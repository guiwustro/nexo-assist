import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { audit } from '@/lib/audit/audit';
import { confirmDraft, toApiDraft } from '@/lib/drafts/service';

export const dynamic = 'force-dynamic';

export const POST = withRoute(
  { role: 'employee', params: z.object({ id: z.string().uuid() }) },
  async ({ session, params, requestId }) => {
    const r = await confirmDraft(params.id, session);
    audit('draft.confirmed', {
      request_id: requestId,
      user_id: session.user_id,
      metadata: { draft_id: r.draft.id, ticket_code: r.ticket.code },
    });
    return ok({ draft: toApiDraft(r.draft), ticket: r.ticket }, { requestId });
  },
);
