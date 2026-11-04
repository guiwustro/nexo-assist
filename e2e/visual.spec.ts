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

  test('meus-chamados', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.goto('/chamados');
    await expect(page.getByTestId('my-tickets')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/meus-chamados.png' });
  });

  test('meu-chamado-detalhe', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.goto('/chamados/INC-20311');
    await expect(page.getByTestId('ticket-history')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/meu-chamado-detalhe.png' });
  });

  test('console-menu-conta', async ({ page, loginAs }) => {
    await loginAs(page, 'rafael');
    await page.getByTestId('console-user').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/console-menu-conta.png' });
  });

  test('console-perfil', async ({ page, loginAs }) => {
    await loginAs(page, 'rafael');
    await page.goto('/console/perfil');
    await expect(page.getByTestId('perfil-nivel')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/console-perfil.png' });
  });

  test('console-busca', async ({ page, loginAs, seed }) => {
    await loginAs(page, 'rafael');
    await page.goto(`/console/${seed.conversations.carla}`);
    await page.getByTestId('console-search').fill('analis');
    await expect(page.getByTestId('conversation-match').first()).toBeVisible();
    await page.getByTestId('header-search').click();
    await page.getByRole('searchbox', { name: 'Buscar na conversa' }).fill('analista');
    await expect(page.getByTestId('busca-contador')).toBeVisible();
    await page.screenshot({ path: 'test-results/telas/console-busca.png' });
  });

  test('console-detalhe-chamado', async ({ page, loginAs, seed }) => {
    await loginAs(page, 'rafael');
    await page.goto(`/console/${seed.conversations.carla}`);
    await page.getByTestId('employee-ticket-REQ-10460').click();
    await expect(page.getByTestId('ticket-detail')).toContainText('Histórico');
    await page.screenshot({ path: 'test-results/telas/console-detalhe-chamado.png' });
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
