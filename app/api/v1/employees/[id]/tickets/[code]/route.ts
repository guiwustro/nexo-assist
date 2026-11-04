import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { getTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import { serverNow } from '@/lib/env';
import { descreverAtraso, estaVencido } from '@/lib/regras/vencido';

export const dynamic = 'force-dynamic';

/** Detalhe de um chamado no painel do console: dados e histórico do legado. */
export const GET = withRoute(
  { role: 'analyst', params: z.object({ id: z.string().uuid(), code: TicketCodeSchema }) },
  async ({ params, requestId }) => {
    const now = serverNow();
    const tickets = getTicketsClient();
    const [ticket, events] = await Promise.all([
      tickets.get(params.code, params.id),
      tickets.events(params.code, params.id),
    ]);
    return ok(
      { ticket: { ...ticket, overdue: estaVencido(ticket, now), overdue_label: descreverAtraso(ticket, now) }, events },
      { requestId },
    );
  },
);
