import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ok, withRoute } from '@/lib/api/wrappers';
import { getDb } from '@/lib/db/client';
import { handoffs } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export const GET = withRoute(
  { role: 'analyst', params: z.object({ id: z.string().uuid() }) },
  async ({ params, requestId }) => {
    const rows = await getDb()
      .select()
      .from(handoffs)
      .where(eq(handoffs.conversation_id, params.id))
      .orderBy(desc(handoffs.created_at));
    return ok(
      rows.map((h) => ({
        id: h.id,
        ticket_code: h.ticket_code,
        origin: h.origin,
        reason_code: h.reason_code,
        support_level: h.support_level,
        title: h.title,
        body: h.body,
        employee_words: h.employee_words,
        agent_reading: h.agent_reading,
        attempts: h.attempts,
        confidence: h.confidence,
        due_at: h.due_at.toISOString(),
        created_at: h.created_at.toISOString(),
      })),
      { requestId },
    );
  },
);
