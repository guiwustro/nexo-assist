import 'dotenv/config';

// Integração sempre roda no banco de teste: o `getDb()` padrão também aponta para ele.
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.LLM_PROVIDER = 'scripted';
