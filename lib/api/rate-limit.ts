import { env } from '@/lib/env';

export type RateLimiter = {
  take(key: string): { ok: boolean; retry_after_s: number };
  reset(): void;
};

/**
 * Janela deslizante em memória: guarda os instantes aceitos de cada chave e barra quando há `limit` deles
 * dentro de `windowMs`. Requisição barrada não ocupa vaga.
 *
 * Trade-off: vale para uma instância só (o deploy roda uma). Com várias réplicas, o estado iria para o Postgres
 * ou para um Redis.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  let ultimaLimpeza = now();

  const limpar = (t: number) => {
    // Evita crescer sem limite com chaves que não voltam (ex.: IPs).
    if (t - ultimaLimpeza < opts.windowMs) return;
    ultimaLimpeza = t;
    for (const [k, xs] of hits) if (!xs.length || xs[xs.length - 1]! <= t - opts.windowMs) hits.delete(k);
  };

  return {
    take(key) {
      const t = now();
      limpar(t);
      const desde = t - opts.windowMs;
      const xs = (hits.get(key) ?? []).filter((x) => x > desde);
      if (xs.length >= opts.limit) {
        hits.set(key, xs);
        return { ok: false, retry_after_s: Math.max(1, Math.ceil((xs[0]! + opts.windowMs - t) / 1000)) };
      }
      xs.push(t);
      hits.set(key, xs);
      return { ok: true, retry_after_s: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

type Registry = { __nexoLimiters?: Record<string, RateLimiter>; __nexoResetHooks?: Array<() => void> };
const g = globalThis as unknown as Registry;

/** Limitador nomeado do processo (sobrevive ao hot reload); a rota de reset do E2E zera todos. */
function shared(name: string, make: () => RateLimiter): RateLimiter {
  g.__nexoLimiters ??= {};
  if (!g.__nexoLimiters[name]) {
    const rl = make();
    g.__nexoLimiters[name] = rl;
    (g.__nexoResetHooks ??= []).push(() => rl.reset());
  }
  return g.__nexoLimiters[name]!;
}

/** Mensagens do chat: `RATE_LIMIT_PER_MINUTE` por funcionário. */
export const chatLimiter = () =>
  shared('chat', () => createRateLimiter({ limit: env.RATE_LIMIT_PER_MINUTE, windowMs: 60_000 }));

/** Login: 10 por minuto por IP. */
export const loginLimiter = () => shared('login', () => createRateLimiter({ limit: 10, windowMs: 60_000 }));

/** IP do cliente atrás do proxy (Caddy põe X-Forwarded-For). */
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}
