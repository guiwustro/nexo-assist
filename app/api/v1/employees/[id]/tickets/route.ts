import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { listTicketsOf } from '@/lib/tickets/views';

export const dynamic = 'force-dynamic';

/** Painel "Chamados da Ana" no console — pela mesma borda de chamados do agent. */
export const GET = withRoute(
  { role: 'analyst', params: z.object({ id: z.string().uuid() }) },
  async ({ params, requestId }) => ok(await listTicketsOf(params.id), { requestId }),
);
