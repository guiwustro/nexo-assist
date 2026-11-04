import { ok, withRoute } from '@/lib/api/wrappers';
import { env, serverNow } from '@/lib/env';
import { loginAt } from '@/lib/auth/session';
import { getCurrentForEmployee, getSession, touchSession } from '@/lib/conversations/attendance';
import { listMessages } from '@/lib/conversations/queries';
import { toApiConversation } from '@/lib/conversations/serialize';

export const dynamic = 'force-dynamic';

export const GET = withRoute({ role: 'employee' }, async ({ session, requestId }) => {
  await touchSession(session.user_id, session.sid, loginAt(session));
  const conv = await getCurrentForEmployee(session.user_id, serverNow());
  const employeeSession = await getSession(session.user_id);
  const { messages, next_cursor } = await listMessages(conv.id, { limit: 50 });
  return ok(
    {
      conversation: toApiConversation(conv),
      messages,
      next_cursor,
      session: { count: employeeSession?.message_count ?? 0, limit: env.SESSION_MESSAGE_LIMIT },
    },
    { requestId },
  );
});
