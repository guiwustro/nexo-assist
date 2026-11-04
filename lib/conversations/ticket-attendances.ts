import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { conversations, messages, ticketDrafts, users } from '@/lib/db/schema';
import type { ConversationStatus } from '@/lib/contracts/enums';
import type { MessagePart } from '@/lib/contracts/parts';
import { closedLabel } from './attendance';

export type TicketAttendance = {
  conversation_id: string;
  started_at: string;
  status: ConversationStatus;
  label: string;
  relation: 'created' | 'updated' | 'reopened' | 'focus';
  message_id: string | null;
};

type AttendanceRow = {
  conversation_id: string;
  started_at: Date;
  status: string;
  closed_reason: string | null;
  analyst_name: string | null;
  draft_id: string | null;
  relation: TicketAttendance['relation'];
};

function labelFor(row: Pick<AttendanceRow, 'status' | 'closed_reason' | 'analyst_name'>): string {
  if (row.status === 'closed') return closedLabel(row.closed_reason);
  if (row.status === 'ai_handling') return 'Com o Nexo';
  if (row.status === 'pending') return 'Aguardando analista';
  return `Com ${row.analyst_name ?? 'analista'}`;
}

export async function attendancesForTicket(employeeId: string, code: string): Promise<TicketAttendance[]> {
  const db = getDb();
  const draftRows = await db
    .select({
      conversation_id: conversations.id,
      started_at: conversations.created_at,
      status: conversations.status,
      closed_reason: conversations.closed_reason,
      analyst_name: users.name,
      draft_id: ticketDrafts.id,
      draft_kind: ticketDrafts.kind,
    })
    .from(ticketDrafts)
    .innerJoin(conversations, eq(conversations.id, ticketDrafts.conversation_id))
    .leftJoin(users, eq(users.id, conversations.assigned_to_user_id))
    .where(
      and(
        eq(conversations.employee_id, employeeId),
        eq(ticketDrafts.status, 'confirmed'),
        or(eq(ticketDrafts.result_ticket_code, code), eq(ticketDrafts.target_ticket_code, code)),
      ),
    )
    .orderBy(desc(ticketDrafts.created_at));

  const rows = new Map<string, AttendanceRow>();
  for (const row of draftRows) {
    if (rows.has(row.conversation_id)) continue;
    rows.set(row.conversation_id, {
      conversation_id: row.conversation_id,
      started_at: row.started_at,
      status: row.status,
      closed_reason: row.closed_reason,
      analyst_name: row.analyst_name,
      draft_id: row.draft_id,
      relation:
        row.draft_kind === 'create' ? 'created' : row.draft_kind === 'update' ? 'updated' : 'reopened',
    });
  }

  const focusRows = await db
    .select({
      conversation_id: conversations.id,
      started_at: conversations.created_at,
      status: conversations.status,
      closed_reason: conversations.closed_reason,
      analyst_name: users.name,
    })
    .from(conversations)
    .leftJoin(users, eq(users.id, conversations.assigned_to_user_id))
    .where(and(eq(conversations.employee_id, employeeId), eq(conversations.focus_ticket_code, code)));
  for (const row of focusRows) {
    if (rows.has(row.conversation_id)) continue;
    rows.set(row.conversation_id, {
      ...row,
      draft_id: null,
      relation: 'focus',
    });
  }
  if (rows.size === 0) return [];

  const candidates = [...rows.values()];
  const candidateIds = candidates.map((row) => row.conversation_id);
  const messageRows = await db
    .select({ id: messages.id, conversation_id: messages.conversation_id, parts: messages.parts })
    .from(messages)
    .where(inArray(messages.conversation_id, candidateIds));
  const cardMessages = new Map<string, string>();
  for (const row of messageRows) {
    for (const part of row.parts as MessagePart[]) {
      if (part.kind !== 'draft_card') continue;
      cardMessages.set(`${row.conversation_id}:${part.draft_id}`, row.id);
    }
  }

  return candidates
    .sort((a, b) => b.started_at.getTime() - a.started_at.getTime())
    .map((row) => ({
      conversation_id: row.conversation_id,
      started_at: row.started_at.toISOString(),
      status: row.status as ConversationStatus,
      label: labelFor(row),
      relation: row.relation,
      message_id: row.draft_id ? (cardMessages.get(`${row.conversation_id}:${row.draft_id}`) ?? null) : null,
    }));
}
