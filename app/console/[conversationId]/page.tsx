import { ConsoleConversation } from '@/components/console/ConsoleConversation';
import { requirePageUser } from '@/lib/server/session';
import { z } from 'zod';

export const metadata = { title: 'Console · Nexo Assist' };

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const [{ conversationId }, { msg }] = await Promise.all([params, searchParams]);
  const { user } = await requirePageUser('analyst');
  return (
    <ConsoleConversation
      key={conversationId}
      id={conversationId}
      me={{ id: user.id, name: user.name }}
      jumpTo={z.string().uuid().safeParse(msg).data ?? null}
    />
  );
}
