import { desc } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { eventLog } from '@/lib/db/schema';
import { fail } from '@/lib/api/wrappers';
import { readSession } from '@/lib/auth/session';
import { readEventsSince } from '@/lib/event-log/read';

export const dynamic = 'force-dynamic';

const POLL_MS = 1000;
const HEARTBEAT_MS = 15_000;

/** SSE lendo o event_log. Funcionário só recebe a própria conversa; analista recebe tudo. */
export async function GET(req: Request): Promise<Response> {
  const session = await readSession(req);
  if (!session) return fail('unauthorized', 'Faça login para continuar', 401);

  const header = req.headers.get('last-event-id') ?? new URL(req.url).searchParams.get('last_event_id');
  let lastId: number;
  if (header !== null && /^\d+$/.test(header)) {
    lastId = Number(header);
  } else {
    const [max] = await getDb().select({ id: eventLog.id }).from(eventLog).orderBy(desc(eventLog.id)).limit(1);
    lastId = max?.id ?? 0;
  }

  const enc = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fechado = false;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      let ultimoPing = Date.now();
      const send = (s: string) => {
        if (!fechado) ctrl.enqueue(enc.encode(s));
      };
      send(`retry: 3000\n: conectado\n\n`);
      const tick = async () => {
        if (fechado) return;
        try {
          const rows = await readEventsSince(lastId, { role: session.role, user_id: session.user_id });
          for (const r of rows) {
            lastId = r.id;
            const data = { id: r.id, type: r.event_type, conversation_id: r.conversation_id, payload: r.payload, created_at: r.created_at };
            send(`id: ${r.id}\nevent: ${r.event_type}\ndata: ${JSON.stringify(data)}\n\n`);
          }
          if (Date.now() - ultimoPing >= HEARTBEAT_MS) {
            send(`: ping\n\n`);
            ultimoPing = Date.now();
          }
        } catch (e) {
          console.warn('[events] leitura falhou', e);
        }
        if (!fechado) timer = setTimeout(tick, POLL_MS);
      };
      void tick();
      req.signal.addEventListener('abort', () => {
        fechado = true;
        clearTimeout(timer);
        try {
          ctrl.close();
        } catch {
          // já fechado
        }
      });
    },
    cancel() {
      fechado = true;
      clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
