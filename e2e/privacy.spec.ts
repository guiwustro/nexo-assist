import { expect, test } from './fixtures';
import { send, lastAgentReply } from './helpers';

test('Ana não vê o chamado da Carla', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await send(page, 'INC-20388');
  await expect(lastAgentReply(page)).toContainText('Não encontrei esse chamado entre os seus');
  expect(await page.content()).not.toContain('Diretoria');
});
