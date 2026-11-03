import { ok, withRoute } from '@/lib/api/wrappers';
import { listForAnalyst, type QueueFilter } from '@/lib/conversations/queries';

export const dynamic = 'force-dynamic';

const FILTROS: QueueFilter[] = ['all', 'for_you', 'with_agent', 'mine'];

export const GET = withRoute({ role: 'analyst' }, async ({ req, session, requestId }) => {
  const url = new URL(req.url);
  const f = url.searchParams.get('filter') as QueueFilter | null;
  const filter = f && FILTROS.includes(f) ? f : 'all';
  const q = url.searchParams.get('q')?.slice(0, 100) || undefined;
  return ok(await listForAnalyst(session.user_id, filter, q), { requestId });
});
