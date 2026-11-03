import type { DbOrTx } from '@/lib/db/client';
import { eventLog } from '@/lib/db/schema';

export type EventType = `${string}.${string}`;

export type AppEvent = {
  type: EventType;
  conversation_id?: string | null;
  actor_user_id?: string | null;
  payload?: Record<string, unknown>;
};

/** Grava no event_log (mesma transação da mudança): o SSE do console lê daqui. */
export async function emitEvent(tx: DbOrTx, e: AppEvent): Promise<void> {
  await tx.insert(eventLog).values({
    event_type: e.type,
    conversation_id: e.conversation_id ?? null,
    actor_user_id: e.actor_user_id ?? null,
    payload: e.payload ?? {},
  });
}
