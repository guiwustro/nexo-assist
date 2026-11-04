import { expect, type Page } from '@playwright/test';

/** Envia uma mensagem pelo composer e espera o turno terminar (composer liberado de novo). */
export async function send(page: Page, text: string): Promise<void> {
  const input = page.getByTestId('composer-input');
  await expect(input).toBeEnabled();
  await input.fill(text);
  await input.press('Enter');
  await expect(page.getByTestId('composer-input')).toBeEnabled({ timeout: 15_000 });
}

/** Última resposta do agent (bloco com status line, bolha e cards). */
export const lastAgentReply = (page: Page) => page.getByTestId('agent-message').last();
