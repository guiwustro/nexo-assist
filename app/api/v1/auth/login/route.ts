import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail, ok, withRoute } from '@/lib/api/wrappers';
import { audit } from '@/lib/audit/audit';
import { clientIp, loginLimiter } from '@/lib/api/rate-limit';
import { createSessionToken, sessionCookie } from '@/lib/auth/session';
import { findUserByEmail, publicUser } from '@/lib/users/queries';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1, 'Informe a senha').max(200),
  /** "Manter conectado neste computador". */
  remember: z.boolean().default(true),
});

/** Login de demonstração: e-mail do seed + qualquer senha não vazia. */
export const POST = withRoute({ role: 'public', body: Body }, async ({ req, body, requestId }) => {
  const vez = loginLimiter().take(clientIp(req));
  if (!vez.ok) {
    return fail('rate_limited', `Muitas tentativas de entrar, aguarde ${vez.retry_after_s}s`, 429, undefined, {
      requestId,
      headers: { 'retry-after': String(vez.retry_after_s) },
    });
  }
  const user = await findUserByEmail(body.email);
  if (!user) {
    return fail('invalid_credentials', 'E-mail não encontrado', 401, undefined, { requestId });
  }
  const sid = randomUUID();
  const token = await createSessionToken({
    user_id: user.id,
    role: user.role as 'employee' | 'analyst',
    name: user.name,
    sid,
  });
  audit('auth.login', { request_id: requestId, user_id: user.id, method: 'POST', path: '/api/v1/auth/login', status: 200 });
  return ok(publicUser(user), { requestId, headers: { 'set-cookie': sessionCookie(token, { persistent: body.remember }) } });
});
