import { expect, test } from './fixtures';
import { enviar, ultimaResposta } from './helpers';

test('Ana consulta o chamado sem lembrar o número e vê que está vencido', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await enviar(page, 'qual o status do meu chamado?');
  const sel = page.getByTestId('ticket-selector');
  await expect(sel).toContainText('INC-20311');
  await expect(sel).toContainText('Aguardando analista');
  await expect(sel).toContainText('INC-20298');
  await expect(sel).toContainText('Em andamento');
  await expect(sel).toContainText('REQ-10442');
  await expect(sel).toContainText('Aprovado');

  await sel.getByTestId('ticket-option-INC-20311').click();
  await expect(page.getByTestId('user-message').last()).toContainText('INC-20311 · Notebook lento após atualização');
  const r = ultimaResposta(page);
  await expect(r.getByTestId('status-line')).toContainText('consultou o INC-20311');
  await expect(r.getByTestId('status-line')).toContainText('calculou o prazo');
  const card = r.getByTestId('ticket-card');
  await expect(card).toContainText('Hardware › Notebook');
  await expect(card).toContainText('Média');
  await expect(card).toContainText('há 6 dias');
  await expect(card).toContainText('· prazo vencido');
  await expect(r.getByText('Falar com um analista')).toBeVisible();
  await expect(r.getByText('Adicionar informação')).toBeVisible();
  await expect(r.getByText('Não, obrigado')).toBeVisible();
});
