import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { searchPattern, unaccented, isShortTerm } from '@/lib/db/search';
import type { DbOrTx } from '@/lib/db/client';
import { ticketEvents, tickets } from '@/lib/db/schema';
import type { CreateTicketInput, Ticket, TicketEvent, TicketHit } from '@/lib/contracts/tickets';
import { TYPE_PREFIX } from '@/lib/contracts/enums';
import { computeDeadline } from '@/lib/rules/deadline';
import type { Priority, TicketStatus } from '@/lib/contracts/enums';

type Row = typeof tickets.$inferSelect;

export function toTicket(r: Row): Ticket {
  return {
    code: r.code,
    type: r.type as Ticket['type'],
    title: r.title,
    description: r.description,
    category: r.category as Ticket['category'],
    subcategory: r.subcategory,
    priority: r.priority as Ticket['priority'],
    affected: r.affected as Ticket['affected'],
    status: r.status as Ticket['status'],
    requester_id: r.requester_id,
    assignee_name: r.assignee_name,
    due_at: r.due_at.toISOString(),
    last_update_at: r.last_update_at.toISOString(),
    resolved_at: r.resolved_at?.toISOString() ?? null,
    created_at: r.created_at.toISOString(),
  };
}

const OPEN_STATUSES: TicketStatus[] = ['open', 'in_progress', 'awaiting_analyst', 'approved'];

export async function listByRequester(db: DbOrTx, requesterId: string, status: 'open' | 'all' = 'all') {
  const where =
    status === 'open'
      ? and(eq(tickets.requester_id, requesterId), inArray(tickets.status, OPEN_STATUSES))
      : eq(tickets.requester_id, requesterId);
  const rows = await db.select().from(tickets).where(where).orderBy(desc(tickets.last_update_at));
  return rows.map(toTicket);
}

/** Busca por código **e** dono: chamado alheio e inexistente são indistinguíveis. */
export async function findOwned(
  db: DbOrTx,
  code: string,
  requesterId: string,
  opts: { lock?: boolean } = { lock: true },
): Promise<Row | null> {
  const q = db
    .select()
    .from(tickets)
    .where(and(eq(tickets.code, code), eq(tickets.requester_id, requesterId)));
  const [row] = opts.lock ? await q.for('update') : await q;
  return row ?? null;
}

/** Chamados de qualquer solicitante cujo código ou título começa com o termo (busca do console). */
export async function searchTickets(db: DbOrTx, term: string, limit = 50): Promise<TicketHit[]> {
  const codePattern = searchPattern(term);
  const title = searchPattern(term, { wholeWord: isShortTerm(term) });
  if (!codePattern || !title) return [];
  return db
    .select({ requester_id: tickets.requester_id, code: tickets.code, title: tickets.title })
    .from(tickets)
    .where(or(sql`${unaccented(tickets.code)} ~ ${codePattern}`, sql`${unaccented(tickets.title)} ~ ${title}`))
    .orderBy(desc(tickets.last_update_at))
    .limit(limit);
}

/** Histórico do chamado, do mais antigo ao mais recente. */
export async function listEvents(db: DbOrTx, ticketId: string): Promise<TicketEvent[]> {
  const rows = await db
    .select()
    .from(ticketEvents)
    .where(eq(ticketEvents.ticket_id, ticketId))
    .orderBy(asc(ticketEvents.created_at), asc(ticketEvents.id));
  return rows.map((e) => ({
    kind: e.kind as TicketEvent['kind'],
    body: e.body,
    actor: e.actor,
    created_at: e.created_at.toISOString(),
  }));
}

export async function createTicket(db: DbOrTx, input: CreateTicketInput, now: Date): Promise<Ticket> {
  const seq = input.type === 'incident' ? 'tickets.inc_seq' : 'tickets.req_seq';
  const [n] = await db.execute<{ n: string }>(sql.raw(`select nextval('${seq}')::text as n`));
  const code = `${TYPE_PREFIX[input.type]}-${n!.n}`;
  const [row] = await db
    .insert(tickets)
    .values({
      code,
      type: input.type,
      title: input.title,
      description: input.description,
      category: input.category,
      subcategory: input.subcategory ?? null,
      priority: input.priority,
      affected: input.affected,
      status: 'open',
      requester_id: input.requester_id,
      due_at: computeDeadline(input.priority, now).due_at,
      last_update_at: now,
      created_at: now,
    })
    .returning();
  await db.insert(ticketEvents).values({ ticket_id: row!.id, kind: 'created', body: input.description, actor: 'agent', created_at: now });
  return toTicket(row!);
}

export async function touch(
  db: DbOrTx,
  row: Row,
  now: Date,
  changes: { status?: TicketStatus; resolved_at?: Date | null },
  event: { kind: 'comment' | 'status_changed' | 'transferred' | 'reopened'; body: string; actor: string },
): Promise<Ticket> {
  const [updated] = await db
    .update(tickets)
    .set({
      ...changes,
      last_update_at: now,
      due_at: computeDeadline(row.priority as Priority, now).due_at,
    })
    .where(eq(tickets.id, row.id))
    .returning();
  await db.insert(ticketEvents).values({ ticket_id: row.id, ...event, created_at: now });
  return toTicket(updated!);
}
