import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./lib/db/schema/app.ts', './lib/db/schema/tickets.ts'],
  out: './db/migrations',
  schemaFilter: ['public', 'tickets'],
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://nexo:nexo@localhost:5432/nexo' },
});
