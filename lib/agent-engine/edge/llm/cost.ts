/** Custo em centavos de dólar. Preço desconhecido → null (nunca 0: "não medido" ≠ "de graça"). */
export function costInCents(
  usage: { input_tokens: number; output_tokens: number },
  prices: { in?: number; out?: number },
): number | null {
  if (prices.in === undefined || prices.out === undefined) return null;
  const c = (usage.input_tokens * prices.in + usage.output_tokens * prices.out) / 1_000_000;
  return Math.round(c * 10_000) / 10_000;
}
