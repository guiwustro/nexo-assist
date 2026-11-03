import 'dotenv/config';
import { migrateDb } from './migrate';
import { resetAndSeed } from './seed';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');
await migrateDb(url);
await resetAndSeed(url);
console.log('banco migrado e semeado do zero');
