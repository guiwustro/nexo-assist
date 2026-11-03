import { eq, sql } from 'drizzle-orm';
import { getDb, type DbOrTx } from '@/lib/db/client';
import { ticketDrafts } from '@/lib/db/schema';
import { emitEvent } from '@/lib/event-log/emit';
import type { DraftKind, DraftPayload } from '@/lib/contracts/drafts';

export type Draft = typeof ticketDrafts.$inferSelect;

export async function createDraft(
  i: { conversation_id: string; agent_run_id: string | null; kind: DraftKind; target_ticket_code: string | null; payload: DraftPayload },
  db: DbOrTx = getDb(),
): Promise<Draft> {
  const [n] = await db.execute<{ n: string }>(sql`select nextval('public.draft_seq')::text as n`);
  const [row] = await db
    .insert(ticketDrafts)
    .values({
      code: `D-${n!.n}`,
      conversation_id: i.conversation_id,
      agent_run_id: i.agent_run_id,
      kind: i.kind,
      target_ticket_code: i.target_ticket_code,
      payload: i.payload,
      status: 'pending',
    })
    .returning();
  await emitEvent(db, {
    type: 'draft.created',
    conversation_id: i.conversation_id,
    payload: { draft_id: row!.id, code: row!.code, kind: i.kind },
  });
  return row!;
}

export async function getDraft(id: string, db: DbOrTx = getDb()): Promise<Draft | null> {
  const [d] = await db.select().from(ticketDrafts).where(eq(ticketDrafts.id, id));
  return d ?? null;
}
