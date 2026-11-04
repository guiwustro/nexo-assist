'use client';

import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Fragment } from 'react';
import { findMatches } from '@/lib/text/matches';

/** Barra "Buscar na conversa" do console: termo, contador e navegação entre os resultados. */
export function ConversationSearch({
  term: term,
  onTermChange: onTermChange,
  total,
  current: current,
  onIndexChange: onIndexChange,
  onClose,
}: {
  term: string;
  onTermChange: (t: string) => void;
  total: number;
  current: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const move = (delta: 1 | -1) => {
    if (total > 0) onIndexChange((current + delta + total) % total);
  };
  const buttonClass = 'flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-desk disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div data-testid="conversation-search" className="flex h-12 shrink-0 items-center gap-2 border-b border-rule bg-paper pr-4 pl-5">
      <Search size={15} className="text-ink-3" />
      <input
        type="search"
        aria-label="Buscar na conversa"
        autoFocus
        value={term}
        onChange={(e) => {
          onTermChange(e.target.value);
          onIndexChange(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            move(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Buscar nas mensagens desta conversa"
        className="flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {term.trim() && (
        <span data-testid="busca-contador" className="text-label whitespace-nowrap text-ink-3">
          {total === 0 ? 'Nada encontrado' : `${current + 1} de ${total}`}
        </span>
      )}
      <button type="button" aria-label="Resultado anterior" disabled={total === 0} onClick={() => move(-1)} className={buttonClass}>
        <ChevronUp size={16} />
      </button>
      <button type="button" aria-label="Próximo resultado" disabled={total === 0} onClick={() => move(1)} className={buttonClass}>
        <ChevronDown size={16} />
      </button>
      <button type="button" aria-label="Fechar busca" onClick={onClose} className={buttonClass}>
        <X size={16} />
      </button>
    </div>
  );
}

/** Texto com as ocorrências do termo marcadas; `ativa` é o índice (nesta mensagem) do resultado atual. */
export function Highlighted({ text: text, term: term, activeIndex: activeIndex }: { text: string; term: string; activeIndex: number | null }) {
  const snippets = findMatches(text, term);
  if (snippets.length === 0) return <>{text}</>;
  return (
    <>
      {snippets.map(([a, b], k) => {
        const before = text.slice(k === 0 ? 0 : snippets[k - 1]![1], a);
        const current = k === activeIndex;
        return (
          <Fragment key={a}>
            {before}
            <mark
              data-busca-ativa={current ? '' : undefined}
              className={`rounded-[3px] px-px text-ink ${current ? 'bg-warning/60' : 'bg-warning/25'}`}
            >
              {text.slice(a, b)}
            </mark>
          </Fragment>
        );
      })}
      {text.slice(snippets[snippets.length - 1]![1])}
    </>
  );
}
