import { and, desc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '@/tests/helpers/db';
import { getMemory } from '@/lib/agent-engine/agent/memory';
import { conversations, employeeSessions, eventLog, messages, ticketDrafts } from '@/lib/db/schema';
import type { DraftPayload } from '@/lib/contracts/drafts';
import {
  closedLabel,
  getCurrentForEmployee,
  getOrCreateWithAgent,
  getSession,
  releaseOrMerge,
  resolveConversation,
  ticketCodesOf,
  touchSession,
} from '@/lib/conversations/attendance';
import { applyTransition, registerEmployeeMessage } from '@/lib/conversations/service';

const t = useTestDb();

const payload: DraftPayload = {
  title: 'Notebook sem rede',
  description: 'Não conecta à rede corporativa.',
  type: 'incident',
  category: 'network_vpn',
  affected: 'me',
  blocks_work: false,
  deadline_today: false,
  priority: 'medium',
  priority_rule: 'Prioridade média',
  due_at: t.now.toISOString(),
};

async function insertClosedAttendance(
  employeeId: string,
  values: { closedAt?: Date; focus?: string; preview?: string; reason?: string } = {},
) {
  const closedAt = values.closedAt ?? t.now;
  const [row] = await t.db
    .insert(conversations)
    .values({
      employee_id: employeeId,
      status: 'closed',
      closed_at: closedAt,
      closed_reason: values.reason ?? 'resolved',
      focus_ticket_code: values.focus ?? null,
      last_message_at: closedAt,
      last_message_preview: values.preview ?? 'O acesso voltou a funcionar.',
      created_at: new Date(closedAt.getTime() - 60_000),
      updated_at: closedAt,
    })
    .returning();
  return row!;
}

async function insertDraft(
  conversationId: string,
  values: {
    code: string;
    status: 'pending' | 'confirmed' | 'cancelled';
    target?: string | null;
    result?: string | null;
  },
) {
  const [draft] = await t.db
    .insert(ticketDrafts)
    .values({
      conversation_id: conversationId,
      code: values.code,
      kind: 'create',
      target_ticket_code: values.target ?? null,
      result_ticket_code: values.result ?? null,
      payload,
      status: values.status,
    })
    .returning();
  return draft!;
}

describe('getOrCreateWithAgent', () => {
  it('concorrente devolve o mesmo atendimento e só uma chamada marca criação', async () => {
    const ana = t.seed.users.ana.id;
    const [a, b] = await Promise.all([getOrCreateWithAgent(ana, t.now), getOrCreateWithAgent(ana, t.now)]);
    expect(a.conversation.id).toBe(b.conversation.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
  });

  it('um atendimento novo recebe a nota dos anteriores na memória', async () => {
    const ana = t.seed.users.ana.id;
    await insertClosedAttendance(ana, {
      focus: 'INC-20311',
      closedAt: t.now,
      preview: 'VPN voltou a funcionar.',
    });

    const { conversation, created } = await getOrCreateWithAgent(ana, t.now);
    expect(created).toBe(true);
    const { messages: memoryMessages } = await getMemory().recall({ threadId: conversation.id });
    const text = JSON.stringify(memoryMessages);
    expect(text).toContain('Atendimentos anteriores deste funcionário:');
    expect(text).toContain('INC-20311');
    expect(text).toContain('03/11');
  });
});

describe('getCurrentForEmployee', () => {
  it('prefere o atendimento aberto ao encerrado', async () => {
    const ana = t.seed.users.ana.id;
    await insertClosedAttendance(ana, { closedAt: t.now });
    const [open] = await t.db
      .insert(conversations)
      .values({
        employee_id: ana,
        status: 'ai_handling',
        created_at: new Date(t.now.getTime() - 10 * 24 * 60 * 60_000),
        last_message_at: new Date(t.now.getTime() - 9 * 24 * 60 * 60_000),
      })
      .returning();

    const current = await getCurrentForEmployee(ana, t.now);
    expect(current.id).toBe(open!.id);
  });

  it('retorna o encerrado mais recente quando não há atendimento aberto', async () => {
    const ana = t.seed.users.ana.id;
    const older = await insertClosedAttendance(ana, { closedAt: new Date(t.now.getTime() - 60_000) });
    const latest = await insertClosedAttendance(ana, { closedAt: t.now, preview: 'Resolvido hoje.' });

    const current = await getCurrentForEmployee(ana, t.now);
    expect(current.id).toBe(latest.id);
    expect(current.id).not.toBe(older.id);
  });

  it('cria um atendimento vazio quando o funcionário ainda não tem histórico', async () => {
    const ana = t.seed.users.ana.id;
    await t.db.delete(conversations).where(eq(conversations.id, t.seed.conversations.ana!));
    const current = await getCurrentForEmployee(ana, t.now);
    expect(current).toMatchObject({ employee_id: ana, status: 'ai_handling', last_message_at: null });
  });

  it('mantém como atual um atendimento do agent parado há dez dias', async () => {
    const ana = t.seed.users.ana.id;
    const lastMessageAt = new Date(t.now.getTime() - 10 * 24 * 60 * 60_000);
    const [stale] = await t.db
      .insert(conversations)
      .values({
        employee_id: ana,
        status: 'ai_handling',
        created_at: new Date(lastMessageAt.getTime() - 60_000),
        last_message_at: lastMessageAt,
      })
      .returning();

    const current = await getCurrentForEmployee(ana, t.now);
    const [stored] = await t.db.select().from(conversations).where(eq(conversations.id, stale!.id));
    expect(current.id).toBe(stale!.id);
    expect(stored?.status).toBe('ai_handling');
  });
});

describe('sessão do funcionário', () => {
  it('concorrência mantém o login mais novo', async () => {
    const ana = t.seed.users.ana.id;
    const older = new Date(t.now.getTime() - 60_000);
    await Promise.all([touchSession(ana, 'sid-old', older), touchSession(ana, 'sid-new', t.now)]);
    expect(await getSession(ana)).toMatchObject({ session_id: 'sid-new', message_count: 0 });
  });

  it('login mais novo zera o contador; um login antigo de outro aparelho preserva', async () => {
    const ana = t.seed.users.ana.id;
    const firstLogin = new Date(t.now.getTime() - 60_000);
    await touchSession(ana, 'sid-a', firstLogin);
    await t.db
      .update(employeeSessions)
      .set({ message_count: 4 })
      .where(eq(employeeSessions.employee_id, ana));

    await touchSession(ana, 'sid-b', t.now);
    expect(await getSession(ana)).toMatchObject({ session_id: 'sid-b', message_count: 0 });
    await t.db
      .update(employeeSessions)
      .set({ message_count: 2 })
      .where(eq(employeeSessions.employee_id, ana));
    await touchSession(ana, 'sid-a', firstLogin);
    expect(await getSession(ana)).toMatchObject({ session_id: 'sid-b', message_count: 2 });
  });

  it('soma mensagens de atendimentos diferentes na mesma sessão', async () => {
    const carla = t.seed.users.carla.id;
    await touchSession(carla, 'sid-c', t.now);
    const active = await getOrCreateWithAgent(carla, t.now);
    await registerEmployeeMessage(t.seed.conversations.carla!, 'mensagem no atendimento pendente', 30);
    const result = await registerEmployeeMessage(
      active.conversation.id,
      'mensagem no atendimento do agent',
      30,
    );
    expect(result.count).toBe(2);
    expect(await getSession(carla)).toMatchObject({ message_count: 2 });
  });
});

describe('resolveConversation', () => {
  it('não fecha atendimento com rascunho pendente', async () => {
    const { conversation } = await getOrCreateWithAgent(t.seed.users.ana.id, t.now);
    await insertDraft(conversation.id, { code: 'D-pending', status: 'pending' });

    expect(await resolveConversation(conversation.id, t.now)).toBeNull();
    const [stored] = await t.db.select().from(conversations).where(eq(conversations.id, conversation.id));
    expect(stored?.status).toBe('ai_handling');
  });

  it('não fecha atendimento que está com analista', async () => {
    const conversationId = t.seed.conversations.carla!;
    expect(await resolveConversation(conversationId, t.now)).toBeNull();
    const [stored] = await t.db.select().from(conversations).where(eq(conversations.id, conversationId));
    expect(stored?.status).toBe('pending');
  });

  it('encerra o atendimento do agent e grava motivo no evento', async () => {
    const { conversation } = await getOrCreateWithAgent(t.seed.users.ana.id, t.now);
    const resolved = await resolveConversation(conversation.id, t.now);
    expect(resolved).toMatchObject({ status: 'closed', closed_reason: 'resolved', closed_at: t.now });
    const [systemMessage] = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversation_id, conversation.id), eq(messages.type, 'system')));
    expect(systemMessage?.body).toContain('Atendimento resolvido ·');
    const [closedEvent] = await t.db
      .select()
      .from(eventLog)
      .where(
        and(eq(eventLog.conversation_id, conversation.id), eq(eventLog.event_type, 'conversation.closed')),
      );
    expect(closedEvent?.payload).toMatchObject({ reason: 'resolved' });
  });
});

