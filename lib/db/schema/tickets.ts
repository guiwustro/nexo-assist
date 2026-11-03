import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ticketsSchema = pgSchema('tickets');

export const incSeq = ticketsSchema.sequence('inc_seq', { startWith: 20500 });
export const reqSeq = ticketsSchema.sequence('req_seq', { startWith: 10500 });

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const tickets = ticketsSchema.table(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    subcategory: text('subcategory'),
    priority: text('priority').notNull(),
    affected: text('affected').notNull(),
    status: text('status').notNull().default('open'),
    /** Sem FK para public.users: é outro sistema, como um legado de verdade. */
    requester_id: uuid('requester_id').notNull(),
    assignee_name: text('assignee_name'),
    due_at: tstz('due_at').notNull(),
    last_update_at: tstz('last_update_at').notNull().defaultNow(),
    resolved_at: tstz('resolved_at'),
    created_at: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('tickets_requester_idx').on(t.requester_id, t.last_update_at),
    check('tickets_type_check', sql`${t.type} in ('incident','request')`),
    check(
      'tickets_category_check',
      sql`${t.category} in ('access','network_vpn','hardware','software','email','other')`,
    ),
    check('tickets_priority_check', sql`${t.priority} in ('critical','high','medium','low')`),
    check('tickets_affected_check', sql`${t.affected} in ('me','team','company')`),
    check(
      'tickets_status_check',
      sql`${t.status} in ('open','in_progress','awaiting_analyst','approved','resolved','closed')`,
    ),
  ],
);

export const ticketEvents = ticketsSchema.table(
  'ticket_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticket_id: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    body: text('body').notNull().default(''),
    actor: text('actor').notNull(),
    created_at: tstz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'ticket_events_kind_check',
      sql`${t.kind} in ('created','comment','status_changed','transferred','reopened')`,
    ),
  ],
);

export const ticketsIdempotencyKeys = ticketsSchema.table('idempotency_keys', {
  key: text('key').primaryKey(),
  scope: text('scope').notNull(),
  request_hash: text('request_hash').notNull(),
  response_status: integer('response_status'),
  response_body: jsonb('response_body'),
  created_at: tstz('created_at').notNull().defaultNow(),
});
