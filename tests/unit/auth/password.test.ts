import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('senha', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const h = await hashPassword('nexo2026');
    expect(await verifyPassword('nexo2026', h)).toBe(true);
    expect(await verifyPassword('nexo2027', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });
  it('não guarda a senha em claro e usa salt por hash', async () => {
    const a = await hashPassword('nexo2026');
    const b = await hashPassword('nexo2026');
    expect(a).not.toContain('nexo2026');
    expect(a).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
  });
  it('hash ausente ou malformado → false, sem exceção', async () => {
    expect(await verifyPassword('nexo2026', null)).toBe(false);
    expect(await verifyPassword('nexo2026', '')).toBe(false);
    expect(await verifyPassword('nexo2026', 'md5$abc')).toBe(false);
    expect(await verifyPassword('nexo2026', 'scrypt$x$8$1$AAAA$AAAA')).toBe(false);
  });
});
