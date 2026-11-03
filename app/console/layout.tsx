import { ConsoleFrame } from '@/components/console/ConsoleFrame';
import { requirePageUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePageUser('analyst');
  return <ConsoleFrame me={{ name: user.name }}>{children}</ConsoleFrame>;
}
