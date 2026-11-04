import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { initials, requirePageUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function FuncionarioLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePageUser('employee');
  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <Sidebar name={user.name} email={user.email} initials={initials(user.name)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
