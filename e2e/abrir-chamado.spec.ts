import { and, eq, sql } from 'drizzle-orm';
import { expect, test } from './fixtures';
import { enviar, ultimaResposta } from './helpers';
import { tickets } from '../lib/db/schema';

test('Ana abre um chamado de VPN conversando e confirma o rascunho', async ({ page, loginAs, seed, db }) => {
  await loginAs(page, 'ana');
  await enviar(page, 'Meu notebook não conecta na VPN, erro 809');
  const r1 = ultimaResposta(page);
  await expect(r1.getByTestId('status-line')).toContainText('consultou seus chamados');
  await expect(r1.getByTestId('status-line')).toContainText('buscou na central de ajuda');
  await expect(r1.getByTestId('quick-reply-2')).toContainText('Windows 11');

  await page.getByTestId('composer-input').blur();
  await page.keyboard.press('2');
  await expect(page.getByTestId('user-message').last()).toContainText('Windows 11');
  await expect(ultimaResposta(page).getByTestId('quick-reply-1')).toContainText('Só eu');

  await ultimaResposta(page).getByText('Só eu').click();
  const card = page.getByTestId('draft-card').last();
  await expect(card).toContainText('Alta');
  await expect(card).toContainText('resposta até');
  await expect(card).toContainText('Aguardando confirmação');

  await card.getByTestId('draft-edit').click();
  await card.getByTestId('draft-field-category').selectOption({ label: 'Rede e VPN' });
  await card.getByTestId('draft-save').click();
  await expect(card.getByTestId('draft-confirm')).toBeVisible();
  await expect(card).toContainText('Rede e VPN');

  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('system-event').filter({ hasText: /INC-205\d\d criado/ })).toBeVisible();
  await expect(page.getByTestId('ticket-card').last()).toBeVisible();
  await expect(card).toContainText(/Criado como INC-205\d\d/);

  // Segundo rascunho: clique duplo rápido em Confirmar cria um único chamado.
  const antes = await db.$count(tickets, eq(tickets.requester_id, seed.users.ana.id));
  await enviar(page, 'Só eu, preciso disso hoje');
  const card2 = page.getByTestId('draft-card').last();
  await expect(card2).toContainText('Aguardando confirmação');
  await card2.getByTestId('draft-confirm').dblclick();
  await expect(card2).toContainText(/Criado como INC-205\d\d/);
  await expect
    .poll(async () => db.$count(tickets, and(eq(tickets.requester_id, seed.users.ana.id), sql`true`)))
    .toBe(antes + 1);
});
