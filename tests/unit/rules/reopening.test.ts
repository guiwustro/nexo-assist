import { describe, expect, it } from 'vitest';
import { canReopen } from '@/lib/rules/reopening';

const now = new Date('2026-11-03T13:00:00.000Z');
const ha = (ms: number) => new Date(now.getTime() - ms).toISOString();
const DAY = 24 * 3600_000;

describe('podeReabrir', () => {
  it('resolvido há 4 dias → pode', () => {
    expect(canReopen({ status: 'resolved', resolved_at: ha(4 * DAY) }, now).ok).toBe(true);
  });
  it('resolvido há exatamente 7×24h → pode', () => {
    expect(canReopen({ status: 'resolved', resolved_at: ha(7 * DAY) }, now).ok).toBe(true);
  });
  it('7 dias + 1 min → não pode, regra cita 7 dias', () => {
    const r = canReopen({ status: 'resolved', resolved_at: ha(7 * DAY + 60_000) }, now);
    expect(r.ok).toBe(false);
    expect(r.rule).toMatch(/7 dias/);
  });
  it('encerrado não reabre', () => {
    expect(canReopen({ status: 'closed', resolved_at: ha(DAY) }, now).ok).toBe(false);
  });
  it('sem resolved_at não reabre', () => {
    expect(canReopen({ status: 'resolved', resolved_at: null }, now).ok).toBe(false);
  });
});
