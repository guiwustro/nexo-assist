import { z } from 'zod';
import {
  TicketEventSchema,
  TicketHitSchema,
  TicketSchema,
  type CreateTicketInput,
  type Ticket,
  type TicketEvent,
  type TicketHit,
  type TransferInput,
  type UpdateTicketInput,
} from '@/lib/contracts/tickets';
import { env } from '@/lib/env';
import { createBreaker, type Breaker, type BreakerState } from './breaker';
import { TicketsNotFoundError, TicketsRejectedError, TicketsTransportError } from './errors';

export type TicketsClient = {
  listByRequester(requesterId: string, status?: 'open' | 'all'): Promise<Ticket[]>;
  get(code: string, requesterId: string): Promise<Ticket>;
  events(code: string, requesterId: string): Promise<TicketEvent[]>;
  search(q: string): Promise<TicketHit[]>;
  create(input: CreateTicketInput, idempotencyKey: string): Promise<Ticket>;
  update(code: string, input: UpdateTicketInput, idempotencyKey: string): Promise<Ticket>;
  reopen(code: string, requesterId: string, idempotencyKey: string, comment?: string): Promise<Ticket>;
  transfer(code: string, input: TransferInput): Promise<Ticket>;
  breakerState(): BreakerState;
};

export type TicketsClientOptions = {
  baseUrl: string;
  secret: string;
  fetch?: typeof fetch;
  retries?: number;
  backoffMs?: number[];
  timeoutMs?: number;
  breaker?: Breaker;
  onRetry?: (attempt: number) => void;
  sleep?: (ms: number) => Promise<void>;
};

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createTicketsClient(opts: TicketsClientOptions): TicketsClient {
  const doFetch = opts.fetch ?? fetch;
  const retries = opts.retries ?? 2;
  const backoff = opts.backoffMs ?? [200, 600];
  const timeoutMs = opts.timeoutMs ?? 2500;
  const breaker = opts.breaker ?? createBreaker({ threshold: 3, openMs: 15_000 });
  const sleep = opts.sleep ?? realSleep;

  async function attempt(method: string, path: string, body: unknown, key?: string): Promise<Response> {
    const headers: Record<string, string> = { 'x-internal-secret': opts.secret, accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (key) headers['idempotency-key'] = key;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await doFetch(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (ctrl.signal.aborted) throw new TicketsTransportError('Sistema de chamados não respondeu a tempo', 'timeout');
      throw new TicketsTransportError(`Falha de rede com o sistema de chamados: ${String(e)}`, 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  async function call<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown, key?: string): Promise<T> {
    if (!breaker.canPass()) {
      throw new TicketsTransportError('Sistema de chamados indisponível (disjuntor aberto)', 'breaker_open');
    }
    let lastError: TicketsTransportError | null = null;
    for (let i = 0; i <= retries; i++) {
      if (i > 0) opts.onRetry?.(i);
      let res: Response;
      try {
        res = await attempt(method, path, body, key);
      } catch (e) {
        lastError = e as TicketsTransportError;
        if (i < retries) await sleep(backoff[i] ?? backoff[backoff.length - 1] ?? 200);
        continue;
      }
      if (res.status >= 500) {
        lastError = new TicketsTransportError(`Sistema de chamados respondeu ${res.status}`, 'unavailable');
        if (i < retries) {
          const ra = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 1000) : (backoff[i] ?? 200));
        }
        continue;
      }
      const payload: unknown = await res.json().catch(() => null);
      breaker.onSuccess();
      if (res.ok) {
        const parsed = z.object({ data: schema }).safeParse(payload);
        if (!parsed.success) throw new TicketsRejectedError('invalid_response', 'Resposta inesperada do serviço', res.status);
        return parsed.data.data;
      }
      const err = ErrorBody.safeParse(payload);
      const code = err.success ? err.data.error.code : `http_${res.status}`;
      if (res.status === 404 && code === 'ticket_not_found') throw new TicketsNotFoundError();
      throw new TicketsRejectedError(code, err.success ? err.data.error.message : 'Recusado', res.status);
    }
    breaker.onFailure();
    throw lastError ?? new TicketsTransportError('Sistema de chamados indisponível');
  }

  const q = encodeURIComponent;
  return {
    listByRequester: (requesterId, status = 'all') =>
      call('GET', `/tickets?requester_id=${q(requesterId)}&status=${status}`, z.array(TicketSchema)),
    get: (code, requesterId) => call('GET', `/tickets/${q(code)}?requester_id=${q(requesterId)}`, TicketSchema),
    events: (code, requesterId) =>
      call('GET', `/tickets/${q(code)}/events?requester_id=${q(requesterId)}`, z.array(TicketEventSchema)),
    search: (term) => call('GET', `/tickets/search?q=${q(term)}`, z.array(TicketHitSchema)),
    create: (input, key) => call('POST', '/tickets', TicketSchema, input, key),
    update: (code, input, key) => call('PATCH', `/tickets/${q(code)}`, TicketSchema, input, key),
    reopen: (code, requesterId, key, comment) =>
      call('POST', `/tickets/${q(code)}/reopen`, TicketSchema, { requester_id: requesterId, comment }, key),
    transfer: (code, input) => call('POST', `/tickets/${q(code)}/transfer`, TicketSchema, input),
    breakerState: () => breaker.state(),
  };
}

const g = globalThis as unknown as { __nexoTickets?: TicketsClient; __nexoTicketsOverride?: TicketsClient; __nexoBreaker?: Breaker };

function sharedBreaker(): Breaker {
  g.__nexoBreaker ??= createBreaker({ threshold: 3, openMs: 15_000 });
  return g.__nexoBreaker;
}

/**
 * Cliente do processo. O disjuntor é compartilhado entre requisições; `onRetry` cria um cliente
 * do turno (mesmo disjuntor) para a trilha mostrar "tentou de novo".
 */
export function getTicketsClient(o: { onRetry?: (attempt: number) => void } = {}): TicketsClient {
  if (g.__nexoTicketsOverride) return g.__nexoTicketsOverride;
  if (g.__nexoTickets && !o.onRetry) return g.__nexoTickets;
  const c = createTicketsClient({
    baseUrl: env.TICKETS_URL,
    secret: env.TICKETS_INTERNAL_SECRET,
    breaker: sharedBreaker(),
    onRetry: o.onRetry,
  });
  if (!o.onRetry) g.__nexoTickets = c;
  return c;
}

/** Só para testes: troca o cliente do processo (ex.: um falso em memória). */
export function setTicketsClient(c: TicketsClient | undefined): void {
  g.__nexoTicketsOverride = c;
}

/** Só para E2E: zera o disjuntor e o cliente do processo entre testes. */
export function resetTicketsClient(): void {
  g.__nexoTickets = undefined;
  g.__nexoBreaker = undefined;
}
