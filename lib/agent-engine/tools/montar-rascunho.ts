import { z } from 'zod';
import { TicketsNotFoundError, TicketsTransportError } from '@/lib/agent-engine/edge/tickets/errors';
import { AffectedSchema, CategorySchema, PRIORITY_LABEL, TicketTypeSchema } from '@/lib/contracts/enums';
import { DraftKindSchema, type DraftPayload } from '@/lib/contracts/drafts';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import { createDraft } from '@/lib/drafts/service';
import { computeDeadline, formatShortDeadline } from '@/lib/rules/deadline';
import { computePriority } from '@/lib/rules/priority';
import { canReopen } from '@/lib/rules/reopening';
import { defineTool } from './types';

export const montarRascunho = defineTool({
  name: 'montar_rascunho',
  description:
    'Monta o RASCUNHO de um chamado para o funcionário conferir. Não cria nada: só o clique em Confirmar cria. ' +
    'A prioridade e o prazo são calculados pelo sistema a partir de affected, blocks_work e deadline_today (Anexo A). ' +
    'kind=update para complementar um chamado aberto sobre o mesmo problema (sem duplicar); kind=reopen para chamado resolvido há até 7 dias. ' +
    'Em update/reopen, monte direto, sem perguntar: copie title, type, category e affected do chamado alvo, use blocks_work=false e ' +
    'deadline_today=false se o funcionário não disse o contrário, e ponha o que ele contou em comment. ' +
    'Em create, o sistema recusa (possible_duplicate) se houver chamado aberto do funcionário na mesma categoria: se for o ' +
    'mesmo problema, use kind=update nele; se for outro problema, chame de novo com o código em distinct_from.',
  inputSchema: z.object({
    kind: DraftKindSchema,
    target_code: TicketCodeSchema.optional().describe('obrigatório em update e reopen'),
    title: z.string().min(3).max(120),
    description: z.string().min(3).max(2000),
    type: TicketTypeSchema.describe('incident = algo parou/não funciona; request = pedido de acesso, equipamento ou software'),
    category: CategorySchema,
    affected: AffectedSchema.describe('me = só a pessoa; team = a equipe; company = a empresa'),
    blocks_work: z.boolean().describe('impede de trabalhar (sem alternativa)?'),
    deadline_today: z.boolean().describe('há um compromisso em risco hoje?'),
    comment: z.string().max(2000).optional().describe('texto do complemento em update/reopen'),
    distinct_from: z
      .array(TicketCodeSchema)
      .max(10)
      .optional()
      .describe('em create: chamados abertos da mesma categoria que você conferiu e que são OUTRO problema'),
  }),
  async run(ctx, input) {
    if (input.kind !== 'create' && !input.target_code) return { ok: false, error: 'target_code_required' };
    if (input.target_code) {
      try {
        const alvo = await ctx.tickets.get(input.target_code, ctx.employee_id);
        if (input.kind === 'reopen') {
          const r = canReopen(alvo, ctx.now);
          if (!r.ok) return { ok: false, error: 'reopen_window_expired', regra: r.rule };
        }
      } catch (e) {
        if (e instanceof TicketsNotFoundError) return { found: false };
        throw e;
      }
    }
    if (input.kind === 'create') {
      const parecidos = await abertosNaCategoria(ctx, input.category, input.distinct_from ?? []);
      if (parecidos.length) {
        return {
          ok: false,
          error: 'possible_duplicate',
          open_tickets: parecidos,
          note:
            'O funcionário já tem chamado aberto nesta categoria. Se for o mesmo problema, monte kind=update nele (sem duplicar). ' +
            'Se for outro problema, monte de novo com distinct_from contendo os códigos.',
        };
      }
    }
    const prioridade = computePriority(input);
    const prazo = computeDeadline(prioridade.priority, ctx.now);
    const payload: DraftPayload = {
      title: input.title,
      description: input.description,
      type: input.type,
      category: input.category,
      affected: input.affected,
      blocks_work: input.blocks_work,
      deadline_today: input.deadline_today,
      priority: prioridade.priority,
      priority_rule: prioridade.rule,
      due_at: prazo.due_at.toISOString(),
      ...(input.comment ? { comment: input.comment } : {}),
    };
    const draft = await createDraft({
      conversation_id: ctx.conversation_id,
      agent_run_id: ctx.agent_run_id,
      kind: input.kind,
      target_ticket_code: input.target_code ?? null,
      payload,
    });
    ctx.emitPart({
      kind: 'draft_card',
      draft_id: draft.id,
      code: draft.code,
      draft_kind: input.kind,
      target_code: input.target_code ?? null,
      status: 'pending',
      payload,
    });
    if (ctx.turn) {
      ctx.turn.draft_priority = prioridade.priority;
      ctx.turn.draft_kind = input.kind;
    }
    return {
      ok: true,
      draft_code: draft.code,
      draft_id: draft.id,
      priority: prioridade.priority,
      priority_rule: prioridade.rule,
      sla_rule: prazo.rule,
      due_at: payload.due_at,
      note: 'Rascunho mostrado ao funcionário. O chamado ainda NÃO existe: peça para conferir e clicar em Confirmar.',
    };
  },
  summary(output, _input, ctx) {
    const o = output as {
      draft_code?: string;
      priority?: keyof typeof PRIORITY_LABEL;
      due_at?: string;
      error?: string;
      found?: boolean;
      open_tickets?: Array<{ code: string }>;
    };
    if (o.found === false) return 'chamado não encontrado entre os seus';
    if (o.error === 'possible_duplicate') {
      return `já existe chamado aberto nesta categoria: ${o.open_tickets!.map((t) => t.code).join(', ')}`;
    }
    if (o.error) return o.error === 'reopen_window_expired' ? 'fora da janela de 7 dias para reabrir' : o.error;
    return `${o.draft_code} · ${PRIORITY_LABEL[o.priority!]} · ${formatShortDeadline(new Date(o.due_at!), ctx.now)}`;
  },
});

/**
 * Chamados abertos do funcionário na mesma categoria (checagem determinística contra duplicidade, além do prompt).
 * Sistema de chamados fora: não dá para checar, e o rascunho segue — a confirmação depende do sistema de qualquer jeito.
 */
async function abertosNaCategoria(
  ctx: Parameters<typeof montarRascunho.run>[0],
  category: string,
  conferidos: string[],
): Promise<Array<{ code: string; title: string; status: string }>> {
  try {
    const abertos = await ctx.tickets.listByRequester(ctx.employee_id, 'open');
    return abertos
      .filter((t) => t.category === category && !conferidos.includes(t.code))
      .map((t) => ({ code: t.code, title: t.title, status: t.status }));
  } catch (e) {
    if (e instanceof TicketsTransportError) return [];
    throw e;
  }
}
