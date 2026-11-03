import { test } from './fixtures';

/** Capturas para conferência lado a lado com os frames do protótipo (sem assert de pixel). */
test.describe('capturas das telas', () => {
  test('login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('ana.souza@nexo.com.br');
    await page.screenshot({ path: 'test-results/telas/login.png' });
  });

  test('perfil', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.goto('/perfil');
    await page.screenshot({ path: 'test-results/telas/perfil.png' });
  });
});
