import { and, desc, eq, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '@/lib/db/client';
import { aiAgentRuns, conversations, handoffs, messages as messagesTable, users } from '@/lib/db/schema';
import { toApiMessage, type ApiMessage } from './serialize';
import { serverNow } from '@/lib/env';

export type QueueFilter = 'all' | 'for_you' | 'with_agent' | 'mine';

export type TagKind =
  | 'transferred'
  | 'agent_asked_help'
  | 'agent_handling'
  | 'resolved_by_agent'
  | 'closed'
  | 'with_me'
  | 'with_other';

export type QueueItem = {
  id: string;
  employee: { id: string; name: string; department: string };
  status: 'ai_handling' | 'pending' | 'claimed' | 'closed';
  assigned_to: { id: string; name: string } | null;
  tag: { kind: TagKind; label: string };
  last_message_preview: string | null;
  last_message_at: string | null;
  unread: number;
  focus_ticket_code: string | null;
  handoff: { reason_code: string; support_level: string; due_at: string; confidence: number | null } | null;
};

const assignee = alias(users, 'assignee');

function filtro(analystId: string, f: QueueFilter): SQL | undefined {
  switch (f) {
    case 'for_you':
      return eq(conversations.status, 'pending');
    case 'with_agent':
      return eq(conversations.status, 'ai_handling');
    case 'mine':
      return and(eq(conversations.status, 'claimed'), eq(conversations.assigned_to_user_id, analystId));
    default:
      return undefined;
  }
}

function minutosAte(due: Date, agora: Date): string {
  const min = Math.round((due.getTime() - agora.getTime()) / 60_000);
  if (min <= 0) return 'contato atrasado';
  if (min < 60) return `contato em ${min} min`;
  const h = Math.round(min / 60);
  return `contato em ${h} h`;
}

export function tagFor(
  row: {
    status: string;
    assigned_to_user_id: string | null;
    assignee_name: string | null;
    had_analyst: boolean;
    focus_ticket_code: string | null;
    handoff: QueueItem['handoff'];
  },
  analystId: string,
  agora: Date,
): QueueItem['tag'] {
  if (row.status === 'claimed') {
    return row.assigned_to_user_id === analystId
      ? { kind: 'with_me', label: 'Você está atendendo' }
      : { kind: 'with_other', label: `Com ${row.assignee_name ?? 'outro analista'}` };
  }
  if (row.status === 'pending') {
    if (row.handoff?.reason_code === 'low_confidence' && row.handoff.confidence !== null) {
      return { kind: 'agent_asked_help', label: `Agent pediu ajuda · confiança ${Math.round(row.handoff.confidence * 100)}%` };
    }
    if (row.handoff?.reason_code === 'session_limit') {
      return { kind: 'transferred', label: 'Transferida · limite da sessão' };
    }
    const code = row.focus_ticket_code;
    if (code) return { kind: 'transferred', label: `Transferida · ${code}` };
    return {
      kind: 'transferred',
      label: `Transferida · ${row.handoff ? minutosAte(new Date(row.handoff.due_at), agora) : 'aguardando'}`,
    };
  }
  if (row.status === 'closed') {
    return row.had_analyst ? { kind: 'closed', label: 'Encerrada' } : { kind: 'resolved_by_agent', label: 'Resolvida pelo agent' };
  }
  return { kind: 'agent_handling', label: 'Agent atendendo' };
}

export async function listForAnalyst(
  analystId: string,
  filter: QueueFilter = 'all',
  q?: string,
  agora: Date = serverNow(),
  onlyId?: string,
): Promise<QueueItem[]> {
  const db = getDb();
  const latest = db
    .selectDistinctOn([handoffs.conversation_id], {
      conversation_id: handoffs.conversation_id,
      reason_code: handoffs.reason_code,
      support_level: handoffs.support_level,
      due_at: handoffs.due_at,
      confidence: handoffs.confidence,
      acknowledged_by: handoffs.acknowledged_by,
    })
    .from(handoffs)
    .orderBy(handoffs.conversation_id, desc(handoffs.created_at))
    .as('latest');

  const termo = q?.trim();
  const busca = termo
    ? or(
        ilike(users.name, `%${termo}%`),
        ilike(conversations.last_message_preview, `%${termo}%`),
        ilike(conversations.focus_ticket_code, `%${termo}%`),
      )
    : undefined;

  const rows = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      assigned_to_user_id: conversations.assigned_to_user_id,
      assignee_name: assignee.name,
      focus_ticket_code: conversations.focus_ticket_code,
      last_message_preview: conversations.last_message_preview,
      last_message_at: conversations.last_message_at,
      unread: conversations.unread_count_for_assignee,
      employee_id: users.id,
      employee_name: users.name,
      department: users.department,
      h_reason: latest.reason_code,
      h_level: latest.support_level,
      h_due: latest.due_at,
      h_conf: latest.confidence,
      had_analyst: sql<boolean>`exists (select 1 from messages m where m.conversation_id = ${conversations.id} and m.metadata->>'event' = 'claim')`,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.employee_id))
    .leftJoin(assignee, eq(assignee.id, conversations.assigned_to_user_id))
    .leftJoin(latest, eq(latest.conversation_id, conversations.id))
    .where(and(filtro(analystId, filter), busca, onlyId ? eq(conversations.id, onlyId) : undefined))
    .orderBy(sql`${conversations.last_message_at} desc nulls last`);

  return rows.map((r) => {
    const handoff = r.h_reason
      ? {
          reason_code: r.h_reason,
          support_level: r.h_level ?? 'N1',
          due_at: (r.h_due ?? new Date()).toISOString(),
          confidence: r.h_conf ?? null,
        }
      : null;
    return {
      id: r.id,
      employee: { id: r.employee_id, name: r.employee_name, department: r.department },
      status: r.status as QueueItem['status'],
      assigned_to: r.assigned_to_user_id ? { id: r.assigned_to_user_id, name: r.assignee_name ?? '' } : null,
      tag: tagFor(
        {
          status: r.status,
          assigned_to_user_id: r.assigned_to_user_id,
          assignee_name: r.assignee_name,
          had_analyst: r.had_analyst,
          focus_ticket_code: r.focus_ticket_code,
          handoff,
        },
        analystId,
        agora,
      ),
      last_message_preview: r.last_message_preview,
      last_message_at: r.last_message_at?.toISOString() ?? null,
      unread: r.assigned_to_user_id === analystId || r.status === 'pending' ? r.unread : 0,
      focus_ticket_code: r.focus_ticket_code,
      handoff,
    };
  });
}

