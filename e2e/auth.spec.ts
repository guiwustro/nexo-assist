import { expect, test } from './fixtures';
import { DEMO_PASSWORD } from '../lib/db/seed-data';

test.describe('login e papéis', () => {
  test('Ana entra e cai no atendimento', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('ana.souza@nexo.com.br');
    await page.getByTestId('login-password').fill(DEMO_PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/atendimento$/);
    await expect(page.getByTestId('sidebar-user')).toContainText('Ana Souza');
  });

  test('Rafael entra e cai no console', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('rafael.lima@nexo.com.br');
    await page.getByTestId('login-password').fill(DEMO_PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/console/);
  });

  test('e-mail desconhecido mostra erro e continua no login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('ninguem@nexo.com.br');
    await page.getByTestId('login-password').fill(DEMO_PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('E-mail ou senha incorretos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('senha errada mostra o mesmo erro e continua no login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('ana.souza@nexo.com.br');
    await page.getByTestId('login-password').fill('senha-errada');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('E-mail ou senha incorretos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('funcionária não acessa o console', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.goto('/console');
    await expect(page).toHaveURL(/\/atendimento$/);
  });

  test('Sair volta ao login e as páginas exigem sessão', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.getByTestId('sidebar-logout').click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/atendimento');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('Meu perfil mostra o e-mail gerenciado pela TI', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.getByRole('link', { name: 'Meu perfil' }).click();
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByTestId('perfil-email')).toContainText('ana.souza@nexo.com.br');
    await expect(page.getByText('Gerenciado pela TI')).toBeVisible();
    await expect(page.getByTestId('topbar-status')).toHaveCount(0);
  });

  test('analista sai do console pelo menu do avatar e as páginas exigem sessão', async ({ page, loginAs }) => {
    await loginAs(page, 'rafael');
    await page.getByTestId('console-user').click();
    await page.getByRole('menuitem', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/console');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('analista abre o próprio perfil pelo menu do avatar e volta às conversas', async ({ page, loginAs }) => {
    await loginAs(page, 'rafael');
    await page.getByTestId('console-user').click();
    await expect(page.getByRole('menu')).toContainText('rafael.lima@nexo.com.br');
    await page.getByRole('menuitem', { name: 'Meu perfil' }).click();
    await expect(page).toHaveURL(/\/console\/perfil$/);
    await expect(page.getByTestId('perfil-email')).toContainText('rafael.lima@nexo.com.br');
    await expect(page.getByTestId('perfil-nivel')).toContainText(/Analista N[12]/);
    await page.getByRole('link', { name: 'Conversas' }).click();
    await expect(page).toHaveURL(/\/console$/);
    await expect(page.getByText('Selecione uma conversa')).toBeVisible();
  });

  test('botão Entrar mostra spinner e fica desabilitado durante o envio', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.goto('/login');
    await page.getByTestId('login-email').fill('ana.souza@nexo.com.br');
    await page.getByTestId('login-password').fill(DEMO_PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-submit')).toBeDisabled();
    await expect(page.getByTestId('login-spinner')).toBeVisible();
    await expect(page).toHaveURL(/\/atendimento$/);
  });
});
