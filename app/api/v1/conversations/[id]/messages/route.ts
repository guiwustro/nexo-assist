import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { z } from 'zod';
import { Conflict, NotFound } from '@/lib/api/errors';
import { fail, ok, withRoute } from '@/lib/api/wrappers';
import { chatLimiter } from '@/lib/api/rate-limit';
import { env } from '@/lib/env';
import { getDb } from '@/lib/db/client';
import { appendMessage, comAnalista, getConversation, getOrCreateCurrent } from '@/lib/conversations/service';
import { listMessages } from '@/lib/conversations/queries';
import { toApiMessage } from '@/lib/conversations/serialize';
import { runTurn } from '@/lib/agent-engine/agent/run-turn';
import type { NexoUIMessage } from '@/lib/contracts/ui';
import type { ConversationStatus } from '@/lib/contracts/enums';
import type { Session } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Params = z.object({ id: z.string().uuid() });
const Body = z.object({ text: z.string().trim().min(1).max(2000) });

async function conversaVisivel(id: string, session: Session) {
  const conv = await getConversation(getDb(), id);
  if (!conv || (session.role === 'employee' && conv.employee_id !== session.user_id)) {
    throw new NotFound('conversation_not_found', 'Conversa não encontrada');
  }
  return conv;
}

export const GET = withRoute({ role: 'any', params: Params }, async ({ req, session, params, requestId }) => {
  await conversaVisivel(params.id, session);
  const cursor = new URL(req.url).searchParams.get('cursor') ?? undefined;
  const page = await listMessages(params.id, { cursor, limit: 50 });
  return ok(page.messages, { requestId, meta: { next_cursor: page.next_cursor } });
});

export const POST = withRoute({ role: 'any', params: Params, body: Body }, async ({ session, params, body, requestId }) => {
  if (session.role === 'analyst') {
    const conv = await conversaVisivel(params.id, session);
    if (conv.status !== 'claimed' || conv.assigned_to_user_id !== session.user_id) {
      throw new Conflict('not_claimed', 'Assuma o atendimento para responder');
    }
    const msg = await appendMessage(getDb(), {
      conversation_id: conv.id,
      direction: 'outbound',
      sent_via: 'user',
      sent_by_user_id: session.user_id,
      body: body.text,
    });
    return ok(toApiMessage(msg, session.name, null, null), { status: 201, requestId });
  }

  // Rate limit por funcionário, antes de abrir o stream (o chat mostra um banner com a espera).
  const vez = chatLimiter().take(session.user_id);
  if (!vez.ok) {
    return fail('rate_limited', `Muitas mensagens em pouco tempo, aguarde ${vez.retry_after_s}s`, 429, undefined, {
      requestId,
      headers: { 'retry-after': String(vez.retry_after_s) },
    });
  }

  // Funcionário: a conversa é sempre a dele (a da sessão); outra → 404.
  const conv = await getOrCreateCurrent(session.user_id, session.sid);
  if (conv.id !== params.id) throw new NotFound('conversation_not_found', 'Conversa não encontrada');
  if (conv.session_message_count >= env.SESSION_MESSAGE_LIMIT && !comAnalista(conv.status as ConversationStatus)) {
    throw new Conflict('session_limit_reached', `Limite de ${env.SESSION_MESSAGE_LIMIT} mensagens nesta sessão`);
  }

  const stream = createUIMessageStream<NexoUIMessage>({
    execute: async ({ writer }) => {
      await runTurn({ conversation_id: conv.id, employee: session, text: body.text, writer });
    },
    onError: (e) => {
      console.error(`[chat] turno falhou request_id=${requestId}`, e);
      return e instanceof Conflict ? e.code : 'turn_failed';
    },
  });
  return createUIMessageStreamResponse({ stream, headers: { 'x-request-id': requestId } });
});
