import { fail } from '@/lib/api/wrappers';
import { readSession } from '@/lib/auth/session';
import { formatCursor, initialCursor, parseCursor, readEventsAfter } from '@/lib/event-log/read';

export const dynamic = 'force-dynamic';

const POLL_MS = 1000;
const HEARTBEAT_MS = 15_000;

/** SSE lendo o event_log. Funcionário só recebe a própria conversa; analista recebe tudo. */
export async function GET(req: Request): Promise<Response> {
  const session = await readSession(req);
  if (!session) return fail('unauthorized', 'Faça login para continuar', 401);

  const header = req.headers.get('last-event-id') ?? new URL(req.url).searchParams.get('last_event_id');
  let cursor = parseCursor(header) ?? (await initialCursor());

  const enc = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      let lastPing = Date.now();
      const send = (s: string) => {
        if (!closed) ctrl.enqueue(enc.encode(s));
      };
      send(`retry: 3000\n: conectado\n\n`);
      const tick = async () => {
        if (closed) return;
        try {
          const rows = await readEventsAfter(cursor, { role: session.role, user_id: session.user_id });
          for (const r of rows) {
            cursor = { tx: r.tx_id, id: r.id };
            const data = { id: r.id, type: r.event_type, conversation_id: r.conversation_id, payload: r.payload, created_at: r.created_at };
            send(`id: ${formatCursor(cursor)}\nevent: ${r.event_type}\ndata: ${JSON.stringify(data)}\n\n`);
          }
          if (Date.now() - lastPing >= HEARTBEAT_MS) {
            send(`: ping\n\n`);
            lastPing = Date.now();
          }
        } catch (e) {
          console.warn('[events] read failed', e);
        }
        if (!closed) timer = setTimeout(tick, POLL_MS);
      };
      void tick();
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearTimeout(timer);
        try {
          ctrl.close();
        } catch {
          // já fechado
        }
      });
    },
    cancel() {
      closed = true;
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
