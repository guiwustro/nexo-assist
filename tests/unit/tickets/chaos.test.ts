import { describe, expect, it } from 'vitest';
import { createChaos } from '@/services/tickets/src/chaos';

describe('createChaos', () => {
  it('falha quando o sorteio fica abaixo da taxa', () => {
    expect(createChaos({ failureRate: 0.5, random: () => 0.4 }).shouldFail()).toBe(true);
  });
  it('passa quando o sorteio fica acima da taxa', () => {
    expect(createChaos({ failureRate: 0.5, random: () => 0.6 }).shouldFail()).toBe(false);
  });
  it('taxa zero nunca falha', () => {
    expect(createChaos({ failureRate: 0, random: () => 0 }).shouldFail()).toBe(false);
  });
  it('queda programada dura N segundos e informa o Retry-After', () => {
    let now = 1_000_000;
    const chaos = createChaos({ failureRate: 0, now: () => new Date(now) });
    chaos.startOutage(10);
    expect(chaos.shouldFail()).toBe(true);
    now += 4_000;
    expect(chaos.retryAfterSeconds()).toBe(6);
    now += 7_000;
    expect(chaos.shouldFail()).toBe(false);
  });
});
