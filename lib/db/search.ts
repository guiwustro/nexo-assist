import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { fold } from '@/lib/text/matches';

// Acentos do português (maiúsculos e minúsculos) → letra sem acento. Sem depender da extensão `unaccent`.
const ACCENTED = 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ';
const UNACCENTED = 'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnn';

/** A coluna minúscula e sem acento, para comparar com um termo passado por `padraoDeBusca`. */
export function unaccented(col: SQLWrapper): SQL {
  return sql`lower(translate(${col}, ${ACCENTED}, ${UNACCENTED}))`;
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\-]/g;
const WORD_CHAR = /[a-z0-9]/;

/**
 * Regex (Postgres, `~`) que casa o termo no começo de uma palavra: "ana" acha "Ana Souza", não "Mariana".
 * Com `inteira`, o termo tem de ser a palavra toda: "ana" não acha "analista".
 */
export function searchPattern(term: string, opts: { wholeWord?: boolean } = {}): string | null {
  const t = fold(term.trim()).replace(/\s+/g, ' ');
  if (!t) return null;
  const body = t.replace(REGEX_SPECIAL, '\\$&');
  const start = WORD_CHAR.test(t[0]!) ? '\\m' : '';
  const end = opts.wholeWord && WORD_CHAR.test(t[t.length - 1]!) ? '\\M' : '';
  return `${start}${body}${end}`;
}

/** Termos curtos no meio do texto viram ruído ("ana" → "analista"): até 3 caracteres, só a palavra inteira. */
export function isShortTerm(term: string): boolean {
  return fold(term.trim()).length <= 3;
}
