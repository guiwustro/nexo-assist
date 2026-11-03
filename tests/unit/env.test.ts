import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/lib/env';

const base = {
  DATABASE_URL: 'postgres://nexo:nexo@localhost:5432/nexo',
  DATABASE_URL_TEST: 'postgres://nexo:nexo@localhost:5432/nexo_test',
  SESSION_SECRET: 'x'.repeat(32),
  TICKETS_URL: 'http://localhost:4001',
  TICKETS_INTERNAL_SECRET: 'segredo-interno',
  MODEL_ID: 'deepseek-chat',
};

describe('parseEnv', () => {
  it('exige DEEPSEEK_API_KEY quando LLM_PROVIDER=deepseek', () => {
    expect(() => parseEnv({ ...base, LLM_PROVIDER: 'deepseek' })).toThrow(/DEEPSEEK_API_KEY/);
  });

  it('aceita scripted sem chave e aplica defaults', () => {
    const env = parseEnv({ ...base, LLM_PROVIDER: 'scripted' });
    expect(env.SESSION_MESSAGE_LIMIT).toBe(30);
    expect(env.LOW_CONFIDENCE_THRESHOLD).toBe(0.6);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(20);
    expect(env.LLM_PRICE_IN_CENTS_PER_MTOK).toBeUndefined();
  });

  it('rejeita SESSION_SECRET curto', () => {
    expect(() => parseEnv({ ...base, LLM_PROVIDER: 'scripted', SESSION_SECRET: 'x' })).toThrow();
  });

  it('converte números vindos como texto', () => {
    const env = parseEnv({
      ...base,
      LLM_PROVIDER: 'scripted',
      SESSION_MESSAGE_LIMIT: '5',
      LLM_PRICE_IN_CENTS_PER_MTOK: '27',
    });
    expect(env.SESSION_MESSAGE_LIMIT).toBe(5);
    expect(env.LLM_PRICE_IN_CENTS_PER_MTOK).toBe(27);
  });
});
