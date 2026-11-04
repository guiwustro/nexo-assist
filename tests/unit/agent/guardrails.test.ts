import { describe, expect, it } from 'vitest';
import { promisedAnalyst } from '@/lib/agent-engine/guardrails/analyst-promise';
import { claimsCreation } from '@/lib/agent-engine/guardrails/hallucinated-action';
import { adjustConfidence } from '@/lib/agent-engine/guardrails/confidence';

describe('prometeuAnalista', () => {
  it.each([
    'Vou te transferir para um analista agora.',
    'Um analista vai entrar em contato com você.',
    'Encaminhei para o suporte N2.',
    'Já transferi você para um atendente.',
  ])('"%s" → prometeu', (t) => expect(promisedAnalyst(t)).toBe(true));
  it.each([
    'Posso transferir para um analista, quer?',
    'Se preferir, um analista pode te ajudar.',
    'O analista respondeu ontem no chamado.',
    'Se não resolver, vou te passar para um analista.',
    'Se preferir, um analista vai te atender.',
    'Caso o erro continue, vou te transferir para o suporte.',
    'Quer que eu te transfira? Vou te passar para um analista se você confirmar.',
    'Está vencido há 3 dias. Quer que eu vou te encaminhar para um analista?',
  ])('"%s" → não prometeu', (t) => expect(promisedAnalyst(t)).toBe(false));
});

describe('afirmouCriacao', () => {
  it.each([
    'Pronto, abri o chamado para você.',
    'Chamado criado com sucesso!',
    'Registrei o chamado INC-20517.',
    'O chamado INC-20517 foi criado.',
  ])('"%s" → afirmou', (t) => expect(claimsCreation(t)).toBe(true));
  it.each([
    'Não abri o chamado ainda: confira o rascunho.',
    'Montei um rascunho, confirme para eu abrir o chamado.',
    'O chamado ainda não foi criado.',
  ])('"%s" → não afirmou', (t) => expect(claimsCreation(t)).toBe(false));
});

describe('ajustarConfianca', () => {
  it('dúvida sem fonte fica no máximo em 0.5', () => {
    expect(adjustConfidence(0.9, { intent: 'question', sources_count: 0 })).toBe(0.5);
    expect(adjustConfidence(0.3, { intent: 'question', sources_count: 0 })).toBe(0.3);
  });
  it('dúvida com fonte mantém', () => {
    expect(adjustConfidence(0.9, { intent: 'question', sources_count: 1 })).toBe(0.9);
  });
  it('outra intenção mantém', () => {
    expect(adjustConfidence(0.9, { intent: 'status', sources_count: 0 })).toBe(0.9);
  });
  it('redirecionamento fora do escopo mantém: a base é a regra de escopo, não a central', () => {
    expect(adjustConfidence(0.9, { intent: 'question', sources_count: 0, action: 'redirect' })).toBe(0.9);
    expect(adjustConfidence(0.9, { intent: 'question', sources_count: 0, action: 'answer' })).toBe(0.5);
  });
  it('null permanece null', () => {
    expect(adjustConfidence(null, { intent: 'question', sources_count: 0 })).toBeNull();
  });
});
