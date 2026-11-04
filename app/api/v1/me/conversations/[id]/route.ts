import { z } from 'zod';
import { NotFound } from '@/lib/api/errors';
import { ok, withRoute } from '@/lib/api/wrappers';
import { env } from '@/lib/env';
import { getSession } from '@/lib/conversations/attendance';
import { currentDataOf } from '@/lib/conversations/employee-view';
import { getConversation } from '@/lib/conversations/service';
import { getDb } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export const GET = withRoute(
  { role: 'employee', params: z.object({ id: z.string().uuid() }) },
  async ({ session, params, requestId }) => {
    const conversation = await getConversation(getDb(), params.id);
    if (!conversation || conversation.employee_id !== session.user_id) {
      throw new NotFound('conversation_not_found', 'Atendimento não encontrado');
    }
    const employeeSession = await getSession(session.user_id);
    return ok(
      await currentDataOf(session.user_id, conversation, {
        count: employeeSession?.message_count ?? 0,
        limit: env.SESSION_MESSAGE_LIMIT,
      }),
      { requestId },
    );
  },
);
