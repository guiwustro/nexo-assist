import type { Priority, ReasonCode, SupportLevel } from '@/lib/contracts/enums';
import { normalize } from '@/lib/text/normalize';

// Pessoa de outro setor ("a pessoa do RH") é redirecionamento, não pedido de analista de TI.
const OTHER_DEPARTMENT = '(?! (do|da|de) (rh|recursos humanos|financeiro|facilities|dp|departamento pessoal|juridico)\\b)';
const HUMAN_PATTERN = `(analista|atendente|pessoa|humano|tecnico|alguem do suporte|suporte humano)\\b${OTHER_DEPARTMENT}`;
// "quero/preciso de uma pessoa" aparece em pedidos de acesso ("preciso de uma pessoa nova no grupo"): só papéis de suporte.
const SUPPORT_PATTERN = `(analista|atendente|humano|alguem do suporte|suporte humano)\\b${OTHER_DEPARTMENT}`;
const ART = '(um |uma |o |a )?';

const REQUEST_PATTERNS = [
  new RegExp(`\\b(falar|conversar|fala|falo) com ${ART}${HUMAN_PATTERN}`),
  new RegExp(`\\b(passa|passe|transfere|transfira|transferir|encaminha|encaminhe|manda|mande) (pra|para) ${ART}${HUMAN_PATTERN}`),
  new RegExp(`\\b(quero|preciso de|chama|chame|cade) ${ART}${SUPPORT_PATTERN}`),
  new RegExp(`\\bme (transfere|transfira|transferir|passa|passe|encaminha|encaminhe)\\b`),
];

/** Pedido explícito de atendimento humano (regex sobre texto normalizado). Negado ("não quero falar…") não conta. */
export function askedForAnalyst(text: string): boolean {
  const t = normalize(text);
  return REQUEST_PATTERNS.some((re) => {
    const m = re.exec(t);
    if (!m) return false;
    const before = t.slice(Math.max(0, m.index - 20), m.index);
    return !/\b(nao|nunca|sem)\b[^.,;!?]*$/.test(before);
  });
}

export type TriggerInput = {
  employee_text: string;
  confidence: number | null;
  draft_priority?: Priority;
  overdue_ticket_code?: string;
  session_count: number;
  limit: number;
  threshold: number;
};

export type TriggerResult =
  | { transfer: false }
  | { transfer: true; reason: ReasonCode; level: SupportLevel; rule: string }
  | { offer: 'overdue'; ticket_code: string; rule: string };

/** Gatilhos de transferência avaliados depois do turno. A ordem é a precedência. */
export function evaluateTriggers(i: TriggerInput): TriggerResult {
  if (i.session_count >= i.limit) {
    return {
      transfer: true,
      reason: 'session_limit',
      level: 'N1',
      rule: `Limite da sessão: ${i.limit} mensagens, um analista continua o atendimento`,
    };
  }
  if (askedForAnalyst(i.employee_text)) {
    return {
      transfer: true,
      reason: 'requested_human',
      level: 'N1',
      rule: 'Pedido explícito: o funcionário pediu para falar com um analista',
    };
  }
  if (i.draft_priority === 'critical') {
    return {
      transfer: true,
      reason: 'critical_priority',
      level: 'N2',
      rule: 'Prioridade Crítica: algo parado para uma equipe ou para a empresa vai direto para o N2',
    };
  }
  if (i.confidence !== null && i.confidence < i.threshold) {
    const pct = Math.round(i.confidence * 100);
    return {
      transfer: true,
      reason: 'low_confidence',
      level: 'N1',
      rule: `Baixa confiança: ${pct}% está abaixo do limiar de ${Math.round(i.threshold * 100)}%`,
    };
  }
  if (i.overdue_ticket_code) {
    return {
      offer: 'overdue',
      ticket_code: i.overdue_ticket_code,
      rule: `Chamado vencido: ${i.overdue_ticket_code} passou do prazo, oferecer um analista`,
    };
  }
  return { transfer: false };
}

/** Nível do suporte para cada motivo. */
export const LEVEL_BY_REASON: Record<ReasonCode, SupportLevel> = {
  session_limit: 'N1',
  budget_exceeded: 'N1',
  requested_human: 'N1',
  low_confidence: 'N1',
  critical_priority: 'N2',
  overdue_ticket: 'N2',
};
