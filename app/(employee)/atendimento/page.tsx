import { ChatView } from '@/components/chat/ChatView';
import { TicketCodeSchema } from '@/lib/contracts/tickets';

export const metadata = { title: 'Atendimento · Nexo Assist' };

/** `?sobre=INC-20311` (vindo de "Meus chamados") abre o composer com "Sobre o INC-20311: ". */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ sobre?: string }> }) {
  const { sobre: about } = await searchParams;
  const code = TicketCodeSchema.safeParse(about);
  return <ChatView aboutTicket={code.success ? code.data : undefined} />;
}
