import { ConsoleConversation } from '@/components/console/ConsoleConversation';
import { requirePageUser } from '@/lib/server/session';

export const metadata = { title: 'Console · Nexo Assist' };

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const { user } = await requirePageUser('analyst');
  return <ConsoleConversation key={conversationId} id={conversationId} me={{ id: user.id, name: user.name }} />;
}
