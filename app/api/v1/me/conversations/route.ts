import { ok, withRoute } from '@/lib/api/wrappers';
import { listEmployeeAttendances } from '@/lib/conversations/employee-view';

export const dynamic = 'force-dynamic';

export const GET = withRoute({ role: 'employee' }, async ({ session, requestId }) =>
  ok(await listEmployeeAttendances(session.user_id), { requestId }),
);
