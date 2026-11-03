import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { messages } from '@/lib/db/schema';
import { noteToMemory } from '@/lib/agent-engine/agent/memory';

/** Ao devolver, o agent fica sabendo o que o analista disse (texto literal, até 3 mensagens). */
export async function writeReleaseNote(conversationId: string, employeeId: string, analyst: { id: string; name: string }) {
  const ultimas = await getDb()
    .select({ body: messages.body })
    .from(messages)
    .where(
      and(
        eq(messages.conversation_id, conversationId),
        eq(messages.sent_by_user_id, analyst.id),
        eq(messages.sent_via, 'user'),
        eq(messages.type, 'text'),
      ),
    )
    .orderBy(desc(messages.created_at))
    .limit(3);
  const falas = ultimas.reverse().map((m) => `"${m.body}"`);
  const resumo = falas.length ? falas.join(' / ') : 'sem mensagens para o funcionário';
  await noteToMemory(conversationId, employeeId, `O analista ${analyst.name} atendeu e devolveu: ${resumo}`);
}
