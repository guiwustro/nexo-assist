import { z } from 'zod';
import { defineTool } from './types';

export const offerOptionsTool = defineTool({
  name: 'offer_options',
  description:
    'Mostra uma pergunta com 2 a 4 opções rápidas clicáveis. Use quando faltar um campo do chamado (ex.: quem está afetado: "Só eu", "Minha equipe", "Toda a empresa", "Não sei").',
  inputSchema: z.object({
    question: z.string().min(3).max(160),
    options: z.array(z.string().min(1).max(60)).min(2).max(4),
  }),
  async run(ctx, input) {
    ctx.emitPart({ kind: 'quick_replies', question: input.question, options: input.options });
    return { shown: true };
  },
  summary: () => 'opções mostradas',
});
