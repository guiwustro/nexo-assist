import { z } from 'zod';
import { NotFound } from '@/lib/api/errors';
import { ok, withRoute } from '@/lib/api/wrappers';
import { listForAnalyst } from '@/lib/conversations/queries';
import { serverNow } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Cabeçalho da conversa no console (mesma forma do item da fila). */
export const GET = withRoute(
  { role: 'analyst', params: z.object({ id: z.string().uuid() }) },
  async ({ session, params, requestId }) => {
    const [item] = await listForAnalyst(session.user_id, 'all', undefined, serverNow(), params.id);
    if (!item) throw new NotFound('conversation_not_found', 'Conversa não encontrada');
    return ok(item, { requestId });
  },
);
