export type BreakerState = 'closed' | 'open' | 'half_open';

export type Breaker = {
  canPass(): boolean;
  onSuccess(): void;
  onFailure(): void;
  state(): BreakerState;
};

/** Disjuntor: após `threshold` falhas seguidas fica aberto por `openMs`, depois deixa uma tentativa passar. */
export function createBreaker(opts: { threshold: number; openMs: number; now?: () => number }): Breaker {
  const now = opts.now ?? Date.now;
  let failures = 0;
  let openedAt: number | null = null;

  const state = (): BreakerState => {
    if (openedAt === null) return 'closed';
    return now() - openedAt >= opts.openMs ? 'half_open' : 'open';
  };

  return {
    state,
    canPass: () => state() !== 'open',
    onSuccess() {
      failures = 0;
      openedAt = null;
    },
    onFailure() {
      if (state() === 'half_open') {
        openedAt = now();
        return;
      }
      failures += 1;
      if (failures >= opts.threshold) openedAt = now();
    },
  };
}
