import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import { createFakeTickets, type FakeTickets } from '@/tests/helpers/fake-tickets';
import { call, json } from '@/tests/helpers/api';
import { messages, ticketDrafts } from '@/lib/db/schema';
import { PATCH as patchDraft } from '@/app/api/v1/drafts/[id]/route';
import { POST as confirm } from '@/app/api/v1/drafts/[id]/confirm/route';
import { POST as cancel } from '@/app/api/v1/drafts/[id]/cancel/route';
import { createDraft } from '@/lib/drafts/service';
import { getOrCreateCurrent, appendMessage } from '@/lib/conversations/service';
import { setTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { closeMemory } from '@/lib/agent-engine/agent/memory';
import { calcularPrazo } from '@/lib/regras/prazo';
import { getDb } from '@/lib/db/client';
import type { Session } from '@/lib/auth/session';
import type { DraftPayload } from '@/lib/contracts/drafts';
import { resetEnvCache } from '@/lib/env';

const t = useTestDb();
let fake: FakeTickets;
const ana = (): Session => ({ user_id: t.seed.users.ana.id, role: 'employee', name: 'Ana Souza', sid: 'sid-ana' });

beforeEach(() => {
  fake = createFakeTickets(t.agora);
  setTicketsClient(fake);
  process.env.E2E = 'true';
  process.env.NOW_OVERRIDE = t.agora.toISOString();
  resetEnvCache();
});
afterAll(async () => {
  delete process.env.E2E;
  delete process.env.NOW_OVERRIDE;
  resetEnvCache();
  setTicketsClient(undefined);
  await closeMemory();
});

const payload = (): DraftPayload => ({
  title: 'VPN não conecta no Windows 11',
  description: 'Erro 809',
  type: 'incident',
  category: 'network_vpn',
  affected: 'me',
  blocks_work: true,
  deadline_today: true,
  priority: 'high',
  priority_rule: 'Alta: …',
  due_at: calcularPrazo('high', t.agora).due_at.toISOString(),
});

async function draftDa(employeeId: string) {
  const conv = await getOrCreateCurrent(employeeId, 'sid');
  const d = await createDraft({ conversation_id: conv.id, agent_run_id: null, kind: 'create', target_ticket_code: null, payload: payload() });
  await appendMessage(getDb(), {
    conversation_id: conv.id,
    direction: 'outbound',
    sent_via: 'ai',
    body: 'Montei o rascunho',
    parts: [{ kind: 'draft_card', draft_id: d.id, code: d.code, draft_kind: 'create', target_code: null, status: 'pending', payload: payload() }],
  });
  return d;
}

type Confirmed = { data: { draft: { status: string; result_ticket_code: string }; ticket: { code: string } } };

describe('rascunhos', () => {
  it('duas confirmações ao mesmo tempo criam um único chamado', async () => {
    const d = await draftDa(t.seed.users.ana.id);
    const antes = fake.tickets.length;
    const [a, b] = await Promise.all([
      call(confirm, { session: ana(), method: 'POST', params: { id: d.id } }),
      call(confirm, { session: ana(), method: 'POST', params: { id: d.id } }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const ca = (await json<Confirmed>(a)).data.ticket.code;
    const cb = (await json<Confirmed>(b)).data.ticket.code;
    expect(ca).toMatch(/^INC-205\d\d$/);
    expect(cb).toBe(ca);
    expect(fake.tickets.length).toBe(antes + 1);
    const sys = await t.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversation_id, d.conversation_id), eq(messages.type, 'system')));
    expect(sys.filter((m) => m.body.startsWith(`${ca} criado`))).toHaveLength(1);
    expect(sys[0]?.body).toMatch(/criado · prioridade Alta · resposta até \d\d:\d\d/);
    const [card] = await t.db.select().from(messages).where(eq(messages.body, 'Montei o rascunho'));
    expect(card?.parts[0]).toMatchObject({ kind: 'draft_card', status: 'confirmed', result_ticket_code: ca });
  });

  it('sistema fora: 503 e o rascunho continua pendente; depois confirma', async () => {
    const d = await draftDa(t.seed.users.ana.id);
    fake.down = true;
    const fora = await call(confirm, { session: ana(), method: 'POST', params: { id: d.id } });
    expect(fora.status).toBe(503);
    const [row] = await t.db.select().from(ticketDrafts).where(eq(ticketDrafts.id, d.id));
    expect(row?.status).toBe('pending');
    fake.down = false;
    const ok = await call(confirm, { session: ana(), method: 'POST', params: { id: d.id } });
    expect(ok.status).toBe(200);
  });

  it('Ana não confirma rascunho da Carla', async () => {
    const d = await draftDa(t.seed.users.carla.id);
    expect((await call(confirm, { session: ana(), method: 'POST', params: { id: d.id } })).status).toBe(404);
  });

  it('editar afetados para a equipe com bloqueio recalcula para Crítica (+1 h)', async () => {
    const d = await draftDa(t.seed.users.ana.id);
    const res = await call(patchDraft, {
      session: ana(),
      method: 'PATCH',
      params: { id: d.id },
      body: { affected: 'team', blocks_work: true },
    });
    expect(res.status).toBe(200);
    const { data } = await json<{ data: { payload: DraftPayload } }>(res);
    expect(data.payload.priority).toBe('critical');
    expect(data.payload.due_at).toBe(new Date(t.agora.getTime() + 3600_000).toISOString());
  });

  it('não dá para mudar a prioridade direto', async () => {
    const d = await draftDa(t.seed.users.ana.id);
    const res = await call(patchDraft, { session: ana(), method: 'PATCH', params: { id: d.id }, body: { priority: 'low' } });
    const { data } = await json<{ data: { payload: DraftPayload } }>(res);
    expect(data.payload.priority).toBe('high');
  });

  it('cancelar marca cancelado e impede confirmar', async () => {
    const d = await draftDa(t.seed.users.ana.id);
    expect((await call(cancel, { session: ana(), method: 'POST', params: { id: d.id } })).status).toBe(200);
    const res = await call(confirm, { session: ana(), method: 'POST', params: { id: d.id } });
    expect(res.status).toBe(409);
  });
});
