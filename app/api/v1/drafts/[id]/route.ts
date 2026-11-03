import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { audit } from '@/lib/audit/audit';
import { DraftEditSchema } from '@/lib/contracts/drafts';
import { editDraft, toApiDraft } from '@/lib/drafts/service';

export const dynamic = 'force-dynamic';

export const PATCH = withRoute(
  { role: 'employee', params: z.object({ id: z.string().uuid() }), body: DraftEditSchema },
  async ({ session, params, body, requestId }) => {
    const d = await editDraft(params.id, session, body);
    audit('draft.edited', { request_id: requestId, user_id: session.user_id, metadata: { draft_id: d.id } });
    return ok(toApiDraft(d), { requestId });
  },
);
