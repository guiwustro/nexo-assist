import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { getTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { serverNow } from '@/lib/env';
import { descreverAtraso, estaVencido } from '@/lib/regras/vencido';

export const dynamic = 'force-dynamic';

const ENCERRADOS = new Set(['resolved', 'closed']);

/** Painel "Chamados da Ana" no console — pela mesma borda de chamados do agent. */
export const GET = withRoute(
  { role: 'analyst', params: z.object({ id: z.string().uuid() }) },
  async ({ params, requestId }) => {
    const now = serverNow();
    const list = await getTicketsClient().listByRequester(params.id, 'all');
    const tickets = list.map((t) => ({ ...t, overdue: estaVencido(t, now), overdue_label: descreverAtraso(t, now) }));
    const closed = tickets.filter((t) => ENCERRADOS.has(t.status)).length;
    return ok({ tickets, open: tickets.length - closed, closed }, { requestId });
  },
);
