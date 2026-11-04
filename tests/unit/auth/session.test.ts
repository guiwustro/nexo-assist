import { describe, expect, it } from 'vitest';
import { createSessionToken, loginAt, readSession, SESSION_COOKIE } from '@/lib/auth/session';

const s = { user_id: '00000000-0000-4000-8000-000000000001', role: 'employee' as const, name: 'Ana Souza', sid: 'sid-1' };
const req = (token: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${token}` } });

describe('sessão', () => {
  it('lê de volta o que assinou, com a hora do login', async () => {
    const quando = new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
    const token = await createSessionToken(s, { now: quando });
    const lida = await readSession(req(token));
    expect(lida).toEqual({ ...s, iat: quando.getTime() / 1000 });
    expect(loginAt(lida!)).toEqual(quando);
  });
  it('cookie adulterado → null', async () => {
    const token = await createSessionToken(s);
    const [h, p, sig] = token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    payload.role = 'analyst';
    const forjado = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
    expect(await readSession(req(forjado))).toBeNull();
  });
  it('expirado → null', async () => {
    const token = await createSessionToken(s, { now: new Date(Date.now() - 13 * 3600_000) });
    expect(await readSession(req(token))).toBeNull();
  });
  it('sem cookie → null', async () => {
    expect(await readSession(new Request('http://x/'))).toBeNull();
  });
});
