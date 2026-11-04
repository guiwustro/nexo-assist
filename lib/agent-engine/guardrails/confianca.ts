/**
 * Dúvida respondida sem nenhuma fonte não pode ter confiança alta. Redirecionamento fora do escopo (RH, financeiro,
 * facilities) não entra: a base dele é a regra de escopo das instruções, não um artigo da central.
 */
export function ajustarConfianca(
  declarada: number | null,
  sinais: { intent: string; sources_count: number; action?: string },
): number | null {
  if (declarada === null) return null;
  if (sinais.action === 'redirect') return declarada;
  if (sinais.intent === 'question' && sinais.sources_count === 0) return Math.min(declarada, 0.5);
  return declarada;
}
