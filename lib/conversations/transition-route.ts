import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { audit } from '@/lib/audit/audit';
import { toApiConversation } from './serialize';
import { applyTransition } from './service';
import { writeReleaseNote } from './release-note';

/** Rotas finas de claim/release/close: a regra está em applyTransition. */
export function transitionRoute(event: 'claim' | 'release' | 'close') {
  return withRoute(
    { role: 'analyst', params: z.object({ id: z.string().uuid() }) },
    async ({ session, params, requestId }) => {
      const conv = await applyTransition(params.id, event, { user_id: session.user_id, role: 'analyst' });
      if (event === 'release') {
        await writeReleaseNote(conv.id, conv.employee_id, { id: session.user_id, name: session.name }).catch((e: unknown) =>
          console.warn('[release] memory note failed', e),
        );
      }
      audit(`conversation.${event}`, { request_id: requestId, user_id: session.user_id, metadata: { conversation_id: conv.id } });
      return ok(toApiConversation(conv), { requestId });
    },
  );
}
