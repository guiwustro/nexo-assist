import { z } from 'zod';
import { descreverAtraso, estaVencido } from '@/lib/regras/vencido';
import { defineTool } from './types';

export const buscarMeusChamados = defineTool({
  name: 'buscar_meus_chamados',
  description:
    'Lista os chamados do próprio funcionário (identidade vem da sessão). Use SEMPRE antes de montar um rascunho, para evitar duplicidade. ' +
    'Passe show=true só quando o funcionário quer ver os chamados (ex.: "qual o status do meu chamado?") — aí a lista aparece para ele escolher.',
  inputSchema: z.object({
    status: z.enum(['open', 'all']).default('open').describe('open = só os em andamento; all = inclui resolvidos e encerrados'),
    show: z.boolean().default(false).describe('true para mostrar a lista ao funcionário'),
  }),
  async run(ctx, input) {
    const list = await ctx.tickets.listByRequester(ctx.employee_id, input.status);
    const tickets = list.map((t) => ({
      code: t.code,
      title: t.title,
      status: t.status,
      category: t.category,
      priority: t.priority,
      last_update_at: t.last_update_at,
      resolved_at: t.resolved_at,
      overdue: estaVencido(t, ctx.now),
    }));
    if (input.show) {
      if (list.length === 1) {
        const t = list[0]!;
        const atraso = descreverAtraso(t, ctx.now);
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
