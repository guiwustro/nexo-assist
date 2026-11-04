import { describe, expect, it } from 'vitest';
import { useTestDb } from '@/tests/helpers/db';
import { getDb } from '@/lib/db/client';
import { emitEvent } from '@/lib/event-log/emit';
import { initialCursor, readEventsAfter, type EventCursor } from '@/lib/event-log/read';

const t = useTestDb();
const analista = () => ({ role: 'analyst' as const, user_id: t.seed.users.rafael.id });

async function lerTudo(cursor: EventCursor) {
  const rows = await readEventsAfter(cursor, analista());
  const last = rows[rows.length - 1];
  return { rows, cursor: last ? { tx: last.tx_id, id: last.id } : cursor };
}

describe('event_log: leitura em ordem de commit', () => {
  it('evento que commita depois de um mais novo não é pulado', async () => {
    let cursor = await initialCursor();

    // A pega o id primeiro e fica com a transação aberta; B grava e commita antes.
    let soltarA!: () => void;
    const segura = new Promise<void>((ok) => (soltarA = ok));
    let gravouA!: () => void;
    const aGravou = new Promise<void>((ok) => (gravouA = ok));
    const txA = getDb().transaction(async (tx) => {
      await emitEvent(tx, { type: 'teste.a' });
      gravouA();
      await segura;
    });
    await aGravou;
    await emitEvent(getDb(), { type: 'teste.b' });

    const entregues: string[] = [];
    let r = await lerTudo(cursor);
    entregues.push(...r.rows.map((e) => e.event_type));
    cursor = r.cursor;

    soltarA();
    await txA;
    r = await lerTudo(cursor);
    entregues.push(...r.rows.map((e) => e.event_type));

    expect(entregues).toEqual(['teste.a', 'teste.b']);
  });

  it('o cursor inicial ignora o que já estava gravado', async () => {
    await emitEvent(getDb(), { type: 'teste.antigo' });
    const cursor = await initialCursor();
    await emitEvent(getDb(), { type: 'teste.novo' });
    const { rows } = await lerTudo(cursor);
    expect(rows.map((e) => e.event_type)).toEqual(['teste.novo']);
  });
});
