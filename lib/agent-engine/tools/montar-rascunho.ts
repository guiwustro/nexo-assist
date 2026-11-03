import { z } from 'zod';
import { TicketsNotFoundError } from '@/lib/agent-engine/edge/tickets/errors';
import { AffectedSchema, CategorySchema, PRIORITY_LABEL, TicketTypeSchema } from '@/lib/contracts/enums';
import { DraftKindSchema, type DraftPayload } from '@/lib/contracts/drafts';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import { createDraft } from '@/lib/drafts/service';
import { calcularPrazo, formatarPrazoCurto } from '@/lib/regras/prazo';
import { calcularPrioridade } from '@/lib/regras/prioridade';
import { podeReabrir } from '@/lib/regras/reabertura';
import { defineTool } from './types';

export const montarRascunho = defineTool({
  name: 'montar_rascunho',
  description:
    'Monta o RASCUNHO de um chamado para o funcionário conferir. Não cria nada: só o clique em Confirmar cria. ' +
    'A prioridade e o prazo são calculados pelo sistema a partir de affected, blocks_work e deadline_today (Anexo A). ' +
    'kind=update para complementar um chamado aberto sobre o mesmo problema (sem duplicar); kind=reopen para chamado resolvido há até 7 dias.',
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
  }),
  async run(ctx, input) {
    if (input.kind !== 'create' && !input.target_code) return { ok: false, error: 'target_code_required' };
    if (input.target_code) {
      try {
        const alvo = await ctx.tickets.get(input.target_code, ctx.employee_id);
        if (input.kind === 'reopen') {
          const r = podeReabrir(alvo, ctx.now);
          if (!r.ok) return { ok: false, error: 'reopen_window_expired', regra: r.regra };
        }
      } catch (e) {
        if (e instanceof TicketsNotFoundError) return { found: false };
        throw e;
      }
    }
    const prioridade = calcularPrioridade(input);
    const prazo = calcularPrazo(prioridade.priority, ctx.now);
    const payload: DraftPayload = {
      title: input.title,
      description: input.description,
      type: input.type,
      category: input.category,
      affected: input.affected,
      blocks_work: input.blocks_work,
      deadline_today: input.deadline_today,
      priority: prioridade.priority,
      priority_rule: prioridade.regra,
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
    if (ctx.turn) ctx.turn.draft_priority = prioridade.priority;
    return {
      ok: true,
      draft_code: draft.code,
      draft_id: draft.id,
      priority: prioridade.priority,
      priority_rule: prioridade.regra,
      sla_rule: prazo.regra,
      due_at: payload.due_at,
      note: 'Rascunho mostrado ao funcionário. O chamado ainda NÃO existe: peça para conferir e clicar em Confirmar.',
    };
  },
  summary(output, _input, ctx) {
    const o = output as { draft_code?: string; priority?: keyof typeof PRIORITY_LABEL; due_at?: string; error?: string; found?: boolean };
    if (o.found === false) return 'chamado não encontrado entre os seus';
    if (o.error) return o.error === 'reopen_window_expired' ? 'fora da janela de 7 dias para reabrir' : o.error;
    return `${o.draft_code} · ${PRIORITY_LABEL[o.priority!]} · ${formatarPrazoCurto(new Date(o.due_at!), ctx.now)}`;
  },
});
