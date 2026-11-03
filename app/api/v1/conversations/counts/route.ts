import { ok, withRoute } from '@/lib/api/wrappers';
import { countsForAnalyst } from '@/lib/conversations/queries';

export const dynamic = 'force-dynamic';

export const GET = withRoute({ role: 'analyst' }, async ({ session, requestId }) =>
  ok(await countsForAnalyst(session.user_id), { requestId }),
);
