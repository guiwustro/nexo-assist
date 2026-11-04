import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import type { UIMessageStreamWriter } from 'ai';
import { useTestDb } from '@/tests/helpers/db';
import { getAgentAttendance } from '@/tests/helpers/attendance';
import { createFakeTickets, type FakeTickets } from '@/tests/helpers/fake-tickets';
import { aiAgentRuns, conversations, employeeSessions, handoffs, llmCalls, messages } from '@/lib/db/schema';
import { runTurn } from '@/lib/agent-engine/agent/run-turn';
import { closeMemory } from '@/lib/agent-engine/agent/memory';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { setModelForTests } from '@/lib/agent-engine/edge/llm/provider';
import { applyTransition } from '@/lib/conversations/service';
import type { Session } from '@/lib/auth/session';
import type { NexoUIMessage } from '@/lib/contracts/ui';

const t = useTestDb();
let fake: FakeTickets;

type Chunk = { type: string; data?: unknown; delta?: string };
function collector() {
  const chunks: Chunk[] = [];
  const writer = {
    write: (c: Chunk) => chunks.push(c),
    merge: () => {},
    onError: undefined,
  } as unknown as UIMessageStreamWriter<NexoUIMessage>;
  return { writer, chunks };
}

const ana = (): Session => ({
  user_id: t.seed.users.ana.id,
  role: 'employee',
  name: 'Ana Souza',
  sid: 'sid-1',
});

async function runTurnFor(text: string, conversationId?: string) {
  const conv = conversationId
    ? { id: conversationId }
    : await getAgentAttendance(ana().user_id, 'sid-1', t.now);
  const c = collector();
  const employee = conversationId
    ? {
        ...ana(),
        user_id: (await t.db.select().from(conversations).where(eq(conversations.id, conversationId)))[0]!
          .employee_id,
      }
    : ana();
  const r = await runTurn({ conversation_id: conv.id, employee, text, writer: c.writer, now: t.now });
  return { ...r, run_id: r.run_id ?? '00000000-0000-4000-8000-000000000000', ...c, conversation_id: conv.id };
}

const statusOf = async (id: string) =>
  (await t.db.select().from(conversations).where(eq(conversations.id, id)))[0]!.status;

beforeEach(() => {
  fake = createFakeTickets(t.now);
  setTicketsClient(fake);
  setModelForTests();
});
afterEach(() => setModelForTests());
afterAll(async () => {
  setTicketsClient(undefined);
  await closeMemory();
});

