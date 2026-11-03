import { expect, test } from './fixtures';
import { enviar, ultimaResposta } from './helpers';

test('Ana não vê o chamado da Carla', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await enviar(page, 'INC-20388');
  await expect(ultimaResposta(page)).toContainText('Não encontrei esse chamado entre os seus');
  expect(await page.content()).not.toContain('Diretoria');
});
