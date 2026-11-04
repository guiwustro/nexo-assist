import { normalize } from '@/lib/text/normalize';

const AFIRMACOES = [
  /\b(abri|criei|registrei|abrimos|criamos|registramos) (o |um |seu )?(chamado|ticket)/,
  /\b(chamado|ticket) (inc-\d+ |req-\d+ )?(foi )?(criado|aberto|registrado)\b/,
];

/** O texto afirma que um chamado foi criado (só o clique em Confirmar cria). */
export function afirmouCriacao(texto: string): boolean {
  const t = normalize(texto);
  return AFIRMACOES.some((re) => {
    const m = re.exec(t);
    if (!m) return false;
    const antes = t.slice(Math.max(0, m.index - 12), m.index);
    return !/\b(nao|ainda nao|nunca)\s*$/.test(antes);
  });
}
