import { RequestContext } from '@mastra/core/request-context';
import type { UIMessageStreamWriter } from 'ai';
import { TZDate } from '@date-fns/tz';
import { and, desc, eq, gte, isNotNull, ne, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { aiAgentRuns, conversations, knowledgeArticles, llmCalls } from '@/lib/db/schema';
import { env, serverNow } from '@/lib/env';
import type { Session } from '@/lib/auth/session';
import type { ActionTrace, TurnDecision } from '@/lib/contracts/decision';
import type { MessagePart } from '@/lib/contracts/parts';
import type { Priority } from '@/lib/contracts/enums';
import type { NexoDataParts, NexoUIMessage } from '@/lib/contracts/ui';
import { appendMessage, getConversation, registerEmployeeMessage } from '@/lib/conversations/service';
import { createHandoff } from '@/lib/conversations/handoff';
import { Conflict } from '@/lib/api/errors';
import { getTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { getModel } from '@/lib/agent-engine/edge/llm/provider';
import { recordLlmCall } from '@/lib/agent-engine/edge/llm/record';
import { evaluateTriggers, askedForAnalyst } from '@/lib/agent-engine/triggers/transfer';
import { adjustConfidence } from '@/lib/agent-engine/guardrails/confidence';
import { claimsCreation } from '@/lib/agent-engine/guardrails/hallucinated-action';
import { promisedAnalyst } from '@/lib/agent-engine/guardrails/analyst-promise';
import { TOOL_CTX_KEY, type ToolCtx } from '@/lib/agent-engine/tools';
import type { TurnSignals } from '@/lib/agent-engine/tools/types';
import type { Article } from '@/lib/agent-engine/knowledge/search';
import { declareDecision } from './decision';
import { summarizeParts } from '@/lib/conversations/parts-summary';
import { createNexoAgent } from './nexo-agent';

export type TurnOutcome = 'answered' | 'transferred' | 'paused' | 'limit' | 'failed';
export type TurnWriter = UIMessageStreamWriter<NexoUIMessage>;

type Input = { conversation_id: string; employee: Session; text: string; writer: TurnWriter; now?: Date };

const PROMISE_GUARD = 'Guardrail: o agent prometeu um analista, transferência executada';
const CREATION_GUARD = 'Guardrail: o agent disse que criou o chamado, mas só a confirmação cria — aviso mostrado';
export const NOT_CREATED_NOTICE = 'O chamado ainda não foi criado — confira o rascunho e confirme.';
const DRAFT_ACTION = { create: 'draft_create', update: 'draft_update', reopen: 'reopen' } as const;
export const BUDGET_NOTICE = 'O assistente atingiu o limite de uso de hoje';

function system(writer: TurnWriter, data: NexoDataParts['system']) {
  writer.write({ type: 'data-system', id: `sys-${crypto.randomUUID()}`, data });
}

async function loadArticles(): Promise<Article[]> {
  const rows = await getDb().select().from(knowledgeArticles);
  return rows.map((r) => ({ slug: r.slug, title: r.title, body: r.body, tags: r.tags, applies_to: r.applies_to }));
}

/** Turno sem modelo (transferência determinística): fica registrado com decisão de regra e custo zero. */
async function ruleBasedTurn(
  i: Input,
  inboundId: string,
  answer: string,
  decision: TurnDecision,
): Promise<string> {
  const db = getDb();
  const [run] = await db
    .insert(aiAgentRuns)
    .values({
      conversation_id: i.conversation_id,
      inbound_message_id: inboundId,
      status: 'handoff',
      model: null,
      cost_cents: 0,
      latency_ms: 0,
      decision,
      completed_at: new Date(),
    })
    .returning();
  i.writer.write({ type: 'data-run', id: `run-${run!.id}`, data: { run_id: run!.id } });
  const id = `txt-${run!.id}`;
  i.writer.write({ type: 'text-start', id });
  i.writer.write({ type: 'text-delta', id, delta: answer });
  i.writer.write({ type: 'text-end', id });
  const msg = await appendMessage(db, {
    conversation_id: i.conversation_id,
    direction: 'outbound',
    sent_via: 'ai',
    body: answer,
    agent_run_id: run!.id,
  });
  await db.update(aiAgentRuns).set({ outbound_message_id: msg.id }).where(eq(aiAgentRuns.id, run!.id));
  i.writer.write({ type: 'data-run', id: `run-${run!.id}`, data: { run_id: run!.id, decision_ready: true } });
  return run!.id;
}

/**
 * Um turno do agent. Ordem: portão de pausa → limite → pedido explícito (sem modelo) → modelo com tools →
 * decisão declarada → gatilhos e guardrails (só se a conversa ainda está com o agent) → registro do run.
 */
export async function runTurn(i: Input): Promise<{ run_id: string | null; outcome: TurnOutcome }> {
  const now = i.now ?? serverNow();
  const db = getDb();
  const limit = env.SESSION_MESSAGE_LIMIT;
  const reg = await registerEmployeeMessage(i.conversation_id, i.text, limit);

  // 1. Portão: com analista (ou aguardando um), o agent não responde — nem gasta token.
  if (reg.conversation.status !== 'ai_handling') {
    system(i.writer, { kind: 'paused', text: 'Sua mensagem foi enviada ao analista' });
    return { run_id: null, outcome: 'paused' };
  }

  // 2. Limite da sessão.
  if (reg.reached_limit) {
    const run_id = await ruleBasedTurn(
      i,
      reg.message.id,
      `Você chegou ao limite de ${limit} mensagens desta sessão. Transferi para um analista, que continua daqui com todo o histórico.`,
      {
        understanding: { intent: 'other', summary: 'Sessão chegou ao limite de mensagens', evidence: i.text },
        decision: {
          action: 'transfer',
          confidence: 1,
          why: `O limite é de ${limit} mensagens por sessão; um analista continua o atendimento.`,
          rules_applied: [`Limite da sessão: ${limit} mensagens, um analista continua o atendimento`],
          sources: [],
        },
      },
    );
    await createHandoff(
      {
        conversation_id: i.conversation_id,
        origin: 'session_limit',
        reason_code: 'session_limit',
        level: 'N1',
        employee_words: i.text,
        ...(await caseWithoutModel(`A sessão chegou a ${limit} mensagens sem resolver.`, reg.conversation, run_id)),
      },
      now,
    );
    system(i.writer, { kind: 'limit', text: 'Transferida para um analista' });
    return { run_id, outcome: 'limit' };
  }

  // 3. Pedido explícito de pessoa: regra, sem modelo.
  if (askedForAnalyst(i.text)) {
    const run_id = await ruleBasedTurn(
      i,
      reg.message.id,
      'Certo, transferi para um analista. Ele vai continuar este atendimento por aqui.',
      {
        understanding: { intent: 'talk_to_human', summary: 'Pediu para falar com um analista', evidence: i.text },
        decision: {
          action: 'transfer',
          confidence: 1,
          why: 'O funcionário pediu atendimento humano.',
          rules_applied: ['Pedido explícito: o funcionário pediu para falar com um analista'],
          sources: [],
        },
      },
    );
    const focusTicket = await getFocusTicket(reg.conversation.focus_ticket_code, i.employee.user_id, 'N1');
    await createHandoff(
      {
        conversation_id: i.conversation_id,
        ticket_code: focusTicket?.code ?? null,
        ticket_priority: focusTicket?.priority,
        origin: 'explicit_request',
        reason_code: 'requested_human',
        level: 'N1',
        employee_words: i.text,
        agent_reading: focusTicket
          ? `Pediu um analista; o chamado em foco é o ${focusTicket.code} (${focusTicket.title}).`
          : 'Pediu um analista; leia o histórico da conversa.',
        attempts: [],
      },
      now,
    );
    system(i.writer, { kind: 'transferred', text: 'Transferida para um analista' });
    return { run_id, outcome: 'transferred' };
  }

  // 4. Teto diário de gasto: acima dele o modelo não é chamado e um analista continua.
  const cap = env.LLM_DAILY_BUDGET_CENTS;
  if (cap !== undefined && (await dailySpend(now)) >= cap) {
    const run_id = await ruleBasedTurn(
      i,
      reg.message.id,
      `${BUDGET_NOTICE}. Transferi para um analista, que continua daqui com todo o histórico.`,
      {
        understanding: { intent: 'other', summary: 'O assistente atingiu o teto diário de uso', evidence: i.text },
        decision: {
          action: 'transfer',
          confidence: 1,
          why: 'O gasto com o modelo hoje chegou ao teto configurado; um analista continua o atendimento.',
          rules_applied: ['Teto diário de uso do assistente atingido: o modelo não é chamado'],
          sources: [],
        },
      },
    );
    await createHandoff(
      {
        conversation_id: i.conversation_id,
        origin: 'budget',
        reason_code: 'budget_exceeded',
        level: 'N1',
        employee_words: i.text,
        ...(await caseWithoutModel('O assistente atingiu o limite de uso de hoje e não leu esta mensagem.', reg.conversation, run_id)),
      },
      now,
    );
    system(i.writer, { kind: 'budget', text: BUDGET_NOTICE });
    return { run_id, outcome: 'transferred' };
  }

  // 5. Turno com o modelo.
  const model = getModel();
  const [run] = await db
    .insert(aiAgentRuns)
    .values({ conversation_id: i.conversation_id, inbound_message_id: reg.message.id, status: 'running', model: model.model_id })
    .returning();
  const run_id = run!.id;
  i.writer.write({ type: 'data-run', id: `run-${run_id}`, data: { run_id } });

  try {
    const actions = new Map<string, ActionTrace>();
    const parts: MessagePart[] = [];
    const turn: TurnSignals = { sources: [] };
    const retry: ToolCtx['retry'] = { current: null };
    const ctx: ToolCtx = {
      employee_id: i.employee.user_id,
      employee_text: i.text,
      conversation_id: i.conversation_id,
      agent_run_id: run_id,
      now,
      tickets: getTicketsClient({ onRetry: (n) => retry.current?.(n) }),
      articles: loadArticles,
      emitAction: (a) => {
        actions.set(a.id, a);
        i.writer.write({ type: 'data-action', id: `act-${a.id}`, data: a });
      },
      emitPart: (p) => {
        parts.push(p);
        i.writer.write({ type: 'data-card', id: `card-${run_id}-${parts.length}`, data: p });
      },
      retry,
      turn,
    };
    const requestContext = new RequestContext();
    requestContext.set(TOOL_CTX_KEY, ctx);

    const t0 = Date.now();
    const textId = `txt-${run_id}`;
    let started = false;
    let answer = '';
    let failed: string | null = null;
    let usage = { in: 0, out: 0, cached: 0 };
    let steps = 0;
    let textStep = -1; // passo em que saiu o último texto: texto de um passo novo começa num parágrafo novo
    const writeText = (delta: string) => {
      if (answer && textStep !== steps && !/\s$/.test(answer)) delta = `\n\n${delta.trimStart()}`;
      textStep = steps;
      if (!started) {
        i.writer.write({ type: 'text-start', id: textId });
        started = true;
      }
      i.writer.write({ type: 'text-delta', id: textId, delta });
      answer += delta;
    };

    try {
      const agent = createNexoAgent(model.model);
      const stream = await agent.stream(i.text, {
        memory: { thread: i.conversation_id, resource: i.employee.user_id },
        requestContext,
        maxSteps: 6,
      });
      for await (const chunk of stream.fullStream) {
        if (chunk.type === 'text-delta') writeText(chunk.payload.text);
        else if (chunk.type === 'step-finish') steps += 1;
        else if (chunk.type === 'error') failed = String((chunk.payload as { error?: unknown }).error ?? 'erro do modelo');
      }
      const u = await stream.usage;
      usage = { in: u.inputTokens ?? 0, out: u.outputTokens ?? 0, cached: u.cachedInputTokens ?? 0 };
    } catch (e) {
      failed = e instanceof Error ? e.message : String(e);
      console.error('[runTurn] model call failed', e);
    }
    if (!answer.trim()) {
      writeText(
        failed
          ? 'Tive um problema para responder agora. Pode tentar de novo em instantes?'
          : 'Pronto. Posso ajudar em mais alguma coisa?',
      );
    }
    if (started) i.writer.write({ type: 'text-end', id: textId });

    const actionList = [...actions.values()];
    if (turn.focus_ticket_code) {
      await db.update(conversations).set({ focus_ticket_code: turn.focus_ticket_code }).where(eq(conversations.id, i.conversation_id));
    }
    const outbound = await appendMessage(db, {
      conversation_id: i.conversation_id,
      direction: 'outbound',
      sent_via: 'ai',
      body: answer,
      parts,
      agent_run_id: run_id,
    });
    await recordLlmCall({
      agent_run_id: run_id,
      purpose: 'agent_turn',
      provider: model.provider,
      model: model.model_id,
      input_tokens: usage.in,
      output_tokens: usage.out,
      cache_read_tokens: usage.cached,
      latency_ms: Date.now() - t0,
    });

    // 6. Decisão declarada (ausente ≠ vazia) + ajustes determinísticos.
    let decision = failed
      ? null
      : await declareDecision({
          employee_text: i.text,
          actions: actionList,
          answer_text: answer,
          cards: summarizeParts(parts),
          model,
          agent_run_id: run_id,
        });
    if (decision) {
      // Fontes saem das tools de verdade, não do que o modelo disse que consultou. Uma fonte citada que uma tool
      // retornou num turno anterior desta conversa também vale (ex.: "Windows 10" respondido com o artigo já buscado).
      const previous = await previouslyVerifiedSources(i.conversation_id, run_id);
      const sources = dedupe([
        ...turn.sources,
        ...decision.decision.sources.filter((s) => previous.has(`${s.kind}:${s.id}`)),
      ]);
      const declared = decision.decision.confidence;
      const adjusted = adjustConfidence(declared, {
        intent: decision.understanding.intent,
        sources_count: sources.length,
        action: decision.decision.action,
      }) ?? declared;
      const rules = [...decision.decision.rules_applied];
      if (adjusted < declared) rules.push('Confiança ajustada: dúvida respondida sem fonte na central (máximo 50%)');
      // A ação também sai do que a tool fez: transferir vence (o agent fica pausado); senão, um rascunho montado
      // define se foi criação, atualização ou reabertura.
      const action = turn.handoff_created
        ? 'transfer'
        : turn.draft_kind
          ? DRAFT_ACTION[turn.draft_kind]
          : decision.decision.action;
      decision = { ...decision, decision: { ...decision.decision, action, confidence: adjusted, sources, rules_applied: rules } };
    }

    // 7. Pós-turno: só se a conversa continua com o agent (o analista pode ter assumido durante o stream).
    let outcome: TurnOutcome = failed ? 'failed' : 'answered';
    const current = await getConversation(db, i.conversation_id);
    const rules: string[] = [];
    if (turn.handoff_created) {
      outcome = 'transferred';
    } else if (current?.status !== 'ai_handling') {
      outcome = 'paused';
    } else if (!failed) {
      const g = evaluateTriggers({
        employee_text: i.text,
        confidence: decision?.decision.confidence ?? null,
        draft_priority: turn.draft_priority,
        overdue_ticket_code: turn.overdue_ticket_code,
        session_count: reg.count,
        limit,
        threshold: env.LOW_CONFIDENCE_THRESHOLD,
      });
      if ('transfer' in g && g.transfer) {
        const transferred = await transferIfWithAgent(
          {
            conversation_id: i.conversation_id,
            ticket_code: turn.overdue_ticket_code ?? null,
            ticket_priority: turn.draft_priority,
            origin: 'trigger',
            reason_code: g.reason,
            level: g.level,
            employee_words: i.text,
            agent_reading: decision?.understanding.summary ?? answer,
            attempts: actionList,
            confidence: decision?.decision.confidence ?? null,
          },
          now,
        );
        if (transferred) {
          rules.push(g.rule);
          system(i.writer, { kind: 'transferred', text: 'Transferida para um analista' });
          outcome = 'transferred';
        } else outcome = 'paused';
      } else {
        if ('offer' in g) rules.push(g.rule);
        if (promisedAnalyst(answer)) {
          const transferred = await transferIfWithAgent(
            {
              conversation_id: i.conversation_id,
              origin: 'guardrail',
              reason_code: 'requested_human',
              level: 'N1',
              employee_words: i.text,
              agent_reading: `O agent respondeu "${answer}" sem transferir; a transferência foi feita pelo sistema.`,
              attempts: actionList,
              confidence: decision?.decision.confidence ?? null,
            },
            now,
          );
          if (transferred) {
            rules.push(PROMISE_GUARD);
            system(i.writer, { kind: 'guardrail', text: 'Transferida para um analista' });
            outcome = 'transferred';
          } else outcome = 'paused';
        }
      }
      if (claimsCreation(answer)) {
        rules.push(CREATION_GUARD);
        await appendMessage(db, {
          conversation_id: i.conversation_id,
          direction: 'outbound',
          type: 'system',
          sent_via: 'system',
          body: NOT_CREATED_NOTICE,
          agent_run_id: run_id,
        });
        system(i.writer, { kind: 'guardrail', text: NOT_CREATED_NOTICE });
      }
    }
    if (decision && rules.length) {
      decision = { ...decision, decision: { ...decision.decision, rules_applied: [...decision.decision.rules_applied, ...rules] } };
    }

    // 8. Registro do run com custo somado das chamadas.
    const calls = await db.select().from(llmCalls).where(eq(llmCalls.agent_run_id, run_id));
    const cost = calls.some((c) => c.cost_cents === null) ? null : calls.reduce((s, c) => s + (c.cost_cents ?? 0), 0);
    await db
      .update(aiAgentRuns)
      .set({
        status: failed ? 'failed' : outcome === 'transferred' ? 'handoff' : 'completed',
        error_code: failed ? 'model_error' : null,
        error_message: failed,
        outbound_message_id: outbound.id,
        tokens_in: calls.reduce((s, c) => s + c.input_tokens, 0),
        tokens_out: calls.reduce((s, c) => s + c.output_tokens, 0),
        cost_cents: cost,
        latency_ms: Date.now() - t0,
        steps_count: steps,
        tool_calls: actionList,
        decision,
        completed_at: new Date(),
      })
      .where(eq(aiAgentRuns.id, run_id));
    i.writer.write({ type: 'data-run', id: `run-${run_id}`, data: { run_id, decision_ready: true } });
    return { run_id, outcome };
  } catch (e) {
    // Qualquer falha depois de abrir o run fecha o registro como falho (senão ele fica "running" para sempre).
    await db
      .update(aiAgentRuns)
      .set({
        status: 'failed',
        error_code: 'internal_error',
        error_message: e instanceof Error ? e.message : String(e),
        completed_at: new Date(),
      })
      .where(and(eq(aiAgentRuns.id, run_id), eq(aiAgentRuns.status, 'running')))
      .catch((err: unknown) => console.error('[runTurn] could not close the run', err));
    throw e;
  }
}

/**
 * Passagem pós-turno. Se o analista assumiu entre a releitura do status e aqui, a transição falha: o turno só
 * termina pausado (a conversa já está com um humano), em vez de virar erro para o funcionário.
 */
async function transferIfWithAgent(input: Parameters<typeof createHandoff>[0], now: Date): Promise<boolean> {
  try {
    await createHandoff(input, now);
    return true;
  } catch (e) {
    if (e instanceof Conflict && e.code === 'invalid_transition') return false;
    throw e;
  }
}

/** Leitura, tentativas e chamado em foco de uma passagem feita sem o modelo (limite da sessão, teto de gasto). */
async function caseWithoutModel(
  matchReason: string,
  conv: { id: string; focus_ticket_code: string | null },
  runId: string,
): Promise<{ agent_reading: string; attempts: ActionTrace[]; ticket_code: string | null }> {
  const caseInfo = await summarizeCase(conv.id, runId);
  const reading = [
    matchReason,
    caseInfo.summaries.length ? `Assuntos dos últimos turnos: ${caseInfo.summaries.map((r) => `"${r}"`).join('; ')}.` : '',
    conv.focus_ticket_code ? `Chamado em foco: ${conv.focus_ticket_code}.` : '',
  ];
  return { agent_reading: reading.filter(Boolean).join(' '), attempts: caseInfo.attempts, ticket_code: conv.focus_ticket_code };
}

/**
 * Resumo do caso para a passagem sem modelo: o que o agent entendeu nos últimos turnos e o que
 * ele já fez, a partir dos runs gravados. Sem chamada ao modelo, para não gastar token numa sessão já no limite.
 */
async function summarizeCase(conversationId: string, exceptRunId: string): Promise<{ summaries: string[]; attempts: ActionTrace[] }> {
  const runs = await getDb()
    .select({ decision: aiAgentRuns.decision, tool_calls: aiAgentRuns.tool_calls })
    .from(aiAgentRuns)
    .where(and(eq(aiAgentRuns.conversation_id, conversationId), ne(aiAgentRuns.id, exceptRunId), isNotNull(aiAgentRuns.decision)))
    .orderBy(desc(aiAgentRuns.started_at))
    .limit(5);
  const summaries = [...new Set(runs.map((r) => r.decision!.understanding.summary))].slice(0, 3).reverse();
  const seen = new Set<string>();
  const attempts = runs
    .flatMap((r) => r.tool_calls)
    .filter((a) => a.result !== 'running' && !seen.has(a.label) && seen.add(a.label));
  return { summaries: summaries, attempts: attempts };
}

/** Chamado em foco da conversa (para a passagem levar o código e o prazo certo). Falha do legado não bloqueia. */
async function getFocusTicket(
  code: string | null,
  employeeId: string,
  level: 'N1' | 'N2',
): Promise<{ code: string; title: string; priority: Priority } | null> {
  if (!code) return null;
  try {
    const tickets = getTicketsClient();
    const t = await tickets.get(code, employeeId);
    await tickets.transfer(t.code, { requester_id: employeeId, level, summary: 'Funcionário pediu um analista' }).catch(() => null);
    return { code: t.code, title: t.title, priority: t.priority };
  } catch {
    return null;
  }
}

/** Soma do custo das chamadas ao modelo no dia corrente de São Paulo (custo não medido conta como zero). */
async function dailySpend(now: Date): Promise<number> {
  const sp = new TZDate(now.getTime(), 'America/Sao_Paulo');
  const start = new TZDate(sp.getFullYear(), sp.getMonth(), sp.getDate(), 0, 0, 0, 'America/Sao_Paulo');
  const [r] = await getDb()
    .select({ total: sql<string | null>`sum(${llmCalls.cost_cents})` })
    .from(llmCalls)
    .where(gte(llmCalls.created_at, new Date(start.getTime())));
  return Number(r?.total ?? 0);
}

/** Fontes que já entraram em decisões anteriores da conversa (e portanto vieram de tools). */
async function previouslyVerifiedSources(conversationId: string, exceptRunId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ decision: aiAgentRuns.decision })
    .from(aiAgentRuns)
    .where(and(eq(aiAgentRuns.conversation_id, conversationId), ne(aiAgentRuns.id, exceptRunId)));
  return new Set(rows.flatMap((r) => r.decision?.decision.sources.map((s) => `${s.kind}:${s.id}`) ?? []));
}

function dedupe<T extends { kind: string; id: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = `${x.kind}:${x.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
