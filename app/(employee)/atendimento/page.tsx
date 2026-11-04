import { ChatView } from '@/components/chat/ChatView';
import { TicketCodeSchema } from '@/lib/contracts/tickets';
import { findAnalystAttendanceFor } from '@/lib/conversations/ticket-elsewhere';
import { requirePageUser } from '@/lib/server/session';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Atendimento · Nexo Assist' };

/** `?sobre=INC-20311` (vindo de "Meus chamados") abre o composer com "Sobre o INC-20311: ". */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ sobre?: string }> }) {
  const { sobre: about } = await searchParams;
  const code = TicketCodeSchema.safeParse(about);
  if (code.success) {
    const { user } = await requirePageUser('employee');
    const attendance = await findAnalystAttendanceFor(user.id, code.data, '');
    if (attendance) redirect(`/atendimento/${attendance.conversation_id}`);
  }
  return <ChatView aboutTicket={code.success ? code.data : undefined} />;
}
