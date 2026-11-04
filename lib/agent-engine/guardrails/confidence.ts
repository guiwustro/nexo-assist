/**
 * Dúvida respondida sem nenhuma fonte não pode ter confiança alta. Redirecionamento fora do escopo (RH, financeiro,
 * facilities) não entra: a base dele é a regra de escopo das instruções, não um artigo da central.
 */
export function adjustConfidence(
  declared: number | null,
  signals: { intent: string; sources_count: number; action?: string },
): number | null {
  if (declared === null) return null;
  if (signals.action === 'redirect') return declared;
  if (signals.intent === 'question' && signals.sources_count === 0) return Math.min(declared, 0.5);
  return declared;
}