export async function countsForAnalyst(analystId: string): Promise<Record<QueueFilter, number>> {
  const [r] = await getDb()
    .select({
      all: sql<number>`count(*)::int`,
      for_you: sql<number>`count(*) filter (where ${conversations.status} = 'pending')::int`,
      with_agent: sql<number>`count(*) filter (where ${conversations.status} = 'ai_handling')::int`,
      mine: sql<number>`count(*) filter (where ${conversations.status} = 'claimed' and ${conversations.assigned_to_user_id} = ${analystId})::int`,
    })
    .from(conversations);
  return { all: r?.all ?? 0, for_you: r?.for_you ?? 0, with_agent: r?.with_agent ?? 0, mine: r?.mine ?? 0 };
}

/** Mensagens mais recentes primeiro na consulta, devolvidas em ordem cronológica. `cursor` = created_at ISO. */
export async function listMessages(conversationId: string, opts: { limit?: number; cursor?: string } = {}): Promise<{
  messages: ApiMessage[];
  next_cursor: string | null;
}> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const db = getDb();
  const rows = await db
    .select({
      m: messagesTable,
      sender: users.name,
      sender_level: users.support_level,
      tool_calls: aiAgentRuns.tool_calls,
      has_decision: sql<boolean>`${aiAgentRuns.decision} is not null`,
    })
    .from(messagesTable)
    .leftJoin(users, eq(users.id, messagesTable.sent_by_user_id))
    .leftJoin(aiAgentRuns, eq(aiAgentRuns.id, messagesTable.agent_run_id))
    .where(
      and(
        eq(messagesTable.conversation_id, conversationId),
        opts.cursor ? lt(messagesTable.created_at, new Date(opts.cursor)) : undefined,
      ),
    )
    .orderBy(desc(messagesTable.created_at), desc(messagesTable.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit).reverse();
  return {
    messages: page.map((r) =>
      toApiMessage(
        r.m,
        r.sender,
        r.tool_calls ? { tool_calls: r.tool_calls, has_decision: Boolean(r.has_decision) } : null,
        r.sender_level,
      ),
    ),
    next_cursor: rows.length > limit ? (page[0]?.m.created_at.toISOString() ?? null) : null,
  };
}
