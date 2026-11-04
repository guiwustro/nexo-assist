import { z } from 'zod';
import { TicketsNotFoundError, TicketsTransportError } from '@/lib/agent-engine/edge/tickets/errors';
import { LEVEL_BY_REASON } from '@/lib/agent-engine/triggers/transfer';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import type { Priority } from '@/lib/contracts/enums';
import { createHandoff } from '@/lib/conversations/handoff';
import { defineTool } from './types';

export const transferToAnalystTool = defineTool({
  name: 'transfer_to_analyst',
  description:
    'Transfere a conversa para um analista humano, com um resumo do caso. Use quando o funcionário pedir, em caso crítico, ' +
    'chamado vencido que ele quer escalar, ou quando você não tiver segurança. Depois disso o agent fica pausado.',
  inputSchema: z.object({
    reason: z.enum(['requested_human', 'low_confidence', 'critical_priority', 'overdue_ticket']),
    reading: z.string().min(3).max(1000).describe('sua leitura do caso, para o analista conferir'),
    ticket_code: TicketCodeSchema.optional(),
  }),
  async run(ctx, input) {
    const level = LEVEL_BY_REASON[input.reason];
    // O legado é melhor-esforço: a passagem vive no banco do app e é justamente o caminho quando ele cai.
    // Chamado não confirmado (não encontrado ou legado fora) não entra na passagem.
    let priority: Priority | undefined;
    if (input.ticket_code) {
      try {
        priority = (await ctx.tickets.get(input.ticket_code, ctx.employee_id)).priority;
      } catch (e) {
        if (!(e instanceof TicketsNotFoundError || e instanceof TicketsTransportError)) throw e;
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
    if (priority && input.ticket_code) {
      try {
        await ctx.tickets.transfer(input.ticket_code, { requester_id: ctx.employee_id, level, summary: input.reading });
      } catch (e) {
        if (!(e instanceof TicketsTransportError)) throw e;
        console.warn(`[transfer_to_analyst] legacy down while transferring ${input.ticket_code}; handoff already recorded in the app`);
      }
    }
    return { ok: true, level, note: 'Conversa transferida. Avise o funcionário que um analista vai continuar.' };
  },
  summary: (output) => `Suporte ${(output as { level?: string }).level ?? ''}`.trim(),
});
