/** Custo em centavos de dólar. Preço desconhecido → null (nunca 0: "não medido" ≠ "de graça"). */
export function custoEmCentavos(
  usage: { input_tokens: number; output_tokens: number },
  precos: { in?: number; out?: number },
): number | null {
  if (precos.in === undefined || precos.out === undefined) return null;
  const c = (usage.input_tokens * precos.in + usage.output_tokens * precos.out) / 1_000_000;
  return Math.round(c * 10_000) / 10_000;
}
