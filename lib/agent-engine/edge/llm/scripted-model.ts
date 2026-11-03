import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import type { ActionTrace, TurnDecision } from '@/lib/contracts/decision';

export type ToolResultView = { toolName: string; output: unknown };
export type StepCtx = { match: RegExpMatchArray; text: string; results: ToolResultView[] };

export type ScriptStep = {
  tool_calls?: Array<{ name: string; args: unknown | ((c: StepCtx) => unknown) }> | ((c: StepCtx) => Array<{ name: string; args: unknown }>);
  text?: string | ((c: StepCtx) => string);
};

export type Script = {
  id: string;
  match: RegExp;
  steps: ScriptStep[];
  decision: TurnDecision | 'invalid' | ((c: { text: string }) => TurnDecision);
};

export type ScriptedHooks = {
  /** Chamado antes de cada passo do turno (testes usam para simular um analista assumindo no meio). */
  onStep?: (scriptId: string, step: number) => Promise<void> | void;
};

const DECISION_OPEN = '<mensagem_do_funcionario>';
const DECISION_CLOSE = '</mensagem_do_funcionario>';

/** Prompt da chamada de fechamento (decisão do turno). O modelo roteirizado acha a fala do funcionário pelas tags. */
export function decisionPrompt(i: { employee_text: string; actions: ActionTrace[]; answer_text: string }): string {
  const acoes = i.actions.length
    ? i.actions.map((a) => `- ${a.label} (${a.tool}): ${a.result} · ${a.summary}`).join('\n')
    : '- nenhuma ferramenta usada';
  return [
    'Registre a decisão deste turno do Nexo Assist, em JSON no formato pedido.',
    'Use as palavras do funcionário como evidência (trecho literal, sem parafrasear).',
    `${DECISION_OPEN}${i.employee_text}${DECISION_CLOSE}`,
    `Ações executadas:\n${acoes}`,
    `Resposta enviada ao funcionário:\n${i.answer_text}`,
  ].join('\n\n');
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p: { type?: string; text?: string }) => (p.type === 'text' ? (p.text ?? '') : ''))
    .join('');
}

function lastUserIndex(prompt: LanguageModelV4Prompt): number {
  for (let i = prompt.length - 1; i >= 0; i--) if (prompt[i]!.role === 'user') return i;
  return -1;
}

function toolResultsAfter(prompt: LanguageModelV4Prompt, from: number): ToolResultView[] {
  const out: ToolResultView[] = [];
  for (const m of prompt.slice(from + 1)) {
    if (m.role !== 'tool') continue;
    for (const p of m.content) {
      if (p.type !== 'tool-result') continue;
      const o = p.output as { type: string; value?: unknown };
      let value: unknown = o.value;
      if (o.type === 'text' && typeof o.value === 'string') {
        try {
          value = JSON.parse(o.value);
        } catch {
          value = o.value;
        }
      }
      out.push({ toolName: p.toolName, output: value });
    }
  }
  return out;
}

function usage(inTok: number, outTok: number): LanguageModelV4Usage {
  return {
    inputTokens: { total: inTok, noCache: inTok, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: outTok, text: outTok, reasoning: 0 },
  };
}

const approxTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

type Plan = { content: LanguageModelV4Content[]; text: string; finish: 'stop' | 'tool-calls' };

