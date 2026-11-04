import type { TicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { TicketsNotFoundError, TicketsRejectedError, TicketsTransportError } from '@/lib/agent-engine/edge/tickets/errors';
import type { Ticket, TicketEvent } from '@/lib/contracts/tickets';
import { SEED_TICKETS, userByKey } from '@/lib/db/seed-data';
import { computeDeadline } from '@/lib/rules/deadline';
import { canReopen } from '@/lib/rules/reopening';
import { dobrar } from '@/lib/text/trechos';

export type FakeTickets = TicketsClient & {
  tickets: Ticket[];
  /** Histórico por código, como a tabela `ticket_events` do legado. */
  history: Map<string, TicketEvent[]>;
  down: boolean;
  /** Executa a operação mas perde a resposta (timeout depois de gravar), como numa rede ruim. */
  loseResponses: boolean;
  calls: string[];
};

/** Serviço de chamados em memória com os dados do seed (relativos a `agora`). */
export function createFakeTickets(agora: Date): FakeTickets {
  const t0 = agora.getTime();
  const tickets: Ticket[] = SEED_TICKETS.map((s) => {
    const last = new Date(t0 - s.last_update_ago);
    return {
      code: s.code,
      type: s.type,
      title: s.title,
      description: s.description,
      category: s.category,
      subcategory: s.subcategory,
      priority: s.priority,
      affected: s.affected,
      status: s.status,
      requester_id: userByKey(s.owner).id,
      assignee_name: s.assignee_name,
      due_at: computeDeadline(s.priority, last).due_at.toISOString(),
      last_update_at: last.toISOString(),
      resolved_at: s.resolved_ago === null ? null : new Date(t0 - s.resolved_ago).toISOString(),
      created_at: new Date(t0 - s.created_ago).toISOString(),
    };
  });
  const history = new Map<string, TicketEvent[]>(
    tickets.map((t) => [t.code, [{ kind: 'created', body: 'Chamado aberto', actor: 'funcionário', created_at: t.created_at }]]),
  );
  const registrar = (code: string, kind: TicketEvent['kind'], body: string) =>
    history.set(code, [...(history.get(code) ?? []), { kind, body, actor: 'funcionário', created_at: agora.toISOString() }]);
  let seq = 20520;
  const recibos = new Map<string, Ticket>();
  const once = async (key: string, fn: () => Promise<Ticket>) => {
    let t = recibos.get(key);
    if (!t) {
      t = await fn();
      recibos.set(key, t);
    }
    if (fake.loseResponses) throw new TicketsTransportError('resposta perdida');
    return t;
  };
  const fake: FakeTickets = {
    tickets,
    history,
    down: false,
    loseResponses: false,
    calls: [],
    async listByRequester(requesterId, status = 'all') {
      guard('list');
      const abertos = ['open', 'in_progress', 'awaiting_analyst', 'approved'];
      return tickets
        .filter((t) => t.requester_id === requesterId && (status === 'all' || abertos.includes(t.status)))
        .sort((a, b) => b.last_update_at.localeCompare(a.last_update_at));
    },
    async get(code, requesterId) {
      guard('get');
      const t = tickets.find((x) => x.code === code && x.requester_id === requesterId);
      if (!t) throw new TicketsNotFoundError(code);
      return t;
    },
    async events(code, requesterId) {
      guard('events');
      await fake.get(code, requesterId);
      return history.get(code) ?? [];
    },
    async search(q) {
      guard('search');
      const alvo = dobrar(q.trim());
      if (!alvo) return [];
      return tickets
        .filter((t) => dobrar(`${t.code} ${t.title}`).includes(alvo))
        .map((t) => ({ requester_id: t.requester_id, code: t.code, title: t.title }));
    },
    async create(input, key) {
      guard('create');
      return once(key, async () => {
      const t: Ticket = {
        ...input,
        subcategory: input.subcategory ?? null,
        code: `${input.type === 'incident' ? 'INC' : 'REQ'}-${seq++}`,
        status: 'open',
        assignee_name: null,
        due_at: computeDeadline(input.priority, agora).due_at.toISOString(),
        last_update_at: agora.toISOString(),
        resolved_at: null,
        created_at: agora.toISOString(),
      };
      tickets.push(t);
      registrar(t.code, 'created', 'Chamado aberto');
      return t;
      });
    },
    async update(code, input, key) {
      guard('update');
      return once(key, async () => {
        const t = await fake.get(code, input.requester_id);
        t.last_update_at = agora.toISOString();
        registrar(code, 'comment', input.comment);
        return t;
      });
    },
    async reopen(code, requesterId, key) {
      guard('reopen');
      return once(key, async () => {
        const t = await fake.get(code, requesterId);
        if (!canReopen(t, agora).ok) throw new TicketsRejectedError('reopen_window_expired', 'Fora da janela', 422);
        t.status = 'open';
        t.resolved_at = null;
        registrar(code, 'reopened', 'Reaberto pelo funcionário');
        return t;
      });
    },
    async transfer(code, input) {
      guard('transfer');
      const t = await fake.get(code, input.requester_id);
      t.status = 'awaiting_analyst';
      registrar(code, 'transferred', input.summary);
      return t;
    },
    breakerState: () => 'closed',
  };
  function guard(op: string) {
    fake.calls.push(op);
    if (fake.down) throw new TicketsTransportError('fora do ar');
  }
  return fake;
}
