import type { Ticket } from '@/lib/contracts/tickets';
import type { TicketStatus } from '@/lib/contracts/enums';

const STATUSES_WITH_DEADLINE: ReadonlySet<TicketStatus> = new Set(['open', 'in_progress', 'awaiting_analyst', 'approved']);
const DAY = 24 * 3600_000;

/** Vencido = passou do prazo da próxima resposta (base: última atualização). */
export function isOverdue(t: Pick<Ticket, 'status' | 'due_at'>, now: Date): boolean {
  if (!STATUSES_WITH_DEADLINE.has(t.status)) return false;
  return now.getTime() > new Date(t.due_at).getTime();
}

export function daysSinceUpdate(t: Pick<Ticket, 'last_update_at'>, now: Date): number {
  return Math.floor((now.getTime() - new Date(t.last_update_at).getTime()) / DAY);
}

/** "há 5 dias · prazo vencido", ou null quando não está vencido. */
export function describeOverdue(t: Pick<Ticket, 'status' | 'due_at' | 'last_update_at'>, now: Date): string | null {
  if (!isOverdue(t, now)) return null;
  const days = daysSinceUpdate(t, now);
  const ago = days <= 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;
  return `${ago} · prazo vencido`;
}
