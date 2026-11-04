import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import { createFakeTickets, type FakeTickets } from '@/tests/helpers/fake-tickets';
import { call, json } from '@/tests/helpers/api';
import { conversations } from '@/lib/db/schema';
import { GET as list } from '@/app/api/v1/conversations/route';
import { GET as counts } from '@/app/api/v1/conversations/counts/route';
import { POST as claim } from '@/app/api/v1/conversations/[id]/claim/route';
import { POST as release } from '@/app/api/v1/conversations/[id]/release/route';
import { POST as close } from '@/app/api/v1/conversations/[id]/close/route';
import { GET as handoffsRoute } from '@/app/api/v1/conversations/[id]/handoffs/route';
import { GET as employeeTickets } from '@/app/api/v1/employees/[id]/tickets/route';
import { GET as employeeTicket } from '@/app/api/v1/employees/[id]/tickets/[code]/route';
import { POST as postMessage } from '@/app/api/v1/conversations/[id]/messages/route';
import { createHandoff } from '@/lib/conversations/handoff';
import { getOrCreateCurrent } from '@/lib/conversations/service';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { closeMemory, getMemory } from '@/lib/agent-engine/agent/memory';
import type { QueueItem } from '@/lib/conversations/queries';
import type { Session } from '@/lib/auth/session';

const t = useTestDb();
let fake: FakeTickets;
const ana = (): Session => ({ user_id: t.seed.users.ana.id, role: 'employee', name: 'Ana Souza', sid: 's' });
const rafael = (): Session => ({ user_id: t.seed.users.rafael.id, role: 'analyst', name: 'Rafael Lima', sid: 's' });
const juliana = (): Session => ({ user_id: t.seed.users.juliana.id, role: 'analyst', name: 'Juliana Costa', sid: 's' });

beforeEach(() => {
  fake = createFakeTickets(t.now);
  setTicketsClient(fake);
});
afterAll(async () => {
  setTicketsClient(undefined);
  await closeMemory();
});

async function transferAnaConversation() {
  const conv = await getOrCreateCurrent(t.seed.users.ana.id, 's');
  await createHandoff(
    {
      conversation_id: conv.id,
      ticket_code: 'INC-20311',
      ticket_priority: 'medium',
      origin: 'explicit_request',
      reason_code: 'requested_human',
      level: 'N2',
      employee_words: 'quero falar com um analista',
      agent_reading: 'Notebook lento, chamado vencido',
      attempts: [],
    },
    t.now,
  );
  return conv.id;
}

const queue = (filter: string, session = rafael()) =>
  call(list, { session, url: `http://x/api/v1/conversations?filter=${filter}` });

