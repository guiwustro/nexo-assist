import { requirePageUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser('analyst');
  return <div className="h-screen overflow-hidden bg-paper">{children}</div>;
}
