/**
 * Evals do Nexo Assist com o modelo real.
 *
 *   pnpm eval                       # todos os cenários, 3× cada (precisa de LLM_PROVIDER=deepseek)
 *   pnpm eval --only reopen-sap    # só um cenário (vírgula para vários)
 *   pnpm eval --vezes 1             # menos repetições
 *   pnpm eval --scripted            # roda com o modelo roteirizado: confere o runner sem gastar
 *
 * Cada repetição refaz o seed do banco de teste e usa o serviço de chamados falso em memória;
 * o resto é o pipeline real (runTurn, tools, memória, decisão, gatilhos e guardrails).
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import type { UIMessageStreamWriter } from 'ai';
import type { NexoUIMessage } from '@/lib/contracts/ui';
import type { Session } from '@/lib/auth/session';
import { SCENARIOS, type Scenario } from './scenarios';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const SCRIPTED = args.includes('--scripted');
const TIMES = Number(arg('vezes') ?? 3);
const ONLY = arg('only')?.split(',');
const THRESHOLD = 0.8;

// Sempre no banco de teste; o provider vem do .env (ou roteirizado com --scripted).
const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? 'postgres://nexo:nexo@localhost:5432/nexo_test';
process.env.DATABASE_URL = TEST_DB_URL;
if (SCRIPTED) process.env.LLM_PROVIDER = 'scripted';
// Evals nunca rodam com o limite de sessão nem com orçamento atrapalhando.
process.env.SESSION_MESSAGE_LIMIT = '30';
delete process.env.LLM_DAILY_BUDGET_CENTS;

/** Terça-feira, 03/11/2026, 10:00 em São Paulo — o mesmo "agora" da integração. */
const NOW = new Date('2026-11-03T13:00:00.000Z');

