const MARCAS = /[̀-ͯ]/g;

/** Minúsculo e sem acento, mantendo espaços (base da busca de trechos). */
export function dobrar(texto: string): string {
  return texto.normalize('NFD').replace(MARCAS, '').toLowerCase();
}

/**
 * Onde `termo` aparece em `texto`, ignorando acento e caixa. Os pares `[início, fim)` são índices do
 * texto **original**, para destacar o trecho como ele foi escrito.
 */
export function acharTrechos(texto: string, termo: string): Array<[number, number]> {
  const alvo = dobrar(termo.trim());
  if (!alvo) return [];

  // Texto dobrado caractere a caractere, guardando de qual índice original veio cada caractere.
  let dobrado = '';
  const origem: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const d = dobrar(texto[i]!);
    for (const c of d) {
      dobrado += c;
      origem.push(i);
    }
  }

  const achados: Array<[number, number]> = [];
  let de = 0;
  for (;;) {
    const at = dobrado.indexOf(alvo, de);
    if (at < 0) break;
    const fimDobrado = at + alvo.length;
    let fim = origem[fimDobrado - 1]! + 1;
    // Acentos decompostos (NFD) logo depois do trecho pertencem a ele.
    while (fim < texto.length && dobrar(texto[fim]!) === '') fim++;
    achados.push([origem[at]!, fim]);
    de = fimDobrado;
  }
  return achados;
}

export function contem(texto: string, termo: string): boolean {
  return acharTrechos(texto, termo).length > 0;
}
