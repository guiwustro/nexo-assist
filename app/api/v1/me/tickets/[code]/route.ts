import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import { getTicketDetailOf } from '@/lib/tickets/views';

export const dynamic = 'force-dynamic';

/** Detalhe de um chamado do próprio funcionário, com o histórico. */
export const GET = withRoute(
  { role: 'employee', params: z.object({ code: TicketCodeSchema }) },
  async ({ session, params, requestId }) => ok(await getTicketDetailOf(session.user_id, params.code), { requestId }),
);
