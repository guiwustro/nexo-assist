import { expect, test } from './fixtures';
import { send, lastAgentReply } from './helpers';

test('pergunta de RH é redirecionada sem abrir chamado', async ({ page, loginAs }) => {
  await loginAs(page, 'diego');
  await send(page, 'como peço férias?');
  await expect(lastAgentReply(page)).toContainText('Portal do Colaborador');
  await expect(page.getByTestId('draft-card')).toHaveCount(0);
});
