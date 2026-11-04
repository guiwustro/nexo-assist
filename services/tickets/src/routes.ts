import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Db } from '@/lib/db/client';
import {
  CreateTicketInputSchema,
  ReopenTicketInputSchema,
  TransferInputSchema,
  UpdateTicketInputSchema,
} from '@/lib/contracts/tickets';
import { canReopen } from '@/lib/rules/reopening';
import { withIdempotency, type Reply } from './idempotency';
import { createTicket, findOwned, listByRequester, listEvents, searchTickets, toTicket, touch } from './repo';

export type RouteDeps = { db: Db; now: () => Date };

const notFound = (): Reply => ({
  status: 404,
  body: { error: { code: 'ticket_not_found', message: 'Chamado não encontrado' } },
});

const send = (c: Context, r: Reply) => c.json(r.body as object, r.status as 200);

function idemKey(c: Context): string | null {
  return c.req.header('idempotency-key')?.trim() || null;
}

const keyRequired = (c: Context) =>
  c.json({ error: { code: 'idempotency_key_required', message: 'Envie o header Idempotency-Key' } }, 400);

async function parse<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T> | Response> {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'invalid_input', message: 'Dados inválidos', details: parsed.error.issues } },
      400,
    );
  }
  return parsed.data;
}

export function ticketRoutes(deps: RouteDeps): Hono {
  const r = new Hono();
  const { db, now } = deps;

  r.get('/tickets', async (c) => {
    const requester = c.req.query('requester_id');
    if (!requester || !z.string().uuid().safeParse(requester).success) {
      return c.json({ error: { code: 'invalid_input', message: 'requester_id obrigatório' } }, 400);
    }
    const status = c.req.query('status') === 'open' ? 'open' : 'all';
    return c.json({ data: await listByRequester(db, requester, status) });
  });

  // Antes de /tickets/:code, senão "search" vira um código.
  r.get('/tickets/search', async (c) => {
    const q = (c.req.query('q') ?? '').slice(0, 100);
    return c.json({ data: await searchTickets(db, q) });
  });

  r.get('/tickets/:code', async (c) => {
    const requester = c.req.query('requester_id') ?? '';
    if (!z.string().uuid().safeParse(requester).success) return send(c, notFound());
    const row = await findOwned(db, c.req.param('code'), requester, { lock: false });
    return row ? c.json({ data: toTicket(row) }) : send(c, notFound());
  });

  r.get('/tickets/:code/events', async (c) => {
    const requester = c.req.query('requester_id') ?? '';
    if (!z.string().uuid().safeParse(requester).success) return send(c, notFound());
    const row = await findOwned(db, c.req.param('code'), requester, { lock: false });
    return row ? c.json({ data: await listEvents(db, row.id) }) : send(c, notFound());
  });

  r.post('/tickets', async (c) => {
    const key = idemKey(c);
    if (!key) return keyRequired(c);
    const input = await parse(c, CreateTicketInputSchema);
    if (input instanceof Response) return input;
    const reply = await withIdempotency(db, { key, scope: 'POST /tickets', body: input }, async (tx) => ({
      status: 201,
      body: { data: await createTicket(tx, input, now()) },
    }));
    return send(c, reply);
  });

  r.patch('/tickets/:code', async (c) => {
    const key = idemKey(c);
    if (!key) return keyRequired(c);
    const input = await parse(c, UpdateTicketInputSchema);
    if (input instanceof Response) return input;
    const code = c.req.param('code');
    const reply = await withIdempotency(db, { key, scope: `PATCH /tickets/${code}`, body: input }, async (tx) => {
      const row = await findOwned(tx, code, input.requester_id);
      if (!row) return notFound();
      const ticket = await touch(
        tx,
        row,
        now(),
        input.status ? { status: input.status } : {},
        { kind: 'comment', body: input.comment, actor: 'funcionário' },
      );
      return { status: 200, body: { data: ticket } };
    });
    return send(c, reply);
  });

  r.post('/tickets/:code/reopen', async (c) => {
    const key = idemKey(c);
    if (!key) return keyRequired(c);
    const input = await parse(c, ReopenTicketInputSchema);
    if (input instanceof Response) return input;
    const code = c.req.param('code');
    const reply = await withIdempotency(db, { key, scope: `POST /tickets/${code}/reopen`, body: input }, async (tx) => {
      const row = await findOwned(tx, code, input.requester_id);
      if (!row) return notFound();
      const rule = canReopen(toTicket(row), now());
      if (!rule.ok) {
        return { status: 422, body: { error: { code: 'reopen_window_expired', message: rule.rule } } };
      }
      const ticket = await touch(
        tx,
        row,
        now(),
        { status: 'open', resolved_at: null },
        { kind: 'reopened', body: input.comment ?? 'Reaberto pelo funcionário', actor: 'funcionário' },
      );
      return { status: 200, body: { data: ticket } };
    });
    return send(c, reply);
  });

  r.post('/tickets/:code/transfer', async (c) => {
    const input = await parse(c, TransferInputSchema);
    if (input instanceof Response) return input;
    const code = c.req.param('code');
    const reply = await db.transaction(async (tx) => {
      const row = await findOwned(tx, code, input.requester_id);
      if (!row) return notFound();
      const ticket = await touch(
        tx,
        row,
        now(),
        { status: 'awaiting_analyst' },
        { kind: 'transferred', body: `Suporte ${input.level}: ${input.summary}`, actor: 'agent' },
      );
      return { status: 200, body: { data: ticket } } satisfies Reply;
    });
    return send(c, reply);
  });

  return r;
}
