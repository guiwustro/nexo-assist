/** Ambiente da stack de E2E: banco próprio, portas próprias, modelo roteirizado. */
export const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgres://nexo:nexo@localhost:5432/nexo_e2e';
export const E2E_WEB_PORT = 3100;
export const E2E_TICKETS_PORT = 4101;
export const E2E_SECRET = 'segredo-interno-e2e';
/** Terça-feira, 03/11/2026, 10:00 em São Paulo. */
export const E2E_NOW = new Date('2026-11-03T13:00:00.000Z');

export const E2E_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  E2E: 'true',
  NOW_OVERRIDE: E2E_NOW.toISOString(),
  DATABASE_URL: E2E_DB,
  SESSION_SECRET: 'segredo-de-sessao-do-e2e-com-32-caracteres',
  TICKETS_URL: `http://localhost:${E2E_TICKETS_PORT}`,
  TICKETS_PORT: String(E2E_TICKETS_PORT),
  TICKETS_HOST: '127.0.0.1',
  TICKETS_INTERNAL_SECRET: E2E_SECRET,
  TICKETS_CHAOS_ENABLED: 'true',
  TICKETS_FAILURE_RATE: '0',
  LLM_PROVIDER: 'scripted',
  MODEL_ID: 'deepseek-flash',
  SESSION_MESSAGE_LIMIT: '30',
  LOW_CONFIDENCE_THRESHOLD: '0.6',
  RATE_LIMIT_PER_MINUTE: '1000',
  NEXT_DIST_DIR: '.next-e2e',
};
