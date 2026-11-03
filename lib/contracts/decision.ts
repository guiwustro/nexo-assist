import { z } from 'zod';

export const INTENTS = [
  'question',
  'status',
  'complement',
  'open_ticket',
  'talk_to_human',
  'out_of_scope',
  'other',
] as const;
export const IntentSchema = z.enum(INTENTS);
export type Intent = z.infer<typeof IntentSchema>;

export const ACTIONS = ['answer', 'ask', 'draft_create', 'draft_update', 'reopen', 'transfer', 'redirect'] as const;
export const ActionSchema = z.enum(ACTIONS);
export type Action = z.infer<typeof ActionSchema>;

export const ACTION_LABEL: Record<Action, string> = {
  answer: 'respondi',
  ask: 'perguntei o que faltava',
  draft_create: 'montei um rascunho de chamado novo',
  draft_update: 'montei um rascunho para atualizar o chamado',
  reopen: 'montei um rascunho para reabrir o chamado',
  transfer: 'transferi para um analista',
  redirect: 'indiquei o canal certo',
};

export const SourceSchema = z.object({
  kind: z.enum(['article', 'ticket']),
  id: z.string().min(1),
  title: z.string(),
});
export type Source = z.infer<typeof SourceSchema>;

export const TurnDecisionSchema = z.object({
  understanding: z.object({
    intent: IntentSchema,
    summary: z.string().min(1),
    evidence: z.string().min(1),
  }),
  decision: z.object({
    action: ActionSchema,
    confidence: z.number().min(0).max(1),
    why: z.string().min(1),
    rules_applied: z.array(z.string()),
    sources: z.array(SourceSchema),
  }),
});
export type TurnDecision = z.infer<typeof TurnDecisionSchema>;

export const ActionTraceSchema = z.object({
  id: z.string(),
  label: z.string(),
  tool: z.string(),
  result: z.enum(['running', 'ok', 'error', 'retried']),
  duration_ms: z.number().int().nonnegative(),
  summary: z.string(),
});
export type ActionTrace = z.infer<typeof ActionTraceSchema>;
