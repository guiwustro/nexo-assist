import { normalizar } from '@/lib/text/normalizar';

const PROMESSAS = [
  /\b(vou|irei|vamos) (te |lhe |voce )?(transferir|passar|encaminhar)\b/,
  /\bum (analista|atendente|tecnico) (vai|ira) (entrar em contato|falar|te atender|assumir|continuar)/,
  /\b(encaminhei|transferi|passei|repassei) (voce |seu caso |o caso |sua conversa )?(para|pra) (o |a |um |uma )?(suporte|analista|atendente|equipe|n1|n2)/,
  /\b(estou|to) (te )?(transferindo|encaminhando)\b/,
];

// Oferta condicional ("se preferir…", "caso continue…", "quer que eu…?") não é promessa: o funcionário decide.
const CONDICIONAL = /\b(se|caso|quer que|prefere|preferir|posso)\b/;

/** O texto afirma (não oferece) que um humano vai assumir. Avalia frase a frase; frase condicional ou pergunta não conta. */
export function prometeuAnalista(texto: string): boolean {
  const frases = normalizar(texto).match(/[^.!?]+[.!?]*/g) ?? [];
  return frases.some((f) => {
    if (f.trim().endsWith('?') || CONDICIONAL.test(f)) return false;
    return PROMESSAS.some((re) => re.test(f));
  });
}
