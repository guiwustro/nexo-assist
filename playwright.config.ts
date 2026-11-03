import { defineConfig, devices } from '@playwright/test';
import { E2E_ENV, E2E_TICKETS_PORT, E2E_WEB_PORT } from './e2e/env';

const env = { ...process.env, ...E2E_ENV } as Record<string, string>;

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'pnpm tickets:start',
      url: `http://127.0.0.1:${E2E_TICKETS_PORT}/healthz`,
      env,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm next build && pnpm next start -p ${E2E_WEB_PORT}`,
      url: `http://localhost:${E2E_WEB_PORT}/api/v1/ping`,
      env,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
