import { ok } from '@/lib/api/wrappers';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return ok({ ok: true });
}
