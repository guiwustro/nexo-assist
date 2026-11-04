import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/** Proteção das páginas: sem sessão → /login; cada papel na sua área. A API valida por conta própria. */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const home = session?.role === 'analyst' ? '/console' : '/atendimento';

  if (pathname === '/login') {
    return session ? NextResponse.redirect(new URL(home, req.url)) : NextResponse.next();
  }
  if (!session) return NextResponse.redirect(new URL('/login', req.url));
  if (pathname === '/') return NextResponse.redirect(new URL(home, req.url));
  if (session.role === 'employee' && pathname.startsWith('/console')) {
    return NextResponse.redirect(new URL('/atendimento', req.url));
  }
  if (session.role === 'analyst' && ['/atendimento', '/perfil', '/chamados'].some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/console', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/atendimento/:path*', '/perfil/:path*', '/chamados/:path*', '/console/:path*'],
};
