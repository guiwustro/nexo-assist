import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import {
  conversations,
  handoffs,
  knowledgeArticles,
  messages,
  ticketEvents,
  ticketDrafts,
  tickets,
  users,
} from '@/lib/db/schema';
import { isOverdue } from '@/lib/rules/overdue';
import { canReopen } from '@/lib/rules/reopening';

const t = useTestDb();

async function ticket(code: string) {
  const [row] = await t.db.select().from(tickets).where(eq(tickets.code, code));
  if (!row) throw new Error(`sem ${code}`);
  return {
    status: row.status as 'open',
    due_at: row.due_at.toISOString(),
    resolved_at: row.resolved_at?.toISOString() ?? null,
  };
}

describe('resetAndSeed', () => {
  it('cria 9 usuários, 9 chamados e 8 artigos', async () => {
    expect(await t.db.$count(users)).toBe(9);
    expect(await t.db.$count(tickets)).toBe(9);
    expect(await t.db.$count(knowledgeArticles)).toBe(8);
    expect(Object.keys(t.seed.users)).toHaveLength(9);
  });

  it('cria 7 conversas (2 pending, 2 ai_handling, 3 closed) e 2 handoffs', async () => {
    const rows = await t.db.select({ status: conversations.status }).from(conversations);
    const byKey = (s: string) => rows.filter((r) => r.status === s).length;
    expect(rows).toHaveLength(7);
    expect([byKey('pending'), byKey('ai_handling'), byKey('closed')]).toEqual([2, 2, 3]);
    expect(await t.db.$count(handoffs)).toBe(2);
    expect(t.seed.conversations.ana).toBeDefined();
    expect(t.seed.conversations.carla).toBeDefined();
  });

  it('Ana tem um atendimento resolvido há três dias sobre o Outlook', async () => {
    const [row] = await t.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, t.seed.conversations.ana!));
    expect(row).toMatchObject({
      status: 'closed',
      closed_reason: 'resolved',
      focus_ticket_code: 'INC-19877',
    });
    expect(row?.closed_at?.getTime()).toBe(t.now.getTime() - 3 * 24 * 60 * 60_000);
  });

  it('INC-20298 tem histórico de comentários e mudança de status', async () => {
    const [inc] = await t.db.select({ id: tickets.id }).from(tickets).where(eq(tickets.code, 'INC-20298'));
    const events = await t.db.select().from(ticketEvents).where(eq(ticketEvents.ticket_id, inc!.id));
    expect(events).toHaveLength(3);
    expect(events.map((event) => [event.kind, event.actor, event.body])).toContainEqual([
      'comment',
      'Juliana Costa',
      'Verificando a permissão com o dono da pasta Financeiro.',
    ]);
    expect(events.map((event) => [event.kind, event.actor, event.body])).toContainEqual([
      'status_changed',
      'Juliana Costa',
      'Em andamento',
    ]);
  });

  it('INC-20311 está vencido e INC-20298 não', async () => {
    expect(isOverdue(await ticket('INC-20311'), t.now)).toBe(true);
    expect(isOverdue(await ticket('INC-20298'), t.now)).toBe(false);
  });

  it('INC-20150 pode ser reaberto e INC-19877 não', async () => {
    expect(canReopen(await ticket('INC-20150'), t.now).ok).toBe(true);
    expect(canReopen(await ticket('INC-19877'), t.now).ok).toBe(false);
  });

  it('Ana tem 6 chamados e nenhum da Carla', async () => {
    const ana = t.seed.users.ana.id;
    expect(await t.db.$count(tickets, eq(tickets.requester_id, ana))).toBe(6);
  });

  it('Elisa tem o card confirmado do INC-20519 ligado ao atendimento de origem', async () => {
    const conversationId = t.seed.conversations.elisa!;
    const [draft] = await t.db.select().from(ticketDrafts);
    const rows = await t.db.select().from(messages);
    const message = rows.find((row) =>
      row.parts.some((part) => part.kind === 'draft_card' && part.draft_id === draft?.id),
    );

    expect(draft).toMatchObject({
      conversation_id: conversationId,
      kind: 'create',
      status: 'confirmed',
      result_ticket_code: 'INC-20519',
    });
    expect(message?.conversation_id).toBe(conversationId);
  });

  it('CHECK impede status inválido de conversa', async () => {
    const carla = t.seed.conversations.carla!;
    const error = await t.db.execute(sql`update conversations set status = 'foo' where id = ${carla}`).then(
      () => null,
      (e: unknown) => e as { cause?: { code?: string; constraint_name?: string } },
    );
    expect(error?.cause?.code).toBe('23514');
    expect(error?.cause?.constraint_name).toBe('conversations_status_check');
  });

  it('próximo INC não colide com os do seed', async () => {
    const [row] = await t.db.execute<{ n: string }>(sql`select nextval('tickets.inc_seq')::text as n`);
    expect(Number(row?.n)).toBeGreaterThan(20519);
  });
});
