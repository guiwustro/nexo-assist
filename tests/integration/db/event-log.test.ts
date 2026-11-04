import { describe, expect, it } from 'vitest';
import { useTestDb } from '@/tests/helpers/db';
import { getDb } from '@/lib/db/client';
import { emitEvent } from '@/lib/event-log/emit';
import { initialCursor, readEventsAfter, type EventCursor } from '@/lib/event-log/read';

const t = useTestDb();
const analyst = () => ({ role: 'analyst' as const, user_id: t.seed.users.rafael.id });

async function readAll(cursor: EventCursor) {
  const rows = await readEventsAfter(cursor, analyst());
  const last = rows[rows.length - 1];
  return { rows, cursor: last ? { tx: last.tx_id, id: last.id } : cursor };
}

describe('event_log: leitura em ordem de commit', () => {
  it('evento que commita depois de um mais novo não é pulado', async () => {
    let cursor = await initialCursor();

    // A pega o id primeiro e fica com a transação aberta; B grava e commita antes.
    let releaseA!: () => void;
    const hold = new Promise<void>((ok) => (releaseA = ok));
    let wroteA!: () => void;
    const aWritten = new Promise<void>((ok) => (wroteA = ok));
    const txA = getDb().transaction(async (tx) => {
      await emitEvent(tx, { type: 'teste.a' });
      wroteA();
      await hold;
    });
    await aWritten;
    await emitEvent(getDb(), { type: 'teste.b' });

    const delivered: string[] = [];
    let r = await readAll(cursor);
    delivered.push(...r.rows.map((e) => e.event_type));
    cursor = r.cursor;

    releaseA();
    await txA;
    r = await readAll(cursor);
    delivered.push(...r.rows.map((e) => e.event_type));

    expect(delivered).toEqual(['teste.a', 'teste.b']);
  });

  it('o cursor inicial ignora o que já estava gravado', async () => {
    await emitEvent(getDb(), { type: 'teste.antigo' });
    const cursor = await initialCursor();
    await emitEvent(getDb(), { type: 'teste.novo' });
    const { rows } = await readAll(cursor);
    expect(rows.map((e) => e.event_type)).toEqual(['teste.novo']);
  });
});
