import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { env } from '@/lib/env';

export const SESSION_COOKIE = 'nexo_session';
export const SESSION_TTL_S = 12 * 3600;

export const SessionSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['employee', 'analyst']),
  name: z.string(),
  sid: z.string().min(1),
});
export type Session = z.infer<typeof SessionSchema>;

const key = () => new TextEncoder().encode(env.SESSION_SECRET);

export async function createSessionToken(s: Session, opts: { now?: Date } = {}): Promise<string> {
  const iat = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_S)
    .sign(key());
}

export async function verifySessionToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    const parsed = SessionSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function readSession(req: Request): Promise<Session | null> {
  return verifySessionToken(readCookie(req.headers.get('cookie'), SESSION_COOKIE));
}

export function sessionCookie(token: string): string {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_S}${secure}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
