import type { TicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { TicketsNotFoundError, TicketsRejectedError, TicketsTransportError } from '@/lib/agent-engine/edge/tickets/errors';
import type { Ticket } from '@/lib/contracts/tickets';
import { SEED_TICKETS, userByKey } from '@/lib/db/seed-data';
import { calcularPrazo } from '@/lib/regras/prazo';
import { podeReabrir } from '@/lib/regras/reabertura';

export type FakeTickets = TicketsClient & {
  tickets: Ticket[];
  down: boolean;
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
      due_at: calcularPrazo(s.priority, last).due_at.toISOString(),
      last_update_at: last.toISOString(),
      resolved_at: s.resolved_ago === null ? null : new Date(t0 - s.resolved_ago).toISOString(),
      created_at: new Date(t0 - s.created_ago).toISOString(),
    };
  });
  let seq = 20520;
  const recibos = new Map<string, Ticket>();
  const once = async (key: string, fn: () => Promise<Ticket>) => {
    const r = recibos.get(key);
    if (r) return r;
    const t = await fn();
    recibos.set(key, t);
    return t;
  };
  const fake: FakeTickets = {
    tickets,
    down: false,
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
    async create(input, key) {
      guard('create');
      return once(key, async () => {
      const t: Ticket = {
        ...input,
        subcategory: input.subcategory ?? null,
        code: `${input.type === 'incident' ? 'INC' : 'REQ'}-${seq++}`,
        status: 'open',
        assignee_name: null,
        due_at: calcularPrazo(input.priority, agora).due_at.toISOString(),
        last_update_at: agora.toISOString(),
        resolved_at: null,
        created_at: agora.toISOString(),
      };
      tickets.push(t);
      return t;
      });
    },
    async update(code, input, key) {
      guard('update');
      return once(key, async () => {
        const t = await fake.get(code, input.requester_id);
        t.last_update_at = agora.toISOString();
        return t;
      });
    },
    async reopen(code, requesterId, key) {
      guard('reopen');
      return once(key, async () => {
        const t = await fake.get(code, requesterId);
        if (!podeReabrir(t, agora).ok) throw new TicketsRejectedError('reopen_window_expired', 'Fora da janela', 422);
        t.status = 'open';
        t.resolved_at = null;
        return t;
      });
    },
    async transfer(code, input) {
      guard('transfer');
      const t = await fake.get(code, input.requester_id);
      t.status = 'awaiting_analyst';
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