describe('releaseOrMerge', () => {
  it('devolve ao agent quando não existe outro atendimento ativo', async () => {
    const ana = t.seed.users.ana.id;
    const [source] = await t.db
      .insert(conversations)
      .values({ employee_id: ana, status: 'pending' })
      .returning();
    const actor = { user_id: t.seed.users.rafael.id, role: 'analyst' as const };
    await applyTransition(source!.id, 'claim', actor, { now: t.now });

    const result = await releaseOrMerge(source!.id, actor, t.now);
    expect(result).toMatchObject({
      merged_into: null,
      conversation: { id: source!.id, status: 'ai_handling' },
    });
  });

  it('junta ao atendimento ativo e transfere a nota do analista para a memória dele', async () => {
    const ana = t.seed.users.ana.id;
    const [source] = await t.db
      .insert(conversations)
      .values({ employee_id: ana, status: 'pending', focus_ticket_code: 'INC-20311' })
      .returning();
    const actor = { user_id: t.seed.users.rafael.id, role: 'analyst' as const };
    await applyTransition(source!.id, 'claim', actor, { now: t.now });
    await t.db.insert(messages).values({
      conversation_id: source!.id,
      direction: 'outbound',
      sent_via: 'user',
      sent_by_user_id: actor.user_id,
      body: 'Vou reiniciar seu perfil',
    });
    const { conversation: active } = await getOrCreateWithAgent(ana, t.now);

    const result = await releaseOrMerge(source!.id, actor, t.now);
    expect(result.merged_into).toBe(active.id);
    expect(result.conversation).toMatchObject({ status: 'closed', closed_reason: 'merged' });
    const [sourceSystemMessage] = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversation_id, source!.id), eq(messages.type, 'system')))
      .orderBy(desc(messages.created_at));
    expect(sourceSystemMessage?.body).toContain(
      'Rafael Lima devolveu ao agent · juntado ao atendimento atual',
    );
    const [systemMessage] = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversation_id, active.id), eq(messages.type, 'system')));
    expect(systemMessage?.body).toContain(
      'Rafael Lima devolveu um atendimento sobre INC-20311 · o Nexo já sabe o que foi feito',
    );
    const [closedEvent] = await t.db
      .select()
      .from(eventLog)
      .where(and(eq(eventLog.conversation_id, source!.id), eq(eventLog.event_type, 'conversation.closed')));
    expect(closedEvent?.payload).toMatchObject({ reason: 'merged' });
    const { messages: memoryMessages } = await getMemory().recall({ threadId: active.id });
    expect(JSON.stringify(memoryMessages)).toContain('O analista Rafael Lima atendeu e devolveu');
    expect(JSON.stringify(memoryMessages)).toContain('Vou reiniciar seu perfil');
  });
});

describe('ticketCodesOf e closedLabel', () => {
  it('junta foco e chamados de rascunhos confirmados sem incluir cancelados', async () => {
    const { conversation } = await getOrCreateWithAgent(t.seed.users.ana.id, t.now);
    await t.db
      .update(conversations)
      .set({ focus_ticket_code: 'INC-1' })
      .where(eq(conversations.id, conversation.id));
    await insertDraft(conversation.id, { code: 'D-confirmed', status: 'confirmed', result: 'INC-2' });
    await insertDraft(conversation.id, { code: 'D-cancelled', status: 'cancelled', target: 'INC-3' });

    expect((await ticketCodesOf([conversation.id])).get(conversation.id)).toEqual(['INC-1', 'INC-2']);
  });

  it('mostra os três rótulos de encerramento', () => {
    expect(closedLabel('analyst')).toBe('Encerrada');
    expect(closedLabel('resolved')).toBe('Resolvida pelo agent');
    expect(closedLabel('merged')).toBe('Encerrada · juntada');
  });
});
