import { eq } from 'drizzle-orm';
import { expect, test } from './fixtures';
import { enviar, ultimaResposta } from './helpers';
import { tickets } from '../lib/db/schema';

test('sistema de chamados fora: aviso honesto, rascunho guardado e confirmação depois', async ({
  page,
  loginAs,
  chaos,
  db,
  seed,
}) => {
  test.setTimeout(90_000);
  await loginAs(page, 'ana');
  const inicio = Date.now();
  await chaos.outage(20);

  await enviar(page, 'qual o status do meu chamado?');
  const r = ultimaResposta(page);
  await expect(r.getByTestId('status-line')).toContainText('sistema de chamados indisponível');
  await expect(r.getByTestId('status-item').filter({ hasText: 'indisponível' })).toHaveAttribute('data-result', 'error');
  await expect(r).toContainText('fora do ar');
  await expect(r.getByTestId('ticket-selector')).toHaveCount(0);

  await enviar(page, 'Só eu, preciso da VPN hoje');
  const card = page.getByTestId('draft-card').last();
  await expect(card).toContainText('Aguardando confirmação');
  const antes = await db.$count(tickets, eq(tickets.requester_id, seed.users.ana.id));
  await card.getByTestId('draft-confirm').click();
  await expect(card.getByTestId('draft-error')).toContainText('fora do ar');
  await expect(card.getByTestId('draft-error')).toContainText('rascunho está guardado');
  await expect(card.getByTestId('draft-confirm')).toContainText('Tentar de novo');

  const falta = 21_000 - (Date.now() - inicio);
  if (falta > 0) await page.waitForTimeout(falta);
  // O sistema voltou, mas o disjuntor pode seguir aberto até 15 s depois da última falha: a pessoa tenta de novo.
  await expect(async () => {
    await card.getByTestId('draft-confirm').click();
    await expect(card).toContainText(/Criado como INC-205\d\d/, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  expect(await db.$count(tickets, eq(tickets.requester_id, seed.users.ana.id))).toBe(antes + 1);
});

test('console com o sistema fora: painel de chamados avisa e o resto funciona', async ({ page, loginAs, chaos, seed }) => {
  await loginAs(page, 'rafael');
  await chaos.outage(15);
  await page.goto(`/console/${seed.conversations.carla}`);
  const painel = page.getByTestId('employee-tickets');
  await expect(painel.getByTestId('tickets-error')).toContainText('Não foi possível carregar', { timeout: 15_000 });
  await expect(painel.getByTestId('tickets-error')).toContainText('Tentar de novo');
  await expect(page.getByTestId('conversation-item').first()).toBeVisible();
  await expect(page.getByTestId('takeover-claim')).toBeVisible();
  await page.getByTestId('takeover-claim').click();
  await expect(page.getByTestId('header-close')).toBeVisible();
});
