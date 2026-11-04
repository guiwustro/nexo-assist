import { getTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import type { Ticket, TicketEvent } from '@/lib/contracts/tickets';
import { serverNow } from '@/lib/env';
import { describeOverdue, isOverdue } from '@/lib/rules/overdue';
import { attendancesForTicket, type TicketAttendance } from '@/lib/conversations/ticket-attendances';

export type TicketView = Ticket & { overdue: boolean; overdue_label: string | null };
export type TicketList = { tickets: TicketView[]; open: number; closed: number };
export type TicketDetail = { ticket: TicketView; events: TicketEvent[]; attendances: TicketAttendance[] };

const CLOSED = new Set(['resolved', 'closed']);

export const isClosed = (t: Pick<Ticket, 'status'>) => CLOSED.has(t.status);

function toView(t: Ticket, now: Date): TicketView {
  return { ...t, overdue: isOverdue(t, now), overdue_label: describeOverdue(t, now) };
}

/** Todos os chamados de um solicitante (em andamento e encerrados), pela borda do legado. */
export async function listTicketsOf(requesterId: string): Promise<TicketList> {
  const now = serverNow();
  const tickets = (await getTicketsClient().listByRequester(requesterId, 'all')).map((t) => toView(t, now));
  const closed = tickets.filter(isClosed).length;
  return { tickets, open: tickets.length - closed, closed };
}

/** Um chamado do solicitante com o histórico. Alheio ou inexistente → TicketsNotFoundError (404). */
export async function getTicketDetailOf(requesterId: string, code: string): Promise<TicketDetail> {
  const tickets = getTicketsClient();
  const [ticket, events, attendances] = await Promise.all([
    tickets.get(code, requesterId),
    tickets.events(code, requesterId),
    attendancesForTicket(requesterId, code),
  ]);
  return { ticket: toView(ticket, serverNow()), events, attendances };
}