describe('console do analista', () => {
  it('funcionário não acessa a fila', async () => {
    expect((await call(list, { session: ana() })).status).toBe(403);
  });

  it('"Para você" mostra a Ana transferida com a tag certa e os contadores batem', async () => {
    const id = await transferAnaConversation();
    const { data } = await json<{ data: QueueItem[] }>(await queue('for_you'));
    expect(data.find((c) => c.id === id)?.tag).toEqual({ kind: 'transferred', label: 'Transferida · INC-20311' });
    const c = await json<{ data: Record<string, number> }>(await call(counts, { session: rafael() }));
    expect(c.data).toMatchObject({ for_you: 3, mine: 0 });
  });

  it('busca por chamado', async () => {
    await transferAnaConversation();
    const res = await call(list, { session: rafael(), url: 'http://x/api/v1/conversations?filter=all&q=INC-20311' });
    expect((await json<{ data: QueueItem[] }>(res)).data.map((c) => c.employee.name)).toEqual(['Ana Souza']);
  });

  it('assumir leva para "Minhas"; segundo analista recebe 409', async () => {
    const id = await transferAnaConversation();
    expect((await call(claim, { session: rafael(), method: 'POST', params: { id } })).status).toBe(200);
    const other = await call(claim, { session: juliana(), method: 'POST', params: { id } });
    expect(other.status).toBe(409);
    expect((await json(other)).error?.code).toBe('conversation_already_claimed');
    const { data } = await json<{ data: QueueItem[] }>(await queue('mine'));
    expect(data.map((c) => c.id)).toEqual([id]);
  });

  it('devolver grava na memória do agent o que o analista disse', async () => {
    const id = await transferAnaConversation();
    await call(claim, { session: rafael(), method: 'POST', params: { id } });
    await call(postMessage, { session: rafael(), method: 'POST', params: { id }, body: { text: 'Vou reiniciar seu perfil' } });
    const res = await call(release, { session: rafael(), method: 'POST', params: { id } });
    expect(res.status).toBe(200);
    const [row] = await t.db.select().from(conversations).where(eq(conversations.id, id));
    expect(row?.status).toBe('ai_handling');
    const { messages } = await getMemory().recall({ threadId: id });
    const texts = JSON.stringify(messages);
    expect(texts).toContain('O analista Rafael Lima atendeu e devolveu');
    expect(texts).toContain('Vou reiniciar seu perfil');
  });

  it('encerrar só por quem assumiu', async () => {
    const id = await transferAnaConversation();
    await call(claim, { session: rafael(), method: 'POST', params: { id } });
    expect((await call(close, { session: juliana(), method: 'POST', params: { id } })).status).toBe(403);
    expect((await call(close, { session: rafael(), method: 'POST', params: { id } })).status).toBe(200);
  });

  it('briefings da passagem', async () => {
    const id = await transferAnaConversation();
    const { data } = await json<{ data: Array<{ employee_words: string; agent_reading: string; reason_code: string }> }>(
      await call(handoffsRoute, { session: rafael(), params: { id } }),
    );
    expect(data[0]).toMatchObject({ employee_words: 'quero falar com um analista', reason_code: 'requested_human' });
  });

  it('chamados da Ana: 6, com vencido marcado; nenhum da Carla', async () => {
    const res = await call(employeeTickets, { session: rafael(), params: { id: t.seed.users.ana.id } });
    const { data } = await json<{ data: { tickets: Array<{ code: string; overdue: boolean }>; open: number; closed: number } }>(res);
    expect(data.tickets).toHaveLength(6);
    expect(data.tickets.find((x) => x.code === 'INC-20311')?.overdue).toBe(true);
    expect(data.tickets.some((x) => x.code === 'INC-20388')).toBe(false);
    expect([data.open, data.closed]).toEqual([3, 3]);
  });

  it('chamados com o sistema fora → 503', async () => {
    fake.down = true;
    const res = await call(employeeTickets, { session: rafael(), params: { id: t.seed.users.ana.id } });
    expect(res.status).toBe(503);
  });

  it('detalhe de um chamado da Ana: dados, vencido e histórico', async () => {
    const res = await call(employeeTicket, { session: rafael(), params: { id: t.seed.users.ana.id, code: 'INC-20311' } });
    expect(res.status).toBe(200);
    const { data } = await json<{
      data: { ticket: { code: string; description: string; overdue: boolean }; events: Array<{ kind: string }> };
    }>(res);
    expect(data.ticket).toMatchObject({ code: 'INC-20311', overdue: true });
    expect(data.ticket.description.length).toBeGreaterThan(0);
    expect(data.events[0]?.kind).toBe('created');
  });

  it('detalhe de chamado de outra pessoa → 404', async () => {
    const res = await call(employeeTicket, { session: rafael(), params: { id: t.seed.users.ana.id, code: 'INC-20388' } });
    expect(res.status).toBe(404);
  });

  it('funcionário não abre detalhe de chamado pelo console', async () => {
    const res = await call(employeeTicket, { session: ana(), params: { id: t.seed.users.ana.id, code: 'INC-20311' } });
    expect(res.status).toBe(403);
  });

  it('busca da fila pela API acha a Carla pelo título de um chamado dela', async () => {
    const res = await call(list, { session: rafael(), url: 'http://localhost/api/v1/conversations?filter=all&q=Diretoria' });
    const { data } = await json<{ data: QueueItem[] }>(res);
    expect(data.map((c) => c.employee.name)).toEqual(['Carla Mendes']);
    expect(data[0]?.match).toEqual({ kind: 'ticket', text: 'INC-20388 · Acesso à pasta da Diretoria' });
  });

  it('busca com o sistema de chamados fora ainda acha por nome', async () => {
    fake.down = true;
    const res = await call(list, { session: rafael(), url: 'http://localhost/api/v1/conversations?filter=all&q=carla' });
    expect(res.status).toBe(200);
    expect((await json<{ data: QueueItem[] }>(res)).data.map((c) => c.employee.name)).toEqual(['Carla Mendes']);
  });

  it('funcionário não lista chamados de ninguém pelo console', async () => {
    expect((await call(employeeTickets, { session: ana(), params: { id: t.seed.users.ana.id } })).status).toBe(403);
  });
});
