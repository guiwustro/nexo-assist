import type { z } from 'zod';
import type { TicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import type { Article } from '@/lib/agent-engine/conhecimento/busca';
import type { ActionTrace } from '@/lib/contracts/decision';
import type { MessagePart } from '@/lib/contracts/parts';

/** Contexto do turno, montado no servidor a partir da sessão. O modelo nunca escreve aqui. */
export type ToolCtx = {
  employee_id: string;
  employee_text: string;
  conversation_id: string;
  agent_run_id: string | null;
  now: Date;
  tickets: TicketsClient;
  articles: () => Promise<Article[]>;
  emitAction: (a: ActionTrace) => void;
  emitPart: (p: MessagePart) => void;
  /** Ouvinte de nova tentativa do cliente de chamados, ligado à tool em execução. */
  retry: { current: ((attempt: number) => void) | null };
  /** Preenchido pelas tools para o pós-turno (gatilhos). */
  turn?: TurnSignals;
};

export type TurnSignals = {
  draft_priority?: import('@/lib/contracts/enums').Priority;
  overdue_ticket_code?: string;
  focus_ticket_code?: string;
  handoff_created?: boolean;
  sources: Array<{ kind: 'article' | 'ticket'; id: string; title: string }>;
};

export type ToolDef<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  inputSchema: S;
  run: (ctx: ToolCtx, input: z.infer<S>) => Promise<unknown>;
  summary: (output: unknown, input: z.infer<S>, ctx: ToolCtx) => string;
};

export const defineTool = <S extends z.ZodObject>(d: ToolDef<S>) => d;
