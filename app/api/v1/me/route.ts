import { NotFound } from '@/lib/api/errors';
import { ok, withRoute } from '@/lib/api/wrappers';
import { findUserById, publicUser } from '@/lib/users/queries';

export const dynamic = 'force-dynamic';

export const GET = withRoute({ role: 'any' }, async ({ session, requestId }) => {
  const user = await findUserById(session.user_id);
  if (!user) throw new NotFound('user_not_found', 'Usuário não encontrado');
  return ok(publicUser(user), { requestId });
});
