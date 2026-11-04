import { normalize } from '@/lib/text/normalize';

export type Article = { slug: string; title: string; body: string; tags: string[]; applies_to: string | null };

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'um', 'uma',
  'com', 'para', 'pra', 'por', 'que', 'qual', 'quais', 'meu', 'minha', 'meus', 'minhas', 'se', 'eu', 'me',
  'ao', 'aos', 'como', 'esta', 'estou', 'ta', 'e', 'é', 'nao', 'sim', 'ja', 'mais', 'muito', 'isso', 'ele', 'ela',
]);

export function tokenizar(texto: string): string[] {
  return normalize(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Abaixo desta fração do melhor score o artigo é ruído (ex.: casou só a palavra "erro"). */
const RELEVANCIA_MINIMA = 0.4;

/** Busca simples por palavras: 3×tags + 2×título + 1×corpo por token da consulta. */
export function buscarArtigos(consulta: string, artigos: Article[], limite = 3): Array<Article & { score: number }> {
  const tokens = [...new Set(tokenizar(consulta))];
  if (tokens.length === 0) return [];
  return artigos
    .map((a) => {
      const tags = new Set(a.tags.flatMap((t) => tokenizar(t)));
      const titulo = new Set(tokenizar(a.title));
      const corpo = new Set(tokenizar(a.body));
      const score = tokens.reduce(
        (s, t) => s + (tags.has(t) ? 3 : 0) + (titulo.has(t) ? 2 : 0) + (corpo.has(t) ? 1 : 0),
        0,
      );
      return { ...a, score };
    })
    .filter((a) => a.score > 0)
    .sort((x, y) => y.score - x.score)
    .filter((a, _i, todos) => a.score >= todos[0]!.score * RELEVANCIA_MINIMA)
    .slice(0, limite);
}
