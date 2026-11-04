import { eq } from 'drizzle-orm';
import { expect, test } from './fixtures';
import { enviar } from './helpers';
import { conversations } from '../lib/db/schema';

test('a 30ª mensagem da sessão transfere para um analista', async ({ page, loginAs, db, seed, browser }) => {
  await loginAs(page, 'diego');
  await expect(page.getByTestId('session-counter')).toContainText('0/30');
  await db.update(conversations).set({ session_message_count: 29 }).where(eq(conversations.id, seed.conversations.diego!));

  await enviar(page, 'mais uma dúvida sobre a impressora');
  await expect(page.getByTestId('session-counter')).toContainText('30/30');
  await expect(page.getByTestId('session-counter')).toHaveClass(/danger/);
  await expect(page.getByTestId('system-event').filter({ hasText: 'Transferida para Suporte' })).toBeVisible();
  await expect(page.getByTestId('composer-input')).toHaveAttribute('placeholder', 'Conversa com analista');

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rafael = await ctx.newPage();
  await rafael.request.post('/api/v1/auth/login', { data: { email: 'rafael.lima@nexo.com.br', password: 'x' } });
  await rafael.goto('/console');
  await expect(rafael.getByTestId('conversation-item').filter({ hasText: 'Diego Ramos' })).toContainText('limite da sessão');
});

test('depois do limite o funcionário continua falando com o analista; de volta ao agent, vê o aviso', async ({ page, loginAs, db, seed }) => {
  await loginAs(page, 'diego');
  await expect(page.getByTestId('session-counter')).toContainText('0/30');
  await db.update(conversations).set({ session_message_count: 29 }).where(eq(conversations.id, seed.conversations.diego!));
  await enviar(page, 'mais uma dúvida sobre a impressora');
  await expect(page.getByTestId('composer-input')).toHaveAttribute('placeholder', 'Conversa com analista');

  await enviar(page, 'ainda estou aguardando');
  await expect(page.getByTestId('user-message').filter({ hasText: 'ainda estou aguardando' })).toBeVisible();

  // O analista devolveu ao agent: acima do limite, a mensagem é recusada com um aviso, não some.
  await db.update(conversations).set({ status: 'ai_handling' }).where(eq(conversations.id, seed.conversations.diego!));
  await page.reload();
  await enviar(page, 'e agora?');
  await expect(page.getByTestId('rate-banner')).toContainText('Limite de 30 mensagens');
});
