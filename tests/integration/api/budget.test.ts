import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { UIMessageStreamWriter } from 'ai';
import { useTestDb } from '@/tests/helpers/db';
import { call, json } from '@/tests/helpers/api';
import { createFakeTickets } from '@/tests/helpers/fake-tickets';
import { aiAgentRuns, conversations, handoffs, llmCalls, messages } from '@/lib/db/schema';
import { runTurn } from '@/lib/agent-engine/agent/run-turn';
import { closeMemory } from '@/lib/agent-engine/agent/memory';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { setModelForTests } from '@/lib/agent-engine/edge/llm/provider';
import { getOrCreateCurrent } from '@/lib/conversations/service';
import { listForAnalyst } from '@/lib/conversations/queries';
import { resetEnvCache } from '@/lib/env';
import { POST as postMessage } from '@/app/api/v1/conversations/[id]/messages/route';
import { POST as login } from '@/app/api/v1/auth/login/route';
import type { Session } from '@/lib/auth/session';
import type { NexoUIMessage } from '@/lib/contracts/ui';

const t = useTestDb();
const ana = (): Session => ({ user_id: t.seed.users.ana.id, role: 'employee', name: 'Ana Souza', sid: 'sid-b' });
const resetLimiters = () => {
  const g = globalThis as unknown as { __nexoResetHooks?: Array<() => void>; __nexoLimiters?: unknown };
  for (const h of g.__nexoResetHooks ?? []) h();
};

function writer() {
  const chunks: { type: string; data?: unknown }[] = [];
  const w = { write: (c: { type: string }) => chunks.push(c), merge: () => {}, onError: undefined };
  return { w: w as unknown as UIMessageStreamWriter<NexoUIMessage>, chunks };
}

async function gastoDeHoje(cents: number) {
  const conv = await getOrCreateCurrent(t.seed.users.diego.id, 'sid-outro');
  const [run] = await t.db.insert(aiAgentRuns).values({ conversation_id: conv.id, status: 'completed', model: 'x' }).returning();
  await t.db.insert(llmCalls).values({
    agent_run_id: run!.id,
    purpose: 'agent_turn',
    provider: 'deepseek',
    model: 'x',
    input_tokens: 1,
    output_tokens: 1,
    cost_cents: cents,
    created_at: t.agora,
  });
}

beforeEach(() => {
  setTicketsClient(createFakeTickets(t.agora));
  setModelForTests();
  resetLimiters();
});
afterEach(() => {
  delete process.env.LLM_DAILY_BUDGET_CENTS;
  delete process.env.RATE_LIMIT_PER_MINUTE;
  resetEnvCache();
  resetLimiters();
  const g = globalThis as unknown as { __nexoLimiters?: unknown };
  g.__nexoLimiters = undefined;
});
afterAll(async () => {
  setTicketsClient(undefined);
  await closeMemory();
});

describe('teto diário de gasto com o modelo', () => {
  it('acima do orçamento: não chama o modelo, transfere e avisa', async () => {
    process.env.LLM_DAILY_BUDGET_CENTS = '100';
    resetEnvCache();
    await gastoDeHoje(120);
    const antes = await t.db.$count(llmCalls);
    const conv = await getOrCreateCurrent(ana().user_id, 'sid-b');
    const { w, chunks } = writer();
    const r = await runTurn({ conversation_id: conv.id, employee: ana(), text: 'Qual o horário do service desk?', writer: w, now: t.agora });

    expect(r.outcome).toBe('transferred');
    expect(await t.db.$count(llmCalls)).toBe(antes);
    const [h] = await t.db.select().from(handoffs).where(eq(handoffs.conversation_id, conv.id));
    expect(h).toMatchObject({ origin: 'budget', reason_code: 'budget_exceeded', support_level: 'N1' });
    const [c] = await t.db.select().from(conversations).where(eq(conversations.id, conv.id));
    expect(c?.status).toBe('pending');
    const out = await t.db.select().from(messages).where(eq(messages.conversation_id, conv.id));
    expect(out.some((m) => m.direction === 'outbound' && /limite de uso de hoje/.test(m.body))).toBe(true);
    expect(chunks.some((x) => x.type === 'data-system' && (x.data as { kind: string }).kind === 'budget')).toBe(true);
    const fila = await listForAnalyst(t.seed.users.rafael.id, 'all', undefined, t.agora, conv.id);
    expect(fila[0]?.tag.label).toBe('Transferida · limite de uso do assistente');
  });

  it('abaixo do orçamento: segue normal', async () => {
    process.env.LLM_DAILY_BUDGET_CENTS = '100';
    resetEnvCache();
    await gastoDeHoje(40);
    const conv = await getOrCreateCurrent(ana().user_id, 'sid-b');
    const r = await runTurn({ conversation_id: conv.id, employee: ana(), text: 'Qual o horário do service desk?', writer: writer().w, now: t.agora });
    expect(r.outcome).toBe('answered');
  });

  it('gasto de ontem não conta', async () => {
    process.env.LLM_DAILY_BUDGET_CENTS = '100';
    resetEnvCache();
    await gastoDeHoje(500);
    await t.db.update(llmCalls).set({ created_at: new Date(t.agora.getTime() - 24 * 3600_000) });
    const conv = await getOrCreateCurrent(ana().user_id, 'sid-b');
    const r = await runTurn({ conversation_id: conv.id, employee: ana(), text: 'Qual o horário do service desk?', writer: writer().w, now: t.agora });
    expect(r.outcome).toBe('answered');
  });
});

describe('rate limit', () => {
  it('chat: passou do limite por minuto → 429 rate_limited com Retry-After, antes do stream', async () => {
    process.env.RATE_LIMIT_PER_MINUTE = '2';
    resetEnvCache();
    (globalThis as unknown as { __nexoLimiters?: unknown }).__nexoLimiters = undefined;
    const conv = await getOrCreateCurrent(ana().user_id, 'sid-b');
    const send = () => call(postMessage, { session: ana(), method: 'POST', params: { id: conv.id }, body: { text: 'oi' } });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const r = await send();
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = await json<{ error: { code: string; message: string } }>(r);
    expect(body.error?.code).toBe('rate_limited');
    expect(body.error.message).toMatch(/^Muitas mensagens em pouco tempo, aguarde \d+s$/);
  });

  it('login: 10 por minuto por IP', async () => {
    const tentar = (ip: string) =>
      login(
        new Request('http://x/api/v1/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify({ email: 'ana.souza@nexo.com.br', password: 'x' }),
        }),
        { params: Promise.resolve({}) },
      );
    for (let i = 0; i < 10; i++) expect((await tentar('10.0.0.1')).status).toBe(200);
    const r = await tentar('10.0.0.1');
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBeTruthy();
    expect((await tentar('10.0.0.2')).status).toBe(200);
  });
});
