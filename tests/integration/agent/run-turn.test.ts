import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { UIMessageStreamWriter } from 'ai';
import { useTestDb } from '@/tests/helpers/db';
import { createFakeTickets, type FakeTickets } from '@/tests/helpers/fake-tickets';
import { aiAgentRuns, conversations, handoffs, llmCalls, messages } from '@/lib/db/schema';
import { runTurn } from '@/lib/agent-engine/agent/run-turn';
import { closeMemory } from '@/lib/agent-engine/agent/memory';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { setModelForTests } from '@/lib/agent-engine/edge/llm/provider';
import { applyTransition, getOrCreateCurrent } from '@/lib/conversations/service';
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

const ana = (): Session => ({ user_id: t.seed.users.ana.id, role: 'employee', name: 'Ana Souza', sid: 'sid-1' });

async function turno(text: string, conversationId?: string) {
  const conv = conversationId ? { id: conversationId } : await getOrCreateCurrent(ana().user_id, 'sid-1');
  const c = collector();
  const employee = conversationId
    ? { ...ana(), user_id: (await t.db.select().from(conversations).where(eq(conversations.id, conversationId)))[0]!.employee_id }
    : ana();
  const r = await runTurn({ conversation_id: conv.id, employee, text, writer: c.writer, now: t.agora });
  return { ...r, run_id: r.run_id ?? '00000000-0000-4000-8000-000000000000', ...c, conversation_id: conv.id };
}

const statusDe = async (id: string) => (await t.db.select().from(conversations).where(eq(conversations.id, id)))[0]!.status;

beforeEach(() => {
  fake = createFakeTickets(t.agora);
  setTicketsClient(fake);
  setModelForTests();
});
afterEach(() => setModelForTests());
afterAll(async () => {
  setTicketsClient(undefined);
  await closeMemory();
});

describe('runTurn', () => {
  it('VPN 809: responde com trilha, opções rápidas e decisão registrada', async () => {
    const r = await turno('Meu notebook não conecta na VPN, erro 809');
    expect(r.outcome).toBe('answered');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.status).toBe('completed');
    const labels = run!.tool_calls.map((a) => a.label);
    expect(labels).toContain('consultou seus chamados');
    expect(labels).toContain('buscou na central de ajuda');
    expect(run!.tool_calls.every((a) => a.result !== 'running')).toBe(true);
    expect(run?.decision?.understanding.evidence.length).toBeGreaterThan(0);
    expect(run?.tokens_in).toBeGreaterThan(0);
    const cards = r.chunks.filter((c) => c.type === 'data-card').map((c) => c.data as { kind: string; options?: string[] });
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
    const r = await turno('alguém aí?', carla);
    expect(r.outcome).toBe('paused');
    expect(await t.db.$count(llmCalls)).toBe(0);
    expect(await t.db.$count(messages, and(eq(messages.conversation_id, carla), eq(messages.body, 'alguém aí?')))).toBe(1);
    expect(r.chunks.some((c) => c.type === 'data-system')).toBe(true);
  });

  it('pedido de analista: transfere sem chamar o modelo', async () => {
    const r = await turno('quero falar com um analista');
    expect(r.outcome).toBe('transferred');
    expect(await t.db.$count(llmCalls)).toBe(0);
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, r.conversation_id));
    expect(h).toMatchObject({ reason_code: 'requested_human', origin: 'explicit_request' });
    expect(await statusDe(r.conversation_id)).toBe('pending');
  });

  it('a 30ª mensagem transfere por limite da sessão', async () => {
    const conv = await getOrCreateCurrent(ana().user_id, 'sid-1');
    await t.db.update(conversations).set({ session_message_count: 29 }).where(eq(conversations.id, conv.id));
    const r = await turno('mais uma pergunta');
    expect(r.outcome).toBe('limit');
    expect(await t.db.$count(llmCalls)).toBe(0);
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, conv.id));
    expect(h?.reason_code).toBe('session_limit');
  });

  it('confiança 0.41 transfere para N1 com motivo low_confidence', async () => {
    const r = await turno('não sei explicar o que houve com o sistema');
    expect(r.outcome).toBe('transferred');
    expect(await statusDe(r.conversation_id)).toBe('pending');
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, r.conversation_id));
    expect(h).toMatchObject({ reason_code: 'low_confidence', support_level: 'N1', confidence: 0.41 });
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.status).toBe('handoff');
    expect(run?.decision?.decision.rules_applied.some((x) => /Baixa confiança/.test(x))).toBe(true);
  });

  it('guardrail: prometeu analista sem transferir → transfere e registra', async () => {
    const r = await turno('teste promessa');
    expect(r.outcome).toBe('transferred');
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, r.conversation_id));
    expect(h?.origin).toBe('guardrail');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.decision?.decision.rules_applied).toContain(
      'Guardrail: o agent prometeu um analista, transferência executada',
    );
  });

  it('decisão com JSON inválido → run completo com decision null', async () => {
    const r = await turno('teste decisão inválida');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.status).toBe('completed');
    expect(run?.decision).toBeNull();
  });

  it('analista assume no meio do turno: resposta salva, nenhum gatilho aplicado', async () => {
    const conv = await getOrCreateCurrent(ana().user_id, 'sid-1');
    setModelForTests({
      onStep: async (_id, step) => {
        if (step === 0) await applyTransition(conv.id, 'claim', { user_id: t.seed.users.rafael.id, role: 'analyst' });
      },
    });
    const r = await turno('não sei explicar o que houve com o sistema');
    expect(await statusDe(conv.id)).toBe('claimed');
    expect(await t.db.$count(handoffs, eq(handoffs.conversation_id, conv.id))).toBe(0);
    const out = await t.db.select().from(messages).where(eq(messages.agent_run_id, r.run_id));
    expect(out).toHaveLength(1);
    expect(r.outcome).toBe('paused');
  });

  it('sistema de chamados fora: ação com erro, resposta honesta gravada', async () => {
    fake.down = true;
    const r = await turno('qual o status do meu chamado?');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.status).toBe('completed');
    expect(run!.tool_calls.some((a) => a.result === 'error')).toBe(true);
    const [msg] = await t.db.select().from(messages).where(eq(messages.agent_run_id, r.run_id));
    expect(msg?.body).toMatch(/fora do ar/);
  });

  it('resposta de seguimento com o artigo do turno anterior não cai para baixa confiança', async () => {
    const r1 = await turno('Meu notebook não conecta na VPN, erro 809');
    const r2 = await turno('Windows 10', r1.conversation_id);
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
    const r = await turno('fonte inventada');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, r.run_id));
    expect(run?.decision?.decision.sources).toEqual([]);
    expect(run?.decision?.decision.confidence).toBe(0.5);
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
    const r = await turno('abre logo');
    const sys = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversation_id, r.conversation_id), eq(messages.type, 'system')));
    expect(sys.some((m) => m.body === 'O chamado ainda não foi criado — confira o rascunho e confirme.')).toBe(true);
  });
});
