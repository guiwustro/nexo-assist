import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '@/lib/contracts/enums';
import type { MessagePart } from '@/lib/contracts/parts';

/**
 * Os cards de uma mensagem em uma linha cada. Usado no console (o analista não vê os cards) e na chamada de
 * decisão (o modelo precisa saber o que foi mostrado, já que o texto não repete os cards).
 */
export function summarizeParts(parts: MessagePart[]): string[] {
  return parts.flatMap((p) => {
    if (p.kind === 'draft_card') return [`Rascunho ${p.code} · ${PRIORITY_LABEL[p.payload.priority]} · ${CATEGORY_LABEL[p.payload.category]}`];
    if (p.kind === 'ticket_card') return [`${p.ticket.code} · ${STATUS_LABEL[p.ticket.status]}${p.overdue ? ' · prazo vencido' : ''}`];
    if (p.kind === 'ticket_selector')
      return [`Mostrou ${p.tickets.length} chamados para escolher: ${p.tickets.map((t) => `${t.code} (${STATUS_LABEL[t.status]})`).join(', ')}`];
    if (p.kind === 'quick_replies') return [`Perguntou: ${p.question} (${p.options.join(' / ')})`];
    return [];
  });
}
