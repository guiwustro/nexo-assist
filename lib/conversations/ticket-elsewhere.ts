import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { conversations, users } from '@/lib/db/schema';

export async function findAnalystAttendanceFor(
  employeeId: string,
  ticketCode: string,
  exceptId: string,
): Promise<{ conversation_id: string; status: 'pending' | 'claimed'; analyst_name: string | null } | null> {
  const conditions = [
    eq(conversations.employee_id, employeeId),
    eq(conversations.focus_ticket_code, ticketCode),
    inArray(conversations.status, ['pending', 'claimed']),
  ];
  if (exceptId) conditions.push(ne(conversations.id, exceptId));

  const [row] = await getDb()
    .select({
      conversation_id: conversations.id,
      status: conversations.status,
      analyst_name: users.name,
    })
    .from(conversations)
    .leftJoin(users, eq(users.id, conversations.assigned_to_user_id))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${conversations.last_message_at}, ${conversations.created_at})`))
    .limit(1);

  if (!row) return null;
  return {
    conversation_id: row.conversation_id,
    status: row.status as 'pending' | 'claimed',
    analyst_name: row.analyst_name,
  };
}
