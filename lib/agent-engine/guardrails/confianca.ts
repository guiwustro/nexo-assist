/** Dúvida respondida sem nenhuma fonte não pode ter confiança alta. */
export function ajustarConfianca(
  declarada: number | null,
  sinais: { intent: string; sources_count: number },
): number | null {
  if (declarada === null) return null;
  if (sinais.intent === 'question' && sinais.sources_count === 0) return Math.min(declarada, 0.5);
  return declarada;
}