type Result = {
  scenario: Scenario;
  ok: boolean;
  failures: string[];
  cost_cents: number | null;
  latency_ms: number;
  turns: number;
  tokens: { in: number; out: number };
  /** Última resposta do agent (para entender a falha). */
  answer: string;
  decision: string;
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function collectingWriter(): UIMessageStreamWriter<NexoUIMessage> {
  return { write: () => {}, merge: () => {}, onError: undefined } as unknown as UIMessageStreamWriter<NexoUIMessage>;
}

async function main() {
  const { env } = await import('@/lib/env');
  if (env.LLM_PROVIDER !== 'deepseek' && !SCRIPTED) {
    console.error('Set LLM_PROVIDER=deepseek and DEEPSEEK_API_KEY in .env (or run with --scripted).');
    process.exit(2);
  }
  const { and, asc, eq, inArray } = await import('drizzle-orm');
  const { getDb } = await import('@/lib/db/client');
  const { migrateDb } = await import('@/lib/db/migrate');
  const { resetAndSeed } = await import('@/lib/db/seed');
  const { userByKey } = await import('@/lib/db/seed-data');
  const { aiAgentRuns, handoffs, llmCalls, messages, ticketDrafts } = await import('@/lib/db/schema');
  const { runTurn } = await import('@/lib/agent-engine/agent/run-turn');
  const { closeMemory } = await import('@/lib/agent-engine/agent/memory');
  const { setTicketsClient } = await import('@/lib/agent-engine/edge/tickets/client');
  const { getModel } = await import('@/lib/agent-engine/edge/llm/provider');
  const { getOrCreateWithAgent, touchSession } = await import('@/lib/conversations/attendance');
  const { createFakeTickets } = await import('@/tests/helpers/fake-tickets');

  await migrateDb(TEST_DB_URL);
  const db = getDb();
  const model = getModel();
  const scenarios = ONLY ? SCENARIOS.filter((c) => ONLY.includes(c.id)) : SCENARIOS;
  if (!scenarios.length) throw new Error(`No scenario with id ${ONLY?.join(', ')}`);

  console.log(`Evals: ${scenarios.length} scenarios × ${TIMES} · model ${model.provider}/${model.model_id}\n`);

  async function runScenario(c: Scenario, rep: number): Promise<Result> {
    await resetAndSeed(TEST_DB_URL, NOW);
    setTicketsClient(createFakeTickets(NOW));
    const user = userByKey(c.persona);
    const session: Session = { user_id: user.id, role: 'employee', name: user.name, sid: `eval-${c.id}-${rep}` };
    await touchSession(user.id, session.sid, NOW);
    const conv = (await getOrCreateWithAgent(user.id, NOW)).conversation;
    // O que já existia antes do cenário (seed) fica de fora da avaliação.
    const before = async () => {
      const ids = await Promise.all([
        db.select({ id: aiAgentRuns.id }).from(aiAgentRuns).where(eq(aiAgentRuns.conversation_id, conv.id)),
        db.select({ id: ticketDrafts.id }).from(ticketDrafts).where(eq(ticketDrafts.conversation_id, conv.id)),
        db.select({ id: messages.id }).from(messages).where(eq(messages.conversation_id, conv.id)),
        db.select({ id: handoffs.id }).from(handoffs).where(eq(handoffs.conversation_id, conv.id)),
      ]);
      return new Set(ids.flat().map((r) => r.id));
    };
    const seed = await before();
    const sinceStart = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !seed.has(r.id));

    let latency = 0;
    let outcome = '';
    for (const text of c.turns) {
      const t0 = performance.now();
      const r = await runTurn({ conversation_id: conv.id, employee: session, text, writer: collectingWriter(), now: NOW });
      latency += performance.now() - t0;
      outcome = r.outcome;
      if (r.outcome !== 'answered') break; // transferiu, pausou ou falhou: os próximos turnos não fazem sentido
    }

    const runs = sinceStart(
      await db.select().from(aiAgentRuns).where(eq(aiAgentRuns.conversation_id, conv.id)).orderBy(asc(aiAgentRuns.started_at)),
    );
    const drafts = sinceStart(
      await db.select().from(ticketDrafts).where(eq(ticketDrafts.conversation_id, conv.id)).orderBy(asc(ticketDrafts.created_at)),
    );
    const texts = sinceStart(
      await db
        .select({ id: messages.id, body: messages.body, parts: messages.parts })
        .from(messages)
        .where(and(eq(messages.conversation_id, conv.id), eq(messages.direction, 'outbound'))),
    );
    const transfers = sinceStart(await db.select().from(handoffs).where(eq(handoffs.conversation_id, conv.id)));
    const calls = runs.length
      ? await db.select().from(llmCalls).where(inArray(llmCalls.agent_run_id, runs.map((r) => r.id)))
      : [];

    const tools = new Set(runs.flatMap((r) => r.tool_calls.map((a) => a.tool)));
    const last = runs.at(-1);
    const action = last?.decision?.decision.action;
    const sources = new Set(runs.flatMap((r) => r.decision?.decision.sources.map((s) => s.id) ?? []));
    const draft = drafts.at(-1);
    const text = normalize(texts.map((t) => t.body).join('\n'));
    const e = c.expected;
    const failures: string[] = [];

    for (const t of e.tools_include ?? []) if (!tools.has(t)) failures.push(`não chamou ${t}`);
    for (const t of e.tools_exclude ?? []) if (tools.has(t)) failures.push(`chamou ${t}`);
    if (e.final_action) {
      const accepted = Array.isArray(e.final_action) ? e.final_action : [e.final_action];
      if (!action || !accepted.includes(action)) failures.push(`ação ${action ?? 'sem decisão'} ≠ ${accepted.join('|')}`);
    }
    if (e.outcome) {
      const real = transfers.length ? 'transferred' : outcome;
      const matchReason = transfers.length ? ` (${transfers.map((h) => h.reason_code).join(', ')})` : '';
      if (real !== e.outcome) failures.push(`desfecho ${real}${matchReason} ≠ ${e.outcome}`);
    }
    if (e.draft === null && drafts.length) failures.push(`montou rascunho ${draft!.kind}`);
    if (e.draft && draft?.kind !== e.draft) failures.push(`rascunho ${draft?.kind ?? 'nenhum'} ≠ ${e.draft}`);
    if (e.target && draft?.target_ticket_code !== e.target) failures.push(`alvo ${draft?.target_ticket_code ?? 'nenhum'} ≠ ${e.target}`);
    if (e.priority && draft?.payload.priority !== e.priority)
      failures.push(`prioridade ${draft?.payload.priority ?? 'sem rascunho'} ≠ ${e.priority}`);
    if (e.category && draft?.payload.category !== e.category)
      failures.push(`categoria ${draft?.payload.category ?? 'sem rascunho'} ≠ ${e.category}`);
    if (e.type && draft?.payload.type !== e.type) failures.push(`tipo ${draft?.payload.type ?? 'sem rascunho'} ≠ ${e.type}`);
    if (e.cites_article && !sources.has(e.cites_article)) failures.push(`não citou ${e.cites_article}`);
    const shown = new Set(
      texts.flatMap((t) =>
        t.parts.flatMap((p) =>
          p.kind === 'ticket_selector' ? p.tickets.map((x) => x.code) : p.kind === 'ticket_card' ? [p.ticket.code] : [],
        ),
      ),
    );
    for (const code of e.shows_tickets ?? []) if (!shown.has(code)) failures.push(`não mostrou ${code}`);
    for (const code of e.hides_tickets ?? []) if (shown.has(code)) failures.push(`mostrou ${code}`);
    for (const forbidden of e.text_excludes ?? [])
      if (text.includes(normalize(forbidden))) failures.push(`texto contém "${forbidden}"`);

    const costs = calls.map((x) => x.cost_cents);
    const cost = costs.length && costs.every((x) => x !== null) ? costs.reduce((a, b) => a! + b!, 0)! : costs.length ? null : 0;
    const tokens = {
      in: calls.reduce((s, x) => s + x.input_tokens, 0),
      out: calls.reduce((s, x) => s + x.output_tokens, 0),
    };
    const answer = texts.at(-1)?.body ?? '';
    const dec = last?.decision?.decision;
    const decision = dec ? `${dec.action} ${Math.round(dec.confidence * 100)}% — ${dec.why}` : 'sem decisão registrada';
    return { scenario: c, ok: failures.length === 0, failures: failures, cost_cents: cost, latency_ms: latency, turns: runs.length, tokens, answer: answer, decision: decision };
  }

  const byScenario = new Map<string, Result[]>();
  for (const c of scenarios) {
    const list: Result[] = [];
    for (let rep = 0; rep < TIMES; rep++) {
      let r: Result;
      try {
        r = await runScenario(c, rep);
      } catch (err) {
        r = { scenario: c, ok: false, failures: [`erro: ${err instanceof Error ? err.message : String(err)}`], cost_cents: null, latency_ms: 0, turns: 0, tokens: { in: 0, out: 0 }, answer: '', decision: '' };
      }
      list.push(r);
      console.log(`${r.ok ? '✓' : '✗'} ${c.id} #${rep + 1}${r.ok ? '' : ` — ${r.failures.join('; ')}`}`);
      if (!r.ok && r.answer) console.log(`    agent: ${r.answer.replace(/\s+/g, ' ').slice(0, 300)}`);
      if (!r.ok && r.decision) console.log(`    decision: ${r.decision.slice(0, 300)}`);
    }
    byScenario.set(c.id, list);
  }
  await closeMemory();

  const showAll = [...byScenario.values()].flat();
  const passed = showAll.filter((r) => r.ok).length;
  const passRate = passed / showAll.length;
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const measuredCosts = showAll.map((r) => r.cost_cents).filter((x): x is number => x !== null);
  const formatCost = (xs: (number | null)[]) => {
    const m = xs.filter((x): x is number => x !== null);
    return m.length === xs.length && m.length ? `${media(m).toFixed(3)}¢` : 'não medido';
  };

  const lines = [...byScenario.entries()].map(([id, rs]) => {
    const ok = rs.filter((r) => r.ok).length;
    const failures = [...new Set(rs.flatMap((r) => r.failures))].join('; ') || '—';
    const turns = media(rs.map((r) => r.turns)) || 1;
    const tin = Math.round(media(rs.map((r) => r.tokens.in)));
    const tout = Math.round(media(rs.map((r) => r.tokens.out)));
    return `| ${id} | ${ok}/${rs.length}${ok / rs.length < THRESHOLD ? ' ⚠' : ''} | ${formatCost(rs.map((r) => r.cost_cents))} | ${tin} / ${tout} | ${Math.round(media(rs.map((r) => r.latency_ms)) / turns)} ms | ${failures} |`;
  });

  const md = [
    '# Resultados dos evals',
    '',
    `Rodado em ${new Date().toISOString()} · modelo \`${model.provider}/${model.model_id}\` · ${scenarios.length} cenários × ${TIMES}.`,
    '',
    `**Taxa de acerto: ${passed}/${showAll.length} (${(passRate * 100).toFixed(0)}%)** · limiar ${THRESHOLD * 100}% · ` +
      `tokens médios por conversa: ${Math.round(media(showAll.map((r) => r.tokens.in)))} entrada / ${Math.round(media(showAll.map((r) => r.tokens.out)))} saída · ` +
      `custo médio por conversa: ${measuredCosts.length === showAll.length && measuredCosts.length ? `${media(measuredCosts).toFixed(3)}¢` : 'não medido (defina LLM_PRICE_*_CENTS_PER_MTOK)'}`,
    '',
    '| Cenário | Passou | Custo médio/conversa | Tokens médios (entrada / saída) | Latência média/turno | Falhas |',
    '|---|---|---|---|---|---|',
    ...lines,
    '',
  ].join('\n');

  console.log(`\n${md}`);
  if (!SCRIPTED && !ONLY) await writeFile(new URL('./resultados.md', import.meta.url), md);
  process.exit(passRate >= THRESHOLD ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
