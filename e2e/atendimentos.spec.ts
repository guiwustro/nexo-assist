import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_NOW } from './env';
import { send } from './helpers';
import { DEMO_PASSWORD, userByKey, type UserKey } from '../lib/db/seed-data';

async function openSession(browser: Browser, who: UserKey): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(E2E_NOW);
  const response = await page.request.post('/api/v1/auth/login', {
    data: { email: userByKey(who).email, password: DEMO_PASSWORD },
  });
  expect(response.ok(), `login de ${who}: ${response.status()}`).toBeTruthy();
  return page;
}

test('com a conversa transferida, a funcionária fala de outro assunto com o agent', async ({
  page,
  loginAs,
}) => {
  await loginAs(page, 'ana');
  await send(page, 'quero falar com um analista');
  await expect(page.getByTestId('analyst-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Falar de outro assunto' }).click();
  await expect(page).toHaveURL(/\/atendimento\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('attendance-switcher')).toBeVisible();
  await expect(page.getByTestId('composer-input')).toHaveAttribute('placeholder', 'Escreva para o Nexo…');
  await send(page, 'qual o horário do service desk?');
  await expect(page.getByTestId('agent-message').last()).toContainText('8h às 18h');
  await page.getByTestId('attendance-switcher').click();
  await expect(page.getByTestId('attendance-item').filter({ hasText: 'Com o Nexo' })).toBeVisible();
  await expect(page.getByTestId('attendance-item').filter({ hasText: 'Aguardando analista' })).toBeVisible();
});

test('“isso resolveu” encerra e a próxima mensagem começa outro atendimento', async ({ page, loginAs }) => {
  await loginAs(page, 'diego');
  await send(page, 'qual o horário do service desk?');
  await send(page, 'Sim, resolveu');
  await expect(page.getByTestId('closed-attendance-banner')).toBeVisible();
  const before = page.url();
  await send(page, 'como redefinir a senha da rede?');
  await expect(page).not.toHaveURL(before);
  await expect(page.getByTestId('user-message')).toHaveCount(1);
});

test('Ver na conversa abre o atendimento no card do rascunho', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await send(page, 'Meu notebook não conecta na VPN, erro 809');
  await send(page, 'Windows 11');
  await send(page, 'Só eu, tenho reunião às 14h');
  await page.getByTestId('draft-confirm').click();
  await expect(page.getByTestId('draft-card')).toContainText(/Criado como INC-\d+/);
  const code = (await page.getByTestId('draft-card').textContent())!.match(/INC-\d+/)![0];
  await page.goto(`/chamados/${code}`);
  await page.getByRole('link', { name: 'Ver na conversa' }).click();
  await expect(page.getByTestId('message-highlight')).toContainText(code);
});

test('chamado sem atendimento diz que foi aberto fora do chat', async ({ page, loginAs }) => {
  await loginAs(page, 'ana');
  await page.goto('/chamados/INC-20298');
  await expect(page.getByText('Aberto fora do Nexo Assist')).toBeVisible();
});

test('Falar sobre este chamado abre o atendimento com analista daquele chamado', async ({
  page,
  loginAs,
}) => {
  await loginAs(page, 'carla');
  await page.goto('/chamados/INC-20388');
  await page.getByRole('link', { name: 'Falar sobre este chamado' }).click();
  await expect(page.getByTestId('analyst-banner')).toBeVisible();
});

test('analista encontra a conversa que criou o chamado e salta até o card', async ({ page, loginAs }) => {
  await loginAs(page, 'rafael');
  await page.goto('/console');
  await page.getByTestId('conversation-item').filter({ hasText: 'Elisa Prado' }).click();
  await expect(page.getByTestId('focus-ticket')).toContainText('INC-20519');
  await page.getByTestId('employee-ticket-INC-20519').click();

  const attendances = page.getByTestId('ticket-attendances');
  await expect(attendances).toContainText('Criado aqui');
  await expect(attendances.getByRole('link', { name: 'Esta conversa' })).toBeVisible();
  await attendances.getByRole('link', { name: 'Esta conversa' }).click();
  await expect(page.getByTestId('message-highlight')).toContainText('INC-20519');
});

test('devolver junta ao atendimento ativo do funcionário', async ({ browser }) => {
  const ana = await openSession(browser, 'ana');
  const rafael = await openSession(browser, 'rafael');
  await ana.goto('/atendimento');
  await send(ana, 'quero falar com um analista');
  await expect(ana.getByTestId('analyst-banner')).toBeVisible();
  await ana.getByRole('button', { name: 'Falar de outro assunto' }).click();
  await expect(ana).toHaveURL(/\/atendimento\/[0-9a-f-]{36}$/);

  await rafael.goto('/console');
  const transferred = rafael
    .getByTestId('conversation-item')
    .filter({ hasText: 'Ana Souza' })
    .filter({ hasText: 'Transferida' });
  await transferred.click();
  await rafael.getByTestId('takeover-claim').click();
  await expect(rafael.getByTestId('takeover-merge-warning')).toContainText(
    'Ana já tem outro atendimento com o agent: devolver junta os dois',
  );
  await rafael.getByTestId('header-release').click();
  await expect(rafael.getByTestId('conversation-mode')).toHaveText('Encerrada');
  await expect(
    rafael.getByTestId('console-system').filter({ hasText: 'Rafael Lima devolveu ao agent · juntado ao atendimento atual' }),
  ).toBeVisible();

  await ana.getByTestId('attendance-switcher').click();
  const closed = ana.getByTestId('attendance-item').filter({ hasText: 'Encerrada · juntada' });
  await expect(closed).toBeVisible();
  const active = ana.getByTestId('attendance-item').filter({ hasText: 'Com o Nexo' });
  await active.click();
  await expect(
    ana.getByText(/devolveu um atendimento sobre outro assunto · o Nexo já sabe o que foi feito/),
  ).toBeVisible();

  await ana.context().close();
  await rafael.context().close();
});
