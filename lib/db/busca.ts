import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { dobrar } from '@/lib/text/trechos';

// Acentos do português (maiúsculos e minúsculos) → letra sem acento. Sem depender da extensão `unaccent`.
const DE = 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ';
const PARA = 'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnn';

/** A coluna minúscula e sem acento, para comparar com um termo passado por `padraoDeBusca`. */
export function semAcento(col: SQLWrapper): SQL {
  return sql`lower(translate(${col}, ${DE}, ${PARA}))`;
}

const ESPECIAIS = /[.*+?^${}()|[\]\\-]/g;
const PALAVRA = /[a-z0-9]/;

/**
 * Regex (Postgres, `~`) que casa o termo no começo de uma palavra: "ana" acha "Ana Souza", não "Mariana".
 * Com `inteira`, o termo tem de ser a palavra toda: "ana" não acha "analista".
 */
export function padraoDeBusca(termo: string, opts: { inteira?: boolean } = {}): string | null {
  const t = dobrar(termo.trim()).replace(/\s+/g, ' ');
  if (!t) return null;
  const corpo = t.replace(ESPECIAIS, '\\$&');
  const inicio = PALAVRA.test(t[0]!) ? '\\m' : '';
  const fim = opts.inteira && PALAVRA.test(t[t.length - 1]!) ? '\\M' : '';
  return `${inicio}${corpo}${fim}`;
}

/** Termos curtos no meio do texto viram ruído ("ana" → "analista"): até 3 caracteres, só a palavra inteira. */
export function termoCurto(termo: string): boolean {
  return dobrar(termo.trim()).length <= 3;
}
