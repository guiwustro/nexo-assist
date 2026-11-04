import { and, eq, sql } from 'drizzle-orm';
import { Conflict, Forbidden, NotFound } from '@/lib/api/errors';
import { getDb, type DbOrTx, type Tx } from '@/lib/db/client';
import { conversations, employeeSessions, messages, users } from '@/lib/db/schema';
import { emitEvent } from '@/lib/event-log/emit';
import type { ConversationStatus } from '@/lib/contracts/enums';
import type { MessagePart } from '@/lib/contracts/parts';
import { transition, type ConversationEvent } from '@/lib/rules/conversation-state';
import { timeInSaoPaulo } from '@/lib/rules/deadline';
import { serverNow } from '@/lib/env';

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Actor = { user_id: string; role: 'employee' | 'analyst' };

export async function getConversation(db: DbOrTx, id: string): Promise<Conversation | null> {
  const [c] = await db.select().from(conversations).where(eq(conversations.id, id));
  return c ?? null;
}

export type NewMessage = {
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  type?: 'text' | 'system';
  sent_via: 'user' | 'ai' | 'system';
  sent_by_user_id?: string | null;
  body: string;
  parts?: MessagePart[];
  agent_run_id?: string | null;
  metadata?: Record<string, unknown>;
};

/** Grava a mensagem, atualiza o resumo da conversa e emite `conversation.message_created`. */
export async function appendMessage(tx: DbOrTx, m: NewMessage): Promise<Message> {
  const [msg] = await tx
    .insert(messages)
    .values({
      conversation_id: m.conversation_id,
      direction: m.direction,
      type: m.type ?? 'text',
      sent_via: m.sent_via,
      sent_by_user_id: m.sent_by_user_id ?? null,
      body: m.body,
      parts: m.parts ?? [],
      agent_run_id: m.agent_run_id ?? null,
      metadata: m.metadata ?? {},
    })
    .returning();
  const isVisible = m.type !== 'system';
  await tx
    .update(conversations)
    .set({
      last_message_at: msg!.created_at,
      updated_at: msg!.created_at,
      ...(isVisible ? { last_message_preview: m.sent_via === 'ai' ? `Nexo: ${m.body}` : m.body } : {}),
      ...(m.direction === 'inbound'
        ? {
            unread_count_for_assignee: sql`case when ${conversations.assigned_to_user_id} is not null then ${conversations.unread_count_for_assignee} + 1 else ${conversations.unread_count_for_assignee} end`,
          }
        : {}),
    })
    .where(eq(conversations.id, m.conversation_id));
  await emitEvent(tx, {
    type: 'conversation.message_created',
    conversation_id: m.conversation_id,
    actor_user_id: m.sent_by_user_id ?? null,
    payload: { message_id: msg!.id, direction: m.direction, sent_via: m.sent_via, type: m.type ?? 'text' },
  });
  return msg!;
}

/**
 * Conta a mensagem do funcionário na sessão. Passou do limite com a conversa indo para o agent → 409
 * `session_limit_reached`. O limite existe para o agent (custo do modelo): com um analista (pendente ou assumida),
 * a mensagem sempre passa — a 30ª transfere justamente para ele continuar.
 */
export async function registerEmployeeMessage(
  conversationId: string,
  body: string,
  limit: number,
): Promise<{ message: Message; count: number; reached_limit: boolean; conversation: Conversation }> {
  return getDb().transaction(async (tx) => {
    const [conv] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for('update');
    if (!conv) throw new NotFound('conversation_not_found', 'Conversa não encontrada');
    const r = transition(conv.status as ConversationStatus, 'employee_message');
    if (!r.ok) throw conflictFor(conv, 'employee_message');

    let [session] = await tx
      .select()
      .from(employeeSessions)
      .where(eq(employeeSessions.employee_id, conv.employee_id))
      .for('update');
    if (!session) {
      [session] = await tx
        .insert(employeeSessions)
        .values({ employee_id: conv.employee_id, session_id: 'legacy', session_started_at: new Date(0) })
        .onConflictDoNothing({ target: employeeSessions.employee_id })
        .returning();
      if (!session) {
        [session] = await tx
          .select()
          .from(employeeSessions)
          .where(eq(employeeSessions.employee_id, conv.employee_id))
          .for('update');
      }
    }
    if (!session) throw new NotFound('employee_session_not_found', 'Sessão do funcionário não encontrada');
    const count = session.message_count + 1;
    if (count > limit && !isWithAnalyst(conv.status as ConversationStatus)) {
      throw new Conflict('session_limit_reached', `Limite de ${limit} mensagens nesta sessão`, { limit });
    }
    const next = r.next;
    const [updated] = await tx
      .update(conversations)
      .set({
        updated_at: new Date(),
        ...(next !== conv.status
          ? { status: next, status_changed_at: new Date(), assigned_to_user_id: null }
          : {}),
      })
      .where(eq(conversations.id, conversationId))
      .returning();
    await tx
      .update(employeeSessions)
      .set({ message_count: count, updated_at: new Date() })
      .where(eq(employeeSessions.employee_id, conv.employee_id));
    const message = await appendMessage(tx, {
      conversation_id: conversationId,
      direction: 'inbound',
      sent_via: 'user',
      sent_by_user_id: conv.employee_id,
      body,
    });
    return { message, count, reached_limit: count >= limit, conversation: updated! };
  });
}

