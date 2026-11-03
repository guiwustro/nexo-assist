import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken, type Session } from '@/lib/auth/session';
import { findUserById, publicUser } from '@/lib/users/queries';

export async function getPageSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** Usuário da página (Server Component). Sem sessão válida → /login. */
export async function requirePageUser(role?: 'employee' | 'analyst') {
  const session = await getPageSession();
  if (!session) redirect('/login');
  const user = await findUserById(session.user_id);
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect(user.role === 'analyst' ? '/console' : '/atendimento');
  return { session, user: publicUser(user) };
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '')).toUpperCase();
}
