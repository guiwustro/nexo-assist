import { Agent } from '@mastra/core/agent';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { toMastraTools } from '@/lib/agent-engine/tools';
import { NEXO_INSTRUCTIONS } from './instructions';
import { getMemory } from './memory';

export function createNexoAgent(model: LanguageModelV4) {
  return new Agent({
    id: 'nexo-assist',
    name: 'Nexo Assist',
    instructions: NEXO_INSTRUCTIONS,
    model,
    tools: toMastraTools(),
    memory: getMemory(),
  });
}
