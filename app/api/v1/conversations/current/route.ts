import { ok, withRoute } from '@/lib/api/wrappers';
import { env, serverNow } from '@/lib/env';
import { loginAt } from '@/lib/auth/session';
import { getCurrentForEmployee, getSession, touchSession } from '@/lib/conversations/attendance';
import { currentDataOf } from '@/lib/conversations/employee-view';

export const dynamic = 'force-dynamic';

export const GET = withRoute({ role: 'employee' }, async ({ session, requestId }) => {
  await touchSession(session.user_id, session.sid, loginAt(session));
  const conv = await getCurrentForEmployee(session.user_id, serverNow());
  const employeeSession = await getSession(session.user_id);
  return ok(
    await currentDataOf(session.user_id, conv, {
      count: employeeSession?.message_count ?? 0,
      limit: env.SESSION_MESSAGE_LIMIT,
    }),
    { requestId },
  );
});
