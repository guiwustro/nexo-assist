import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '@/tests/helpers/db';
import { createFakeTickets } from '@/tests/helpers/fake-tickets';
import { call, json } from '@/tests/helpers/api';
import { conversations, messages } from '@/lib/db/schema';
import { GET as current } from '@/app/api/v1/conversations/current/route';
import { POST as open } from '@/app/api/v1/conversations/route';
import { GET as listMine } from '@/app/api/v1/me/conversations/route';
import { GET as getMine } from '@/app/api/v1/me/conversations/[id]/route';
import { POST as postMessage } from '@/app/api/v1/conversations/[id]/messages/route';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { closeMemory } from '@/lib/agent-engine/agent/memory';
import type { Session } from '@/lib/auth/session';
import type { AttendanceSummary, CurrentData } from '@/lib/client/api';

const t = useTestDb();
const ana = (): Session => ({
  user_id: t.seed.users.ana.id,
  role: 'employee',
  name: 'Ana Souza',
  sid: 'sid-ana',
});

beforeEach(() => setTicketsClient(createFakeTickets(t.now)));
afterAll(async () => {
  setTicketsClient(undefined);
  await closeMemory();
});

async function addAttendance(employeeId: string, status: 'ai_handling' | 'pending' | 'closed', at: Date) {
  const [row] = await t.db
    .insert(conversations)
    .values({
      employee_id: employeeId,
      status,
      ...(status === 'closed' ? { closed_at: at, closed_reason: 'resolved' as const } : {}),
      last_message_at: at,
      last_message_preview: 'Atendimento de teste',
      created_at: at,
    })
    .returning();
  return row!;
}

describe('atendimentos do funcionário', () => {
  it('mensagem em atendimento encerrado roda em outro e retorna o id no header', async () => {
    const closed = await addAttendance(t.seed.users.ana.id, 'closed', t.now);
    const response = await call(postMessage, {
      session: ana(),
      method: 'POST',
      params: { id: closed.id },
      body: { text: 'qual o horário do service desk?' },
    });
    expect(response.status).toBe(200);
    const newId = response.headers.get('x-conversation-id');
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(closed.id);
    await response.text();

    const [oldRow, newRow] = await Promise.all([
      t.db.query.conversations.findFirst({ where: (table, { eq }) => eq(table.id, closed.id) }),
      t.db.query.conversations.findFirst({ where: (table, { eq }) => eq(table.id, newId!) }),
    ]);
    expect(oldRow).toMatchObject({ status: 'closed', closed_reason: 'resolved' });
    expect(newRow).toMatchObject({ status: 'ai_handling' });
    const newMessages = await t.db.select().from(messages);
    expect(
      newMessages.some(
        (message) => message.conversation_id === newId && message.body === 'qual o horário do service desk?',
      ),
    ).toBe(true);
  });

  it('abre atendimento com o agent enquanto outro espera analista; chamadas seguintes recuperam o mesmo', async () => {
    await addAttendance(t.seed.users.ana.id, 'pending', t.now);
    const first = await call(open, { session: ana(), method: 'POST' });
    const firstData = await json<{ data: AttendanceSummary }>(first);
    expect(first.status).toBe(201);
    expect(firstData.data.status).toBe('ai_handling');

    const second = await call(open, { session: ana(), method: 'POST' });
    const secondData = await json<{ data: AttendanceSummary }>(second);
    expect(second.status).toBe(200);
    expect(secondData.data.id).toBe(firstData.data.id);
  });

  it('lista atendimentos abertos antes dos encerrados e esconde vazios', async () => {
    const closed = await addAttendance(t.seed.users.ana.id, 'closed', new Date(t.now.getTime() - 60_000));
    const pending = await addAttendance(t.seed.users.ana.id, 'pending', t.now);
    await t.db.insert(conversations).values({ employee_id: t.seed.users.ana.id, status: 'ai_handling' });

    const response = await call(listMine, { session: ana() });
    const { data } = await json<{ data: AttendanceSummary[] }>(response);
    expect(data.map((item) => item.id)).toEqual([pending.id, closed.id, t.seed.conversations.ana]);
  });

  it('não abre pela id um atendimento de outra pessoa', async () => {
    const response = await call(getMine, {
      session: ana(),
      params: { id: t.seed.conversations.carla! },
    });
    expect(response.status).toBe(404);
    expect((await json(response)).error?.code).toBe('conversation_not_found');
  });

  it('current escolhe o atendimento aberto mais recente, mesmo aguardando analista', async () => {
    const closed = await addAttendance(t.seed.users.ana.id, 'closed', t.now);
    const pending = await addAttendance(t.seed.users.ana.id, 'pending', new Date(t.now.getTime() - 60_000));

    const response = await call(current, { session: ana() });
    const { data } = await json<{ data: CurrentData }>(response);
    expect(data.conversation.id).toBe(pending.id);
    expect(data.conversation.label).toBe('Aguardando analista');
    expect(data.others).toEqual([]);
    expect(closed.id).not.toBe(data.conversation.id);
  });
});
