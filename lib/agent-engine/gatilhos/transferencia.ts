import type { Priority, ReasonCode, SupportLevel } from '@/lib/contracts/enums';
import { normalize } from '@/lib/text/normalize';

// Pessoa de outro setor ("a pessoa do RH") é redirecionamento, não pedido de analista de TI.
const OUTRO_SETOR = '(?! (do|da|de) (rh|recursos humanos|financeiro|facilities|dp|departamento pessoal|juridico)\\b)';
const HUMANO = `(analista|atendente|pessoa|humano|tecnico|alguem do suporte|suporte humano)\\b${OUTRO_SETOR}`;
// "quero/preciso de uma pessoa" aparece em pedidos de acesso ("preciso de uma pessoa nova no grupo"): só papéis de suporte.
const SUPORTE = `(analista|atendente|humano|alguem do suporte|suporte humano)\\b${OUTRO_SETOR}`;
const ART = '(um |uma |o |a )?';

const PEDIDOS = [
  new RegExp(`\\b(falar|conversar|fala|falo) com ${ART}${HUMANO}`),
  new RegExp(`\\b(passa|passe|transfere|transfira|transferir|encaminha|encaminhe|manda|mande) (pra|para) ${ART}${HUMANO}`),
  new RegExp(`\\b(quero|preciso de|chama|chame|cade) ${ART}${SUPORTE}`),
  new RegExp(`\\bme (transfere|transfira|transferir|passa|passe|encaminha|encaminhe)\\b`),
];

/** Pedido explícito de atendimento humano (regex sobre texto normalizado). Negado ("não quero falar…") não conta. */
export function pediuAnalista(texto: string): boolean {
  const t = normalize(texto);
  return PEDIDOS.some((re) => {
    const m = re.exec(t);
    if (!m) return false;
    const antes = t.slice(Math.max(0, m.index - 20), m.index);
    return !/\b(nao|nunca|sem)\b[^.,;!?]*$/.test(antes);
  });
}

export type EntradaGatilhos = {
  texto_funcionario: string;
  confidence: number | null;
  draft_priority?: Priority;
  overdue_ticket_code?: string;
  session_count: number;
  limit: number;
  threshold: number;
};

export type ResultadoGatilhos =
  | { transfer: false }
  | { transfer: true; reason: ReasonCode; level: SupportLevel; regra: string }
  | { offer: 'overdue'; ticket_code: string; regra: string };

/** Gatilhos de transferência avaliados depois do turno. A ordem é a precedência. */
export function avaliarGatilhos(i: EntradaGatilhos): ResultadoGatilhos {
  if (i.session_count >= i.limit) {
    return {
      transfer: true,
      reason: 'session_limit',
      level: 'N1',
      regra: `Limite da sessão: ${i.limit} mensagens, um analista continua o atendimento`,
    };
  }
  if (pediuAnalista(i.texto_funcionario)) {
    return {
      transfer: true,
      reason: 'requested_human',
      level: 'N1',
      regra: 'Pedido explícito: o funcionário pediu para falar com um analista',
    };
  }
  if (i.draft_priority === 'critical') {
    return {
      transfer: true,
      reason: 'critical_priority',
      level: 'N2',
      regra: 'Prioridade Crítica: algo parado para uma equipe ou para a empresa vai direto para o N2',
    };
  }
  if (i.confidence !== null && i.confidence < i.threshold) {
    const pct = Math.round(i.confidence * 100);
    return {
      transfer: true,
      reason: 'low_confidence',
      level: 'N1',
      regra: `Baixa confiança: ${pct}% está abaixo do limiar de ${Math.round(i.threshold * 100)}%`,
    };
  }
  if (i.overdue_ticket_code) {
    return {
      offer: 'overdue',
      ticket_code: i.overdue_ticket_code,
      regra: `Chamado vencido: ${i.overdue_ticket_code} passou do prazo, oferecer um analista`,
    };
  }
  return { transfer: false };
}

/** Nível do suporte para cada motivo. */
export const NIVEL_POR_MOTIVO: Record<ReasonCode, SupportLevel> = {
  session_limit: 'N1',
  budget_exceeded: 'N1',
  requested_human: 'N1',
  low_confidence: 'N1',
  critical_priority: 'N2',
  overdue_ticket: 'N2',
};
