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
