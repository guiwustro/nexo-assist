import { defineConfig } from '@playwright/test';

// Esqueleto. A Task 12 completa com webServer (web + tickets) e o banco nexo_e2e.
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  use: { baseURL: 'http://localhost:3100' },
});
