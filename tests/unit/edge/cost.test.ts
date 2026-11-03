import { describe, expect, it } from 'vitest';
import { custoEmCentavos } from '@/lib/agent-engine/edge/llm/cost';

describe('custoEmCentavos', () => {
  it('calcula pelos preços por milhão de tokens', () => {
    expect(custoEmCentavos({ input_tokens: 1_000_000, output_tokens: 500_000 }, { in: 27, out: 110 })).toBe(82);
    expect(custoEmCentavos({ input_tokens: 1830, output_tokens: 96 }, { in: 27, out: 110 })).toBeCloseTo(0.0600, 4);
  });
  it('sem preço → null (nunca 0)', () => {
    expect(custoEmCentavos({ input_tokens: 10, output_tokens: 10 }, {})).toBeNull();
    expect(custoEmCentavos({ input_tokens: 10, output_tokens: 10 }, { in: 27 })).toBeNull();
  });
  it('preço zero explícito é 0', () => {
    expect(custoEmCentavos({ input_tokens: 10, output_tokens: 10 }, { in: 0, out: 0 })).toBe(0);
  });
});
