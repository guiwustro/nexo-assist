/**
 * Evals do Nexo Assist com o modelo real.
 *
 *   pnpm eval                       # todos os cenários, 3× cada (precisa de LLM_PROVIDER=deepseek)
 *   pnpm eval --only reabrir-sap    # só um cenário (vírgula para vários)
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
import { CENARIOS, type Cenario } from './cenarios';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const SCRIPTED = args.includes('--scripted');
const VEZES = Number(arg('vezes') ?? 3);
const ONLY = arg('only')?.split(',');
const LIMIAR = 0.8;

// Sempre no banco de teste; o provider vem do .env (ou roteirizado com --scripted).
const TEST_DB_URL = process.env.DATABASE_URL_TEST ?? 'postgres://nexo:nexo@localhost:5432/nexo_test';
process.env.DATABASE_URL = TEST_DB_URL;
if (SCRIPTED) process.env.LLM_PROVIDER = 'scripted';
// Evals nunca rodam com o limite de sessão nem com orçamento atrapalhando.
process.env.SESSION_MESSAGE_LIMIT = '30';
delete process.env.LLM_DAILY_BUDGET_CENTS;

/** Terça-feira, 03/11/2026, 10:00 em São Paulo — o mesmo "agora" da integração. */
const AGORA = new Date('2026-11-03T13:00:00.000Z');

type Resultado = {
  cenario: Cenario;
  ok: boolean;
  falhas: string[];
  custo_cents: number | null;
  latencia_ms: number;
  turnos: number;
  tokens: { in: number; out: number };
  /** Última resposta do agent (para entender a falha). */
  resposta: string;
};

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function writerColetor(): UIMessageStreamWriter<NexoUIMessage> {
  return { write: () => {}, merge: () => {}, onError: undefined } as unknown as UIMessageStreamWriter<NexoUIMessage>;
}

