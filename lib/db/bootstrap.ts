import 'dotenv/config';
import postgres from 'postgres';
import { migrateDb } from './migrate';
import { resetAndSeed, seedPasswordHash } from './seed';
import { SEED_USERS } from './seed-data';

/**
 * Start do container: aplica as migrations e semeia só se o banco ainda não tem usuários.
 * Nunca refaz o seed de um banco em uso — o histórico precisa sobreviver a restarts.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');

await migrateDb(url);
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from public.users`;
  if ((r?.n ?? 0) === 0) {
    await resetAndSeed(url);
    console.log('[bootstrap] migrations applied and database seeded (it was empty)');
  } else {
    console.log('[bootstrap] migrations applied; database has data, skipping seed');
    // Banco anterior à coluna password_hash: usuários do seed sem hash recebem a senha de demonstração.
    let n = 0;
    for (const u of SEED_USERS) {
      const r = await sql`update public.users set password_hash = ${await seedPasswordHash(u.key)}
                          where id = ${u.id} and password_hash is null`;
      n += r.count;
    }
    if (n > 0) console.log(`[bootstrap] demo password set for ${n} seed user(s) without one`);
  }
} finally {
  await sql.end({ timeout: 1 });
}
