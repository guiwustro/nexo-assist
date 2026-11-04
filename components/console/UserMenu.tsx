'use client';

import { LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSair } from '@/lib/client/use-sair';
import { iniciaisDe } from './avatar';

export type ConsoleMe = { name: string; email: string; support_level: 'N1' | 'N2' | null };

/** Avatar do rail do console: abre o menu com os dados do analista, o perfil e o Sair. */
export function UserMenu({ me }: { me: ConsoleMe }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const sair = useSair();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const item = 'flex h-9 w-full items-center gap-2.5 rounded-btn px-2.5 text-body font-medium text-ink-2 hover:bg-desk';

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        data-testid="console-user"
        aria-label={`${me.name}: menu da conta`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-full bg-primary-soft text-label font-bold text-primary-text outline-offset-2 hover:ring-2 hover:ring-primary-soft"
      >
        {iniciaisDe(me.name)}
        <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-desk bg-success" />
      </button>
      {aberto && (
        <div
          role="menu"
          aria-label="Conta"
          className="absolute bottom-0 left-[calc(100%+10px)] z-20 flex w-60 flex-col rounded-card border border-card-border bg-paper p-1.5 shadow-lg"
        >
          <div className="flex flex-col gap-px border-b border-rule px-2.5 pt-1.5 pb-2.5">
            <span className="truncate text-body font-semibold text-ink">{me.name}</span>
            <span className="truncate text-tag-list text-ink-3">{me.email}</span>
            {me.support_level && <span className="pt-1 text-label text-ink-3">Analista {me.support_level}</span>}
          </div>
          <div className="flex flex-col gap-0.5 pt-1.5">
            <Link role="menuitem" href="/console/perfil" onClick={() => setAberto(false)} className={item}>
              <UserRound size={16} className="text-ink-3" />
              Meu perfil
            </Link>
            <button
              role="menuitem"
              type="button"
              data-testid="console-logout"
              onClick={() => void sair()}
              className={item}
            >
              <LogOut size={16} className="text-ink-3" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
