import { expect, test } from './fixtures';
import { enviar, ultimaResposta } from './helpers';

test('pergunta de RH é redirecionada sem abrir chamado', async ({ page, loginAs }) => {
  await loginAs(page, 'diego');
  await enviar(page, 'como peço férias?');
  await expect(ultimaResposta(page)).toContainText('Portal do Colaborador');
  await expect(page.getByTestId('draft-card')).toHaveCount(0);
});
