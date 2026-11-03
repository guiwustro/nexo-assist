import { describe, expect, it } from 'vitest';
import { podeReabrir } from '@/lib/regras/reabertura';

const agora = new Date('2026-11-03T13:00:00.000Z');
const ha = (ms: number) => new Date(agora.getTime() - ms).toISOString();
const DIA = 24 * 3600_000;

describe('podeReabrir', () => {
  it('resolvido há 4 dias → pode', () => {
    expect(podeReabrir({ status: 'resolved', resolved_at: ha(4 * DIA) }, agora).ok).toBe(true);
  });
  it('resolvido há exatamente 7×24h → pode', () => {
    expect(podeReabrir({ status: 'resolved', resolved_at: ha(7 * DIA) }, agora).ok).toBe(true);
  });
  it('7 dias + 1 min → não pode, regra cita 7 dias', () => {
    const r = podeReabrir({ status: 'resolved', resolved_at: ha(7 * DIA + 60_000) }, agora);
    expect(r.ok).toBe(false);
    expect(r.regra).toMatch(/7 dias/);
  });
  it('encerrado não reabre', () => {
    expect(podeReabrir({ status: 'closed', resolved_at: ha(DIA) }, agora).ok).toBe(false);
  });
  it('sem resolved_at não reabre', () => {
    expect(podeReabrir({ status: 'resolved', resolved_at: null }, agora).ok).toBe(false);
  });
});
