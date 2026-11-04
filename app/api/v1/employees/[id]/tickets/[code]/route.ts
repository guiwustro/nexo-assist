import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import { getTicketDetailOf } from '@/lib/tickets/views';

export const dynamic = 'force-dynamic';

/** Detalhe de um chamado no painel do console: dados e histórico do legado. */
export const GET = withRoute(
  { role: 'analyst', params: z.object({ id: z.string().uuid(), code: TicketCodeSchema }) },
  async ({ params, requestId }) => ok(await getTicketDetailOf(params.id, params.code), { requestId }),
);
