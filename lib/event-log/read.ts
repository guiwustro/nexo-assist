import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { conversations, eventLog } from '@/lib/db/schema';

export type EventRow = typeof eventLog.$inferSelect;

/** Eventos depois de `lastId`. Funcionário só vê os da própria conversa; analista vê todos. */
export async function readEventsSince(
  lastId: number,
  filter: { role: 'employee' | 'analyst'; user_id: string },
  limit = 200,
): Promise<EventRow[]> {
  const db = getDb();
  if (filter.role === 'analyst') {
    return db.select().from(eventLog).where(gt(eventLog.id, lastId)).orderBy(asc(eventLog.id)).limit(limit);
  }
  const own = db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.employee_id, filter.user_id));
  return db
    .select()
    .from(eventLog)
    .where(and(gt(eventLog.id, lastId), inArray(eventLog.conversation_id, own)))
    .orderBy(asc(eventLog.id))
    .limit(limit);
}
