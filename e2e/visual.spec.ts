import { expect, test } from './fixtures';
import { enviar } from './helpers';

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

  test('chat-novo-chamado', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await enviar(page, 'Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.');
    await enviar(page, 'Windows 11');
    await enviar(page, 'Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando.');
    await expect(page.getByTestId('draft-card')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/chat-novo-chamado.png' });
  });

  test('chat-consulta', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await enviar(page, 'Qual o status do meu chamado?');
    await page.getByTestId('ticket-option-INC-20311').click();
    await expect(page.getByTestId('ticket-card')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toBeEnabled();
    await page.screenshot({ path: 'test-results/telas/chat-consulta.png' });
  });

  test('painel-decisao', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await enviar(page, 'Meu notebook não conecta na VPN, erro 809');
    await page.getByTestId('status-line').last().click();
    await expect(page.getByTestId('decision-cost')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/painel-decisao.png' });
  });

  test('console-transferida', async ({ page, loginAs, seed }) => {
    await loginAs(page, 'rafael');
    await page.goto(`/console/${seed.conversations.carla}`);
    await expect(page.getByTestId('takeover-claim')).toBeVisible();
    await expect(page.getByTestId('focus-ticket')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/console-transferida.png' });
  });

  test('console-assumida', async ({ page, loginAs, seed }) => {
    await loginAs(page, 'rafael');
    await page.goto(`/console/${seed.conversations.carla}`);
    await page.getByTestId('takeover-claim').click();
    await page.getByTestId('console-composer').fill('Oi, Carla! Aqui é o Rafael. Vou liberar o acesso agora.');
    await page.getByTestId('console-send').click();
    await expect(page.getByTestId('human-message')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/console-assumida.png' });
  });
});
