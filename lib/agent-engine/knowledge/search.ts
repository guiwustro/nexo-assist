import { normalize } from '@/lib/text/normalize';

export type Article = { slug: string; title: string; body: string; tags: string[]; applies_to: string | null };

const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'um', 'uma',
  'com', 'para', 'pra', 'por', 'que', 'qual', 'quais', 'meu', 'minha', 'meus', 'minhas', 'se', 'eu', 'me',
  'ao', 'aos', 'como', 'esta', 'estou', 'ta', 'e', 'é', 'nao', 'sim', 'ja', 'mais', 'muito', 'isso', 'ele', 'ela',
]);

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Abaixo desta fração do melhor score o artigo é ruído (ex.: casou só a palavra "erro"). */
const MIN_RELEVANCE = 0.4;

/** Busca simples por palavras: 3×tags + 2×título + 1×corpo por token da consulta. */
export function searchArticles(query: string, articles: Article[], limit = 3): Array<Article & { score: number }> {
  const tokens = [...new Set(tokenize(query))];
  if (tokens.length === 0) return [];
  return articles
    .map((a) => {
      const tags = new Set(a.tags.flatMap((t) => tokenize(t)));
      const title = new Set(tokenize(a.title));
      const body = new Set(tokenize(a.body));
      const score = tokens.reduce(
        (s, t) => s + (tags.has(t) ? 3 : 0) + (title.has(t) ? 2 : 0) + (body.has(t) ? 1 : 0),
        0,
      );
      return { ...a, score };
    })
    .filter((a) => a.score > 0)
    .sort((x, y) => y.score - x.score)
    .filter((a, _i, showAll) => a.score >= showAll[0]!.score * MIN_RELEVANCE)
    .slice(0, limit);
}
