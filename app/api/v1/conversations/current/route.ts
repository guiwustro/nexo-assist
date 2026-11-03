import { ok, withRoute } from '@/lib/api/wrappers';
import { env } from '@/lib/env';
import { getOrCreateCurrent } from '@/lib/conversations/service';
import { listMessages } from '@/lib/conversations/queries';
import { toApiConversation } from '@/lib/conversations/serialize';

export const dynamic = 'force-dynamic';

export const GET = withRoute({ role: 'employee' }, async ({ session, requestId }) => {
  const conv = await getOrCreateCurrent(session.user_id, session.sid);
  const { messages, next_cursor } = await listMessages(conv.id, { limit: 50 });
  return ok(
    {
      conversation: toApiConversation(conv),
      messages,
      next_cursor,
      session: { count: conv.session_message_count, limit: env.SESSION_MESSAGE_LIMIT },
    },
    { requestId },
  );
});
