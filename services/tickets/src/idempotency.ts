import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Db, Tx } from '@/lib/db/client';
import { ticketsIdempotencyKeys } from '@/lib/db/schema';

export type Reply = { status: number; body: unknown };

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export const hashBody = (scope: string, body: unknown) =>
  createHash('sha256').update(`${scope}\n${stable(body)}`).digest('hex');

/**
 * Executa `fn` uma única vez por chave. O recibo é gravado na mesma transação da escrita:
 * uma segunda requisição com a mesma chave espera a primeira terminar e devolve a resposta gravada.
 */
export async function withIdempotency(
  db: Db,
  opts: { key: string; scope: string; body: unknown },
  fn: (tx: Tx) => Promise<Reply>,
): Promise<Reply> {
  const request_hash = hashBody(opts.scope, opts.body);
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(ticketsIdempotencyKeys)
      .values({ key: opts.key, scope: opts.scope, request_hash })
      .onConflictDoNothing()
      .returning({ key: ticketsIdempotencyKeys.key });

    if (inserted.length === 0) {
      const [recibo] = await tx
        .select()
        .from(ticketsIdempotencyKeys)
        .where(eq(ticketsIdempotencyKeys.key, opts.key));
      if (!recibo || recibo.request_hash !== request_hash) {
        return {
          status: 422,
          body: { error: { code: 'idempotency_key_reused', message: 'Chave já usada com outro conteúdo' } },
        };
      }
      return { status: recibo.response_status ?? 200, body: recibo.response_body };
    }

    const reply = await fn(tx);
    await tx
      .update(ticketsIdempotencyKeys)
      .set({ response_status: reply.status, response_body: sql`${JSON.stringify(reply.body)}::jsonb` })
      .where(and(eq(ticketsIdempotencyKeys.key, opts.key), eq(ticketsIdempotencyKeys.scope, opts.scope)));
    return reply;
  });
}
