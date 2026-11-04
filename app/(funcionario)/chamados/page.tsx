import { MyTickets } from '@/components/tickets/MyTickets';

export const metadata = { title: 'Meus chamados · Nexo Assist' };

export default async function ChamadosPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  return <MyTickets initialTab={aba === 'resolvidos' ? 'closed' : 'open'} />;
}
