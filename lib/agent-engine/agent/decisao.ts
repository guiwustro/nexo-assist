import { generateText, Output } from 'ai';
import { TurnDecisionSchema, type ActionTrace, type TurnDecision } from '@/lib/contracts/decision';
import { decisionPrompt } from '@/lib/agent-engine/edge/llm/scripted-model';
import { recordLlmCall } from '@/lib/agent-engine/edge/llm/record';
import type { ModelInfo } from '@/lib/agent-engine/edge/llm/provider';

const FORMATO = `Formato (JSON):
{"understanding":{"intent":"question|status|complement|open_ticket|talk_to_human|out_of_scope|other","summary":"o que entendeu, em uma frase","evidence":"trecho LITERAL da fala do funcionário"},
 "decision":{"action":"answer|ask|draft_create|draft_update|reopen|transfer|redirect","confidence":0.0-1.0,"why":"por quê, em linguagem simples","rules_applied":["regras do service desk que pesaram"],"sources":[{"kind":"article|ticket","id":"slug ou código","title":"título"}]}}`;

/**
 * Chamada de fechamento do turno: o modelo declara o que entendeu, o que fez, com que confiança e por quê.
 * Erro ou JSON inválido → null ("o agent não registrou"), nunca um objeto inventado.
 */
export async function declararDecisao(i: {
  employee_text: string;
  actions: ActionTrace[];
  answer_text: string;
  model: ModelInfo;
  agent_run_id: string;
}): Promise<TurnDecision | null> {
  const t0 = Date.now();
  try {
    const r = await generateText({
      model: i.model.model,
      output: Output.object({ schema: TurnDecisionSchema }),
      temperature: 0,
      maxRetries: 0,
      messages: [
        {
          role: 'user',
          content: `${decisionPrompt({ employee_text: i.employee_text, actions: i.actions, answer_text: i.answer_text })}\n\n${FORMATO}`,
        },
      ],
    });
    await recordLlmCall({
      agent_run_id: i.agent_run_id,
      purpose: 'decision',
      provider: i.model.provider,
      model: i.model.model_id,
      input_tokens: r.usage.inputTokens ?? 0,
      output_tokens: r.usage.outputTokens ?? 0,
      latency_ms: Date.now() - t0,
    });
    const parsed = TurnDecisionSchema.safeParse(r.output);
    return parsed.success ? parsed.data : null;
  } catch {
    await recordLlmCall({
      agent_run_id: i.agent_run_id,
      purpose: 'decision',
      provider: i.model.provider,
      model: i.model.model_id,
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: Date.now() - t0,
    }).catch(() => {});
    return null;
  }
}
