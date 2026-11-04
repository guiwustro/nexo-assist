'use client';

import { LogOut, MessageSquare, Ticket, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NexoMark } from '@/components/ui/NexoMark';
import { useLogout } from '@/lib/client/use-logout';

const NAV = [
  { href: '/atendimento', label: 'Atendimento', Icon: MessageSquare },
  { href: '/chamados', label: 'Meus chamados', Icon: Ticket },
  { href: '/perfil', label: 'Meu perfil', Icon: UserRound },
];

export function Sidebar({ name, email, initials }: { name: string; email: string; initials: string }) {
  const path = usePathname();
  const sair = useLogout();

  return (
    <aside className="flex h-screen w-[232px] shrink-0 flex-col border-r border-rule px-3.5 pt-5 pb-3.5">
      <div className="flex items-center gap-2.5 px-2">
        <NexoMark size={20} color="#037AF6" />
        <span className="text-base font-bold text-ink">Nexo Assist</span>
      </div>
      <div className="h-[22px]" />
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-btn px-2.5 text-body ${
                active ? 'bg-primary-soft font-semibold text-primary-text' : 'font-medium text-ink-2 hover:bg-desk'
              }`}
            >
              <Icon size={16} className={active ? 'text-primary-text' : 'text-ink-3'} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div data-testid="sidebar-user" className="flex items-center gap-2.5 border-t border-rule px-2 pt-3.5 pb-1">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-label font-bold text-primary-text">
          {initials}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-body font-semibold text-ink">{name}</span>
          <span className="truncate text-tag-list text-ink-3">{email}</span>
        </span>
      </div>
      <button
        type="button"
        data-testid="sidebar-logout"
        onClick={sair}
        className="mt-1 flex h-[34px] items-center gap-2.5 rounded-btn px-2.5 text-body font-medium text-ink-2 hover:bg-desk"
      >
        <LogOut size={16} className="text-ink-3" />
        Sair
      </button>
    </aside>
  );
}
