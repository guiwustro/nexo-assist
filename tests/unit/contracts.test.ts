import { describe, expect, it } from 'vitest';
import { TurnDecisionSchema } from '@/lib/contracts/decision';
import { MessagePartSchema } from '@/lib/contracts/parts';
import { DraftPayloadSchema } from '@/lib/contracts/drafts';
import { CATEGORY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, AFFECTED_LABEL } from '@/lib/contracts/enums';
import { TicketSchema } from '@/lib/contracts/tickets';

const decision = {
  understanding: { intent: 'open_ticket', summary: 'VPN com erro 809', evidence: 'não conecta na VPN, erro 809' },
  decision: {
    action: 'ask',
    confidence: 0.8,
    why: 'Falta saber o sistema',
    rules_applied: [],
    sources: [{ kind: 'article', id: 'vpn-erro-809', title: 'Erro 809 na VPN' }],
  },
};

const payload = {
  title: 'VPN não conecta',
  description: 'Erro 809',
  type: 'incident',
  category: 'network_vpn',
  affected: 'me',
  blocks_work: true,
  deadline_today: true,
  priority: 'high',
  priority_rule: 'Alta: …',
  due_at: '2026-11-03T17:00:00.000Z',
};

describe('contratos', () => {
  it('TurnDecision aceita a forma válida', () => {
    expect(TurnDecisionSchema.parse(decision).decision.confidence).toBe(0.8);
  });
  it('TurnDecision rejeita confidence 1.2', () => {
    expect(() =>
      TurnDecisionSchema.parse({ ...decision, decision: { ...decision.decision, confidence: 1.2 } }),
    ).toThrow();
  });
  it('TurnDecision rejeita evidence vazia', () => {
    expect(() =>
      TurnDecisionSchema.parse({ ...decision, understanding: { ...decision.understanding, evidence: '' } }),
    ).toThrow();
  });
  it('quick_replies exige 2 a 4 opções', () => {
    const qr = (n: number) => ({
      kind: 'quick_replies',
      question: 'Quem?',
      options: Array.from({ length: n }, (_, i) => `op ${i}`),
    });
    expect(() => MessagePartSchema.parse(qr(1))).toThrow();
    expect(() => MessagePartSchema.parse(qr(5))).toThrow();
    expect(MessagePartSchema.parse(qr(4)).kind).toBe('quick_replies');
  });
  it('MessagePart com kind desconhecido falha', () => {
    expect(() => MessagePartSchema.parse({ kind: 'foo' })).toThrow();
  });
  it('DraftPayload rejeita category rh', () => {
    expect(DraftPayloadSchema.parse(payload).category).toBe('network_vpn');
    expect(() => DraftPayloadSchema.parse({ ...payload, category: 'rh' })).toThrow();
  });
  it('Ticket aceita subcategoria nula', () => {
    const t = TicketSchema.parse({
      code: 'INC-20311',
      type: 'incident',
      title: 'Notebook lento',
      description: 'x',
      category: 'hardware',
      subcategory: null,
      priority: 'medium',
      affected: 'me',
      status: 'awaiting_analyst',
      requester_id: '7f0c3a52-1111-4111-8111-111111111111',
      assignee_name: null,
      due_at: '2026-11-03T17:00:00.000Z',
      last_update_at: '2026-11-03T17:00:00.000Z',
      resolved_at: null,
      created_at: '2026-11-03T17:00:00.000Z',
    });
    expect(t.code).toBe('INC-20311');
  });
  it('rótulos e tons seguem o design', () => {
    expect(CATEGORY_LABEL.network_vpn).toBe('Rede e VPN');
    expect(STATUS_LABEL.awaiting_analyst).toBe('Aguardando analista');
    expect(AFFECTED_LABEL.me).toBe('Somente você');
    expect(STATUS_TONE.awaiting_analyst).toBe('warning');
    expect(STATUS_TONE.closed).toBe('muted');
    expect(PRIORITY_TONE.critical).toBe('danger');
  });
});
