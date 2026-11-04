import { describe, expect, it } from 'vitest';
import { conversations } from '@/lib/db/schema/app';
import { useTestDb } from '@/tests/helpers/db';

const t = useTestDb();

describe('attendance schema', () => {
  it('um funcionário não tem dois atendimentos com o agent', async () => {
    const ana = t.seed.users.ana.id;
    await t.db.insert(conversations).values({ employee_id: ana, status: 'ai_handling' });
    await expect(t.db.insert(conversations).values({ employee_id: ana, status: 'ai_handling' })).rejects.toThrow();
  });

  it('vários atendimentos com analista convivem com um com o agent', async () => {
    const ana = t.seed.users.ana.id;
    await t.db.insert(conversations).values([
      { employee_id: ana, status: 'ai_handling' },
      { employee_id: ana, status: 'pending' },
      { employee_id: ana, status: 'pending' },
    ]);
  });

  it('closed exige motivo', async () => {
    await expect(t.db.insert(conversations).values({ employee_id: t.seed.users.ana.id, status: 'closed' })).rejects.toThrow();
  });
});
