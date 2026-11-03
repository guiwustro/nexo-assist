import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import { createTicketsApp } from '@/services/tickets/src/app';
import { createChaos } from '@/services/tickets/src/chaos';
import { ticketEvents, tickets } from '@/lib/db/schema';
import { calcularPrazo } from '@/lib/regras/prazo';
import type { Ticket } from '@/lib/contracts/tickets';

const t = useTestDb();
const SECRET = 'segredo-de-teste';

function setup() {
  const clock = { now: new Date(t.agora) };
  const chaos = createChaos({ failureRate: 0, now: () => clock.now });
  const app = createTicketsApp({ db: t.db, now: () => clock.now, chaos, secret: SECRET, chaosEnabled: true });
  const req = (path: string, init: RequestInit & { key?: string } = {}) => {
    const headers = new Headers(init.headers);
    headers.set('x-internal-secret', SECRET);
    headers.set('content-type', 'application/json');
    if (init.key) headers.set('idempotency-key', init.key);
    return app.request(path, { ...init, headers });
  };
  return { app, req, clock, chaos };
}

const novo = () => ({
  requester_id: t.seed.users.ana.id,
  type: 'incident',
  title: 'VPN não conecta',
  description: 'Erro 809 no Windows 11',
  category: 'network_vpn',
  priority: 'high',
  affected: 'me',
});

