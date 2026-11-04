import { test as base, expect, type Page } from '@playwright/test';
import { createDb, type Db } from '../lib/db/client';
import { resetAndSeed, type SeedResult } from '../lib/db/seed';
import type { UserKey } from '../lib/db/seed-data';
import { DEMO_PASSWORD, userByKey } from '../lib/db/seed-data';
import { E2E_NOW, E2E_DB, E2E_SECRET, E2E_TICKETS_PORT } from './env';

type Fixtures = {
  seed: SeedResult;
  db: Db;
  loginAs: (page: Page, who: UserKey) => Promise<void>;
  chaos: { outage: (seconds: number) => Promise<void> };
};

export const test = base.extend<Fixtures>({
  seed: [
    async ({ request }, use) => {
      // Estado em memória dos dois processos volta ao zero: sem queda programada, disjuntor fechado.
      await request.post(`http://127.0.0.1:${E2E_TICKETS_PORT}/_chaos/outage?seconds=0`, {
        headers: { 'x-internal-secret': E2E_SECRET },
      });
      const reset = await request.post('/api/v1/e2e/reset');
      expect(reset.ok(), `reset do web: ${reset.status()}`).toBeTruthy();
      await use(await resetAndSeed(E2E_DB, E2E_NOW));
    },
    { auto: true },
  ],
  db: async ({}, use) => {
    const db = createDb(E2E_DB, { max: 2 });
    await use(db);
    await db.$client.end({ timeout: 1 });
  },
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(E2E_NOW);
    await use(page);
  },
  loginAs: async ({}, use) => {
    await use(async (page, who) => {
      const res = await page.request.post('/api/v1/auth/login', {
        data: { email: userByKey(who).email, password: DEMO_PASSWORD },
      });
      expect(res.ok(), `login de ${who}: ${res.status()} ${await res.text()}`).toBeTruthy();
      await page.goto(userByKey(who).role === 'analyst' ? '/console' : '/atendimento');
    });
  },
  chaos: async ({ request }, use) => {
    await use({
      outage: async (seconds) => {
        const res = await request.post(`http://127.0.0.1:${E2E_TICKETS_PORT}/_chaos/outage?seconds=${seconds}`, {
          headers: { 'x-internal-secret': E2E_SECRET },
        });
        expect(res.ok()).toBeTruthy();
      },
    });
  },
});

export { expect };
