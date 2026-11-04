import { randomUUID } from 'node:crypto';
import { z, ZodError, type ZodType } from 'zod';
import { TicketsNotFoundError, TicketsTransportError } from '@/lib/agent-engine/edge/tickets/errors';
import { requireRole, type RoleRequirement } from '@/lib/auth/require';
import { readSession, type Session } from '@/lib/auth/session';
import { AppError } from './errors';

type Init = { status?: number; meta?: Record<string, unknown>; headers?: HeadersInit; requestId?: string };

function withRequestId(headers: HeadersInit | undefined, requestId?: string): Headers {
  const h = new Headers(headers);
  h.set('x-request-id', requestId ?? randomUUID());
  return h;
}

export function ok<T>(data: T, init: Init = {}): Response {
  const body = init.meta ? { data, meta: init.meta } : { data };
  return Response.json(body, { status: init.status ?? 200, headers: withRequestId(init.headers, init.requestId) });
}

export function fail(
  code: string,
  message: string,
  status: number,
  details?: unknown,
  init: { headers?: HeadersInit; requestId?: string } = {},
): Response {
  const error = details === undefined ? { code, message } : { code, message, details };
  return Response.json({ error }, { status, headers: withRequestId(init.headers, init.requestId) });
}

type RouteCtx = { params: Promise<Record<string, string | string[] | undefined>> };

type Opts<B extends ZodType | undefined, P extends ZodType | undefined, R extends RoleRequirement | 'public'> = {
  role?: R;
  body?: B;
  params?: P;
};

type HandlerCtx<B, P, R> = {
  req: Request;
  session: R extends 'public' ? Session | null : Session;
  body: B extends ZodType ? z.infer<B> : undefined;
  params: P extends ZodType ? z.infer<P> : Record<string, string>;
  requestId: string;
};

/** Rota fina: autentica, valida, chama o handler e converte erros conhecidos no envelope `fail()`. */
export function withRoute<
  B extends ZodType | undefined = undefined,
  P extends ZodType | undefined = undefined,
  R extends RoleRequirement | 'public' = 'any',
>(opts: Opts<B, P, R>, handler: (ctx: HandlerCtx<B, P, R>) => Promise<Response>) {
  return async (req: Request, ctx: RouteCtx): Promise<Response> => {
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    try {
      const role = opts.role ?? 'any';
      const session = await readSession(req);
      if (role !== 'public') {
        if (!session) return fail('unauthorized', 'Faça login para continuar', 401, undefined, { requestId });
        requireRole(session, role);
      }
      const rawParams = (await ctx?.params) ?? {};
      const params = opts.params ? opts.params.parse(rawParams) : rawParams;
      let body: unknown = undefined;
      if (opts.body) {
        const raw: unknown = await req.json().catch(() => undefined);
        body = opts.body.parse(raw ?? {});
      }
      const res = await handler({ req, session, body, params, requestId } as HandlerCtx<B, P, R>);
      if (!res.headers.has('x-request-id')) {
        try {
          res.headers.set('x-request-id', requestId);
        } catch {
          // headers imutáveis (ex.: stream): segue sem o id
        }
      }
      return res;
    } catch (e) {
      return toFailResponse(e, requestId);
    }
  };
}

export function toFailResponse(e: unknown, requestId: string): Response {
  if (e instanceof AppError) return fail(e.code, e.message, e.status, e.details, { requestId });
  if (e instanceof ZodError) {
    return fail('invalid_input', 'Dados inválidos', 400, e.issues, { requestId });
  }
  if (e instanceof TicketsNotFoundError) {
    return fail('ticket_not_found', 'Chamado não encontrado', 404, undefined, { requestId });
  }
  if (e instanceof TicketsTransportError) {
    return fail('tickets_unavailable', 'O sistema de chamados está fora do ar agora', 503, undefined, {
      requestId,
      headers: { 'retry-after': '5' },
    });
  }
  console.error(`[api] unexpected error request_id=${requestId}`, e);
  return fail('internal_error', 'Erro interno', 500, undefined, { requestId });
}