describe('serviço de chamados', () => {
  it('exige x-internal-secret, menos no /healthz', async () => {
    const { app } = setup();
    expect((await app.request('/tickets?requester_id=x')).status).toBe(401);
    expect((await app.request('/healthz')).status).toBe(200);
  });

  it('lista só os chamados do solicitante, do mais recente para o mais antigo', async () => {
    const { req } = setup();
    const res = await req(`/tickets?requester_id=${t.seed.users.ana.id}`);
    const { data } = (await res.json()) as { data: Ticket[] };
    expect(data).toHaveLength(6);
    expect(data.every((x) => x.requester_id === t.seed.users.ana.id)).toBe(true);
    expect(data[0]?.code).toBe('INC-20298');
  });

  it('filtra abertos com status=open', async () => {
    const { req } = setup();
    const res = await req(`/tickets?requester_id=${t.seed.users.ana.id}&status=open`);
    const { data } = (await res.json()) as { data: Ticket[] };
    expect(data.map((x) => x.code).sort()).toEqual(['INC-20298', 'INC-20311', 'REQ-10442']);
  });

  it('chamado de outra pessoa → 404 sem vazar o título', async () => {
    const { req } = setup();
    const res = await req(`/tickets/INC-20388?requester_id=${t.seed.users.ana.id}`);
    expect(res.status).toBe(404);
    const corpo = await res.text();
    expect(corpo).not.toContain('Diretoria');
    expect(JSON.parse(corpo).error.code).toBe('ticket_not_found');
    const inexistente = await req(`/tickets/INC-99999?requester_id=${t.seed.users.ana.id}`);
    expect(await inexistente.text()).toBe(corpo);
  });

  it('POST sem Idempotency-Key → 400', async () => {
    const { req } = setup();
    const res = await req('/tickets', { method: 'POST', body: JSON.stringify(novo()) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('idempotency_key_required');
  });

  it('mesma chave em paralelo cria um único chamado', async () => {
    const { req } = setup();
    const antes = await t.db.$count(tickets);
    const body = JSON.stringify(novo());
    const [a, b] = await Promise.all([
      req('/tickets', { method: 'POST', body, key: 'k-1' }),
      req('/tickets', { method: 'POST', body, key: 'k-1' }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const ca = ((await a.json()) as { data: Ticket }).data;
    const cb = ((await b.json()) as { data: Ticket }).data;
    expect(ca.code).toMatch(/^INC-\d+$/);
    expect(cb.code).toBe(ca.code);
    expect(await t.db.$count(tickets)).toBe(antes + 1);
    expect(ca.due_at).toBe(calcularPrazo('high', t.agora).due_at.toISOString());
  });

  it('mesma chave com corpo diferente → 422', async () => {
    const { req } = setup();
    await req('/tickets', { method: 'POST', body: JSON.stringify(novo()), key: 'k-2' });
    const res = await req('/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...novo(), title: 'outro' }),
      key: 'k-2',
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('idempotency_key_reused');
  });

  it('requisição gera código REQ', async () => {
    const { req } = setup();
    const res = await req('/tickets', {
      method: 'POST',
      body: JSON.stringify({ ...novo(), type: 'request', priority: 'low' }),
      key: 'k-req',
    });
    expect(((await res.json()) as { data: Ticket }).data.code).toMatch(/^REQ-105\d\d$/);
  });

  it('reabre INC-20150 e recusa INC-19877', async () => {
    const { req } = setup();
    const body = JSON.stringify({ requester_id: t.seed.users.ana.id, comment: 'voltou a bloquear' });
    const ok = await req('/tickets/INC-20150/reopen', { method: 'POST', body, key: 'r-1' });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: Ticket }).data.status).toBe('open');
    const nao = await req('/tickets/INC-19877/reopen', { method: 'POST', body, key: 'r-2' });
    expect(nao.status).toBe(422);
    expect(((await nao.json()) as { error: { code: string } }).error.code).toBe('reopen_window_expired');
  });

  it('PATCH adiciona comentário, atualiza last_update_at e recalcula due_at', async () => {
    const { req, clock } = setup();
    clock.now = new Date(t.agora.getTime() + 30 * 60_000);
    const res = await req('/tickets/INC-20298', {
      method: 'PATCH',
      key: 'p-1',
      body: JSON.stringify({ requester_id: t.seed.users.ana.id, comment: 'o erro agora diz acesso negado' }),
    });
    expect(res.status).toBe(200);
    const data = ((await res.json()) as { data: Ticket }).data;
    expect(data.last_update_at).toBe(clock.now.toISOString());
    expect(data.due_at).toBe(calcularPrazo('medium', clock.now).due_at.toISOString());
    const [row] = await t.db.select().from(tickets).where(eq(tickets.code, 'INC-20298'));
    const eventos = await t.db.select().from(ticketEvents).where(eq(ticketEvents.ticket_id, row!.id));
    expect(eventos.some((e) => e.kind === 'comment' && e.body.includes('acesso negado'))).toBe(true);
  });

  it('PATCH em chamado alheio → 404', async () => {
    const { req } = setup();
    const res = await req('/tickets/INC-20388', {
      method: 'PATCH',
      key: 'p-2',
      body: JSON.stringify({ requester_id: t.seed.users.ana.id, comment: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('transfer marca aguardando analista', async () => {
    const { req } = setup();
    const res = await req('/tickets/INC-20298/transfer', {
      method: 'POST',
      body: JSON.stringify({ requester_id: t.seed.users.ana.id, level: 'N2', summary: 'Ana pediu analista' }),
    });
    expect(((await res.json()) as { data: Ticket }).data.status).toBe('awaiting_analyst');
  });

  it('queda programada → 503 com Retry-After e volta depois', async () => {
    const { req, clock } = setup();
    const ch = await req('/_chaos/outage?seconds=10', { method: 'POST' });
    expect(ch.status).toBe(200);
    const fora = await req(`/tickets?requester_id=${t.seed.users.ana.id}`);
    expect(fora.status).toBe(503);
    expect(fora.headers.get('retry-after')).toBe('10');
    expect(((await fora.json()) as { error: { code: string } }).error.code).toBe('tickets_unavailable');
    clock.now = new Date(t.agora.getTime() + 11_000);
    expect((await req(`/tickets?requester_id=${t.seed.users.ana.id}`)).status).toBe(200);
  });

  it('rota de caos desligada → 404', async () => {
    const chaos = createChaos({ failureRate: 0 });
    const app = createTicketsApp({ db: t.db, chaos, secret: SECRET, chaosEnabled: false });
    const res = await app.request('/_chaos/outage?seconds=5', {
      method: 'POST',
      headers: { 'x-internal-secret': SECRET },
    });
    expect(res.status).toBe(404);
  });
});
