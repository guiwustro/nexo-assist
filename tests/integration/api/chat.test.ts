import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import { createFakeTickets } from '@/tests/helpers/fake-tickets';
import { call, json } from '@/tests/helpers/api';
import { conversations } from '@/lib/db/schema';
import { GET as current } from '@/app/api/v1/conversations/current/route';
import { GET as listMessages, POST as postMessage } from '@/app/api/v1/conversations/[id]/messages/route';
import { GET as getRun } from '@/app/api/v1/ai/runs/[id]/route';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { closeMemory } from '@/lib/agent-engine/agent/memory';
import type { Session } from '@/lib/auth/session';

const t = useTestDb();
const ana = (): Session => ({ user_id: t.seed.users.ana.id, role: 'employee', name: 'Ana Souza', sid: 'sid-ana' });
const carla = (): Session => ({ user_id: t.seed.users.carla.id, role: 'employee', name: 'Carla Mendes', sid: 'sid-carla' });
const rafael = (): Session => ({ user_id: t.seed.users.rafael.id, role: 'analyst', name: 'Rafael Lima', sid: 'sid-r' });

beforeEach(() => setTicketsClient(createFakeTickets(t.agora)));
afterAll(async () => {
  setTicketsClient(undefined);
  await closeMemory();
});

type Current = { data: { conversation: { id: string; status: string }; messages: unknown[]; session: { count: number; limit: number } } };

async function anaConversation(): Promise<string> {
  const r = await json<Current>(await call(current, { session: ana() }));
  return r.data.conversation.id;
}

describe('chat', () => {
  it('GET current cria a conversa da Ana e mostra o contador', async () => {
    const r = await json<Current>(await call(current, { session: ana() }));
    expect(r.data.conversation.status).toBe('ai_handling');
    expect(r.data.session).toEqual({ count: 0, limit: 30 });
  });

  it('Ana não escreve na conversa da Carla', async () => {
    const res = await call(postMessage, {
      session: ana(),
      method: 'POST',
      params: { id: t.seed.conversations.carla! },
      body: { text: 'oi' },
    });
    expect(res.status).toBe(404);
  });

  it('Ana não lê a conversa da Carla', async () => {
    const res = await call(listMessages, { session: ana(), params: { id: t.seed.conversations.carla! } });
    expect(res.status).toBe(404);
  });

  it('31ª mensagem pela API → 409', async () => {
    const id = await anaConversation();
    await t.db.update(conversations).set({ session_message_count: 30 }).where(eq(conversations.id, id));
    const res = await call(postMessage, { session: ana(), method: 'POST', params: { id }, body: { text: 'oi' } });
    expect(res.status).toBe(409);
    expect((await json(res)).error?.code).toBe('session_limit_reached');
  });

  it('texto vazio → 400', async () => {
    const id = await anaConversation();
    const res = await call(postMessage, { session: ana(), method: 'POST', params: { id }, body: { text: '' } });
    expect(res.status).toBe(400);
  });

  it('stream do turno traz ações e cards; o run fica consultável só pela dona', async () => {
    const id = await anaConversation();
    const res = await call(postMessage, {
      session: ana(),
      method: 'POST',
      params: { id },
      body: { text: 'Meu notebook não conecta na VPN, erro 809' },
    });
    expect(res.status).toBe(200);
    const corpo = await res.text();
    expect(corpo).toContain('"type":"data-action"');
    expect(corpo).toContain('"type":"data-card"');
    const runId = corpo.match(/"run_id":"([0-9a-f-]{36})"/)?.[1];
    expect(runId).toBeTruthy();

    const meu = await call(getRun, { session: ana(), params: { id: runId! } });
    expect(meu.status).toBe(200);
    const detalhe = await json<{ data: { decision: unknown; tool_calls: unknown[]; cost: { model: string; cost_cents: number | null } } }>(meu);
    expect(detalhe.data.tool_calls.length).toBeGreaterThan(0);
    expect(detalhe.data.cost.cost_cents).toBeNull();
    expect(detalhe.data.decision).not.toBeNull();

    expect((await call(getRun, { session: carla(), params: { id: runId! } })).status).toBe(404);
    expect((await call(getRun, { session: rafael(), params: { id: runId! } })).status).toBe(200);

    const hist = await json<{ data: Array<{ direction: string }> }>(await call(listMessages, { session: ana(), params: { id } }));
    expect(hist.data.map((m) => m.direction)).toEqual(['inbound', 'outbound']);
  });

  it('analista não responde conversa que não assumiu', async () => {
    const res = await call(postMessage, {
      session: rafael(),
      method: 'POST',
      params: { id: t.seed.conversations.carla! },
      body: { text: 'Olá, Carla' },
    });
    expect(res.status).toBe(409);
    expect((await json(res)).error?.code).toBe('not_claimed');
  });
});