function chunks(s: string, n = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

/**
 * Modelo de linguagem determinístico: pela última fala do funcionário escolhe um roteiro e, pelo número de
 * respostas do assistente já dadas depois dela, sabe em que passo está. Exercita o pipeline real (tools,
 * stream, persistência, UI); só a "inteligência" é falsa — a real é medida nos evals.
 */
export function createScriptedModel(scripts: Script[], hooks: ScriptedHooks = {}): LanguageModelV4 {
  const fallback = scripts.find((s) => s.id === 'fallback');
  let seq = 0;

  const pick = (text: string): { script: Script; match: RegExpMatchArray } | null => {
    for (const s of scripts) {
      if (s.id === 'fallback') continue;
      const m = text.match(s.match);
      if (m) return { script: s, match: m };
    }
    if (!fallback) return null;
    return { script: fallback, match: text.match(/[\s\S]*/)! };
  };

  async function plan(opts: LanguageModelV4CallOptions): Promise<Plan> {
    const prompt = opts.prompt;
    const ui = lastUserIndex(prompt);
    const userText = ui >= 0 ? textOf(prompt[ui]!.content) : '';

    if (opts.responseFormat?.type === 'json') {
      const a = userText.indexOf(DECISION_OPEN);
      const b = userText.indexOf(DECISION_CLOSE);
      const employee = a >= 0 && b > a ? userText.slice(a + DECISION_OPEN.length, b) : userText;
      const chosen = pick(employee.trim());
      const d = chosen?.script.decision;
      const json =
        d === undefined || d === 'invalid'
          ? '{"isto não é": json válido'
          : JSON.stringify(typeof d === 'function' ? d({ text: employee.trim() }) : d);
      return { content: [{ type: 'text', text: json }], text: json, finish: 'stop' };
    }

    const chosen = pick(userText.trim());
    if (!chosen) return { content: [{ type: 'text', text: '' }], text: '', finish: 'stop' };
    const step = prompt.slice(ui + 1).filter((m) => m.role === 'assistant').length;
    await hooks.onStep?.(chosen.script.id, step);
    const ctx: StepCtx = { match: chosen.match, text: userText.trim(), results: toolResultsAfter(prompt, ui) };
    const s = chosen.script.steps[step];
    if (!s) return { content: [{ type: 'text', text: '' }], text: '', finish: 'stop' };

    const calls = typeof s.tool_calls === 'function' ? s.tool_calls(ctx) : (s.tool_calls ?? []);
    const text = typeof s.text === 'function' ? s.text(ctx) : (s.text ?? '');
    if (calls.length > 0) {
      // Como o modelo real: o passo pode trazer um texto curto antes das tool calls.
      return {
        content: [
          ...(text ? [{ type: 'text' as const, text }] : []),
          ...calls.map((c, i) => ({
            type: 'tool-call' as const,
            toolCallId: `call_${++seq}_${step}_${i}`,
            toolName: c.name,
            input: JSON.stringify(typeof c.args === 'function' ? (c.args as (x: StepCtx) => unknown)(ctx) : c.args),
          })),
        ],
        text,
        finish: 'tool-calls',
      };
    }
    return { content: [{ type: 'text', text }], text, finish: 'stop' };
  }

  const promptSize = (p: LanguageModelV4Prompt) => approxTokens(JSON.stringify(p));

  return new MockLanguageModelV4({
    provider: 'scripted',
    modelId: 'scripted-v1',
    doGenerate: async (opts) => {
      const p = await plan(opts);
      return {
        content: p.content,
        finishReason: { unified: p.finish, raw: p.finish },
        usage: usage(promptSize(opts.prompt), approxTokens(p.text || JSON.stringify(p.content))),
        warnings: [],
      };
    },
    doStream: async (opts) => {
      const p = await plan(opts);
      const parts: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];
      for (const c of p.content) {
        if (c.type === 'text') {
          const id = `t_${++seq}`;
          parts.push({ type: 'text-start', id });
          for (const d of chunks(c.text)) parts.push({ type: 'text-delta', id, delta: d });
          parts.push({ type: 'text-end', id });
        } else if (c.type === 'tool-call') {
          parts.push(c);
        }
      }
      parts.push({
        type: 'finish',
        finishReason: { unified: p.finish, raw: p.finish },
        usage: usage(promptSize(opts.prompt), approxTokens(p.text || JSON.stringify(p.content))),
      });
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(ctrl) {
            for (const part of parts) ctrl.enqueue(part);
            ctrl.close();
          },
        }),
      };
    },
  });
}
