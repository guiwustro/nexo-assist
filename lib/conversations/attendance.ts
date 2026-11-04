import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { NotFound } from '@/lib/api/errors';
import { noteToMemory } from '@/lib/agent-engine/agent/memory';
import { getDb } from '@/lib/db/client';
import { conversations, employeeSessions, ticketDrafts, type EmployeeSession } from '@/lib/db/schema';
import { applyTransition, type Conversation } from './service';

export async function touchSession(employeeId: string, sid: string, loginAt: Date): Promise<EmployeeSession> {
  return getDb().transaction(async (tx) => {
    let [session] = await tx
      .select()
      .from(employeeSessions)
      .where(eq(employeeSessions.employee_id, employeeId))
      .for('update');

    if (!session) {
      [session] = await tx
        .insert(employeeSessions)
        .values({ employee_id: employeeId, session_id: sid, session_started_at: loginAt })
        .onConflictDoNothing({ target: employeeSessions.employee_id })
        .returning();
      if (!session) {
        [session] = await tx
          .select()
          .from(employeeSessions)
          .where(eq(employeeSessions.employee_id, employeeId))
          .for('update');
      }
    }
    if (session && session.session_id !== sid && session.session_started_at < loginAt) {
      [session] = await tx
        .update(employeeSessions)
        .set({ session_id: sid, session_started_at: loginAt, message_count: 0, updated_at: new Date() })
        .where(eq(employeeSessions.employee_id, employeeId))
        .returning();
    }

    if (!session) throw new NotFound('employee_session_not_found', 'Sessão do funcionário não encontrada');
    return session;
  });
}

export async function getSession(employeeId: string): Promise<EmployeeSession | null> {
  const [session] = await getDb().select().from(employeeSessions).where(eq(employeeSessions.employee_id, employeeId));
  return session ?? null;
}

export async function getOrCreateWithAgent(
  employeeId: string,
  now: Date,
): Promise<{ conversation: Conversation; created: boolean }> {
  const db = getDb();
  const [inserted] = await db
    .insert(conversations)
    .values({
      employee_id: employeeId,
      status: 'ai_handling',
      created_at: now,
      updated_at: now,
      status_changed_at: now,
    })
    .onConflictDoNothing({ target: conversations.employee_id, where: sql`status = 'ai_handling'` })
    .returning({ id: conversations.id });

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.employee_id, employeeId), eq(conversations.status, 'ai_handling')))
    .orderBy(desc(sql`coalesce(${conversations.last_message_at}, ${conversations.created_at})`), desc(conversations.created_at))
    .limit(1);
  if (!conversation) throw new NotFound('conversation_not_found', 'Atendimento com o agent não encontrado');

  const created = Boolean(inserted);
  if (created) {
    const note = await previousAttendanceNote(employeeId, conversation.id);
    if (note) await noteToMemory(conversation.id, employeeId, note);
  }
  return { conversation, created };
}

export async function getCurrentForEmployee(employeeId: string, now: Date): Promise<Conversation> {
  const db = getDb();
  const [open] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.employee_id, employeeId), eq(conversations.status, 'ai_handling')))
    .orderBy(desc(sql`coalesce(${conversations.last_message_at}, ${conversations.created_at})`), desc(conversations.created_at))
    .limit(1);
  if (open) return open;

  const [closed] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.employee_id, employeeId), eq(conversations.status, 'closed')))
    .orderBy(
      desc(sql`coalesce(${conversations.closed_at}, ${conversations.last_message_at}, ${conversations.created_at})`),
      desc(conversations.created_at),
    )
    .limit(1);
  if (closed) return closed;

  return (await getOrCreateWithAgent(employeeId, now)).conversation;
}

export async function previousAttendanceNote(employeeId: string, excludeId: string): Promise<string | null> {
  const rows = await getDb()
    .select({
      id: conversations.id,
      closed_at: conversations.closed_at,
      last_message_at: conversations.last_message_at,
      created_at: conversations.created_at,
      closed_reason: conversations.closed_reason,
      last_message_preview: conversations.last_message_preview,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.employee_id, employeeId),
        eq(conversations.status, 'closed'),
        ne(conversations.id, excludeId),
      ),
    )
    .orderBy(
      desc(sql`coalesce(${conversations.closed_at}, ${conversations.last_message_at}, ${conversations.created_at})`),
      desc(conversations.created_at),
    )
    .limit(3);
  if (rows.length === 0) return null;

  const ticketCodes = await ticketCodesOf(rows.map((row) => row.id));
  const dateFormat = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
  const lines = rows.map((row) => {
    const closedAt = row.closed_at ?? row.last_message_at ?? row.created_at;
    const preview = (row.last_message_preview ?? 'sem mensagens').replace(/\s+/g, ' ').trim() || 'sem mensagens';
    const codes = ticketCodes.get(row.id) ?? [];
    return `Atendimento de ${dateFormat.format(closedAt)} (${closedLabel(row.closed_reason)}): ${preview}; chamados: ${codes.join(', ') || 'nenhum'}`;
  });
  return `Atendimentos anteriores deste funcionário:\n${lines.join('\n')}`;
}

export async function resolveConversation(conversationId: string, now: Date): Promise<Conversation | null> {
  return getDb().transaction(async (tx) => {
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for('update');
    if (!conversation || conversation.status !== 'ai_handling') return null;

    const [pendingDraft] = await tx
      .select({ id: ticketDrafts.id })
      .from(ticketDrafts)
      .where(and(eq(ticketDrafts.conversation_id, conversationId), eq(ticketDrafts.status, 'pending')))
      .limit(1);
    if (pendingDraft) return null;

    return applyTransition(
      conversationId,
      'resolve',
      { user_id: conversation.employee_id, role: 'employee' },
      { expectedStatus: 'ai_handling', now, tx },
    );
  });
}

export async function ticketCodesOf(conversationIds: string[]): Promise<Map<string, string[]>> {
  const codes = new Map<string, string[]>(conversationIds.map((id): [string, string[]] => [id, []]));
  if (conversationIds.length === 0) return codes;

  const db = getDb();
  const conversationRows = await db
    .select({ id: conversations.id, focus_ticket_code: conversations.focus_ticket_code })
    .from(conversations)
    .where(inArray(conversations.id, conversationIds));
  for (const row of conversationRows) {
    if (row.focus_ticket_code) addCode(codes, row.id, row.focus_ticket_code);
  }

  const draftRows = await db
    .select({
      conversation_id: ticketDrafts.conversation_id,
      result_ticket_code: ticketDrafts.result_ticket_code,
      target_ticket_code: ticketDrafts.target_ticket_code,
    })
    .from(ticketDrafts)
    .where(and(inArray(ticketDrafts.conversation_id, conversationIds), eq(ticketDrafts.status, 'confirmed')))
    .orderBy(ticketDrafts.created_at);
  for (const row of draftRows) {
    const code = row.result_ticket_code ?? row.target_ticket_code;
    if (code) addCode(codes, row.conversation_id, code);
  }
  return codes;
}

function addCode(codes: Map<string, string[]>, conversationId: string, code: string): void {
  const values = codes.get(conversationId);
  if (values && !values.includes(code)) values.push(code);
}

export function closedLabel(reason: string | null): string {
  switch (reason) {
    case 'resolved':
      return 'Resolvida pelo agent';
    case 'merged':
      return 'Encerrada · juntada';
    case 'analyst':
    default:
      return 'Encerrada';
  }
}
