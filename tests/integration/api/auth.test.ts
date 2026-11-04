import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '@/tests/helpers/db';
import { POST as login } from '@/app/api/v1/auth/login/route';
import { POST as logout } from '@/app/api/v1/auth/logout/route';
import { GET as me } from '@/app/api/v1/me/route';
import { DEMO_PASSWORD } from '@/lib/db/seed-data';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { loginLimiter } from '@/lib/api/rate-limit';

const t = useTestDb();
// O limite de 10 logins/min por IP não é o assunto aqui.
beforeEach(() => loginLimiter().reset());
const noParams = { params: Promise.resolve({}) };

const doLogin = (email: string, password = DEMO_PASSWORD, extra: Record<string, unknown> = {}) =>
  login(
    new Request('http://x/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, ...extra }),
    }),
    noParams,
  );

function cookieFrom(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? '';
  return raw.split(';')[0] ?? '';
}

describe('login', () => {
  it('Ana entra e recebe o cookie de sessão', async () => {
    const res = await doLogin('ana.souza@nexo.com.br');
    expect(res.status).toBe(200);
    const sc = res.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/nexo_session=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(((await res.json()) as { data: { role: string } }).data.role).toBe('employee');
  });
  it('e-mail desconhecido → 401', async () => {
    const res = await doLogin('ninguem@nexo.com.br');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_credentials');
  });
  it('senha errada → 401, com a mesma mensagem do e-mail desconhecido', async () => {
    const errada = await doLogin('ana.souza@nexo.com.br', 'outra-senha');
    expect(errada.status).toBe(401);
    expect(errada.headers.get('set-cookie')).toBeNull();
    const semEmail = await doLogin('ninguem@nexo.com.br');
    const a = ((await errada.json()) as { error: { code: string; message: string } }).error;
    const b = ((await semEmail.json()) as { error: { code: string; message: string } }).error;
    expect(a).toEqual(b);
    expect(a).toMatchObject({ code: 'invalid_credentials', message: 'E-mail ou senha incorretos' });
  });
  it('usuário sem senha cadastrada não entra', async () => {
    await t.db.update(users).set({ password_hash: null }).where(eq(users.email, 'ana.souza@nexo.com.br'));
    expect((await doLogin('ana.souza@nexo.com.br')).status).toBe(401);
  });
  it('o banco guarda só o hash, nunca a senha', async () => {
    const [u] = await t.db.select({ h: users.password_hash }).from(users).where(eq(users.email, 'ana.souza@nexo.com.br'));
    expect(u?.h).toMatch(/^scrypt\$/);
    expect(u?.h).not.toContain(DEMO_PASSWORD);
  });
  it('senha vazia → 400', async () => {
    expect((await doLogin('ana.souza@nexo.com.br', '')).status).toBe(400);
  });
  it('ignora maiúsculas e espaços no e-mail', async () => {
    expect((await doLogin('ANA.SOUZA@NEXO.COM.BR ')).status).toBe(200);
  });
  it('/me devolve a Ana com o cookie', async () => {
    const cookie = cookieFrom(await doLogin('ana.souza@nexo.com.br'));
    const res = await me(new Request('http://x/api/v1/me', { headers: { cookie } }), noParams);
    const { data } = (await res.json()) as { data: { name: string; department: string; email: string } };
    expect(data).toMatchObject({ name: 'Ana Souza', department: 'Financeiro', email: 'ana.souza@nexo.com.br' });
  });
  it('cada login gera um sid novo', async () => {
    const a = cookieFrom(await doLogin('ana.souza@nexo.com.br'));
    const b = cookieFrom(await doLogin('ana.souza@nexo.com.br'));
    expect(a).not.toBe(b);
  });
  it('"Manter conectado" (padrão) grava cookie persistente; desmarcado, cookie da sessão do navegador', async () => {
    expect((await doLogin('ana.souza@nexo.com.br')).headers.get('set-cookie')).toMatch(/Max-Age=43200/);
    expect((await doLogin('ana.souza@nexo.com.br', DEMO_PASSWORD, { remember: true })).headers.get('set-cookie')).toMatch(/Max-Age=43200/);
    const sc = (await doLogin('ana.souza@nexo.com.br', DEMO_PASSWORD, { remember: false })).headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/nexo_session=/);
    expect(sc).not.toMatch(/Max-Age|Expires/i);
  });
  it('logout limpa o cookie', async () => {
    const cookie = cookieFrom(await doLogin('ana.souza@nexo.com.br'));
    const res = await logout(new Request('http://x/api/v1/auth/logout', { method: 'POST', headers: { cookie } }), noParams);
    expect(res.headers.get('set-cookie')).toMatch(/nexo_session=;|Max-Age=0/);
  });
});
