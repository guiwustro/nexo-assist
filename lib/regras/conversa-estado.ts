import type { ConversationStatus } from '@/lib/contracts/enums';

export type ConversationEvent = 'transfer' | 'claim' | 'release' | 'close' | 'employee_message';

/** Quem fala com o funcionário: o agent (ai_handling) ou um analista (pending → claimed). */
const TABELA: Record<ConversationStatus, Partial<Record<ConversationEvent, ConversationStatus>>> = {
  ai_handling: { transfer: 'pending', claim: 'claimed', employee_message: 'ai_handling' },
  pending: { claim: 'claimed', release: 'ai_handling', close: 'closed', employee_message: 'pending' },
  claimed: { release: 'ai_handling', close: 'closed', employee_message: 'claimed' },
  closed: { employee_message: 'ai_handling' },
};

export function transicao(
  estado: ConversationStatus,
  evento: ConversationEvent,
): { ok: true; next: ConversationStatus } | { ok: false; code: 'invalid_transition' } {
  const next = TABELA[estado][evento];
  return next ? { ok: true, next } : { ok: false, code: 'invalid_transition' };
}