describe('runTurn', () => {
  it('encerra depois da resposta quando o funcionário confirma que resolveu', async () => {
    const r = await runTurnFor('Isso resolveu, obrigado!');
    const [conversation] = await t.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, r.conversation_id));
    expect(conversation).toMatchObject({ status: 'closed', closed_reason: 'resolved' });

    const rows = await t.db
      .select()
      .from(messages)
      .where(eq(messages.conversation_id, r.conversation_id))
      .orderBy(asc(messages.created_at));
    const answerIndex = rows.findIndex((message) => message.sent_via === 'ai');
    const resolvedIndex = rows.findIndex(
      (message) => message.type === 'system' && message.body.startsWith('Atendimento resolvido ·'),
    );
    expect(answerIndex).toBeGreaterThanOrEqual(0);
    expect(resolvedIndex).toBeGreaterThan(answerIndex);
  });

  it('transferência vence quando o mesmo turno também marca resolução', async () => {
    setModelForTests(undefined, undefined, [
      {
        id: 'transfer-and-resolve',
        match: /transfira e resolva/i,
        steps: [
          {
            tool_calls: [
              {
                name: 'transfer_to_analyst',
                args: { reason: 'requested_human', reading: 'A funcionária pediu um analista.' },
              },
              { name: 'mark_resolved', args: { summary: 'A funcionária também confirmou que resolveu.' } },
            ],
          },
          { text: 'Certo, transferi para um analista continuar este atendimento.' },
        ],
        decision: {
          understanding: {
            intent: 'talk_to_human',
            summary: 'Pediu atendimento humano',
            evidence: 'transfira e resolva',
          },
          decision: {
            action: 'transfer',
            confidence: 0.9,
            why: 'A funcionária pediu um analista.',
            rules_applied: [],
            sources: [],
          },
        },
      },
    ]);

    const r = await runTurnFor('transfira e resolva, por favor');
    const [conversation] = await t.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, r.conversation_id));
    expect(r.outcome).toBe('transferred');
    expect(conversation).toMatchObject({ status: 'pending', closed_reason: null });
  });

  it('VPN 809: responde com trilha, opções rápidas e decisão registrada', async () => {
    const r = await runTurnFor('Meu notebook não conecta na VPN, erro 809');
    expect(r.outcome).toBe('answered');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.status).toBe('completed');
    const labels = run!.tool_calls.map((a) => a.label);
    expect(labels).toContain('consultou seus chamados');
    expect(labels).toContain('buscou na central de ajuda');
    expect(run!.tool_calls.every((a) => a.result !== 'running')).toBe(true);
    expect(run?.decision?.understanding.evidence.length).toBeGreaterThan(0);
    expect(run?.tokens_in).toBeGreaterThan(0);
    const cards = r.chunks
      .filter((c) => c.type === 'data-card')
      .map((c) => c.data as { kind: string; options?: string[] });
    expect(cards.find((c) => c.kind === 'quick_replies')?.options).toEqual(['Windows 10', 'Windows 11']);
    expect(r.chunks.some((c) => c.type === 'text-delta')).toBe(true);
    const out = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.agent_run_id, r.run_id), eq(messages.direction, 'outbound')));
    expect(out[0]?.parts.some((p) => p.kind === 'quick_replies')).toBe(true);
    expect(out[0]?.body).toMatch(/Windows 10/);
    const calls = await t.db.select().from(llmCalls).where(eq(llmCalls.agent_run_id, r.run_id));
    expect(calls.map((c) => c.purpose).sort()).toEqual(['agent_turn', 'decision']);
    expect(calls.every((c) => c.cost_cents === null)).toBe(true);
  });

  it('conversa com analista: não chama o modelo', async () => {
    const carla = t.seed.conversations.carla!;
    await applyTransition(carla, 'claim', { user_id: t.seed.users.rafael.id, role: 'analyst' });
    const r = await runTurnFor('alguém aí?', carla);
    expect(r.outcome).toBe('paused');
    expect(await t.db.$count(llmCalls)).toBe(0);
    expect(
      await t.db.$count(messages, and(eq(messages.conversation_id, carla), eq(messages.body, 'alguém aí?'))),
    ).toBe(1);
    expect(r.chunks.some((c) => c.type === 'data-system')).toBe(true);
  });

  it('pedido de analista: transfere sem chamar o modelo', async () => {
    const r = await runTurnFor('quero falar com um analista');
    expect(r.outcome).toBe('transferred');
    expect(await t.db.$count(llmCalls)).toBe(0);
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, r.conversation_id));
    expect(h).toMatchObject({ reason_code: 'requested_human', origin: 'explicit_request' });
    expect(await statusOf(r.conversation_id)).toBe('pending');
  });

  it('a 30ª mensagem transfere por limite da sessão', async () => {
    const conv = await getAgentAttendance(ana().user_id, 'sid-1', t.now);
    await t.db
      .update(employeeSessions)
      .set({ message_count: 29 })
      .where(eq(employeeSessions.employee_id, ana().user_id));
    const r = await runTurnFor('mais uma pergunta');
    expect(r.outcome).toBe('limit');
    expect(await t.db.$count(llmCalls)).toBe(0);
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, conv.id));
    expect(h?.reason_code).toBe('session_limit');
  });

  it('a passagem pelo limite leva o resumo do caso, o que já foi tentado e o chamado em foco', async () => {
    const vpn = await runTurnFor('Meu notebook não conecta na VPN, erro 809');
    const [before] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, vpn.run_id));
    const summary = before!.decision!.understanding.summary;
    await t.db
      .update(employeeSessions)
      .set({ message_count: 29 })
      .where(eq(employeeSessions.employee_id, ana().user_id));
    await t.db
      .update(conversations)
      .set({ focus_ticket_code: 'INC-20298' })
      .where(eq(conversations.id, vpn.conversation_id));

    const r = await runTurnFor('mais uma pergunta');
    expect(r.outcome).toBe('limit');
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, vpn.conversation_id));
    expect(h?.agent_reading).toContain(summary);
    expect(h?.agent_reading).not.toMatch(/confira o histórico\.$/);
    expect(h?.attempts.map((a) => a.label)).toContain('buscou na central de ajuda');
    expect(h?.ticket_code).toBe('INC-20298');
  });

  it('confiança 0.41 transfere para N1 com motivo low_confidence', async () => {
    const r = await runTurnFor('não sei explicar o que houve com o sistema');
    expect(r.outcome).toBe('transferred');
    expect(await statusOf(r.conversation_id)).toBe('pending');
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, r.conversation_id));
    expect(h).toMatchObject({ reason_code: 'low_confidence', support_level: 'N1', confidence: 0.41 });
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.status).toBe('handoff');
    expect(run?.decision?.decision.rules_applied.some((x) => /Baixa confiança/.test(x))).toBe(true);
  });

  it('guardrail: prometeu analista sem transferir → transfere e registra', async () => {
    const r = await runTurnFor('teste promessa');
    expect(r.outcome).toBe('transferred');
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, r.conversation_id));
    expect(h?.origin).toBe('guardrail');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.decision?.decision.rules_applied).toContain(
      'Guardrail: o agent prometeu um analista, transferência executada',
    );
  });

  it('decisão com JSON inválido → run completo com decision null', async () => {
    const r = await runTurnFor('teste decisão inválida');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.status).toBe('completed');
    expect(run?.decision).toBeNull();
  });

  it('analista assume no meio do turno: resposta salva, nenhum gatilho aplicado', async () => {
    const conv = await getAgentAttendance(ana().user_id, 'sid-1', t.now);
    setModelForTests({
      onStep: async (_id, step) => {
        if (step === 0)
          await applyTransition(conv.id, 'claim', { user_id: t.seed.users.rafael.id, role: 'analyst' });
      },
    });
    const r = await runTurnFor('não sei explicar o que houve com o sistema');
    expect(await statusOf(conv.id)).toBe('claimed');
    expect(await t.db.$count(handoffs, eq(handoffs.conversation_id, conv.id))).toBe(0);
    const out = await t.db.select().from(messages).where(eq(messages.agent_run_id, r.run_id));
    expect(out).toHaveLength(1);
    expect(r.outcome).toBe('paused');
  });

  it('sistema de chamados fora: ação com erro, resposta honesta gravada', async () => {
    fake.down = true;
    const r = await runTurnFor('qual o status do meu chamado?');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.status).toBe('completed');
    expect(run!.tool_calls.some((a) => a.result === 'error')).toBe(true);
    const [msg] = await t.db.select().from(messages).where(eq(messages.agent_run_id, r.run_id));
    expect(msg?.body).toMatch(/fora do ar/);
  });

  it('sistema de chamados fora: a tool de transferência ainda passa a conversa para um analista', async () => {
    setModelForTests(undefined, undefined, [
      {
        id: 'transfere-com-legado-fora',
        match: /escalar o INC-20311/i,
        steps: [
          {
            tool_calls: [
              {
                name: 'transfer_to_analyst',
                args: {
                  reason: 'overdue_ticket',
                  reading: 'INC-20311 vencido, quer escalar',
                  ticket_code: 'INC-20311',
                },
              },
            ],
          },
          { text: 'Transferi para um analista, que vai continuar com você.' },
        ],
        decision: {
          understanding: { intent: 'talk_to_human', summary: 'Escalar INC-20311', evidence: 'escalar' },
          decision: { action: 'transfer', confidence: 0.9, why: 'x', rules_applied: [], sources: [] },
        },
      },
    ]);
    fake.down = true;
    const r = await runTurnFor('quero escalar o INC-20311');
    expect(r.outcome).toBe('transferred');
    expect(await statusOf(r.conversation_id)).toBe('pending');
    const hs = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, r.conversation_id));
    expect(hs.some((h) => h.origin === 'model_tool')).toBe(true);
  });

  it('resposta de seguimento com o artigo do turno anterior não cai para baixa confiança', async () => {
    const r1 = await runTurnFor('Meu notebook não conecta na VPN, erro 809');
    const r2 = await runTurnFor('Windows 10', r1.conversation_id);
    expect(r2.outcome).toBe('answered');
    expect(await t.db.$count(handoffs, eq(handoffs.conversation_id, r1.conversation_id))).toBe(0);
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r2.run_id));
    expect(run?.decision?.decision.sources.map((s) => s.id)).toEqual(['vpn-erro-809']);
    expect(run?.decision?.decision.confidence).toBe(0.9);
  });

  it('fonte citada pelo modelo que nenhuma tool retornou continua ignorada', async () => {
    setModelForTests(undefined, undefined, [
      {
        id: 'inventada',
        match: /fonte inventada/i,
        steps: [{ text: 'Segundo o artigo, reinicie o roteador.' }],
        decision: {
          understanding: { intent: 'question', summary: 'x', evidence: 'fonte inventada' },
          decision: {
            action: 'answer',
            confidence: 0.9,
            why: 'x',
            rules_applied: [],
            sources: [{ kind: 'article', id: 'wifi-visitantes', title: 'Wi-Fi de visitantes' }],
          },
        },
      },
    ]);
    const r = await runTurnFor('fonte inventada');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.decision?.decision.sources).toEqual([]);
    expect(run?.decision?.decision.confidence).toBe(0.5);
  });

  it('ação da decisão segue o rascunho que a tool montou, não o que o modelo declarou', async () => {
    setModelForTests(undefined, undefined, [
      {
        id: 'update-rotulado-errado',
        match: /acesso negado agora/i,
        steps: [
          {
            tool_calls: [
              {
                name: 'build_draft',
                args: {
                  kind: 'update',
                  target_code: 'INC-20298',
                  title: 'Acesso à pasta Financeiro no SharePoint',
                  description: 'Sem acesso à pasta Financeiro',
                  type: 'incident',
                  category: 'access',
                  affected: 'me',
                  blocks_work: false,
                  deadline_today: false,
                  comment: 'O erro agora diz acesso negado',
                },
              },
            ],
          },
          { text: 'Montei o complemento do INC-20298. Confira e clique em Confirmar.' },
        ],
        decision: {
          understanding: {
            intent: 'complement',
            summary: 'Complemento do INC-20298',
            evidence: 'acesso negado agora',
          },
          decision: { action: 'draft_create', confidence: 0.9, why: 'x', rules_applied: [], sources: [] },
        },
      },
    ]);
    const r = await runTurnFor('acesso negado agora');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.decision?.decision.action).toBe('draft_update');
  });

  it('turno que montou rascunho e transferiu fica com a ação transfer', async () => {
    setModelForTests(undefined, undefined, [
      {
        id: 'rascunho-e-transfere',
        match: /vendas está fora do ar/i,
        steps: [
          {
            tool_calls: [
              {
                name: 'build_draft',
                args: {
                  kind: 'create',
                  title: 'Sistema de vendas fora do ar',
                  description: 'Sistema de vendas parado para a equipe toda',
                  type: 'incident',
                  category: 'software',
                  affected: 'company',
                  blocks_work: true,
                  deadline_today: true,
                },
              },
              {
                name: 'transfer_to_analyst',
                args: { reason: 'critical_priority', reading: 'Sistema de vendas parado para a equipe toda' },
              },
            ],
          },
          { text: 'É crítico: transferi para um analista, que vai continuar com você.' },
        ],
        decision: {
          understanding: { intent: 'open_ticket', summary: 'Vendas fora do ar', evidence: 'fora do ar' },
          decision: { action: 'transfer', confidence: 0.9, why: 'x', rules_applied: [], sources: [] },
        },
      },
    ]);
    const r = await runTurnFor('O sistema de vendas está fora do ar para a equipe toda');
    expect(r.outcome).toBe('transferred');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.decision?.decision.action).toBe('transfer');
  });

  it('texto de passos diferentes não sai grudado', async () => {
    setModelForTests(undefined, undefined, [
      {
        id: 'dois-passos',
        match: /dois passos/i,
        steps: [
          { text: 'Deixa eu conferir.', tool_calls: [{ name: 'list_my_tickets', args: {} }] },
          { text: 'Achei seus chamados.' },
        ],
        decision: {
          understanding: { intent: 'status', summary: 'x', evidence: 'dois passos' },
          decision: { action: 'answer', confidence: 0.9, why: 'x', rules_applied: [], sources: [] },
        },
      },
    ]);
    const r = await runTurnFor('dois passos');
    const [out] = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.agent_run_id, r.run_id), eq(messages.direction, 'outbound')));
    expect(out?.body).toBe('Deixa eu conferir.\n\nAchei seus chamados.');
    const deltas = r.chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(deltas).toBe('Deixa eu conferir.\n\nAchei seus chamados.');
  });

  it('afirmou criação sem confirmação → mensagem de sistema corrige', async () => {
    setModelForTests(undefined, undefined, [
      {
        id: 'mentira',
        match: /abre logo/i,
        steps: [{ text: 'Pronto, abri o chamado para você.' }],
        decision: {
          understanding: { intent: 'open_ticket', summary: 'x', evidence: 'abre logo' },
          decision: { action: 'answer', confidence: 0.9, why: 'x', rules_applied: [], sources: [] },
        },
      },
    ]);
    const r = await runTurnFor('abre logo');
    const sys = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversation_id, r.conversation_id), eq(messages.type, 'system')));
    expect(
      sys.some((m) => m.body === 'O chamado ainda não foi criado — confira o rascunho e confirme.'),
    ).toBe(true);
  });
});
