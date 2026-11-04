import { ok, withRoute } from '@/lib/api/wrappers';
import { getTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import type { TicketHit } from '@/lib/contracts/tickets';
import { listForAnalyst, type QueueFilter } from '@/lib/conversations/queries';
import { getOrCreateWithAgent } from '@/lib/conversations/attendance';
import { attendanceSummaryOf } from '@/lib/conversations/employee-view';
import { serverNow } from '@/lib/env';

export const dynamic = 'force-dynamic';

const FILTERS: QueueFilter[] = ['all', 'for_you', 'with_agent', 'mine'];
/** A busca não espera o legado: se ele demorar ou cair, a fila sai só com nome e mensagens. */
const TICKET_SEARCH_WAIT_MS = 800;

async function findMatchingTickets(q: string): Promise<TicketHit[]> {
  const timeout = new Promise<TicketHit[]>((r) => setTimeout(() => r([]), TICKET_SEARCH_WAIT_MS));
  return Promise.race([
    getTicketsClient()
      .search(q)
      .catch(() => []),
    timeout,
  ]);
}

export const GET = withRoute({ role: 'analyst' }, async ({ req, session, requestId }) => {
  const url = new URL(req.url);
  const f = url.searchParams.get('filter') as QueueFilter | null;
  const filter = f && FILTERS.includes(f) ? f : 'all';
  const q = url.searchParams.get('q')?.trim().slice(0, 100) || undefined;
  const ticketHits = q ? await findMatchingTickets(q) : [];
  return ok(await listForAnalyst(session.user_id, { filter, q, ticketHits }), { requestId });
});

export const POST = withRoute({ role: 'employee' }, async ({ session, requestId }) => {
  const { conversation, created } = await getOrCreateWithAgent(session.user_id, serverNow());
  const summary = await attendanceSummaryOf(conversation);
  return ok(summary, { status: created ? 201 : 200, requestId });
});
