import type { Priority, ReasonCode, SupportLevel } from '@/lib/contracts/enums';
import { normalizar } from '@/lib/text/normalizar';

const HUMANO = '(analista|atendente|pessoa|humano|tecnico|alguem do suporte|suporte humano)';
const ART = '(um |uma |o |a )?';

const PEDIDOS = [
  new RegExp(`\\b(falar|conversar|fala|falo) com ${ART}${HUMANO}`),
  new RegExp(`\\b(passa|passe|transfere|transfira|transferir|encaminha|encaminhe|manda|mande) (pra|para) ${ART}${HUMANO}`),
  new RegExp(`\\b(quero|preciso de|chama|chame|cade) ${ART}${HUMANO}`),
  new RegExp(`\\bme (transfere|transfira|transferir|passa|passe|encaminha|encaminhe)\\b`),
];

/** Pedido explícito de atendimento humano (regex sobre texto normalizado). */
export function pediuAnalista(texto: string): boolean {
  const t = normalizar(texto);
  return PEDIDOS.some((re) => re.test(t));
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
  requested_human: 'N1',
  low_confidence: 'N1',
  critical_priority: 'N2',
  overdue_ticket: 'N2',
};
