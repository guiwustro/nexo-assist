import { expect, test } from './fixtures';

/** Controles do console que pareciam clicáveis e não faziam nada (docs/PROXIMOS-PASSOS.md, item 2). */
test.describe('controles do console', () => {
  test('busca da lista ignora acento e procura nos chamados do funcionário, mostrando o porquê', async ({ page, loginAs }) => {
    await loginAs(page, 'rafael');
    const itens = page.getByTestId('conversation-item');

    await page.getByTestId('console-search').fill('fabio');
    await expect(itens).toHaveCount(1);
    await expect(itens.first()).toContainText('Fábio Nunes');

    await page.getByTestId('console-search').fill('Diretoria');
    await expect(itens).toHaveCount(1);
    await expect(itens.first()).toContainText('Carla Mendes');
    await expect(itens.first().getByTestId('conversation-match')).toContainText('INC-20388 · Acesso à pasta da Diretoria');

    await page.getByTestId('console-search').fill('ana');
    await expect(itens).toHaveCount(1);
    await expect(itens.first()).toContainText('Ana Souza');
    await expect(page.getByText('Nada encontrado para “ana”')).toHaveCount(0);
  });

  test('linha de "Outros chamados" abre o detalhe com histórico e Voltar retorna', async ({ page, loginAs, seed }) => {
    await loginAs(page, 'rafael');
    await page.goto(`/console/${seed.conversations.carla}`);
    await page.getByTestId('employee-ticket-REQ-10460').click();
    const detail = page.getByTestId('ticket-detail');
    await expect(detail).toContainText('Licença do Power BI');
    await expect(detail).toContainText('Histórico');
    await expect(detail).toContainText('Chamado aberto');
    await page.getByRole('button', { name: 'Voltar aos chamados' }).click();
    await expect(page.getByTestId('other-tickets')).toBeVisible();
  });

  test('lupa busca na conversa aberta, destaca e Esc fecha', async ({ page, loginAs, seed }) => {
    await loginAs(page, 'rafael');
    await page.goto(`/console/${seed.conversations.carla}`);
    await page.getByTestId('header-search').click();
    await page.getByRole('searchbox', { name: 'Buscar na conversa' }).fill('sap');
    await expect(page.getByTestId('busca-contador')).toHaveText('1 de 1');
    await expect(page.locator('mark[data-busca-ativa]')).toHaveText('SAP');
    await page.getByRole('searchbox', { name: 'Buscar na conversa' }).press('Escape');
    await expect(page.getByTestId('conversation-search')).toHaveCount(0);
    await expect(page.locator('mark')).toHaveCount(0);
  });

  test('"Disponível" é um selo, não um botão', async ({ page, loginAs }) => {
    await loginAs(page, 'rafael');
    const badge = page.getByTestId('analyst-status');
    await expect(badge).toHaveText('Disponível');
    expect(await badge.evaluate((el) => el.tagName)).toBe('SPAN');
  });
});
