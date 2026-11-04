const COMBINING_MARKS = /[̀-ͯ]/g;

/** Minúsculo e sem acento, mantendo espaços (base da busca de trechos). */
export function fold(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * Onde `termo` aparece em `texto`, ignorando acento e caixa. Os pares `[início, fim)` são índices do
 * texto **original**, para destacar o trecho como ele foi escrito.
 */
export function findMatches(text: string, term: string): Array<[number, number]> {
  const target = fold(term.trim());
  if (!target) return [];

  // Texto dobrado caractere a caractere, guardando de qual índice original veio cada caractere.
  let folded = '';
  const sourceIndex: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const d = fold(text[i]!);
    for (const c of d) {
      folded += c;
      sourceIndex.push(i);
    }
  }

  const matches: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const at = folded.indexOf(target, from);
    if (at < 0) break;
    const foldedEnd = at + target.length;
    let end = sourceIndex[foldedEnd - 1]! + 1;
    // Acentos decompostos (NFD) logo depois do trecho pertencem a ele.
    while (end < text.length && fold(text[end]!) === '') end++;
    matches.push([sourceIndex[at]!, end]);
    from = foldedEnd;
  }
  return matches;
}

export function containsTerm(text: string, term: string): boolean {
  return findMatches(text, term).length > 0;
}
