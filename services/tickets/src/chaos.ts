export type Chaos = {
  startOutage(seconds: number): void;
  shouldFail(): boolean;
  retryAfterSeconds(): number;
};

/** Instabilidade do legado: falhas aleatórias (taxa) e quedas programadas de N segundos. */
export function createChaos(opts: { failureRate: number; random?: () => number; now?: () => Date }): Chaos {
  const random = opts.random ?? Math.random;
  const now = opts.now ?? (() => new Date());
  let outageUntil = 0;
  return {
    startOutage(seconds) {
      outageUntil = now().getTime() + seconds * 1000;
    },
    shouldFail() {
      if (now().getTime() < outageUntil) return true;
      return opts.failureRate > 0 && random() < opts.failureRate;
    },
    retryAfterSeconds() {
      const remaining = Math.ceil((outageUntil - now().getTime()) / 1000);
      return Math.max(1, remaining);
    },
  };
}
