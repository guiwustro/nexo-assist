import { ChatView } from '@/components/chat/ChatView';
import { TicketCodeSchema } from '@/lib/contracts/tickets';

export const metadata = { title: 'Atendimento · Nexo Assist' };

/** `?sobre=INC-20311` (vindo de "Meus chamados") abre o composer com "Sobre o INC-20311: ". */
export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ sobre?: string }> }) {
  const { sobre } = await searchParams;
  const code = TicketCodeSchema.safeParse(sobre);
  return <ChatView aboutTicket={code.success ? code.data : undefined} />;
}
