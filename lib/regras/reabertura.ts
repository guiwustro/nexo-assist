import type { Ticket } from '@/lib/contracts/tickets';

export const JANELA_REABERTURA_MS = 7 * 24 * 3600_000;

/** Anexo A: só reabre chamado resolvido há no máximo 7 dias. */
export function podeReabrir(t: Pick<Ticket, 'status' | 'resolved_at'>, agora: Date): { ok: boolean; regra: string } {
  if (t.status !== 'resolved' || !t.resolved_at) {
    return { ok: false, regra: 'Reabertura: só chamados resolvidos podem ser reabertos (até 7 dias)' };
  }
  const passou = agora.getTime() - new Date(t.resolved_at).getTime();
  if (passou <= JANELA_REABERTURA_MS) {
    return { ok: true, regra: 'Reabertura: resolvido há no máximo 7 dias, pode ser reaberto' };
  }
  return { ok: false, regra: 'Reabertura: resolvido há mais de 7 dias, abrir um chamado novo' };
}
