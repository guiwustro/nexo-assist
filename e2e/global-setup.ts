import { migrateDb } from '../lib/db/migrate';
import { E2E_DB } from './env';

export default async function globalSetup(): Promise<void> {
  await migrateDb(E2E_DB);
}