async function main() {
  const { env } = await import('@/lib/env');
  if (env.LLM_PROVIDER !== 'deepseek' && !SCRIPTED) {
    console.error('Defina LLM_PROVIDER=deepseek e DEEPSEEK_API_KEY no .env (ou rode com --scripted).');
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
  const { getOrCreateCurrent, applyTransition } = await import('@/lib/conversations/service');
  const { createFakeTickets } = await import('@/tests/helpers/fake-tickets');

  await migrateDb(TEST_DB_URL);
  const db = getDb();
  const modelo = getModel();
  const cenarios = ONLY ? CENARIOS.filter((c) => ONLY.includes(c.id)) : CENARIOS;
  if (!cenarios.length) throw new Error(`Nenhum cenário com id ${ONLY?.join(', ')}`);

  console.log(`Evals: ${cenarios.length} cenários × ${VEZES} · modelo ${modelo.provider}/${modelo.model_id}\n`);

  async function rodar(c: Cenario, rep: number): Promise<Resultado> {
    await resetAndSeed(TEST_DB_URL, AGORA);
    setTicketsClient(createFakeTickets(AGORA));
    const user = userByKey(c.persona);
    const session: Session = { user_id: user.id, role: 'employee', name: user.name, sid: `eval-${c.id}-${rep}` };
    const conv = await getOrCreateCurrent(user.id, session.sid);
    // Conversas semeadas como "aguardando analista" voltam ao agent: o cenário começa do zero com ele.
    if (conv.status !== 'ai_handling') {
      await applyTransition(conv.id, 'claim', { user_id: userByKey('rafael').id, role: 'analyst' }).catch(() => {});
      await applyTransition(conv.id, 'release', { user_id: userByKey('rafael').id, role: 'analyst' });
    }
    // O que já existia antes do cenário (seed) fica de fora da avaliação.
    const antes = async () => {
      const ids = await Promise.all([
        db.select({ id: aiAgentRuns.id }).from(aiAgentRuns).where(eq(aiAgentRuns.conversation_id, conv.id)),
        db.select({ id: ticketDrafts.id }).from(ticketDrafts).where(eq(ticketDrafts.conversation_id, conv.id)),
        db.select({ id: messages.id }).from(messages).where(eq(messages.conversation_id, conv.id)),
        db.select({ id: handoffs.id }).from(handoffs).where(eq(handoffs.conversation_id, conv.id)),
      ]);
      return new Set(ids.flat().map((r) => r.id));
    };
    const seed = await antes();
    const novo = <T extends { id: string }>(rows: T[]) => rows.filter((r) => !seed.has(r.id));

    let latencia = 0;
    let outcome = '';
    for (const text of c.turnos) {
      const t0 = performance.now();
      const r = await runTurn({ conversation_id: conv.id, employee: session, text, writer: writerColetor(), now: AGORA });
      latencia += performance.now() - t0;
      outcome = r.outcome;
      if (r.outcome !== 'answered') break; // transferiu, pausou ou falhou: os próximos turnos não fazem sentido
    }

    const runs = novo(
      await db.select().from(aiAgentRuns).where(eq(aiAgentRuns.conversation_id, conv.id)).orderBy(asc(aiAgentRuns.started_at)),
    );
    const drafts = novo(
      await db.select().from(ticketDrafts).where(eq(ticketDrafts.conversation_id, conv.id)).orderBy(asc(ticketDrafts.created_at)),
    );
    const textos = novo(
      await db
        .select({ id: messages.id, body: messages.body })
        .from(messages)
        .where(and(eq(messages.conversation_id, conv.id), eq(messages.direction, 'outbound'))),
    );
    const transferencias = novo(await db.select().from(handoffs).where(eq(handoffs.conversation_id, conv.id)));
    const chamadas = runs.length
      ? await db.select().from(llmCalls).where(inArray(llmCalls.agent_run_id, runs.map((r) => r.id)))
      : [];

    const tools = new Set(runs.flatMap((r) => r.tool_calls.map((a) => a.tool)));
    const ultimo = runs.at(-1);
    const acao = ultimo?.decision?.decision.action;
    const fontes = new Set(runs.flatMap((r) => r.decision?.decision.sources.map((s) => s.id) ?? []));
    const rascunho = drafts.at(-1);
    const texto = normalizar(textos.map((t) => t.body).join('\n'));
    const e = c.esperado;
    const falhas: string[] = [];

    for (const t of e.tools_incluem ?? []) if (!tools.has(t)) falhas.push(`não chamou ${t}`);
    for (const t of e.tools_excluem ?? []) if (tools.has(t)) falhas.push(`chamou ${t}`);
    if (e.acao_final) {
      const aceitas = Array.isArray(e.acao_final) ? e.acao_final : [e.acao_final];
      if (!acao || !aceitas.includes(acao)) falhas.push(`ação ${acao ?? 'sem decisão'} ≠ ${aceitas.join('|')}`);
    }
    if (e.outcome) {
      const real = transferencias.length ? 'transferred' : outcome;
      const motivo = transferencias.length ? ` (${transferencias.map((h) => h.reason_code).join(', ')})` : '';
      if (real !== e.outcome) falhas.push(`desfecho ${real}${motivo} ≠ ${e.outcome}`);
    }
    if (e.rascunho === null && drafts.length) falhas.push(`montou rascunho ${rascunho!.kind}`);
    if (e.rascunho && rascunho?.kind !== e.rascunho) falhas.push(`rascunho ${rascunho?.kind ?? 'nenhum'} ≠ ${e.rascunho}`);
    if (e.alvo && rascunho?.target_ticket_code !== e.alvo) falhas.push(`alvo ${rascunho?.target_ticket_code ?? 'nenhum'} ≠ ${e.alvo}`);
    if (e.prioridade && rascunho?.payload.priority !== e.prioridade)
      falhas.push(`prioridade ${rascunho?.payload.priority ?? 'sem rascunho'} ≠ ${e.prioridade}`);
    if (e.categoria && rascunho?.payload.category !== e.categoria)
      falhas.push(`categoria ${rascunho?.payload.category ?? 'sem rascunho'} ≠ ${e.categoria}`);
    if (e.tipo && rascunho?.payload.type !== e.tipo) falhas.push(`tipo ${rascunho?.payload.type ?? 'sem rascunho'} ≠ ${e.tipo}`);
    if (e.cita_artigo && !fontes.has(e.cita_artigo)) falhas.push(`não citou ${e.cita_artigo}`);
    for (const proibido of e.texto_nao_contem ?? [])
      if (texto.includes(normalizar(proibido))) falhas.push(`texto contém "${proibido}"`);

    const custos = chamadas.map((x) => x.cost_cents);
    const custo = custos.length && custos.every((x) => x !== null) ? custos.reduce((a, b) => a! + b!, 0)! : custos.length ? null : 0;
    const tokens = {
      in: chamadas.reduce((s, x) => s + x.input_tokens, 0),
      out: chamadas.reduce((s, x) => s + x.output_tokens, 0),
    };
    const resposta = textos.at(-1)?.body ?? '';
    return { cenario: c, ok: falhas.length === 0, falhas, custo_cents: custo, latencia_ms: latencia, turnos: runs.length, tokens, resposta };
  }

  const porCenario = new Map<string, Resultado[]>();
  for (const c of cenarios) {
    const lista: Resultado[] = [];
    for (let rep = 0; rep < VEZES; rep++) {
      let r: Resultado;
      try {
        r = await rodar(c, rep);
      } catch (err) {
        r = { cenario: c, ok: false, falhas: [`erro: ${err instanceof Error ? err.message : String(err)}`], custo_cents: null, latencia_ms: 0, turnos: 0, tokens: { in: 0, out: 0 }, resposta: '' };
      }
      lista.push(r);
      console.log(`${r.ok ? '✓' : '✗'} ${c.id} #${rep + 1}${r.ok ? '' : ` — ${r.falhas.join('; ')}`}`);
      if (!r.ok && r.resposta) console.log(`    agent: ${r.resposta.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
    porCenario.set(c.id, lista);
  }
  await closeMemory();

  const todos = [...porCenario.values()].flat();
  const passou = todos.filter((r) => r.ok).length;
  const taxa = passou / todos.length;
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const custosMedidos = todos.map((r) => r.custo_cents).filter((x): x is number => x !== null);
  const fmtCusto = (xs: (number | null)[]) => {
    const m = xs.filter((x): x is number => x !== null);
    return m.length === xs.length && m.length ? `${media(m).toFixed(3)}¢` : 'não medido';
  };

  const linhas = [...porCenario.entries()].map(([id, rs]) => {
    const ok = rs.filter((r) => r.ok).length;
    const falhas = [...new Set(rs.flatMap((r) => r.falhas))].join('; ') || '—';
    const turnos = media(rs.map((r) => r.turnos)) || 1;
    const tin = Math.round(media(rs.map((r) => r.tokens.in)));
    const tout = Math.round(media(rs.map((r) => r.tokens.out)));
    return `| ${id} | ${ok}/${rs.length}${ok / rs.length < LIMIAR ? ' ⚠' : ''} | ${fmtCusto(rs.map((r) => r.custo_cents))} | ${tin} / ${tout} | ${Math.round(media(rs.map((r) => r.latencia_ms)) / turnos)} ms | ${falhas} |`;
  });

  const md = [
    '# Resultados dos evals',
    '',
    `Rodado em ${new Date().toISOString()} · modelo \`${modelo.provider}/${modelo.model_id}\` · ${cenarios.length} cenários × ${VEZES}.`,
    '',
    `**Taxa de acerto: ${passou}/${todos.length} (${(taxa * 100).toFixed(0)}%)** · limiar ${LIMIAR * 100}% · ` +
      `tokens médios por conversa: ${Math.round(media(todos.map((r) => r.tokens.in)))} entrada / ${Math.round(media(todos.map((r) => r.tokens.out)))} saída · ` +
      `custo médio por conversa: ${custosMedidos.length === todos.length && custosMedidos.length ? `${media(custosMedidos).toFixed(3)}¢` : 'não medido (defina LLM_PRICE_*_CENTS_PER_MTOK)'}`,
    '',
    '| Cenário | Passou | Custo médio/conversa | Tokens médios (entrada / saída) | Latência média/turno | Falhas |',
    '|---|---|---|---|---|---|',
    ...linhas,
    '',
  ].join('\n');

  console.log(`\n${md}`);
  if (!SCRIPTED && !ONLY) await writeFile(new URL('./resultados.md', import.meta.url), md);
  process.exit(taxa >= LIMIAR ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
