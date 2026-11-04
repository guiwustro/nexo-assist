import { ok, withRoute } from '@/lib/api/wrappers';
import { getTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import type { TicketHit } from '@/lib/contracts/tickets';
import { listForAnalyst, type QueueFilter } from '@/lib/conversations/queries';

export const dynamic = 'force-dynamic';

const FILTROS: QueueFilter[] = ['all', 'for_you', 'with_agent', 'mine'];
/** A busca não espera o legado: se ele demorar ou cair, a fila sai só com nome e mensagens. */
const ESPERA_DOS_CHAMADOS_MS = 800;

async function chamadosQueCasam(q: string): Promise<TicketHit[]> {
  const espera = new Promise<TicketHit[]>((r) => setTimeout(() => r([]), ESPERA_DOS_CHAMADOS_MS));
  return Promise.race([getTicketsClient().search(q).catch(() => []), espera]);
}

export const GET = withRoute({ role: 'analyst' }, async ({ req, session, requestId }) => {
  const url = new URL(req.url);
  const f = url.searchParams.get('filter') as QueueFilter | null;
  const filter = f && FILTROS.includes(f) ? f : 'all';
  const q = url.searchParams.get('q')?.trim().slice(0, 100) || undefined;
  const ticketHits = q ? await chamadosQueCasam(q) : [];
  return ok(await listForAnalyst(session.user_id, { filter, q, ticketHits }), { requestId });
});
