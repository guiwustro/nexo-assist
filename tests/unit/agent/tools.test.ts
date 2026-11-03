import { describe, expect, it } from 'vitest';
import { createFakeTickets } from '@/tests/helpers/fake-tickets';
import { runTool, TOOL_DEFS, type ToolCtx } from '@/lib/agent-engine/tools';
import { SEED_ARTICLES, userByKey } from '@/lib/db/seed-data';
import type { ActionTrace } from '@/lib/contracts/decision';
import type { MessagePart } from '@/lib/contracts/parts';

const agora = new Date('2026-11-03T13:00:00.000Z');

function ctx(over: Partial<ToolCtx> = {}) {
  const actions: ActionTrace[] = [];
  const parts: MessagePart[] = [];
  const tickets = createFakeTickets(agora);
  const c: ToolCtx = {
    employee_id: userByKey('ana').id,
    employee_text: 'texto',
    conversation_id: '00000000-0000-4000-8000-0000000000c1',
    agent_run_id: null,
    now: agora,
    tickets,
    articles: async () => SEED_ARTICLES,
    emitAction: (a) => actions.push(a),
    emitPart: (p) => parts.push(p),
    retry: { current: null },
    ...over,
  };
  return { c, actions, parts, tickets };
}

const finais = (a: ActionTrace[]) => a.filter((x) => x.result !== 'running');

describe('tools do agent', () => {
  it('nenhum inputSchema aceita identidade', () => {
    for (const [nome, def] of Object.entries(TOOL_DEFS)) {
      const chaves = Object.keys(def.inputSchema.shape);
      expect(chaves, nome).not.toContain('employee_id');
      expect(chaves, nome).not.toContain('requester_id');
      expect(chaves, nome).not.toContain('user_id');
    }
  });

  it('ver_chamado de chamado alheio → found:false sem vazar nada', async () => {
    const { c, parts, actions } = ctx();
    const out = await runTool(c, 'ver_chamado', { code: 'INC-20388' });
    expect(out).toEqual({ found: false });
    expect(JSON.stringify(parts)).not.toContain('Diretoria');
    expect(JSON.stringify(actions)).not.toContain('Diretoria');
  });

  it('buscar_meus_chamados para mostrar → seletor com os 3 abertos', async () => {
    const { c, parts, actions } = ctx();
    const out = (await runTool(c, 'buscar_meus_chamados', { status: 'open', show: true })) as {
      tickets: Array<{ code: string }>;
    };
    expect(out.tickets.map((t) => t.code).sort()).toEqual(['INC-20298', 'INC-20311', 'REQ-10442']);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.kind).toBe('ticket_selector');
    expect(finais(actions)[0]).toMatchObject({ label: 'consultou seus chamados', result: 'ok', tool: 'buscar_meus_chamados' });
  });

  it('buscar_meus_chamados só para checar duplicidade não mostra card', async () => {
    const { c, parts } = ctx();
    await runTool(c, 'buscar_meus_chamados', { status: 'open' });
    expect(parts).toHaveLength(0);
  });

  it('ver_chamado INC-20311 → card vencido "há 6 dias"', async () => {
    const { c, parts, actions } = ctx();
    const out = (await runTool(c, 'ver_chamado', { code: 'INC-20311' })) as { found: boolean; overdue: boolean };
    expect(out).toMatchObject({ found: true, overdue: true });
    expect(parts[0]).toMatchObject({ kind: 'ticket_card', overdue: true, overdue_label: 'há 6 dias · prazo vencido' });
    expect(finais(actions).map((a) => a.label)).toEqual(['consultou o INC-20311', 'calculou o prazo']);
  });

  it('sistema de chamados fora → resposta honesta e ação com erro', async () => {
    const { c, actions, tickets } = ctx();
    tickets.down = true;
    const out = await runTool(c, 'buscar_meus_chamados', { status: 'open', show: true });
    expect(out).toEqual({ ok: false, error: 'tickets_unavailable' });
    expect(finais(actions)[0]).toMatchObject({ result: 'error', label: 'sistema de chamados indisponível' });
  });

  it('buscar_artigos devolve até 3 artigos', async () => {
    const { c } = ctx();
    const out = (await runTool(c, 'buscar_artigos', { query: 'vpn erro 809' })) as { articles: Array<{ slug: string }> };
    expect(out.articles[0]?.slug).toBe('vpn-erro-809');
    expect(out.articles.length).toBeLessThanOrEqual(3);
  });

  it('oferecer_opcoes emite as opções rápidas sem ação na status line', async () => {
    const { c, parts, actions } = ctx();
    await runTool(c, 'oferecer_opcoes', { question: 'Qual sistema?', options: ['Windows 10', 'Windows 11'] });
    expect(parts[0]).toEqual({ kind: 'quick_replies', question: 'Qual sistema?', options: ['Windows 10', 'Windows 11'] });
    expect(actions).toHaveLength(0);
  });

  it('nova tentativa vira ação "retried"', async () => {
    const { c, actions, tickets } = ctx();
    const original = tickets.listByRequester;
    tickets.listByRequester = async (...a) => {
      c.retry.current?.(1);
      return original(...a);
    };
    await runTool(c, 'buscar_meus_chamados', { status: 'open' });
    expect(actions.some((a) => a.result === 'retried')).toBe(true);
    expect(finais(actions).at(-1)?.result).toBe('ok');
  });
});
