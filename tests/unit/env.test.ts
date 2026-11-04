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

describe('parseEnv: modelo', () => {
  it('sem MODEL_ID usa deepseek-flash, o modelo da tabela de preços atual da DeepSeek', () => {
    const { MODEL_ID: _ignorado, ...semModelo } = base;
    expect(parseEnv({ ...semModelo, LLM_PROVIDER: 'scripted' }).MODEL_ID).toBe('deepseek-flash');
  });
});

describe('parseEnv: teto de gasto', () => {
  it('teto sem os dois preços é erro: sem preço o custo não é medido e o teto nunca dispararia', () => {
    expect(() => parseEnv({ ...base, LLM_PROVIDER: 'scripted', LLM_DAILY_BUDGET_CENTS: '500' })).toThrow(/LLM_PRICE/);
    expect(() =>
      parseEnv({ ...base, LLM_PROVIDER: 'scripted', LLM_DAILY_BUDGET_CENTS: '500', LLM_PRICE_IN_CENTS_PER_MTOK: '30' }),
    ).toThrow(/LLM_PRICE_OUT/);
  });

  it('teto com os dois preços é aceito', () => {
    const env = parseEnv({
      ...base,
      LLM_PROVIDER: 'scripted',
      LLM_DAILY_BUDGET_CENTS: '500',
      LLM_PRICE_IN_CENTS_PER_MTOK: '30',
      LLM_PRICE_OUT_CENTS_PER_MTOK: '120',
    });
    expect(env.LLM_DAILY_BUDGET_CENTS).toBe(500);
  });
});

describe('parseEnv com .env copiado do exemplo', () => {
  it('trata valores vazios como ausentes', () => {
    const env = parseEnv({ ...base, LLM_PROVIDER: 'scripted', DEEPSEEK_API_KEY: '', LLM_DAILY_BUDGET_CENTS: '' });
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(env.LLM_DAILY_BUDGET_CENTS).toBeUndefined();
  });
});
