import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createDb } from '@/lib/db/client';
import { createTicketsApp } from './app';
import { createChaos } from './chaos';

const port = Number(process.env.TICKETS_PORT ?? 4001);
const secret = process.env.TICKETS_INTERNAL_SECRET;
const url = process.env.DATABASE_URL;
if (!secret || !url) throw new Error('TICKETS_INTERNAL_SECRET e DATABASE_URL são obrigatórias');

const nowOverride = process.env.E2E === 'true' && process.env.NOW_OVERRIDE ? process.env.NOW_OVERRIDE : null;
const now = nowOverride ? () => new Date(nowOverride) : () => new Date();

const app = createTicketsApp({
  db: createDb(url),
  now,
  // O caos usa o relógio real: uma queda de 20 s termina em 20 s mesmo com o "agora" fixado.
  chaos: createChaos({ failureRate: Number(process.env.TICKETS_FAILURE_RATE ?? 0) }),
  secret,
  chaosEnabled: process.env.TICKETS_CHAOS_ENABLED === 'true',
});

serve({ fetch: app.fetch, port, hostname: process.env.TICKETS_HOST ?? '0.0.0.0' }, (info) => {
  console.log(`[tickets] ouvindo em :${info.port}`);
});
