import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, { max: opts.max ?? 10, onnotice: () => {}, prepare: false });
  return drizzle(client, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Aceita o banco ou uma transação aberta. */
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __nexoDb?: Db };

/** Banco padrão (DATABASE_URL), criado no primeiro uso e reaproveitado no hot reload. */
export function getDb(): Db {
  globalForDb.__nexoDb ??= createDb(env.DATABASE_URL);
  return globalForDb.__nexoDb;
}
