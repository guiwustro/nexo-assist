import 'dotenv/config';
import postgres from 'postgres';
import { migrateDb } from './migrate';
import { resetAndSeed } from './seed';

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
    console.log('[bootstrap] migrations aplicadas e banco semeado (estava vazio)');
  } else {
    console.log('[bootstrap] migrations aplicadas; banco já tem dados, seed não roda');
  }
} finally {
  await sql.end({ timeout: 1 });
}
