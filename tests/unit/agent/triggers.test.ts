import { describe, expect, it } from 'vitest';
import { evaluateTriggers, askedForAnalyst } from '@/lib/agent-engine/triggers/transfer';

describe('pediuAnalista', () => {
  it.each([
    'quero falar com um analista',
    'me passa pra um atendente',
    'Falar com analista',
    'prefiro falar com uma pessoa',
    'Quero falar com um ATENDENTE humano!',
    'pode me transferir para um técnico?',
  ])('"%s" → pediu', (t) => expect(askedForAnalyst(t)).toBe(true));

  it.each([
    'o analista já respondeu?',
    'o analista disse para reiniciar',
    'como falo com o RH?',
    'meu notebook não liga',
    'não quero falar com um analista, só quero resolver',
    'Quero o pessoal da minha equipe com acesso à pasta do SharePoint',
    'Preciso de uma pessoa nova adicionada no grupo de e-mail',
    'quero falar com a pessoa do RH sobre minhas férias',
  ])('"%s" → não pediu', (t) => expect(askedForAnalyst(t)).toBe(false));
});

const base = { employee_text: 'oi', confidence: 0.9, session_count: 3, limit: 30, threshold: 0.6 };

describe('avaliarGatilhos', () => {
  it('limite da sessão vence até o pedido explícito', () => {
    const r = evaluateTriggers({ ...base, session_count: 30, employee_text: 'quero falar com um analista' });
    expect(r).toMatchObject({ transfer: true, reason: 'session_limit', level: 'N1' });
  });
  it('pedido explícito → requested_human N1', () => {
    expect(evaluateTriggers({ ...base, employee_text: 'quero falar com um analista' })).toMatchObject({
      transfer: true,
      reason: 'requested_human',
      level: 'N1',
    });
  });
  it('confiança null nunca transfere', () => {
    expect(evaluateTriggers({ ...base, confidence: null })).toEqual({ transfer: false });
  });
  it('confiança 0.41 → low_confidence N1', () => {
    const r = evaluateTriggers({ ...base, confidence: 0.41 });
    expect(r).toMatchObject({ transfer: true, reason: 'low_confidence', level: 'N1' });
    if ('rule' in r) expect(r.rule).toMatch(/41%/);
  });
  it('confiança igual ao limiar não transfere', () => {
    expect(evaluateTriggers({ ...base, confidence: 0.6 })).toEqual({ transfer: false });
  });
  it('rascunho crítico → critical_priority N2', () => {
    expect(evaluateTriggers({ ...base, draft_priority: 'critical' })).toMatchObject({
      transfer: true,
      reason: 'critical_priority',
      level: 'N2',
    });
  });
  it('chamado vencido sem pedido → oferta', () => {
    expect(evaluateTriggers({ ...base, overdue_ticket_code: 'INC-20311' })).toMatchObject({
      offer: 'overdue',
      ticket_code: 'INC-20311',
    });
  });
  it('nada a fazer → sem transferência', () => {
    expect(evaluateTriggers(base)).toEqual({ transfer: false });
  });
});
