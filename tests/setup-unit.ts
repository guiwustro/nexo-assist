import '@testing-library/jest-dom/vitest';

// Unitários não leem .env: valores mínimos para o env validado.
process.env.DATABASE_URL ??= 'postgres://nexo:nexo@localhost:5432/nexo_test';
process.env.SESSION_SECRET ??= 'segredo-de-teste-unitario-com-32-caracteres!!';
process.env.TICKETS_INTERNAL_SECRET ??= 'segredo-interno-teste';
process.env.LLM_PROVIDER = 'scripted';
