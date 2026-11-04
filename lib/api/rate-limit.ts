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
/**
 * IP do cliente para o limite de login. Cada proxy acrescenta à direita do X-Forwarded-For o endereço de quem
 * falou com ele; o que vem à esquerda o próprio cliente pode escrever. Com `hops` proxies confiáveis na frente
 * (TRUST_PROXY_HOPS; 1 = o Caddy da VPS), o cliente real é a entrada `hops` a partir da direita. Com 0 (porta do
 * app publicada direto), os cabeçalhos são ignorados: todo mundo cai no mesmo balde, mas ninguém escapa do limite.
 */
export function clientIp(req: Request, hops: number = env.TRUST_PROXY_HOPS): string {
  if (hops <= 0) return 'local';
  const xff = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length) return xff[Math.max(0, xff.length - hops)]!;
  return req.headers.get('x-real-ip')?.trim() || 'local';
}
