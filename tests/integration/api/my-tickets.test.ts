import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '@/tests/helpers/db';
import { createFakeTickets, type FakeTickets } from '@/tests/helpers/fake-tickets';
import { call, json } from '@/tests/helpers/api';
import { GET as myTickets } from '@/app/api/v1/me/tickets/route';
import { GET as myTicket } from '@/app/api/v1/me/tickets/[code]/route';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import type { Session } from '@/lib/auth/session';
import type { TicketDetail, TicketList } from '@/lib/tickets/views';

const t = useTestDb();
let fake: FakeTickets;
const ana = (): Session => ({ user_id: t.seed.users.ana.id, role: 'employee', name: 'Ana Souza', sid: 's' });
const elisa = (): Session => ({
  user_id: t.seed.users.elisa.id,
  role: 'employee',
  name: 'Elisa Prado',
  sid: 's',
});
const rafael = (): Session => ({
  user_id: t.seed.users.rafael.id,
  role: 'analyst',
  name: 'Rafael Lima',
  sid: 's',
});

beforeEach(() => {
  fake = createFakeTickets(t.now);
  setTicketsClient(fake);
});
afterAll(() => setTicketsClient(undefined));

describe('Meus chamados (funcionário)', () => {
  it('lista os chamados da Ana, em andamento e resolvidos, com vencido marcado', async () => {
    const res = await call(myTickets, { session: ana() });
    expect(res.status).toBe(200);
    const { data } = await json<{ data: TicketList }>(res);
    expect(data.tickets).toHaveLength(6);
    expect([data.open, data.closed]).toEqual([3, 3]);
    expect(data.tickets.find((x) => x.code === 'INC-20311')?.overdue).toBe(true);
    expect(data.tickets.every((x) => x.requester_id === t.seed.users.ana.id)).toBe(true);
  });

  it('detalhe de um chamado dela traz o histórico', async () => {
    const res = await call(myTicket, { session: ana(), params: { code: 'INC-20150' } });
    const { data } = await json<{ data: TicketDetail }>(res);
    expect(data.ticket.code).toBe('INC-20150');
    expect(data.events[0]?.kind).toBe('created');
  });

  it('detalhe do INC-20519 mostra o atendimento onde o rascunho foi criado', async () => {
    const res = await call(myTicket, { session: elisa(), params: { code: 'INC-20519' } });
    const { data } = await json<{ data: TicketDetail }>(res);
    expect(data.attendances[0]).toMatchObject({
      conversation_id: t.seed.conversations.elisa,
      relation: 'created',
    });
    expect(data.attendances[0]?.message_id).toBeTruthy();
  });

  it('chamado da Carla → 404, sem vazar nada', async () => {
    const res = await call(myTicket, { session: ana(), params: { code: 'INC-20388' } });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain('Diretoria');
  });

  it('código malformado → 400', async () => {
    expect((await call(myTicket, { session: ana(), params: { code: 'abc' } })).status).toBe(400);
  });

  it('analista não usa a rota do funcionário', async () => {
    expect((await call(myTickets, { session: rafael() })).status).toBe(403);
  });

  it('sistema de chamados fora → 503', async () => {
    fake.down = true;
    expect((await call(myTickets, { session: ana() })).status).toBe(503);
  });
});
