import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import type { Db } from '@/lib/db/client';
import type { Chaos } from './chaos';
import { ticketRoutes } from './routes';

export type TicketsAppDeps = {
  db: Db;
  now?: () => Date;
  chaos: Chaos;
  secret: string;
  chaosEnabled?: boolean;
};

function sameSecret(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createTicketsApp(deps: TicketsAppDeps): Hono {
  const now = deps.now ?? (() => new Date());
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ data: { ok: true } }));

  app.use('*', async (c, next) => {
    if (!sameSecret(c.req.header('x-internal-secret'), deps.secret)) {
      return c.json({ error: { code: 'unauthorized', message: 'Segredo interno ausente ou inválido' } }, 401);
    }
    await next();
  });

  app.post('/_chaos/outage', (c) => {
    if (!deps.chaosEnabled) return c.json({ error: { code: 'not_found', message: 'Rota inexistente' } }, 404);
    const raw = Number(c.req.query('seconds') ?? 10);
    const seconds = Math.min(300, Math.max(0, Number.isFinite(raw) ? raw : 10));
    deps.chaos.startOutage(seconds);
    return c.json({ data: { outage_seconds: seconds } });
  });

  app.use('*', async (c, next) => {
    if (deps.chaos.shouldFail()) {
      c.header('Retry-After', String(deps.chaos.retryAfterSeconds()));
      return c.json({ error: { code: 'tickets_unavailable', message: 'Sistema de chamados indisponível' } }, 503);
    }
    await next();
  });

  app.route('/', ticketRoutes({ db: deps.db, now }));

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Rota inexistente' } }, 404));
  app.onError((err, c) => {
    console.error('[tickets] unexpected error', err);
    return c.json({ error: { code: 'internal_error', message: 'Erro interno' } }, 500);
  });

  return app;
}
