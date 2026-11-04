'use client';

import { ChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function TopBar() {
  const path = usePathname();
  const section = path.startsWith('/perfil') ? 'profile' : path.startsWith('/chamados') ? 'tickets' : 'support';
  const here = { profile: 'Meu perfil', tickets: 'Meus chamados', support: 'Atendimento' }[section];
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-rule px-8">
      <div className="flex flex-1 items-center gap-2 text-body">
        <span className="text-ink-3">Service desk de TI</span>
        <ChevronRight size={14} className="text-ink-3" />
        <span className="font-semibold text-ink">{here}</span>
      </div>
      {section === 'support' && (
        <span
          data-testid="topbar-status"
          className="flex items-center gap-[7px] rounded-full bg-success-soft px-2.5 py-[5px] text-label font-semibold text-success-text"
        >
          <span className="size-[7px] rounded-full bg-success" />
          Assistente online
        </span>
      )}
    </header>
  );
}
