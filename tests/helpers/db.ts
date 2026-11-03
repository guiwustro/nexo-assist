import { afterAll, beforeAll, beforeEach } from 'vitest';
import { getDb, type Db } from '@/lib/db/client';
import { migrateDb } from '@/lib/db/migrate';
import { resetAndSeed, type SeedResult } from '@/lib/db/seed';

export const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? 'postgres://nexo:nexo@localhost:5432/nexo_test';

/** Terça-feira, 03/11/2026, 10:00 em São Paulo. */
export const AGORA_TESTE = new Date('2026-11-03T13:00:00.000Z');

export type TestDb = { db: Db; seed: SeedResult; agora: Date };

/** Migra o banco de teste uma vez e refaz o seed antes de cada teste. */
export function useTestDb(agora: Date = AGORA_TESTE): TestDb {
  const ctx = { agora } as TestDb;
  beforeAll(async () => {
    await migrateDb(TEST_DB_URL);
    ctx.db = getDb();
  });
  beforeEach(async () => {
    ctx.seed = await resetAndSeed(TEST_DB_URL, agora);
  });
  afterAll(async () => {
    await ctx.db?.$client.end({ timeout: 1 });
    (globalThis as { __nexoDb?: Db }).__nexoDb = undefined;
  });
  return ctx;
}
