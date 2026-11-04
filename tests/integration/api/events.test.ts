import { describe, expect, it } from 'vitest';
import { useTestDb } from '@/tests/helpers/db';
import { cookieFor } from '@/tests/helpers/api';
import { GET as events } from '@/app/api/v1/events/route';
import { applyTransition, getOrCreateCurrent } from '@/lib/conversations/service';
import { createHandoff } from '@/lib/conversations/handoff';
import type { Session } from '@/lib/auth/session';

const t = useTestDb();
const ana = (): Session => ({ user_id: t.seed.users.ana.id, role: 'employee', name: 'Ana Souza', sid: 's' });
const carla = (): Session => ({ user_id: t.seed.users.carla.id, role: 'employee', name: 'Carla Mendes', sid: 's' });

type Ev = { id: number; cursor: string; event: string; data: { id: number; conversation_id: string } };

/** Abre o SSE, roda `during` e lê o que chegar por `ms`. */
async function ouvir(session: Session, ms: number, during?: () => Promise<void>, lastEventId?: string): Promise<Ev[]> {
  const ctrl = new AbortController();
  const headers = new Headers({ cookie: await cookieFor(session) });
  if (lastEventId !== undefined) headers.set('last-event-id', lastEventId);
  const res = await events(new Request('http://x/api/v1/events', { headers, signal: ctrl.signal }));
  expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const fim = Date.now() + ms;
  const leitura = (async () => {
    while (Date.now() < fim) {
      const r = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((ok) => setTimeout(() => ok({ done: true, value: undefined }), fim - Date.now())),
      ]);
      if (r.done) break;
      buf += dec.decode(r.value);
    }
  })();
  await new Promise((r) => setTimeout(r, 150));
  await during?.();
  await leitura;
  ctrl.abort();
  await reader.cancel().catch(() => {});
  return buf
    .split('\n\n')
    .filter((b) => b.includes('data:'))
    .map((b) => {
      const cursor = /^id: (\d+-\d+)$/m.exec(b)?.[1] ?? '';
      const event = /^event: (.+)$/m.exec(b)?.[1] ?? '';
      const data = JSON.parse(/^data: (.+)$/m.exec(b)?.[1] ?? '{}') as Ev['data'];
      return { id: data.id, cursor, event, data };
    });
}

async function transferirEAssumir(convId: string) {
  await createHandoff(
    {
      conversation_id: convId,
      origin: 'explicit_request',
      reason_code: 'requested_human',
      level: 'N1',
      employee_words: 'quero um analista',
      agent_reading: '—',
      attempts: [],
    },
    t.agora,
  );
  await applyTransition(convId, 'claim', { user_id: t.seed.users.rafael.id, role: 'analyst' });
}

describe('GET /events (SSE)', () => {
  it('Ana recebe os eventos da conversa dela; Carla não', async () => {
    const conv = await getOrCreateCurrent(t.seed.users.ana.id, 's');
    const [daAna, daCarla] = await Promise.all([
      ouvir(ana(), 2600, () => transferirEAssumir(conv.id)),
      ouvir(carla(), 2600),
    ]);
    expect(daCarla).toHaveLength(0);
    const claimed = daAna.filter((e) => e.event === 'conversation.claimed');
    expect(claimed).toHaveLength(1);
    expect(daAna.every((e) => e.data.conversation_id === conv.id)).toBe(true);
    const ids = daAna.map((e) => e.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('reconexão com Last-Event-ID não repete eventos', async () => {
    const conv = await getOrCreateCurrent(t.seed.users.ana.id, 's');
    const primeiro = await ouvir(ana(), 2600, () => transferirEAssumir(conv.id));
    const ultimo = primeiro[primeiro.length - 1]!.cursor;
    const segundo = await ouvir(ana(), 1500, undefined, ultimo);
    expect(segundo).toHaveLength(0);
    const desdeOInicio = await ouvir(ana(), 1500, undefined, '0-0');
    expect(desdeOInicio.length).toBeGreaterThanOrEqual(primeiro.length);
  });
});
