import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import { getAgentAttendance } from '@/tests/helpers/attendance';
import { createFakeTickets } from '@/tests/helpers/fake-tickets';
import { runTool, type ToolCtx } from '@/lib/agent-engine/tools';
import { ticketDrafts } from '@/lib/db/schema';
import { computeDeadline } from '@/lib/rules/deadline';
import { SEED_ARTICLES } from '@/lib/db/seed-data';
import type { MessagePart } from '@/lib/contracts/parts';
import type { ActionTrace } from '@/lib/contracts/decision';
import type { FakeTickets } from '@/tests/helpers/fake-tickets';

const t = useTestDb();

async function ctx() {
  const conv = await getAgentAttendance(t.seed.users.ana.id, 'sid', t.now);
  const parts: MessagePart[] = [];
  const actions: ActionTrace[] = [];
  const c: ToolCtx = {
    employee_id: t.seed.users.ana.id,
    employee_text: 'só eu, reunião às 14h',
    conversation_id: conv.id,
    agent_run_id: null,
    now: t.now,
    tickets: createFakeTickets(t.now),
    articles: async () => SEED_ARTICLES,
    emitAction: (a) => actions.push(a),
    emitPart: (p) => parts.push(p),
    retry: { current: null },
  };
  return { c, parts, actions };
}

const base = {
  title: 'VPN não conecta no Windows 11',
  description: 'Erro 809',
  type: 'incident',
  category: 'network_vpn',
  affected: 'me',
  blocks_work: true,
  deadline_today: true,
};

describe('build_draft', () => {
  it('calcula Alta no servidor e grava o rascunho D-381 pendente', async () => {
    const { c, parts } = await ctx();
    const out = (await runTool(c, 'build_draft', { kind: 'create', ...base })) as {
      draft_code: string;
      priority: string;
      priority_rule: string;
      due_at: string;
    };
    expect(out.priority).toBe('high');
    expect(out.priority_rule.startsWith('Alta')).toBe(true);
    expect(out.due_at).toBe(computeDeadline('high', t.now).due_at.toISOString());
    expect(out.draft_code).toBe('D-381');
    const [row] = await t.db.select().from(ticketDrafts).where(eq(ticketDrafts.code, 'D-381'));
    expect(row?.status).toBe('pending');
    expect(row?.idempotency_key).toBeTruthy();
    expect(parts[0]).toMatchObject({ kind: 'draft_card', code: 'D-381', draft_kind: 'create', status: 'pending' });
  });

  it('reabrir INC-19877 (60 dias) → reopen_window_expired', async () => {
    const { c } = await ctx();
    const out = await runTool(c, 'build_draft', { kind: 'reopen', target_code: 'INC-19877', ...base });
    expect(out).toMatchObject({ ok: false, error: 'reopen_window_expired' });
    expect(await t.db.$count(ticketDrafts)).toBe(0);
  });

  it('reabrir INC-20150 (4 dias) → rascunho de reabertura', async () => {
    const { c } = await ctx();
    const out = await runTool(c, 'build_draft', { kind: 'reopen', target_code: 'INC-20150', ...base });
    expect(out).toMatchObject({ draft_code: 'D-381' });
  });

  it('atualizar chamado da Carla → found:false', async () => {
    const { c } = await ctx();
    const out = await runTool(c, 'build_draft', { kind: 'update', target_code: 'INC-20388', ...base, comment: 'x' });
    expect(out).toEqual({ found: false });
  });

  it('atualizar sem target_code → erro de entrada', async () => {
    const { c } = await ctx();
    const out = await runTool(c, 'build_draft', { kind: 'update', ...base });
    expect(out).toMatchObject({ ok: false, error: 'target_code_required' });
  });

  describe('chamado aberto na mesma categoria', () => {
    const sharepoint = { ...base, title: 'Pasta Financeiro no SharePoint não abre', category: 'access' };

    it('criar com um aberto na mesma categoria → possible_duplicate, sem rascunho', async () => {
      const { c, parts, actions } = await ctx();
      const out = await runTool(c, 'build_draft', { kind: 'create', ...sharepoint });
      expect(out).toMatchObject({ ok: false, error: 'possible_duplicate', open_tickets: [{ code: 'INC-20298' }] });
      expect(await t.db.$count(ticketDrafts)).toBe(0);
      expect(parts).toHaveLength(0);
      expect(actions.find((a) => a.result !== 'running')?.summary).toMatch(/INC-20298/);
    });

    it('o agent confirma que é outro problema (distinct_from) → cria o rascunho', async () => {
      const { c } = await ctx();
      const out = await runTool(c, 'build_draft', { kind: 'create', ...sharepoint, distinct_from: ['INC-20298'] });
      expect(out).toMatchObject({ ok: true, draft_code: 'D-381' });
    });

    it('chamados resolvidos não contam', async () => {
      const { c } = await ctx();
      const out = await runTool(c, 'build_draft', {
        kind: 'create',
        ...base,
        title: 'Outlook não sincroniza no celular',
        category: 'email',
      });
      expect(out).toMatchObject({ ok: true });
    });

    it('sistema de chamados fora: não dá para checar, o rascunho sai mesmo assim', async () => {
      const { c } = await ctx();
      (c.tickets as FakeTickets).down = true;
      const out = await runTool(c, 'build_draft', { kind: 'create', ...sharepoint });
      expect(out).toMatchObject({ ok: true });
    });
  });
});
