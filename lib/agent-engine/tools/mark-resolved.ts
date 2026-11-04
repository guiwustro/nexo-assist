import { z } from 'zod';
import { defineTool } from './types';

export const markResolvedTool = defineTool({
  name: 'mark_resolved',
  description:
    'Registra que o funcionário confirmou que o problema foi resolvido e que este atendimento pode ser encerrado.',
  inputSchema: z.object({ summary: z.string().min(3).max(300) }),
  async run(ctx, input) {
    if (ctx.turn) ctx.turn.resolved = true;
    return { ok: true, summary: input.summary };
  },
  summary: () => 'funcionário confirmou que resolveu',
});
