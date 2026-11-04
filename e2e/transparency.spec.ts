import { expect, test } from './fixtures';
import { send, lastAgentReply } from './helpers';

test('o painel "Por quê?" mostra entendimento, ação, regras e fontes', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await send(page, 'VPN com erro 809');
  await lastAgentReply(page).getByTestId('status-line').click();
  const panel = page.getByTestId('decision-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('decision-understood')).toContainText('Entendi que');
  await expect(panel.getByTestId('decision-understood')).toContainText('Palavras suas');
  await expect(panel.getByTestId('decision-action')).toContainText('Então eu');
  await expect(panel.getByTestId('decision-why').getByTestId('rule-chip').first()).toBeVisible();
  await expect(panel.getByTestId('decision-sources')).toContainText('consultou seus chamados');
  await expect(panel.getByTestId('decision-sources')).toContainText('VPN com erro 809');
  await expect(panel.getByTestId('decision-cost')).toContainText('custo não medido');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('baixa confiança aparece em vermelho', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await send(page, 'não sei explicar o que está acontecendo');
  await lastAgentReply(page).getByTestId('status-line').click();
  const bar = page.getByTestId('decision-panel').getByTestId('confidence-bar');
  await expect(bar).toContainText('41%');
  await expect(bar).toHaveAttribute('data-tone', 'danger');
});
