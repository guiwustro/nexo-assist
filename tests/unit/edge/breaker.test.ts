import { describe, expect, it } from 'vitest';
import { createBreaker } from '@/lib/agent-engine/edge/tickets/breaker';

describe('createBreaker', () => {
  it('abre após 3 falhas seguidas, meio-abre depois de openMs e fecha no sucesso', () => {
    let now = 0;
    const b = createBreaker({ threshold: 3, openMs: 15_000, now: () => now });
    expect(b.state()).toBe('closed');
    b.onFailure();
    b.onFailure();
    expect(b.canPass()).toBe(true);
    b.onFailure();
    expect(b.state()).toBe('open');
    expect(b.canPass()).toBe(false);
    now += 15_000;
    expect(b.state()).toBe('half_open');
    expect(b.canPass()).toBe(true);
    b.onSuccess();
    expect(b.state()).toBe('closed');
  });

  it('falha no meio-aberto reabre', () => {
    let now = 0;
    const b = createBreaker({ threshold: 3, openMs: 1000, now: () => now });
    b.onFailure();
    b.onFailure();
    b.onFailure();
    now += 1000;
    expect(b.state()).toBe('half_open');
    b.onFailure();
    expect(b.state()).toBe('open');
  });

  it('sucesso zera a contagem', () => {
    const b = createBreaker({ threshold: 3, openMs: 1000, now: () => 0 });
    b.onFailure();
    b.onFailure();
    b.onSuccess();
    b.onFailure();
    expect(b.state()).toBe('closed');
  });
});
