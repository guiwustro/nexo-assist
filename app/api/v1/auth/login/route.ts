import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail, ok, withRoute } from '@/lib/api/wrappers';
import { audit } from '@/lib/audit/audit';
import { clientIp, loginLimiter } from '@/lib/api/rate-limit';
import { burnPasswordCheck, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, sessionCookie } from '@/lib/auth/session';
import { findUserByEmail, publicUser } from '@/lib/users/queries';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1, 'Informe a senha').max(200),
  /** "Manter conectado neste computador". */
  remember: z.boolean().default(true),
});

/** E-mail + senha conferida contra o hash scrypt. E-mail ou senha errados dão a mesma resposta. */
export const POST = withRoute({ role: 'public', body: Body }, async ({ req, body, requestId }) => {
  const slot = loginLimiter().take(clientIp(req));
  if (!slot.ok) {
    return fail('rate_limited', `Muitas tentativas de entrar, aguarde ${slot.retry_after_s}s`, 429, undefined, {
      requestId,
      headers: { 'retry-after': String(slot.retry_after_s) },
    });
  }
  const user = await findUserByEmail(body.email);
  // E-mail inexistente também paga uma conferência de hash: o tempo de resposta não revela quem existe.
  const valid = user ? await verifyPassword(body.password, user.password_hash) : (await burnPasswordCheck(body.password), false);
  if (!user || !valid) {
    return fail('invalid_credentials', 'E-mail ou senha incorretos', 401, undefined, { requestId });
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
