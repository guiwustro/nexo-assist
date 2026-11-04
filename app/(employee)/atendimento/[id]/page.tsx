import { ChatView } from '@/components/chat/ChatView';
import { z } from 'zod';

export const metadata = { title: 'Atendimento · Nexo Assist' };

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const [{ id }, { msg }] = await Promise.all([params, searchParams]);
  return <ChatView conversationId={id} jumpTo={z.string().uuid().safeParse(msg).data ?? null} />;
}
