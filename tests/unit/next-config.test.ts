import { describe, expect, it } from 'vitest';
import config from '@/next.config';

describe('next.config: cabeçalhos de segurança', () => {
  it('valem para todas as rotas', async () => {
    const rules = await config.headers!();
    const all = rules.find((r) => r.source === '/:path*');
    const h = Object.fromEntries(all!.headers.map((x) => [x.key, x.value]));
    expect(h).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    });
    expect(config.poweredByHeader).toBe(false);
  });
});
