import { randomUUID } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import type { RequestContext } from '@mastra/core/request-context';
import { TicketsRejectedError, TicketsTransportError } from '@/lib/agent-engine/edge/tickets/errors';
import { labelsFor } from '@/lib/agent-engine/agent/labels';
import type { ActionTrace } from '@/lib/contracts/decision';
import { searchArticlesTool } from './search-articles';
import { listMyTicketsTool } from './list-my-tickets';
import { buildDraftTool } from './build-draft';
import { offerOptionsTool } from './offer-options';
import { transferToAnalystTool } from './transfer-to-analyst';
import type { ToolCtx, ToolDef } from './types';
import { getTicketTool } from './get-ticket';
import { markResolvedTool } from './mark-resolved';

export type { ToolCtx } from './types';

export const TOOL_DEFS = {
  list_my_tickets: listMyTicketsTool,
  get_ticket: getTicketTool,
  search_articles: searchArticlesTool,
  build_draft: buildDraftTool,
  offer_options: offerOptionsTool,
  transfer_to_analyst: transferToAnalystTool,
  mark_resolved: markResolvedTool,
} as const satisfies Record<string, ToolDef>;

export type ToolName = keyof typeof TOOL_DEFS;

/**
 * Executa uma tool registrando a trilha: cada rótulo vira uma ação (spinner → ✓/⚠).
 * Queda do sistema de chamados vira resposta honesta `{ ok:false, error:'tickets_unavailable' }`.
 */
export async function runTool(ctx: ToolCtx, name: ToolName, rawInput: unknown): Promise<unknown> {
  const def = TOOL_DEFS[name] as unknown as ToolDef;
  const parsed = def.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success)
    return { ok: false, error: 'invalid_input', details: parsed.error.issues.map((i) => i.message) };
  const input = parsed.data;
  const id = randomUUID();
  const t0 = Date.now();
  // Enquanto roda, só o primeiro rótulo aparece (com spinner); o resultado traz os definitivos.
  const running = labelsFor(name, input, undefined).slice(0, 1);
  const emit = (labels: string[], result: ActionTrace['result'], summary: string) =>
    labels.forEach((label, i) =>
      ctx.emitAction({ id: `${id}:${i}`, label, tool: name, result, duration_ms: Date.now() - t0, summary }),
    );

  emit(running, 'running', '');
  ctx.retry.current = (attempt) =>
    emit(running, 'retried', `sistema de chamados lento, tentativa ${attempt + 1}`);
  let output: unknown;
  try {
    output = await def.run(ctx, input);
  } catch (e) {
    if (e instanceof TicketsTransportError) output = { ok: false, error: 'tickets_unavailable' };
    else if (e instanceof TicketsRejectedError) output = { ok: false, error: e.code };
    else {
      console.error(`[tool ${name}] failed`, e);
      output = { ok: false, error: 'internal_error' };
    }
  } finally {
    ctx.retry.current = null;
  }
  const err = (output as { error?: string } | null)?.error;
  const final = labelsFor(name, input, output);
  // Se o rótulo final mudou (ex.: "sistema indisponível"), os ids de "running" são reaproveitados.
  emit(
    final,
    err === 'tickets_unavailable' || err === 'internal_error' ? 'error' : 'ok',
    err && err !== 'possible_duplicate' ? describeError(err) : def.summary(output, input, ctx),
  );
  return output;
}

function describeError(code: string): string {
  if (code === 'tickets_unavailable') return 'o sistema de chamados não respondeu';
  if (code === 'reopen_window_expired') return 'fora da janela de 7 dias para reabrir';
  return code;
}

export const TOOL_CTX_KEY = 'nexo.tool_ctx';

/** Adapter Mastra: o contexto do turno vem do RequestContext montado no servidor — nunca do input do modelo. */
export function toMastraTools() {
  const entries = Object.entries(TOOL_DEFS).map(([name, def]) => [
    name,
    createTool({
      id: name,
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (inputData: unknown, context?: { requestContext?: RequestContext<unknown> }) => {
        const ctx = context?.requestContext?.get(TOOL_CTX_KEY as never) as ToolCtx | undefined;
        if (!ctx) throw new Error('contexto do turno ausente');
        return runTool(ctx, name as ToolName, inputData);
      },
    }),
  ]);
  return Object.fromEntries(entries) as Record<ToolName, ReturnType<typeof createTool>>;
}
