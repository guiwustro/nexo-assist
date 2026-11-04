import { MyTicketDetail } from '@/components/tickets/MyTicketDetail';

export const metadata = { title: 'Chamado · Nexo Assist' };

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <MyTicketDetail code={decodeURIComponent(code)} />;
}
