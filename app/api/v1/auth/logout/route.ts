import { ok, withRoute } from '@/lib/api/wrappers';
import { clearSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const POST = withRoute({ role: 'public' }, async ({ requestId }) =>
  ok({ ok: true }, { requestId, headers: { 'set-cookie': clearSessionCookie() } }),
);