/** A conversa está com um analista (esperando ou assumida): mensagens não passam pelo agent. */
export function isWithAnalyst(status: ConversationStatus): boolean {
  return status === 'pending' || status === 'claimed';
}

async function nameOf(tx: Tx, userId: string): Promise<string> {
  const [u] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return u?.name ?? 'Analista';
}

const TEXT_BY_TRANSITION: Partial<Record<ConversationEvent, (name: string, time: string) => string>> = {
  claim: (name, time) => `${name} assumiu · agent pausado · ${time}`,
  release: (name, time) => `${name} devolveu ao agent · ${time}`,
  close: (name, time) => `Atendimento encerrado por ${name} · ${time}`,
  resolve: (_name, time) => `Atendimento resolvido · ${time}`,
  merge: (name, time) => `${name} devolveu ao agent · juntado ao atendimento atual · ${time}`,
};

const EVENT_BY_TRANSITION: Partial<Record<ConversationEvent, `${string}.${string}`>> = {
  claim: 'conversation.claimed',
  release: 'conversation.released',
  close: 'conversation.closed',
  resolve: 'conversation.closed',
  merge: 'conversation.closed',
};

/**
 * Muda o estado com trava otimista (`WHERE status = <lido>`). Quem perde a corrida recebe 409.
 * `transfer` passa por `createHandoff`, que grava o briefing.
 */
export async function applyTransition(
  conversationId: string,
  event: Exclude<ConversationEvent, 'employee_message'>,
  actor: Actor,
  opts: { expectedStatus?: ConversationStatus; now?: Date; tx?: Tx } = {},
): Promise<Conversation> {
  const run = async (tx: Tx): Promise<Conversation> => {
    const conv = await getConversation(tx, conversationId);
    if (!conv) throw new NotFound('conversation_not_found', 'Conversa não encontrada');
    const read = conv.status as ConversationStatus;
    if (opts.expectedStatus && opts.expectedStatus !== read) throw conflictFor(conv, event);
    const r = transition(read, event);
    if (!r.ok) throw conflictFor(conv, event);
    if (
      (event === 'release' || event === 'close' || event === 'merge') &&
      read === 'claimed' &&
      conv.assigned_to_user_id !== actor.user_id
    ) {
      throw new Forbidden('not_assignee', 'Só quem assumiu a conversa pode fazer isso');
    }
    const now = opts.now ?? serverNow();
    const changedAt = new Date();
    const set =
      event === 'claim'
        ? { assigned_to_user_id: actor.user_id, assigned_at: changedAt, unread_count_for_assignee: 0 }
        : {
            assigned_to_user_id: null,
            assigned_at: null,
            ...(event === 'close' || event === 'resolve' || event === 'merge'
              ? {
                  closed_at: now,
                  closed_reason: event === 'close' ? 'analyst' : event === 'resolve' ? 'resolved' : 'merged',
                }
              : {}),
          };
    const updated = await tx
      .update(conversations)
      .set({ status: r.next, status_changed_at: changedAt, updated_at: changedAt, ...set })
      .where(and(eq(conversations.id, conversationId), eq(conversations.status, read)))
      .returning();
    if (updated.length === 0) {
      const reread = await getConversation(tx, conversationId);
      throw conflictFor(reread ?? conv, event);
    }
    const text = TEXT_BY_TRANSITION[event];
    if (text) {
      await appendMessage(tx, {
        conversation_id: conversationId,
        direction: 'outbound',
        type: 'system',
        sent_via: 'system',
        sent_by_user_id: actor.user_id,
        body: text(await nameOf(tx, actor.user_id), timeInSaoPaulo(now)),
        metadata: { event },
      });
    }
    const type = EVENT_BY_TRANSITION[event];
    if (type) {
      const reason =
        event === 'close'
          ? 'analyst'
          : event === 'resolve'
            ? 'resolved'
            : event === 'merge'
              ? 'merged'
              : undefined;
      await emitEvent(tx, {
        type: type,
        conversation_id: conversationId,
        actor_user_id: actor.user_id,
        payload: { status: r.next, from: read, ...(reason ? { reason } : {}) },
      });
    }
    return updated[0]!;
  };
  try {
    return opts.tx ? await run(opts.tx) : await getDb().transaction(run);
  } catch (e) {
    if (e instanceof Conflict && e.code === 'conversation_already_claimed') throw await withClaimerName(e);
    // Duas transações concorrentes: a perdedora pode bater no CHECK/serialização; relê e explica.
    if (e instanceof Conflict || e instanceof Forbidden || e instanceof NotFound) throw e;
    const conv = await getConversation(getDb(), conversationId);
    if (conv) throw conflictFor(conv, event);
    throw e;
  }
}

async function withClaimerName(e: Conflict): Promise<Conflict> {
  const id = (e.details as { assigned_to_user_id?: string | null } | undefined)?.assigned_to_user_id;
  if (!id) return e;
  const [u] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, id));
  return u
    ? new Conflict(e.code, `${u.name} já assumiu esta conversa`, {
        ...(e.details as object),
        assigned_to_name: u.name,
      })
    : e;
}

function conflictFor(conv: Conversation, event: ConversationEvent): Conflict {
  if (event === 'claim' && conv.status === 'claimed') {
    return new Conflict('conversation_already_claimed', 'Outro analista já assumiu esta conversa', {
      assigned_to_user_id: conv.assigned_to_user_id,
    });
  }
  return new Conflict('invalid_transition', `Não é possível ${event} uma conversa em ${conv.status}`, {
    status: conv.status,
  });
}
