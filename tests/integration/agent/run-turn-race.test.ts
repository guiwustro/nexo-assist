import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { UIMessageStreamWriter } from 'ai';
import { useTestDb } from '@/tests/helpers/db';
import { createFakeTickets } from '@/tests/helpers/fake-tickets';
import { aiAgentRuns, conversations, handoffs, messages } from '@/lib/db/schema';
import { runTurn } from '@/lib/agent-engine/agent/run-turn';
import { closeMemory } from '@/lib/agent-engine/agent/memory';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { setModelForTests } from '@/lib/agent-engine/edge/llm/provider';
import * as service from '@/lib/conversations/service';
import type { NexoUIMessage } from '@/lib/contracts/ui';

/**
 * O analista assume entre a releitura do status (pós-turno) e a passagem criada por um gatilho. O mock devolve a
 * leitura antiga ("ai_handling") depois de aplicar o claim — exatamente a janela da corrida.
 */
const race = vi.hoisted(() => ({ mode: 'off' as 'off' | 'claim' | 'erro', analyst: '' }));
vi.mock('@/lib/conversations/service', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/conversations/service')>();
  return {
    ...orig,
    getConversation: async (...args: Parameters<typeof orig.getConversation>) => {
      const stale = await orig.getConversation(...args);
      if (race.mode === 'claim') {
        await orig.applyTransition(args[1], 'claim', { user_id: race.analyst, role: 'analyst' });
      }
      if (race.mode === 'erro') throw new Error('banco caiu no meio do turno');
      return stale;
    },
  };
});

const t = useTestDb();

function writer() {
  return { write: () => {}, merge: () => {}, onError: undefined } as unknown as UIMessageStreamWriter<NexoUIMessage>;
}

beforeEach(() => {
  setTicketsClient(createFakeTickets(t.now));
  setModelForTests();
  race.analyst = t.seed.users.rafael.id;
});
afterEach(() => {
  race.mode = 'off';
  setModelForTests();
});
afterAll(async () => {
  setTicketsClient(undefined);
  await closeMemory();
});

async function runTurnFor(text: string) {
  const conv = await service.getOrCreateCurrent(t.seed.users.ana.id, 'sid-1');
  const employee = { user_id: t.seed.users.ana.id, role: 'employee' as const, name: 'Ana Souza', sid: 'sid-1' };
  return { conv, r: runTurn({ conversation_id: conv.id, employee, text, writer: writer(), now: t.now }) };
}

describe('runTurn: analista assume na última hora', () => {
  it('gatilho de transferência perde a corrida: turno termina pausado, sem erro e sem passagem', async () => {
    race.mode = 'claim';
    const { conv, r } = await runTurnFor('não sei explicar o que houve com o sistema');
    const res = await r;
    expect(res.outcome).toBe('paused');
    const [run] = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.id, res.run_id!));
    expect(run?.status).toBe('completed');
    const [c] = await t.db.select().from(conversations).where(eq(conversations.id, conv.id));
    expect(c?.status).toBe('claimed');
    expect(await t.db.$count(handoffs, eq(handoffs.conversation_id, conv.id))).toBe(0);
    const out = await t.db.select().from(messages).where(eq(messages.agent_run_id, res.run_id!));
    expect(out).toHaveLength(1);
  });

  it('erro inesperado depois do modelo não deixa o run como "running"', async () => {
    race.mode = 'erro';
    const { conv, r } = await runTurnFor('não sei explicar o que houve com o sistema');
    await expect(r).rejects.toThrow('banco caiu');
    const runs = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.conversation_id, conv.id));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.error_code).toBe('internal_error');
  });
});
