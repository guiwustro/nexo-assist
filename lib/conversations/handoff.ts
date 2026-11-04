import { eq } from 'drizzle-orm';
import { Conflict, NotFound } from '@/lib/api/errors';
import { getDb, type Tx } from '@/lib/db/client';
import { conversations, handoffs } from '@/lib/db/schema';
import { emitEvent } from '@/lib/event-log/emit';
import type { ActionTrace } from '@/lib/contracts/decision';
import type { ConversationStatus, Priority, ReasonCode, SupportLevel } from '@/lib/contracts/enums';
import { transition } from '@/lib/rules/conversation-state';
import { computeDeadline, timeInSaoPaulo } from '@/lib/rules/deadline';
import { serverNow } from '@/lib/env';
import { appendMessage } from './service';

export type Handoff = typeof handoffs.$inferSelect;
export type HandoffOrigin = 'explicit_request' | 'trigger' | 'model_tool' | 'session_limit' | 'guardrail' | 'budget';

export type HandoffInput = {
  conversation_id: string;
  ticket_code?: string | null;
  ticket_priority?: Priority;
  origin: HandoffOrigin;
  reason_code: ReasonCode;
  level: SupportLevel;
  employee_words: string;
  agent_reading: string;
  attempts: ActionTrace[];
  confidence?: number | null;
};

const TITULO: Record<ReasonCode, string> = {
  requested_human: 'Pediu para falar com um analista',
  critical_priority: 'Caso crítico',
  overdue_ticket: 'Chamado vencido',
  low_confidence: 'Agent pediu ajuda',
  session_limit: 'Limite de mensagens da sessão',
  budget_exceeded: 'Assistente atingiu o limite de uso de hoje',
};

export function briefing(employee_words: string, agent_reading: string): string {
  return `Palavras do funcionário: "${employee_words}"\nSegundo o agent — confira: ${agent_reading}`;
}

/**
 * Passa a conversa para um analista: transição `transfer`, briefing (fala literal separada da leitura
 * do agent), prazo da passagem pelo Anexo A, mensagem de sistema e evento — tudo numa transação.
 */
export async function createHandoff(input: HandoffInput, now: Date = serverNow(), tx?: Tx): Promise<Handoff> {
  const run = async (tx: Tx) => {
    const [conv] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, input.conversation_id))
      .for('update');
    if (!conv) throw new NotFound('conversation_not_found', 'Conversa não encontrada');
    const r = transition(conv.status as ConversationStatus, 'transfer');
    if (!r.ok) throw new Conflict('invalid_transition', `Conversa em ${conv.status} não pode ser transferida`);
    const agora = new Date();
    await tx
      .update(conversations)
      .set({
        status: r.next,
        status_changed_at: agora,
        last_handoff_at: agora,
        last_handoff_reason: input.reason_code,
        focus_ticket_code: input.ticket_code ?? conv.focus_ticket_code,
        updated_at: agora,
      })
      .where(eq(conversations.id, conv.id));
    const [h] = await tx
      .insert(handoffs)
      .values({
        conversation_id: conv.id,
        ticket_code: input.ticket_code ?? null,
        origin: input.origin,
        reason_code: input.reason_code,
        support_level: input.level,
        title: TITULO[input.reason_code],
        body: briefing(input.employee_words, input.agent_reading),
        employee_words: input.employee_words,
        agent_reading: input.agent_reading,
        attempts: input.attempts,
        confidence: input.confidence ?? null,
        due_at: computeDeadline(input.ticket_priority ?? 'high', now).due_at,
      })
      .returning();
    await appendMessage(tx, {
      conversation_id: conv.id,
      direction: 'outbound',
      type: 'system',
      sent_via: 'system',
      body: `Transferida para Suporte ${input.level} · ${timeInSaoPaulo(now)}`,
      parts: [{ kind: 'handoff_notice', reason_code: input.reason_code, level: input.level }],
      metadata: { handoff_id: h!.id },
    });
    await emitEvent(tx, {
      type: 'conversation.transferred',
      conversation_id: conv.id,
      payload: { handoff_id: h!.id, reason_code: input.reason_code, level: input.level },
    });
    return h!;
  };
  return tx ? run(tx) : getDb().transaction(run);
}
