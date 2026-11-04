import { normalize } from '@/lib/text/normalize';

const PROMISE_PATTERNS = [
  /\b(vou|irei|vamos) (te |lhe |voce )?(transferir|passar|encaminhar)\b/,
  /\bum (analista|atendente|tecnico) (vai|ira) (entrar em contato|falar|te atender|assumir|continuar)/,
  /\b(encaminhei|transferi|passei|repassei) (voce |seu caso |o caso |sua conversa )?(para|pra) (o |a |um |uma )?(suporte|analista|atendente|equipe|n1|n2)/,
  /\b(estou|to) (te )?(transferindo|encaminhando)\b/,
];

// Oferta condicional ("se preferir…", "caso continue…", "quer que eu…?") não é promessa: o funcionário decide.
const CONDITIONAL_PATTERN = /\b(se|caso|quer que|prefere|preferir|posso)\b/;

/** O texto afirma (não oferece) que um humano vai assumir. Avalia frase a frase; frase condicional ou pergunta não conta. */
export function promisedAnalyst(text: string): boolean {
  const sentences = normalize(text).match(/[^.!?]+[.!?]*/g) ?? [];
  return sentences.some((f) => {
    if (f.trim().endsWith('?') || CONDITIONAL_PATTERN.test(f)) return false;
    return PROMISE_PATTERNS.some((re) => re.test(f));
  });
}
