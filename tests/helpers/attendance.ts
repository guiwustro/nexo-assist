import { getOrCreateWithAgent, touchSession } from '@/lib/conversations/attendance';
import type { Conversation } from '@/lib/conversations/service';

/** Abre/recupera o atendimento com o agent e garante a sessão usada pelo contador. */
export async function getAgentAttendance(employeeId: string, sid: string, now: Date): Promise<Conversation> {
  await touchSession(employeeId, sid, now);
  return (await getOrCreateWithAgent(employeeId, now)).conversation;
}
