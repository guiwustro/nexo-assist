import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter } from '@/lib/api/rate-limit';

describe('createRateLimiter (janela deslizante)', () => {
  it('20 passam, a 21ª é barrada, e depois de 60 s volta a passar', () => {
    let t = 1_000_000;
    const rl = createRateLimiter({ limit: 20, windowMs: 60_000, now: () => t });
    for (let i = 0; i < 20; i++) {
      expect(rl.take('ana').ok).toBe(true);
      t += 1000;
    }
    const barrada = rl.take('ana');
    expect(barrada.ok).toBe(false);
    // A mais antiga (t0) sai da janela em t0 + 60 s; estamos em t0 + 20 s.
    expect(barrada.retry_after_s).toBe(40);
    t += 40_000;
    expect(rl.take('ana').ok).toBe(true);
  });

  it('chaves são independentes', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(rl.take('ana').ok).toBe(true);
    expect(rl.take('ana').ok).toBe(false);
    expect(rl.take('diego').ok).toBe(true);
  });

  it('requisição barrada não ocupa vaga na janela', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => t });
    rl.take('k');
    rl.take('k');
    for (let i = 0; i < 5; i++) expect(rl.take('k').ok).toBe(false);
    t = 10_000;
    expect(rl.take('k').ok).toBe(true);
    expect(rl.take('k').ok).toBe(true);
    expect(rl.take('k').ok).toBe(false);
  });

  it('retry_after_s nunca é zero quando barra', () => {
    let t = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    rl.take('k');
    t = 999;
    expect(rl.take('k')).toEqual({ ok: false, retry_after_s: 1 });
  });

  it('reset limpa todas as chaves', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    rl.take('k');
    rl.reset();
    expect(rl.take('k').ok).toBe(true);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://x/', { headers });

  it('atrás de um proxy confiável, usa o endereço que ele acrescentou (o da direita), não o que o cliente mandou', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }), 1)).toBe('203.0.113.9');
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.9' }), 1)).toBe('203.0.113.9');
  });

  it('com dois proxies, pula o mais próximo', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9, 10.0.0.5' }), 2)).toBe('203.0.113.9');
  });

  it('sem proxy confiável, ignora os cabeçalhos (qualquer um poderia forjar)', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' }), 0)).toBe('local');
  });

  it('sem cabeçalho, cai no x-real-ip ou em "local"', () => {
    expect(clientIp(req({ 'x-real-ip': '5.6.7.8' }), 1)).toBe('5.6.7.8');
    expect(clientIp(req({}), 1)).toBe('local');
  });
});
