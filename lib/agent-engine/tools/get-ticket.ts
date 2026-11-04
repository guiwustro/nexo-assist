import { z } from 'zod';
import { TicketsNotFoundError } from '@/lib/agent-engine/edge/tickets/errors';
import { STATUS_LABEL } from '@/lib/contracts/enums';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import { describeOverdue } from '@/lib/rules/overdue';
import { computeDeadline } from '@/lib/rules/deadline';
import { defineTool } from './types';

export const getTicketTool = defineTool({
  name: 'get_ticket',
  description:
    'Mostra um chamado do próprio funcionário pelo código (INC-… ou REQ-…), com status e se está vencido. ' +
    'Chamado de outra pessoa e inexistente dão a mesma resposta: found=false. Nunca cite um chamado que não veio desta tool.',
  inputSchema: z.object({ code: z.string().trim().toUpperCase().pipe(TicketCodeSchema) }),
  async run(ctx, input) {
    try {
      const ticket = await ctx.tickets.get(input.code, ctx.employee_id);
      const delay = describeOverdue(ticket, ctx.now);
      ctx.emitPart({ kind: 'ticket_card', ticket, overdue: delay !== null, ...(delay ? { overdue_label: delay } : {}) });
      if (ctx.turn) {
        ctx.turn.sources.push({ kind: 'ticket', id: ticket.code, title: ticket.title });
        ctx.turn.focus_ticket_code = ticket.code;
        if (delay) ctx.turn.overdue_ticket_code = ticket.code;
      }
      return {
        found: true,
        ticket,
        overdue: delay !== null,
        overdue_label: delay,
        sla_rule: computeDeadline(ticket.priority, new Date(ticket.last_update_at)).rule,
      };
    } catch (e) {
      if (e instanceof TicketsNotFoundError) return { found: false };
      throw e;
    }
  },
  summary(output) {
    const o = output as { found: boolean; ticket?: { status: keyof typeof STATUS_LABEL }; overdue?: boolean };
    if (!o.found || !o.ticket) return 'não encontrado entre os seus chamados';
    return `${STATUS_LABEL[o.ticket.status]}${o.overdue ? ' · prazo vencido' : ' · dentro do prazo'}`;
  },
});
