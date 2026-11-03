import { expect, test } from './fixtures';

test.describe('login e papéis', () => {
  test('Ana entra e cai no atendimento', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('ana.souza@nexo.com.br');
    await page.getByTestId('login-password').fill('qualquer');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/atendimento$/);
    await expect(page.getByTestId('sidebar-user')).toContainText('Ana Souza');
  });

  test('Rafael entra e cai no console', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('rafael.lima@nexo.com.br');
    await page.getByTestId('login-password').fill('qualquer');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/console/);
  });

  test('e-mail desconhecido mostra erro e continua no login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('ninguem@nexo.com.br');
    await page.getByTestId('login-password').fill('qualquer');
    await page.getByTestId('login-submit').click();
    await expect(page.getByText('E-mail não encontrado')).toBeVisible();
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

  test('botão Entrar mostra spinner e fica desabilitado durante o envio', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.goto('/login');
    await page.getByTestId('login-email').fill('ana.souza@nexo.com.br');
    await page.getByTestId('login-password').fill('qualquer');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-submit')).toBeDisabled();
    await expect(page.getByTestId('login-spinner')).toBeVisible();
    await expect(page).toHaveURL(/\/atendimento$/);
  });
});
