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
const corrida = vi.hoisted(() => ({ modo: 'off' as 'off' | 'claim' | 'erro', analista: '' }));
vi.mock('@/lib/conversations/service', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/conversations/service')>();
  return {
    ...orig,
    getConversation: async (...args: Parameters<typeof orig.getConversation>) => {
      const lida = await orig.getConversation(...args);
      if (corrida.modo === 'claim') {
        await orig.applyTransition(args[1], 'claim', { user_id: corrida.analista, role: 'analyst' });
      }
      if (corrida.modo === 'erro') throw new Error('banco caiu no meio do turno');
      return lida;
    },
  };
});

const t = useTestDb();

function writer() {
  return { write: () => {}, merge: () => {}, onError: undefined } as unknown as UIMessageStreamWriter<NexoUIMessage>;
}

beforeEach(() => {
  setTicketsClient(createFakeTickets(t.agora));
  setModelForTests();
  corrida.analista = t.seed.users.rafael.id;
});
afterEach(() => {
  corrida.modo = 'off';
  setModelForTests();
});
afterAll(async () => {
  setTicketsClient(undefined);
  await closeMemory();
});

async function turno(text: string) {
  const conv = await service.getOrCreateCurrent(t.seed.users.ana.id, 'sid-1');
  const employee = { user_id: t.seed.users.ana.id, role: 'employee' as const, name: 'Ana Souza', sid: 'sid-1' };
  return { conv, r: runTurn({ conversation_id: conv.id, employee, text, writer: writer(), now: t.agora }) };
}

describe('runTurn: analista assume na última hora', () => {
  it('gatilho de transferência perde a corrida: turno termina pausado, sem erro e sem passagem', async () => {
    corrida.modo = 'claim';
    const { conv, r } = await turno('não sei explicar o que houve com o sistema');
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
    corrida.modo = 'erro';
    const { conv, r } = await turno('não sei explicar o que houve com o sistema');
    await expect(r).rejects.toThrow('banco caiu');
    const runs = await t.db.select().from(aiAgentRuns).where(eq(aiAgentRuns.conversation_id, conv.id));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.error_code).toBe('internal_error');
  });
});
