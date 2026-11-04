import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { conversations, eventLog } from '@/lib/db/schema';

export type EventRow = typeof eventLog.$inferSelect;

/** Posição no event_log: transação e id do último evento entregue. */
export type EventCursor = { tx: number; id: number };

/** Transação aberta mais antiga: tudo abaixo dela já commitou ou não vai commitar mais. */
const XMIN = sql`(pg_snapshot_xmin(pg_current_snapshot())::text::bigint)`;

/**
 * Cursor de quem acaba de conectar: pula o que já commitou antes das transações em andamento. Pode reentregar
 * alguns eventos recentes (de transações que commitaram enquanto uma mais antiga seguia aberta), o que é inofensivo
 * para quem só recarrega a tela.
 */
export async function initialCursor(): Promise<EventCursor> {
  const [r] = await getDb().execute<{ xmin: string }>(sql`select ${XMIN}::text as xmin`);
  return { tx: Number(r!.xmin), id: 0 };
}

/** `tx-id`, o formato do `id:` do SSE (volta como Last-Event-ID na reconexão). */
export function formatCursor(c: EventCursor): string {
  return `${c.tx}-${c.id}`;
}

export function parseCursor(s: string | null): EventCursor | null {
  const m = s ? /^(\d+)-(\d+)$/.exec(s) : null;
  return m ? { tx: Number(m[1]), id: Number(m[2]) } : null;
}

/**
 * Eventos depois do cursor, em ordem (tx_id, id), só de transações anteriores à aberta mais antiga. Um evento que
 * pegou um id menor e commitou depois de um maior chega na ordem da transação, nunca atrás do cursor.
 * Funcionário só vê os da própria conversa; analista vê todos.
 */
export async function readEventsAfter(
  cursor: EventCursor,
  filter: { role: 'employee' | 'analyst'; user_id: string },
  limit = 200,
): Promise<EventRow[]> {
  const db = getDb();
  const depois = and(
    sql`(${eventLog.tx_id}, ${eventLog.id}) > (${cursor.tx}, ${cursor.id})`,
    sql`${eventLog.tx_id} < ${XMIN}`,
  );
  const visiveis =
    filter.role === 'analyst'
      ? depois
      : and(
          depois,
          inArray(
            eventLog.conversation_id,
            db.select({ id: conversations.id }).from(conversations).where(eq(conversations.employee_id, filter.user_id)),
          ),
        );
  return db.select().from(eventLog).where(visiveis).orderBy(asc(eventLog.tx_id), asc(eventLog.id)).limit(limit);
}
