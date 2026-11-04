import { eq } from 'drizzle-orm';
import { conversations, messages } from '../lib/db/schema';
import { expect, test } from './fixtures';
import { enviar, ultimaResposta } from './helpers';
import { AGORA_E2E } from './env';

/** Histórico: "Meus chamados", chamados resolvidos pelo chat e mensagens anteriores (docs/PROXIMOS-PASSOS.md, item 3). */
test.describe('histórico', () => {
  test('Meus chamados: em andamento, resolvidos, detalhe com histórico e voltar ao chat sobre o chamado', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.getByRole('link', { name: 'Meus chamados' }).click();
    await expect(page).toHaveURL(/\/chamados$/);

    await expect(page.getByTestId('tab-open')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('my-ticket-INC-20311')).toBeVisible();
    await expect(page.getByTestId('my-ticket-INC-20150')).toHaveCount(0);

    await page.getByTestId('tab-closed').click();
    await expect(page.getByTestId('my-ticket-INC-20150')).toBeVisible();
    await expect(page.getByTestId('my-ticket-INC-20311')).toHaveCount(0);

    await page.getByTestId('my-ticket-INC-20150').click();
    await expect(page).toHaveURL(/\/chamados\/INC-20150$/);
    await expect(page.getByTestId('ticket-card')).toContainText('Senha do SAP bloqueada');
    await expect(page.getByTestId('ticket-history')).toContainText('Chamado aberto');

    await page.getByTestId('talk-about-ticket').click();
    await expect(page).toHaveURL(/\/atendimento$/);
    await expect(page.getByTestId('composer-input')).toHaveValue('Sobre o INC-20150: ');
  });

  test('voltar do detalhe de um resolvido cai na aba Resolvidos', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.goto('/chamados/INC-19877');
    await page.getByTestId('my-ticket-detail').getByRole('link', { name: 'Meus chamados' }).click();
    await expect(page).toHaveURL(/\/chamados\?aba=resolvidos$/);
    await expect(page.getByTestId('tab-closed')).toHaveAttribute('aria-selected', 'true');
  });

  test('chamado de outra pessoa não aparece pelo endereço', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await page.goto('/chamados/INC-20388');
    await expect(page.getByText('Não encontramos o chamado INC-20388 entre os seus.')).toBeVisible();
    await expect(page.getByText('Diretoria')).toHaveCount(0);
  });

  test('no chat, pedir os chamados resolvidos mostra só os encerrados', async ({ page, loginAs }) => {
    await loginAs(page, 'ana');
    await enviar(page, 'Quero ver meus chamados resolvidos');
    const resposta = ultimaResposta(page);
    await expect(resposta.getByTestId('ticket-option-INC-20150')).toBeVisible();
    await expect(resposta.getByTestId('ticket-option-INC-19877')).toBeVisible();
    await expect(resposta.getByTestId('ticket-option-INC-20311')).toHaveCount(0);
  });

  test('conversa longa: carregar mensagens anteriores no chat e no console', async ({ page, loginAs, db, seed }) => {
    await loginAs(page, 'ana');
    await expect(page.getByTestId('composer-input')).toBeEnabled();
    const [conv] = await db.select().from(conversations).where(eq(conversations.employee_id, seed.users.ana.id));
    const base = AGORA_E2E.getTime() - 3_600_000;
    await db.insert(messages).values(
      Array.from({ length: 70 }, (_, i) => ({
        conversation_id: conv!.id,
        direction: 'inbound' as const,
        sent_via: 'user' as const,
        body: `mensagem antiga ${i}`,
        created_at: new Date(base + i * 1000),
      })),
    );

    await page.reload();
    await expect(page.getByText('mensagem antiga 69', { exact: true })).toBeVisible();
    await expect(page.getByText('mensagem antiga 0', { exact: true })).toHaveCount(0);
    await page.getByTestId('load-older').click();
    await expect(page.getByText('mensagem antiga 0', { exact: true })).toBeAttached();
    await expect(page.getByTestId('load-older')).toHaveCount(0);

    await page.context().clearCookies();
    await loginAs(page, 'rafael');
    await page.goto(`/console/${conv!.id}`);
    await expect(page.getByText('mensagem antiga 69', { exact: true })).toBeVisible();
    await expect(page.getByText('mensagem antiga 0', { exact: true })).toHaveCount(0);
    await page.getByTestId('load-older').click();
    await expect(page.getByText('mensagem antiga 0', { exact: true })).toBeAttached();
  });
});
