import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { useTestDb } from '@/tests/helpers/db';
import { conversations, handoffs, knowledgeArticles, tickets, users } from '@/lib/db/schema';
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

  it('cria 6 conversas (2 pending, 2 ai_handling, 2 closed) e 2 handoffs', async () => {
    const rows = await t.db.select({ status: conversations.status }).from(conversations);
    const por = (s: string) => rows.filter((r) => r.status === s).length;
    expect(rows).toHaveLength(6);
    expect([por('pending'), por('ai_handling'), por('closed')]).toEqual([2, 2, 2]);
    expect(await t.db.$count(handoffs)).toBe(2);
    expect(t.seed.conversations.ana).toBeUndefined();
    expect(t.seed.conversations.carla).toBeDefined();
  });

  it('INC-20311 está vencido e INC-20298 não', async () => {
    expect(isOverdue(await ticket('INC-20311'), t.agora)).toBe(true);
    expect(isOverdue(await ticket('INC-20298'), t.agora)).toBe(false);
  });

  it('INC-20150 pode ser reaberto e INC-19877 não', async () => {
    expect(canReopen(await ticket('INC-20150'), t.agora).ok).toBe(true);
    expect(canReopen(await ticket('INC-19877'), t.agora).ok).toBe(false);
  });

  it('Ana tem 6 chamados e nenhum da Carla', async () => {
    const ana = t.seed.users.ana.id;
    expect(await t.db.$count(tickets, eq(tickets.requester_id, ana))).toBe(6);
  });

  it('CHECK impede status inválido de conversa', async () => {
    const carla = t.seed.conversations.carla!;
    const erro = await t.db
      .execute(sql`update conversations set status = 'foo' where id = ${carla}`)
      .then(() => null, (e: unknown) => e as { cause?: { code?: string; constraint_name?: string } });
    expect(erro?.cause?.code).toBe('23514');
    expect(erro?.cause?.constraint_name).toBe('conversations_status_check');
  });

  it('próximo INC não colide com os do seed', async () => {
    const [row] = await t.db.execute<{ n: string }>(sql`select nextval('tickets.inc_seq')::text as n`);
    expect(Number(row?.n)).toBeGreaterThan(20519);
  });
});
