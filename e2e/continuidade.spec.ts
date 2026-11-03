import { expect, test } from './fixtures';
import { enviar } from './helpers';

test('a conversa continua depois de recarregar e de um novo login', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await enviar(page, 'qual o horário do service desk?');
  await enviar(page, 'Só eu, preciso disso hoje');
  await expect(page.getByTestId('draft-card')).toContainText('Aguardando confirmação');
  await expect(page.getByTestId('session-counter')).toContainText('2/30');
  const antes = await page.getByTestId('user-message').allTextContents();

  await page.reload();
  await expect(page.getByTestId('user-message')).toHaveText(antes);
  await expect(page.getByTestId('session-counter')).toContainText('2/30');

  await page.getByTestId('sidebar-logout').click();
  await expect(page).toHaveURL(/\/login$/);
  await loginAs(page, 'ana');
  await expect(page.getByTestId('user-message')).toHaveText(antes);
  await expect(page.getByTestId('session-counter')).toContainText('0/30');

  await page.getByTestId('draft-card').getByTestId('draft-confirm').click();
  await expect(page.getByTestId('draft-card')).toContainText(/Criado como INC-205\d\d/);
});
