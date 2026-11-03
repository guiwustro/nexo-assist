import { z } from 'zod';
import { TicketsNotFoundError } from '@/lib/agent-engine/edge/tickets/errors';
import { NIVEL_POR_MOTIVO } from '@/lib/agent-engine/gatilhos/transferencia';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import type { Priority } from '@/lib/contracts/enums';
import { createHandoff } from '@/lib/conversations/handoff';
import { defineTool } from './types';

export const transferirParaAnalista = defineTool({
  name: 'transferir_para_analista',
  description:
    'Transfere a conversa para um analista humano, com um resumo do caso. Use quando o funcionário pedir, em caso crítico, ' +
    'chamado vencido que ele quer escalar, ou quando você não tiver segurança. Depois disso o agent fica pausado.',
  inputSchema: z.object({
    reason: z.enum(['requested_human', 'low_confidence', 'critical_priority', 'overdue_ticket']),
    reading: z.string().min(3).max(1000).describe('sua leitura do caso, para o analista conferir'),
    ticket_code: TicketCodeSchema.optional(),
  }),
  async run(ctx, input) {
    const level = NIVEL_POR_MOTIVO[input.reason];
    let priority: Priority | undefined;
    if (input.ticket_code) {
      try {
        const t = await ctx.tickets.get(input.ticket_code, ctx.employee_id);
        priority = t.priority;
        await ctx.tickets.transfer(t.code, { requester_id: ctx.employee_id, level, summary: input.reading });
      } catch (e) {
        if (!(e instanceof TicketsNotFoundError)) throw e;
      }
    }
    await createHandoff({
      conversation_id: ctx.conversation_id,
      ticket_code: priority ? input.ticket_code : null,
      ticket_priority: priority,
      origin: 'model_tool',
      reason_code: input.reason,
      level,
      employee_words: ctx.employee_text,
      agent_reading: input.reading,
      attempts: [],
    }, ctx.now);
    if (ctx.turn) ctx.turn.handoff_created = true;
    return { ok: true, level, note: 'Conversa transferida. Avise o funcionário que um analista vai continuar.' };
  },
  summary: (output) => `Suporte ${(output as { level?: string }).level ?? ''}`.trim(),
});
