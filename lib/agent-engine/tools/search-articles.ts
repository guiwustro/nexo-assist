import { z } from 'zod';
import { searchArticles } from '@/lib/agent-engine/knowledge/search';
import { defineTool } from './types';

export const searchArticlesTool = defineTool({
  name: 'search_articles',
  description:
    'Busca na central de ajuda. Use para dúvidas e antes de abrir chamado: se um artigo resolve, responda com ele (atenção ao campo applies_to, ex.: só Windows 10).',
  inputSchema: z.object({ query: z.string().min(2).max(200) }),
  async run(ctx, input) {
    const found = searchArticles(input.query, await ctx.articles(), 3);
    for (const a of found) ctx.turn?.sources.push({ kind: 'article', id: a.slug, title: a.title });
    return { articles: found.map(({ slug, title, body, applies_to }) => ({ slug, title, body, applies_to })) };
  },
  summary(output) {
    const o = output as { articles: Array<{ title: string }> };
    return o.articles.length ? o.articles.map((a) => a.title).join(' · ') : 'nenhum artigo relacionado';
  },
});
