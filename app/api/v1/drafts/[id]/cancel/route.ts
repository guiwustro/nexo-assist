import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { cancelDraft, toApiDraft } from '@/lib/drafts/service';

export const dynamic = 'force-dynamic';

export const POST = withRoute(
  { role: 'employee', params: z.object({ id: z.string().uuid() }) },
  async ({ session, params, requestId }) => ok(toApiDraft(await cancelDraft(params.id, session)), { requestId }),
);
