import { describe, expect, it } from 'vitest';
import config from '@/next.config';

describe('next.config: cabeçalhos de segurança', () => {
  it('valem para todas as rotas', async () => {
    const regras = await config.headers!();
    const todas = regras.find((r) => r.source === '/:path*');
    const h = Object.fromEntries(todas!.headers.map((x) => [x.key, x.value]));
    expect(h).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    expect(config.poweredByHeader).toBe(false);
  });
});
