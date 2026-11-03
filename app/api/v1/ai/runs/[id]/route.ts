import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { NotFound } from '@/lib/api/errors';
import { ok, withRoute } from '@/lib/api/wrappers';
import { getDb } from '@/lib/db/client';
import { aiAgentRuns, conversations, messages } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export const GET = withRoute(
  { role: 'any', params: z.object({ id: z.string().uuid() }) },
  async ({ session, params, requestId }) => {
    const db = getDb();
    const [row] = await db
      .select({ run: aiAgentRuns, employee_id: conversations.employee_id })
      .from(aiAgentRuns)
      .innerJoin(conversations, eq(conversations.id, aiAgentRuns.conversation_id))
      .where(eq(aiAgentRuns.id, params.id));
    if (!row || (session.role === 'employee' && row.employee_id !== session.user_id)) {
      throw new NotFound('run_not_found', 'Registro do turno não encontrado');
    }
    const run = row.run;
    const [inbound] = run.inbound_message_id
      ? await db.select({ body: messages.body }).from(messages).where(eq(messages.id, run.inbound_message_id))
      : [];
    return ok(
      {
        run: {
          id: run.id,
          conversation_id: run.conversation_id,
          status: run.status,
          started_at: run.started_at.toISOString(),
          completed_at: run.completed_at?.toISOString() ?? null,
          employee_text: inbound?.body ?? null,
        },
        decision: run.decision ?? null,
        tool_calls: run.tool_calls,
        cost: {
          model: run.model,
          tokens_in: run.tokens_in,
          tokens_out: run.tokens_out,
          cost_cents: run.cost_cents,
          latency_ms: run.latency_ms,
        },
      },
      { requestId },
    );
  },
);
