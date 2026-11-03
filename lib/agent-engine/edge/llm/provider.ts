import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { env } from '@/lib/env';
import { createScriptedModel, type Script, type ScriptedHooks } from './scripted-model';
import { SCRIPTS } from './scripts';

export type ModelInfo = { model: LanguageModelV4; provider: 'deepseek' | 'scripted'; model_id: string };

const g = globalThis as unknown as { __nexoModel?: ModelInfo };

/** Modelo do agent: DeepSeek real ou o roteirizado (testes, E2E e demo sem chave). */
export function getModel(): ModelInfo {
  if (g.__nexoModel) return g.__nexoModel;
  if (env.LLM_PROVIDER === 'deepseek') {
    const deepseek = createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY });
    g.__nexoModel = { model: deepseek(env.MODEL_ID) as LanguageModelV4, provider: 'deepseek', model_id: env.MODEL_ID };
  } else {
    g.__nexoModel = { model: createScriptedModel(SCRIPTS), provider: 'scripted', model_id: 'scripted-v1' };
  }
  return g.__nexoModel;
}

/** Só para testes: troca o modelo do processo (ex.: roteirizado com ganchos). */
export function setModelForTests(hooks?: ScriptedHooks, model?: LanguageModelV4, extraScripts: Script[] = []): void {
  g.__nexoModel =
    hooks || model || extraScripts.length
      ? { model: model ?? createScriptedModel([...extraScripts, ...SCRIPTS], hooks), provider: 'scripted', model_id: 'scripted-v1' }
      : undefined;
}
