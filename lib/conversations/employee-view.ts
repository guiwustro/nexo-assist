import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { conversations, users } from '@/lib/db/schema';
import type { AttendanceSummary, CurrentData } from '@/lib/client/api';
import { ticketCodesOf, closedLabel } from './attendance';
import { listMessages } from './queries';
import type { Conversation } from './service';

function summary(
  conversation: Conversation,
  analystName: string | null,
  ticketCodes: string[],
): AttendanceSummary {
  const label =
    conversation.status === 'ai_handling'
      ? 'Com o Nexo'
      : conversation.status === 'pending'
        ? 'Aguardando analista'
        : conversation.status === 'claimed'
          ? `Com ${analystName ?? 'analista'}`
          : closedLabel(conversation.closed_reason);
  return {
    id: conversation.id,
    status: conversation.status as AttendanceSummary['status'],
    label,
    analyst_name: analystName,
    focus_ticket_code: conversation.focus_ticket_code,
    ticket_codes: ticketCodes,
    started_at: conversation.created_at.toISOString(),
    last_message_at: conversation.last_message_at?.toISOString() ?? null,
    last_message_preview: conversation.last_message_preview,
    closed_reason: conversation.closed_reason as AttendanceSummary['closed_reason'],
  };
}

export async function attendanceSummaryOf(conversation: Conversation): Promise<AttendanceSummary> {
  const db = getDb();
  const [[assignee], codes] = await Promise.all([
    conversation.assigned_to_user_id
      ? db.select({ name: users.name }).from(users).where(eq(users.id, conversation.assigned_to_user_id))
      : Promise.resolve([]),
    ticketCodesOf([conversation.id]),
  ]);
  return summary(conversation, assignee?.name ?? null, codes.get(conversation.id) ?? []);
}

export async function listEmployeeAttendances(employeeId: string): Promise<AttendanceSummary[]> {
  const rows = await getDb()
    .select({ conversation: conversations, analyst_name: users.name })
    .from(conversations)
    .leftJoin(users, eq(users.id, conversations.assigned_to_user_id))
    .where(and(eq(conversations.employee_id, employeeId), isNotNull(conversations.last_message_at)))
    .orderBy(
      asc(sql`case when ${conversations.status} = 'closed' then 1 else 0 end`),
      desc(sql`coalesce(${conversations.last_message_at}, ${conversations.created_at})`),
      desc(conversations.created_at),
    );
  const codes = await ticketCodesOf(rows.map((row) => row.conversation.id));
  return rows.map((row) => summary(row.conversation, row.analyst_name, codes.get(row.conversation.id) ?? []));
}

export async function currentDataOf(
  employeeId: string,
  conversation: Conversation,
  session: { count: number; limit: number },
): Promise<CurrentData> {
  const [current, all, page] = await Promise.all([
    attendanceSummaryOf(conversation),
    listEmployeeAttendances(employeeId),
    listMessages(conversation.id, { limit: 50 }),
  ]);
  return {
    conversation: current,
    messages: page.messages,
    next_cursor: page.next_cursor,
    session,
    others: all.filter((item) => item.status !== 'closed' && item.id !== conversation.id),
  };
}
