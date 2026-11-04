import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'db/migrations');

export async function migrateDb(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 1 });
  }
}

// Só como CLI (`pnpm db:migrate`); empacotado dentro do bootstrap, não roda de novo.
if (process.argv[1] && /migrate\.[cm]?[tj]s$/.test(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import('dotenv/config');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  await migrateDb(url);
  console.log('migrations applied');
}
