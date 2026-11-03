import { describe, expect, it, vi } from 'vitest';
import { createTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { createBreaker } from '@/lib/agent-engine/edge/tickets/breaker';
import {
  TicketsNotFoundError,
  TicketsRejectedError,
  TicketsTransportError,
} from '@/lib/agent-engine/edge/tickets/errors';
import type { Ticket } from '@/lib/contracts/tickets';

const ticket: Ticket = {
  code: 'INC-20311',
  type: 'incident',
  title: 'Notebook lento',
  description: 'x',
  category: 'hardware',
  subcategory: 'Notebook',
  priority: 'medium',
  affected: 'me',
  status: 'awaiting_analyst',
  requester_id: '00000000-0000-4000-8000-000000000001',
  assignee_name: null,
  due_at: '2026-11-03T13:00:00.000Z',
  last_update_at: '2026-11-03T13:00:00.000Z',
  resolved_at: null,
  created_at: '2026-11-03T13:00:00.000Z',
};
const REQ = ticket.requester_id;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const unavailable = () => json(503, { error: { code: 'tickets_unavailable', message: 'fora' } });

/** fetch falso que devolve as respostas em ordem e registra as chamadas. */
function fakeFetch(...respostas: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const r = respostas[Math.min(calls.length - 1, respostas.length - 1)];
    return r!();
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const client = (f: typeof fetch, extra: Partial<Parameters<typeof createTicketsClient>[0]> = {}) =>
  createTicketsClient({ baseUrl: 'http://tickets', secret: 's', fetch: f, sleep: async () => {}, ...extra });

describe('createTicketsClient', () => {
  it('503, 503, 200 → resolve e avisa cada nova tentativa', async () => {
    const { fetch, calls } = fakeFetch(unavailable, unavailable, () => json(200, { data: [ticket] }));
    const onRetry = vi.fn();
    const r = await client(fetch, { onRetry }).listByRequester(REQ);
    expect(r[0]?.code).toBe('INC-20311');
    expect(calls).toHaveLength(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1);
  });

  it('503 três vezes → TicketsTransportError', async () => {
    const { fetch, calls } = fakeFetch(unavailable);
    await expect(client(fetch).listByRequester(REQ)).rejects.toBeInstanceOf(TicketsTransportError);
    expect(calls).toHaveLength(3);
  });

  it('404 → TicketsNotFoundError sem nova tentativa', async () => {
    const { fetch, calls } = fakeFetch(() => json(404, { error: { code: 'ticket_not_found', message: 'x' } }));
    await expect(client(fetch).get('INC-20388', REQ)).rejects.toBeInstanceOf(TicketsNotFoundError);
    expect(calls).toHaveLength(1);
  });

  it('422 → TicketsRejectedError com o código, sem nova tentativa', async () => {
    const { fetch, calls } = fakeFetch(() => json(422, { error: { code: 'reopen_window_expired', message: 'x' } }));
    const erro = await client(fetch)
      .reopen('INC-19877', REQ, 'k')
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(TicketsRejectedError);
    expect((erro as TicketsRejectedError).code).toBe('reopen_window_expired');
    expect(calls).toHaveLength(1);
  });

  it('timeout → TicketsTransportError', async () => {
    const nunca = vi.fn(
      (_url: string | URL | Request, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const c = client(nunca as unknown as typeof fetch, { timeoutMs: 20, retries: 0 });
    await expect(c.listByRequester(REQ)).rejects.toBeInstanceOf(TicketsTransportError);
  });

  it('erro de rede → TicketsTransportError', async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(client(fetch, { retries: 0 }).listByRequester(REQ)).rejects.toBeInstanceOf(TicketsTransportError);
  });

  it('create manda a mesma Idempotency-Key em todas as tentativas', async () => {
    const { fetch, calls } = fakeFetch(unavailable, unavailable, () => json(201, { data: ticket }));
    await client(fetch).create(
      {
        requester_id: REQ,
        type: 'incident',
        title: 't',
        description: 'd',
        category: 'hardware',
        priority: 'medium',
        affected: 'me',
      },
      'chave-1',
    );
    const keys = calls.map((c) => new Headers(c.init.headers).get('idempotency-key'));
    expect(keys).toEqual(['chave-1', 'chave-1', 'chave-1']);
    expect(new Headers(calls[0]!.init.headers).get('x-internal-secret')).toBe('s');
  });

  it('respeita Retry-After limitado a 1 s', async () => {
    const sleep = vi.fn(async () => {});
    const { fetch } = fakeFetch(
      () => json(503, { error: { code: 'tickets_unavailable', message: 'x' } }, { 'retry-after': '20' }),
      () => json(200, { data: [] }),
    );
    await client(fetch, { sleep }).listByRequester(REQ);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('disjuntor aberto falha sem chamar o serviço', async () => {
    const breaker = createBreaker({ threshold: 3, openMs: 15_000, now: () => 0 });
    const { fetch, calls } = fakeFetch(unavailable);
    const c = client(fetch, { retries: 0, breaker });
    for (let i = 0; i < 3; i++) await c.listByRequester(REQ).catch(() => null);
    expect(c.breakerState()).toBe('open');
    const antes = calls.length;
    await expect(c.listByRequester(REQ)).rejects.toBeInstanceOf(TicketsTransportError);
    expect(calls.length).toBe(antes);
  });

  it('404 não conta como falha para o disjuntor', async () => {
    const breaker = createBreaker({ threshold: 1, openMs: 15_000, now: () => 0 });
    const { fetch } = fakeFetch(() => json(404, { error: { code: 'ticket_not_found', message: 'x' } }));
    await client(fetch, { breaker }).get('INC-1', REQ).catch(() => null);
    expect(breaker.state()).toBe('closed');
  });
});
