import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

export type UserRow = typeof users.$inferSelect;

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [u] = await getDb()
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.trim().toLowerCase()));
  return u ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const [u] = await getDb().select().from(users).where(eq(users.id, id));
  return u ?? null;
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as 'employee' | 'analyst',
    department: u.department,
    support_level: u.support_level as 'N1' | 'N2' | null,
  };
}
