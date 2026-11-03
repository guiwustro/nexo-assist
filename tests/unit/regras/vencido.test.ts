import { describe, expect, it } from 'vitest';
import { descreverAtraso, estaVencido } from '@/lib/regras/vencido';

const agora = new Date('2026-11-03T13:00:00.000Z');
const ontem = new Date(agora.getTime() - 24 * 3600_000).toISOString();

describe('estaVencido', () => {
  it('aberto com prazo ontem está vencido', () => {
    expect(estaVencido({ status: 'open', due_at: ontem }, agora)).toBe(true);
  });
  it('resolvido nunca está vencido', () => {
    expect(estaVencido({ status: 'resolved', due_at: ontem }, agora)).toBe(false);
  });
  it('prazo exatamente agora ainda não venceu', () => {
    expect(estaVencido({ status: 'in_progress', due_at: agora.toISOString() }, agora)).toBe(false);
  });
  it('aguardando analista e aprovado também vencem', () => {
    expect(estaVencido({ status: 'awaiting_analyst', due_at: ontem }, agora)).toBe(true);
    expect(estaVencido({ status: 'approved', due_at: ontem }, agora)).toBe(true);
    expect(estaVencido({ status: 'closed', due_at: ontem }, agora)).toBe(false);
  });
});

describe('descreverAtraso', () => {
  it('conta dias corridos desde a última atualização', () => {
    const t = {
      status: 'awaiting_analyst' as const,
      due_at: ontem,
      last_update_at: new Date(agora.getTime() - 5 * 24 * 3600_000 - 60_000).toISOString(),
    };
    expect(descreverAtraso(t, agora)).toBe('há 5 dias · prazo vencido');
  });
  it('um dia usa singular', () => {
    const t = { status: 'open' as const, due_at: ontem, last_update_at: ontem };
    expect(descreverAtraso(t, agora)).toBe('há 1 dia · prazo vencido');
  });
  it('não vencido → null', () => {
    const t = { status: 'open' as const, due_at: agora.toISOString(), last_update_at: ontem };
    expect(descreverAtraso(t, agora)).toBeNull();
  });
});
