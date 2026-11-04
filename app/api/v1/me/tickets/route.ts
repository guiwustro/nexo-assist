import { ok, withRoute } from '@/lib/api/wrappers';
import { listTicketsOf } from '@/lib/tickets/views';

export const dynamic = 'force-dynamic';

/** "Meus chamados": os chamados do próprio funcionário (identidade da sessão). */
export const GET = withRoute({ role: 'employee' }, async ({ session, requestId }) =>
  ok(await listTicketsOf(session.user_id), { requestId }),
);
