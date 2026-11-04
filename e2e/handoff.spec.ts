import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { send } from './helpers';
import { E2E_NOW } from './env';
import { DEMO_PASSWORD, userByKey, type UserKey } from '../lib/db/seed-data';

async function openConversation(browser: Browser, who: UserKey): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(E2E_NOW);
  const res = await page.request.post('/api/v1/auth/login', { data: { email: userByKey(who).email, password: DEMO_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  return page;
}

test('Ana pede um analista, Rafael assume, responde, devolve e encerra', async ({ browser }) => {
  const ana = await openConversation(browser, 'ana');
  const rafael = await openConversation(browser, 'rafael');

  // 1. Ana pede um analista.
  await ana.goto('/atendimento');
  await send(ana, 'quero falar com um analista');
  await expect(ana.getByTestId('system-event').filter({ hasText: 'Transferida para Suporte' })).toBeVisible();
  await expect(ana.getByTestId('composer-input')).toHaveAttribute('placeholder', 'Conversa com analista');

  // 2. Rafael vê a fila e abre a Ana.
  await rafael.goto('/console');
  await expect(rafael.getByTestId('filter-for_you')).toContainText('3');
  await rafael.getByTestId('filter-for_you').click();
  const itemAna = rafael.getByTestId('conversation-item').filter({ hasText: 'Ana Souza' });
  await expect(itemAna).toContainText('Transferida');
  await expect(rafael.getByTestId('conversation-item').filter({ hasText: 'Bruno Tavares' })).toContainText(
    'Agent pediu ajuda · confiança 41%',
  );
  await itemAna.click();
  await expect(rafael.getByTestId('conversation-mode')).toContainText('Aguardando atendente');
  await expect(rafael.getByTestId('handoff-card')).toContainText('"quero falar com um analista"');
  await expect(rafael.getByTestId('takeover-bar')).toContainText('Ana espera um atendente');
  await expect(rafael.getByTestId('takeover-bar')).toContainText(/Agent pausado · até/);
  await expect(rafael.getByTestId('console-composer')).toHaveAttribute('placeholder', 'Assuma o atendimento para responder');

  // 3. Rafael assume; Ana vê sem recarregar.
  await rafael.getByTestId('takeover-claim').click();
  await expect(rafael.getByTestId('header-close')).toBeVisible();
  await expect(ana.getByTestId('system-event').filter({ hasText: 'Rafael Lima assumiu · agent pausado' })).toBeVisible({
    timeout: 5000,
  });

  // 4. Ana escreve: vai para o analista, o agent não responde.
  const rowsBefore = await ana.getByTestId('status-line').count();
  await send(ana, 'ainda está lento');
  await expect(rafael.getByTestId('console-thread')).toContainText('ainda está lento', { timeout: 5000 });
  await expect(ana.getByTestId('status-line')).toHaveCount(rowsBefore);

  // 5. Rafael responde.
  await rafael.getByTestId('console-composer').fill('Vou reiniciar seu perfil');
  await rafael.getByTestId('console-send').click();
  const bubble = rafael.getByTestId('human-message').last();
  await expect(bubble).toContainText('Vou reiniciar seu perfil');
  await expect(bubble).toContainText('Suporte N2');
  await expect(ana.getByText('Vou reiniciar seu perfil')).toBeVisible({ timeout: 5000 });

  // 6. Rafael devolve; o agent volta a responder.
  await rafael.getByTestId('header-release').click();
  await expect(rafael.getByTestId('takeover-claim')).toBeVisible();
  await expect(ana.getByTestId('composer-input')).toHaveAttribute('placeholder', 'Escreva para o Nexo…', { timeout: 5000 });
  await send(ana, 'qual o status do meu chamado?');
  await expect(ana.getByTestId('status-line')).toHaveCount(rowsBefore + 1);

  // 7. Assume de novo e encerra.
  await rafael.getByTestId('takeover-claim').click();
  await rafael.getByTestId('header-close').click();
  await expect(ana.getByTestId('system-event').filter({ hasText: 'Atendimento encerrado' })).toBeVisible({ timeout: 5000 });
});

test('dois analistas: o segundo a assumir vê que o primeiro já assumiu', async ({ browser, seed }) => {
  const rafael = await openConversation(browser, 'rafael');
  const juliana = await openConversation(browser, 'juliana');
  const carla = seed.conversations.carla!;

  await juliana.route('**/api/v1/events*', (r) => r.abort());
  let first: string | null = null;
  await juliana.route(`**/api/v1/conversations/${carla}`, async (r) => {
    if (r.request().method() !== 'GET') return r.continue();
    if (first) return r.fulfill({ status: 200, contentType: 'application/json', body: first });
    const res = await r.fetch();
    first = await res.text();
    return r.fulfill({ response: res, body: first });
  });

  await juliana.goto(`/console/${carla}`);
  await rafael.goto(`/console/${carla}`);
  await expect(juliana.getByTestId('takeover-claim')).toBeVisible();
  await rafael.getByTestId('takeover-claim').click();
  await expect(rafael.getByTestId('header-close')).toBeVisible();
  await juliana.getByTestId('takeover-claim').click();
  await expect(juliana.getByTestId('toast')).toContainText('Rafael Lima já assumiu esta conversa');
});

test('painel de chamados, filtro vazio e busca', async ({ browser }) => {
  const ana = await openConversation(browser, 'ana');
  const rafael = await openConversation(browser, 'rafael');
  await ana.goto('/atendimento');
  await send(ana, 'INC-20311');
  await send(ana, 'quero falar com um analista');

  await rafael.goto('/console');
  await rafael.getByTestId('conversation-item').filter({ hasText: 'Ana Souza' }).click();
  const panel = rafael.getByTestId('employee-tickets');
  await expect(panel).toContainText('Chamados da Ana');
  await expect(panel).toContainText('3 abertos · 3 encerrados');
  await expect(panel.getByTestId('focus-ticket')).toContainText('INC-20311');
  const others = panel.getByTestId('other-tickets');
  await expect(others).toContainText('INC-20298');
  await expect(others).toContainText('REQ-10442');
  await expect(others).toContainText('INC-19877');
  await expect(panel).not.toContainText('INC-20388');

  await rafael.getByTestId('filter-mine').click();
  await expect(rafael.getByText('Nenhuma conversa aqui')).toBeVisible();
  await rafael.getByTestId('filter-all').click();
  await rafael.getByTestId('console-search').fill('INC-20311');
  await expect(rafael.getByTestId('conversation-item')).toHaveCount(1);
  await expect(rafael.getByTestId('conversation-item')).toContainText('Ana Souza');
});
