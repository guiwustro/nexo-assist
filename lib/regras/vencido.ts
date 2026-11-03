import type { Ticket } from '@/lib/contracts/tickets';
import type { TicketStatus } from '@/lib/contracts/enums';

const STATUS_COM_PRAZO: ReadonlySet<TicketStatus> = new Set(['open', 'in_progress', 'awaiting_analyst', 'approved']);
const DIA = 24 * 3600_000;

/** Vencido = passou do prazo da próxima resposta (base: última atualização). */
export function estaVencido(t: Pick<Ticket, 'status' | 'due_at'>, agora: Date): boolean {
  if (!STATUS_COM_PRAZO.has(t.status)) return false;
  return agora.getTime() > new Date(t.due_at).getTime();
}

export function diasSemAtualizacao(t: Pick<Ticket, 'last_update_at'>, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(t.last_update_at).getTime()) / DIA);
}

/** "há 5 dias · prazo vencido", ou null quando não está vencido. */
export function descreverAtraso(t: Pick<Ticket, 'status' | 'due_at' | 'last_update_at'>, agora: Date): string | null {
  if (!estaVencido(t, agora)) return null;
  const dias = diasSemAtualizacao(t, agora);
  const quando = dias <= 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  return `${quando} · prazo vencido`;
}
