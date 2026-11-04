import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { audit } from '@/lib/audit/audit';
import { serverNow } from '@/lib/env';
import { toApiConversation } from './serialize';
import { applyTransition } from './service';
import { releaseOrMerge } from './attendance';

/** Rotas finas de claim/release/close: a regra está em applyTransition. */
export function transitionRoute(event: 'claim' | 'release' | 'close') {
  return withRoute(
    { role: 'analyst', params: z.object({ id: z.string().uuid() }) },
    async ({ session, params, requestId }) => {
      const actor = { user_id: session.user_id, role: 'analyst' as const };
      const result =
        event === 'release'
          ? await releaseOrMerge(params.id, actor, serverNow())
          : { conversation: await applyTransition(params.id, event, actor), merged_into: null };
      audit(`conversation.${event}`, {
        request_id: requestId,
        user_id: session.user_id,
        metadata: {
          conversation_id: result.conversation.id,
          ...(result.merged_into ? { merged_into: result.merged_into } : {}),
        },
      });
      return ok(
        event === 'release'
          ? { ...toApiConversation(result.conversation), merged_into: result.merged_into }
          : toApiConversation(result.conversation),
        { requestId },
      );
    },
  );
}
