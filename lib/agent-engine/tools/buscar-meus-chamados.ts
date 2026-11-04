import { z } from 'zod';
import { describeOverdue, isOverdue } from '@/lib/rules/overdue';
import { defineTool } from './types';

export const buscarMeusChamados = defineTool({
  name: 'buscar_meus_chamados',
  description:
    'Lista os chamados do próprio funcionário (identidade vem da sessão). Use SEMPRE antes de montar um rascunho, para evitar duplicidade. ' +
    'Passe show=true só quando o funcionário quer ver os chamados (ex.: "qual o status do meu chamado?") — aí a lista aparece para ele escolher. ' +
    'Se ele pedir chamados antigos, resolvidos, encerrados ou o histórico, use status=closed (ou all para ver tudo).',
  inputSchema: z.object({
    status: z
      .enum(['open', 'closed', 'all'])
      .default('open')
      .describe('open = só os em andamento; closed = só os resolvidos e encerrados; all = todos'),
    show: z.boolean().default(false).describe('true para mostrar a lista ao funcionário'),
  }),
  async run(ctx, input) {
    const all = await ctx.tickets.listByRequester(ctx.employee_id, input.status === 'open' ? 'open' : 'all');
    const list = input.status === 'closed' ? all.filter((t) => t.status === 'resolved' || t.status === 'closed') : all;
    const tickets = list.map((t) => ({
      code: t.code,
      title: t.title,
      status: t.status,
      category: t.category,
      priority: t.priority,
      last_update_at: t.last_update_at,
      resolved_at: t.resolved_at,
      overdue: isOverdue(t, ctx.now),
    }));
    if (input.show) {
      // O que o funcionário vê é a base da resposta: entra como fonte (a checagem de duplicidade, interna, não).
      for (const t of list) ctx.turn?.sources.push({ kind: 'ticket', id: t.code, title: t.title });
      if (list.length === 1) {
        const t = list[0]!;
        const atraso = describeOverdue(t, ctx.now);
        ctx.emitPart({ kind: 'ticket_card', ticket: t, overdue: atraso !== null, ...(atraso ? { overdue_label: atraso } : {}) });
      } else if (list.length > 1) {
        ctx.emitPart({
          kind: 'ticket_selector',
          tickets: list.map((t) => ({ code: t.code, title: t.title, status: t.status, last_update_at: t.last_update_at })),
        });
      }
    }
    return { tickets };
  },
  summary(output) {
    const o = output as { tickets?: Array<{ overdue: boolean }> };
    const n = o.tickets?.length ?? 0;
    const v = o.tickets?.filter((t) => t.overdue).length ?? 0;
    return `${n} chamado${n === 1 ? '' : 's'}${v ? `, ${v} vencido${v === 1 ? '' : 's'}` : ''}`;
  },
});
