import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ActionTrace, TurnDecision } from '@/lib/contracts/decision';
import type { DraftPayload } from '@/lib/contracts/drafts';
import type { MessagePart } from '@/lib/contracts/parts';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const draftSeq = pgSequence('draft_seq', { startWith: 381 });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    department: text('department').notNull(),
    support_level: text('support_level'),
    created_at: createdAt(),
  },
  (t) => [
    check('users_role_check', sql`${t.role} in ('employee','analyst')`),
    check('users_support_level_check', sql`${t.support_level} is null or ${t.support_level} in ('N1','N2')`),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employee_id: uuid('employee_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('ai_handling'),
    status_changed_at: tstz('status_changed_at').notNull().defaultNow(),
    assigned_to_user_id: uuid('assigned_to_user_id').references(() => users.id),
    assigned_at: tstz('assigned_at'),
    focus_ticket_code: text('focus_ticket_code'),
    last_message_at: tstz('last_message_at'),
    last_message_preview: text('last_message_preview'),
    unread_count_for_assignee: integer('unread_count_for_assignee').notNull().default(0),
    session_id: text('session_id'),
    session_message_count: integer('session_message_count').notNull().default(0),
    session_started_at: tstz('session_started_at'),
    summary: text('summary'),
    last_handoff_at: tstz('last_handoff_at'),
    last_handoff_reason: text('last_handoff_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    created_at: createdAt(),
    updated_at: tstz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_employee_unique').on(t.employee_id),
    index('conversations_status_idx').on(t.status, t.last_message_at),
    check('conversations_status_check', sql`${t.status} in ('ai_handling','pending','claimed','closed')`),
    check(
      'conversations_claimed_has_assignee',
      sql`${t.status} <> 'claimed' or ${t.assigned_to_user_id} is not null`,
    ),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    type: text('type').notNull().default('text'),
    sent_via: text('sent_via').notNull(),
    sent_by_user_id: uuid('sent_by_user_id').references(() => users.id),
    body: text('body').notNull(),
    parts: jsonb('parts').$type<MessagePart[]>().notNull().default([]),
    agent_run_id: uuid('agent_run_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    created_at: createdAt(),
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversation_id, t.created_at),
    check('messages_direction_check', sql`${t.direction} in ('inbound','outbound')`),
    check('messages_type_check', sql`${t.type} in ('text','system')`),
    check('messages_sent_via_check', sql`${t.sent_via} in ('user','ai','system')`),
  ],
);

export const aiAgentRuns = pgTable(
  'ai_agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    inbound_message_id: uuid('inbound_message_id'),
    outbound_message_id: uuid('outbound_message_id'),
    status: text('status').notNull().default('running'),
    error_code: text('error_code'),
    error_message: text('error_message'),
    model: text('model'),
    tokens_in: integer('tokens_in').notNull().default(0),
    tokens_out: integer('tokens_out').notNull().default(0),
    cost_cents: numeric('cost_cents', { precision: 12, scale: 4, mode: 'number' }),
    latency_ms: integer('latency_ms'),
    steps_count: integer('steps_count').notNull().default(0),
    tool_calls: jsonb('tool_calls').$type<ActionTrace[]>().notNull().default([]),
    decision: jsonb('decision').$type<TurnDecision>(),
    started_at: tstz('started_at').notNull().defaultNow(),
    completed_at: tstz('completed_at'),
  },
  (t) => [
    index('ai_agent_runs_conversation_idx').on(t.conversation_id, t.started_at),
    check(
      'ai_agent_runs_status_check',
      sql`${t.status} in ('running','completed','failed','aborted','handoff')`,
    ),
  ],
);

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agent_run_id: uuid('agent_run_id'),
    purpose: text('purpose').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    input_tokens: integer('input_tokens').notNull().default(0),
    output_tokens: integer('output_tokens').notNull().default(0),
    cache_read_tokens: integer('cache_read_tokens').notNull().default(0),
    cost_cents: numeric('cost_cents', { precision: 12, scale: 4, mode: 'number' }),
    latency_ms: integer('latency_ms').notNull().default(0),
    created_at: createdAt(),
  },
  (t) => [
    index('llm_calls_created_idx').on(t.created_at),
    check('llm_calls_purpose_check', sql`${t.purpose} in ('agent_turn','decision','summary')`),
  ],
);

