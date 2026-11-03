import { normalizar } from '@/lib/text/normalizar';

const PROMESSAS = [
  /\b(vou|irei|vamos) (te |lhe |voce )?(transferir|passar|encaminhar)\b/,
  /\bum (analista|atendente|tecnico) (vai|ira) (entrar em contato|falar|te atender|assumir|continuar)/,
  /\b(encaminhei|transferi|passei|repassei) (voce |seu caso |o caso |sua conversa )?(para|pra) (o |a |um |uma )?(suporte|analista|atendente|equipe|n1|n2)/,
  /\b(estou|to) (te )?(transferindo|encaminhando)\b/,
];

/** O texto afirma (não oferece) que um humano vai assumir. */
export function prometeuAnalista(texto: string): boolean {
  const t = normalizar(texto);
  return PROMESSAS.some((re) => re.test(t));
}
