import { MyTickets } from '@/components/tickets/MyTickets';

export const metadata = { title: 'Meus chamados · Nexo Assist' };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba: tab } = await searchParams;
  return <MyTickets initialTab={tab === 'resolvidos' ? 'closed' : 'open'} />;
}
