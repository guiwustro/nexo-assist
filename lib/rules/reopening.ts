import type { Ticket } from '@/lib/contracts/tickets';

export const REOPEN_WINDOW_MS = 7 * 24 * 3600_000;

/** Anexo A: só reabre chamado resolvido há no máximo 7 dias. */
export function canReopen(t: Pick<Ticket, 'status' | 'resolved_at'>, now: Date): { ok: boolean; rule: string } {
  if (t.status !== 'resolved' || !t.resolved_at) {
    return { ok: false, rule: 'Reabertura: só chamados resolvidos podem ser reabertos (até 7 dias)' };
  }
  const passed = now.getTime() - new Date(t.resolved_at).getTime();
  if (passed <= REOPEN_WINDOW_MS) {
    return { ok: true, rule: 'Reabertura: resolvido há no máximo 7 dias, pode ser reaberto' };
  }
  return { ok: false, rule: 'Reabertura: resolvido há mais de 7 dias, abrir um chamado novo' };
}