export const ticketDrafts = pgTable(
  'ticket_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    agent_run_id: uuid('agent_run_id'),
    kind: text('kind').notNull(),
    target_ticket_code: text('target_ticket_code'),
    payload: jsonb('payload').$type<DraftPayload>().notNull(),
    status: text('status').notNull().default('pending'),
    idempotency_key: uuid('idempotency_key').notNull().defaultRandom(),
    result_ticket_code: text('result_ticket_code'),
    error_code: text('error_code'),
    created_at: createdAt(),
    /** Primeira tentativa de envio ao sistema de chamados: depois dela o conteúdo não muda mais (idempotência). */
    sent_at: tstz('sent_at'),
    decided_at: tstz('decided_at'),
  },
  (t) => [
    check('ticket_drafts_kind_check', sql`${t.kind} in ('create','update','reopen')`),
    check('ticket_drafts_status_check', sql`${t.status} in ('pending','confirmed','cancelled','failed')`),
  ],
);

export const handoffs = pgTable(
  'handoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    ticket_code: text('ticket_code'),
    origin: text('origin').notNull(),
    reason_code: text('reason_code').notNull(),
    support_level: text('support_level').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    employee_words: text('employee_words').notNull().default(''),
    agent_reading: text('agent_reading').notNull().default(''),
    attempts: jsonb('attempts').$type<ActionTrace[]>().notNull().default([]),
    confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }),
    due_at: tstz('due_at').notNull(),
    created_at: createdAt(),
    acknowledged_by: uuid('acknowledged_by').references(() => users.id),
    acknowledged_at: tstz('acknowledged_at'),
  },
  (t) => [
    index('handoffs_conversation_idx').on(t.conversation_id, t.created_at),
    check(
      'handoffs_origin_check',
      sql`${t.origin} in ('explicit_request','trigger','model_tool','session_limit','guardrail','budget')`,
    ),
    check(
      'handoffs_reason_check',
      sql`${t.reason_code} in ('requested_human','critical_priority','overdue_ticket','low_confidence','session_limit','budget_exceeded')`,
    ),
    check('handoffs_level_check', sql`${t.support_level} in ('N1','N2')`),
    check(
      'handoffs_ack_coherence',
      sql`(${t.acknowledged_by} is null) = (${t.acknowledged_at} is null)`,
    ),
  ],
);

export const knowledgeArticles = pgTable('knowledge_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  applies_to: text('applies_to'),
  created_at: createdAt(),
});

export const eventLog = pgTable(
  'event_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    event_type: text('event_type').notNull(),
    conversation_id: uuid('conversation_id'),
    actor_user_id: uuid('actor_user_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    /**
     * Transação que gravou o evento. O SSE lê em ordem (tx_id, id) e só até a transação aberta mais antiga:
     * um id menor que commita depois de um maior não fica para trás do cursor.
     */
    tx_id: bigint('tx_id', { mode: 'number' })
      .notNull()
      .default(sql`(pg_current_xact_id()::text::bigint)`),
    created_at: createdAt(),
  },
  (t) => [
    index('event_log_conversation_idx').on(t.conversation_id, t.id),
    index('event_log_tx_idx').on(t.tx_id, t.id),
    check('event_log_type_check', sql`${t.event_type} ~ '^[a-z_]+\\.[a-z_]+$'`),
  ],
);

export const apiAuditLog = pgTable('api_audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  request_id: text('request_id'),
  user_id: uuid('user_id'),
  action: text('action').notNull(),
  method: text('method'),
  path: text('path'),
  status: integer('status'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  created_at: createdAt(),
});

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(),
  scope: text('scope').notNull(),
  request_hash: text('request_hash').notNull(),
  response_status: integer('response_status'),
  response_body: jsonb('response_body'),
  created_at: createdAt(),
  expires_at: tstz('expires_at')
    .notNull()
    .default(sql`now() + interval '24 hours'`),
});
