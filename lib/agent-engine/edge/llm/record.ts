import { getDb } from '@/lib/db/client';
import { llmCalls } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { custoEmCentavos } from './cost';

export type LlmCallRecord = {
  agent_run_id?: string | null;
  purpose: 'agent_turn' | 'decision' | 'summary';
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  latency_ms: number;
};

export function precoAtual(): { in?: number; out?: number } {
  return { in: env.LLM_PRICE_IN_CENTS_PER_MTOK, out: env.LLM_PRICE_OUT_CENTS_PER_MTOK };
}

/** Uma linha em llm_calls por chamada de modelo, com custo (ou null quando o preço não é conhecido). */
export async function recordLlmCall(c: LlmCallRecord): Promise<number | null> {
  const cost_cents = custoEmCentavos({ input_tokens: c.input_tokens, output_tokens: c.output_tokens }, precoAtual());
  await getDb()
    .insert(llmCalls)
    .values({
      agent_run_id: c.agent_run_id ?? null,
      purpose: c.purpose,
      provider: c.provider,
      model: c.model,
      input_tokens: c.input_tokens,
      output_tokens: c.output_tokens,
      cache_read_tokens: c.cache_read_tokens ?? 0,
      cost_cents,
      latency_ms: c.latency_ms,
    });
  return cost_cents;
}
