import { describe, expect, it } from 'vitest';
import { generateText, isStepCount, Output, tool } from 'ai';
import { z } from 'zod';
import { createScriptedModel, decisionPrompt } from '@/lib/agent-engine/edge/llm/scripted-model';
import { SCRIPTS } from '@/lib/agent-engine/edge/llm/scripts';
import { TurnDecisionSchema } from '@/lib/contracts/decision';

const stub = (result: unknown = { ok: true }) =>
  tool({ inputSchema: z.record(z.string(), z.unknown()), execute: async () => result });
const tools = {
  buscar_meus_chamados: stub([]),
  buscar_artigos: stub([{ slug: 'vpn-erro-809' }]),
  oferecer_opcoes: stub({ shown: true }),
  ver_chamado: stub({ found: false }),
  montar_rascunho: stub({ draft_code: 'D-381' }),
};

const run = (text: string) =>
  generateText({
    model: createScriptedModel(SCRIPTS),
    tools,
    messages: [{ role: 'user', content: text }],
    stopWhen: isStepCount(5),
  });

describe('modelo roteirizado', () => {
  it('VPN 809: consulta chamados e artigos, depois oferece opções', async () => {
    const r = await run('VPN com erro 809');
    expect(r.steps[0]?.toolCalls.map((c) => c.toolName)).toEqual(['buscar_meus_chamados', 'buscar_artigos']);
    expect(r.steps[1]?.toolCalls[0]?.toolName).toBe('oferecer_opcoes');
    expect(r.steps[1]?.toolCalls[0]?.input).toMatchObject({ options: ['Windows 10', 'Windows 11'] });
    expect(r.text.length).toBeGreaterThan(10);
  });

  it('sem roteiro → texto do fallback', async () => {
    const r = await run('bom dia, tudo bem?');
    expect(r.steps[0]?.toolCalls).toHaveLength(0);
    expect(r.text).toMatch(/me contar/);
  });

  it('código de chamado vira ver_chamado com o código capturado', async () => {
    const r = await run('INC-20388');
    expect(r.steps[0]?.toolCalls[0]).toMatchObject({ toolName: 'ver_chamado', input: { code: 'INC-20388' } });
    const r2 = await run('INC-20311 · Notebook lento após atualização');
    expect(r2.steps[0]?.toolCalls[0]?.input).toEqual({ code: 'INC-20311' });
  });

  it('a chamada de decisão devolve a decisão do roteiro em JSON', async () => {
    const r = await generateText({
      model: createScriptedModel(SCRIPTS),
      output: Output.object({ schema: TurnDecisionSchema }),
      messages: [{ role: 'user', content: decisionPrompt({ employee_text: 'VPN com erro 809', actions: [], answer_text: 'x' }) }],
    });
    const d = TurnDecisionSchema.parse(r.output);
    expect(d.decision.action).toBe('ask');
    expect(d.understanding.evidence.length).toBeGreaterThan(0);
  });

  it('roteiro incerto declara confiança 0.41', async () => {
    const r = await generateText({
      model: createScriptedModel(SCRIPTS),
      output: Output.object({ schema: TurnDecisionSchema }),
      messages: [{ role: 'user', content: decisionPrompt({ employee_text: 'não sei explicar o que houve', actions: [], answer_text: 'x' }) }],
    });
    expect(r.output.decision.confidence).toBe(0.41);
  });

  it('usa o resultado das tools no texto final quando o sistema está fora', async () => {
    const r = await generateText({
      model: createScriptedModel(SCRIPTS),
      tools: { ...tools, buscar_meus_chamados: stub({ ok: false, error: 'tickets_unavailable' }) },
      messages: [{ role: 'user', content: 'qual o status do meu chamado?' }],
      stopWhen: isStepCount(5),
    });
    expect(r.text).toMatch(/fora do ar/);
  });

  it('informa uso de tokens', async () => {
    const r = await run('VPN com erro 809');
    expect(r.totalUsage.inputTokens).toBeGreaterThan(0);
    expect(r.totalUsage.outputTokens).toBeGreaterThan(0);
  });
});
