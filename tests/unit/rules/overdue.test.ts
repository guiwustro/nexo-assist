import { describe, expect, it } from 'vitest';
import { describeOverdue, isOverdue } from '@/lib/rules/overdue';

const now = new Date('2026-11-03T13:00:00.000Z');
const yesterday = new Date(now.getTime() - 24 * 3600_000).toISOString();

describe('estaVencido', () => {
  it('aberto com prazo ontem está vencido', () => {
    expect(isOverdue({ status: 'open', due_at: yesterday }, now)).toBe(true);
  });
  it('resolvido nunca está vencido', () => {
    expect(isOverdue({ status: 'resolved', due_at: yesterday }, now)).toBe(false);
  });
  it('prazo exatamente agora ainda não venceu', () => {
    expect(isOverdue({ status: 'in_progress', due_at: now.toISOString() }, now)).toBe(false);
  });
  it('aguardando analista e aprovado também vencem', () => {
    expect(isOverdue({ status: 'awaiting_analyst', due_at: yesterday }, now)).toBe(true);
    expect(isOverdue({ status: 'approved', due_at: yesterday }, now)).toBe(true);
    expect(isOverdue({ status: 'closed', due_at: yesterday }, now)).toBe(false);
  });
});

describe('descreverAtraso', () => {
  it('conta dias corridos desde a última atualização', () => {
    const t = {
      status: 'awaiting_analyst' as const,
      due_at: yesterday,
      last_update_at: new Date(now.getTime() - 5 * 24 * 3600_000 - 60_000).toISOString(),
    };
    expect(describeOverdue(t, now)).toBe('há 5 dias · prazo vencido');
  });
  it('um dia usa singular', () => {
    const t = { status: 'open' as const, due_at: yesterday, last_update_at: yesterday };
    expect(describeOverdue(t, now)).toBe('há 1 dia · prazo vencido');
  });
  it('não vencido → null', () => {
    const t = { status: 'open' as const, due_at: now.toISOString(), last_update_at: yesterday };
    expect(describeOverdue(t, now)).toBeNull();
  });
});
