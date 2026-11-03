import { createSessionToken, SESSION_COOKIE, type Session } from '@/lib/auth/session';

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export async function cookieFor(s: Session): Promise<string> {
  return `${SESSION_COOKIE}=${await createSessionToken(s)}`;
}

/** Chama um route handler do Next como o servidor faria. */
export async function call(
  handler: Handler,
  opts: { session?: Session; method?: string; body?: unknown; params?: Record<string, string>; url?: string } = {},
): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.session) headers.set('cookie', await cookieFor(opts.session));
  const req = new Request(opts.url ?? 'http://localhost/api/v1/x', {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return handler(req, { params: Promise.resolve(opts.params ?? {}) });
}

export const json = async <T = { data: unknown; error?: { code: string } }>(r: Response) => (await r.json()) as T;
