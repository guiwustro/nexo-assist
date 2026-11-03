import { expect, test } from './fixtures';
import { enviar, ultimaResposta } from './helpers';

test('o painel "Por quê?" mostra entendimento, ação, regras e fontes', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await enviar(page, 'VPN com erro 809');
  await ultimaResposta(page).getByTestId('status-line').click();
  const painel = page.getByTestId('decision-panel');
  await expect(painel).toBeVisible();
  await expect(painel.getByTestId('decision-understood')).toContainText('Entendi que');
  await expect(painel.getByTestId('decision-understood')).toContainText('Palavras suas');
  await expect(painel.getByTestId('decision-action')).toContainText('Então eu');
  await expect(painel.getByTestId('decision-why').getByTestId('rule-chip').first()).toBeVisible();
  await expect(painel.getByTestId('decision-sources')).toContainText('consultou seus chamados');
  await expect(painel.getByTestId('decision-sources')).toContainText('VPN com erro 809');
  await expect(painel.getByTestId('decision-cost')).toContainText('custo não medido');
  await page.keyboard.press('Escape');
  await expect(painel).toHaveCount(0);
});

test('baixa confiança aparece em vermelho', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await enviar(page, 'não sei explicar o que está acontecendo');
  await ultimaResposta(page).getByTestId('status-line').click();
  const bar = page.getByTestId('decision-panel').getByTestId('confidence-bar');
  await expect(bar).toContainText('41%');
  await expect(bar).toHaveAttribute('data-tone', 'danger');
});
