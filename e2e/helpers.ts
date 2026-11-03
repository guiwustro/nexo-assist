import { expect, type Page } from '@playwright/test';

/** Envia uma mensagem pelo composer e espera o turno terminar (composer liberado de novo). */
export async function enviar(page: Page, texto: string): Promise<void> {
  const input = page.getByTestId('composer-input');
  await expect(input).toBeEnabled();
  await input.fill(texto);
  await input.press('Enter');
  await expect(page.getByTestId('composer-input')).toBeEnabled({ timeout: 15_000 });
}

/** Última resposta do agent (bloco com status line, bolha e cards). */
export const ultimaResposta = (page: Page) => page.getByTestId('agent-message').last();
