import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fail, ok, withRoute } from '@/lib/api/wrappers';
import { NotFound } from '@/lib/api/errors';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { TicketsTransportError } from '@/lib/agent-engine/edge/tickets/errors';

const ana = { user_id: '00000000-0000-4000-8000-000000000001', role: 'employee' as const, name: 'Ana', sid: 's' };
const noParams = { params: Promise.resolve({}) };

async function req(body?: unknown, session = ana) {
  const token = await createSessionToken(session);
  return new Request('http://x/api', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('ok / fail', () => {
  it('ok tem envelope e X-Request-Id', async () => {
    const r = ok({ a: 1 });
    expect(r.headers.get('x-request-id')).toBeTruthy();
    expect(await r.json()).toEqual({ data: { a: 1 } });
  });
  it('fail tem envelope de erro', async () => {
    const r = fail('x_code', 'mensagem', 409, { k: 1 });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: { code: 'x_code', message: 'mensagem', details: { k: 1 } } });
  });
});

describe('withRoute', () => {
  const handler = withRoute({ role: 'employee', body: z.object({ text: z.string().min(1) }) }, async ({ body, session }) =>
    ok({ text: body.text, user: session.user_id }),
  );

  it('body inválido → 400 invalid_input', async () => {
    const r = await handler(await req({ text: '' }), noParams);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('invalid_input');
  });
  it('sem sessão → 401', async () => {
    const r = await handler(new Request('http://x/api', { method: 'POST', body: '{}' }), noParams);
    expect(r.status).toBe(401);
  });
  it('papel errado → 403', async () => {
    const r = await handler(await req({ text: 'oi' }, { ...ana, role: 'analyst' as 'employee' }), noParams);
    expect(r.status).toBe(403);
  });
  it('caminho feliz usa a identidade da sessão', async () => {
    const r = await handler(await req({ text: 'oi' }), noParams);
    expect(await r.json()).toEqual({ data: { text: 'oi', user: ana.user_id } });
  });
  it('TicketsTransportError → 503 tickets_unavailable', async () => {
    const h = withRoute({ role: 'any' }, async () => {
      throw new TicketsTransportError('fora');
    });
    const r = await h(await req(), noParams);
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('tickets_unavailable');
  });
  it('AppError vira fail com o status dele', async () => {
    const h = withRoute({ role: 'any' }, async () => {
      throw new NotFound('conversation_not_found', 'Conversa não encontrada');
    });
    const r = await h(await req(), noParams);
    expect(r.status).toBe(404);
  });
  it('erro inesperado → 500 internal_error sem vazar a mensagem', async () => {
    const h = withRoute({ role: 'any' }, async () => {
      throw new Error('detalhe secreto');
    });
    const r = await h(await req(), noParams);
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('detalhe secreto');
  });
  it('valida params', async () => {
    const h = withRoute({ role: 'any', params: z.object({ id: z.string().uuid() }) }, async ({ params }) => ok(params));
    const r = await h(await req(), { params: Promise.resolve({ id: 'x' }) });
    expect(r.status).toBe(400);
  });
});
