import { z } from 'zod';
import { TicketsNotFoundError } from '@/lib/agent-engine/edge/tickets/errors';
import { STATUS_LABEL } from '@/lib/contracts/enums';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import { descreverAtraso } from '@/lib/regras/vencido';
import { calcularPrazo } from '@/lib/regras/prazo';
import { defineTool } from './types';

export const verChamado = defineTool({
  name: 'ver_chamado',
  description:
    'Mostra um chamado do próprio funcionário pelo código (INC-… ou REQ-…), com status e se está vencido. ' +
    'Chamado de outra pessoa e inexistente dão a mesma resposta: found=false. Nunca cite um chamado que não veio desta tool.',
  inputSchema: z.object({ code: z.string().trim().toUpperCase().pipe(TicketCodeSchema) }),
  async run(ctx, input) {
    try {
      const ticket = await ctx.tickets.get(input.code, ctx.employee_id);
      const atraso = descreverAtraso(ticket, ctx.now);
      ctx.emitPart({ kind: 'ticket_card', ticket, overdue: atraso !== null, ...(atraso ? { overdue_label: atraso } : {}) });
      if (ctx.turn) {
        ctx.turn.sources.push({ kind: 'ticket', id: ticket.code, title: ticket.title });
        if (atraso) ctx.turn.overdue_ticket_code = ticket.code;
      }
      return {
        found: true,
        ticket,
        overdue: atraso !== null,
        overdue_label: atraso,
        sla_rule: calcularPrazo(ticket.priority, new Date(ticket.last_update_at)).regra,
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
