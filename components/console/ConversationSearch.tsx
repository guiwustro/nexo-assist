'use client';

import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { Fragment } from 'react';
import { acharTrechos } from '@/lib/text/trechos';

/** Barra "Buscar na conversa" do console: termo, contador e navegação entre os resultados. */
export function ConversationSearch({
  termo,
  onTermo,
  total,
  atual,
  onAtual,
  onClose,
}: {
  termo: string;
  onTermo: (t: string) => void;
  total: number;
  atual: number;
  onAtual: (i: number) => void;
  onClose: () => void;
}) {
  const ir = (passo: 1 | -1) => {
    if (total > 0) onAtual((atual + passo + total) % total);
  };
  const botao = 'flex size-8 items-center justify-center rounded-full text-ink-2 hover:bg-desk disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div data-testid="conversation-search" className="flex h-12 shrink-0 items-center gap-2 border-b border-rule bg-paper pr-4 pl-5">
      <Search size={15} className="text-ink-3" />
      <input
        type="search"
        aria-label="Buscar na conversa"
        autoFocus
        value={termo}
        onChange={(e) => {
          onTermo(e.target.value);
          onAtual(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            ir(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Buscar nas mensagens desta conversa"
        className="flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {termo.trim() && (
        <span data-testid="busca-contador" className="text-label whitespace-nowrap text-ink-3">
          {total === 0 ? 'Nada encontrado' : `${atual + 1} de ${total}`}
        </span>
      )}
      <button type="button" aria-label="Resultado anterior" disabled={total === 0} onClick={() => ir(-1)} className={botao}>
        <ChevronUp size={16} />
      </button>
      <button type="button" aria-label="Próximo resultado" disabled={total === 0} onClick={() => ir(1)} className={botao}>
        <ChevronDown size={16} />
      </button>
      <button type="button" aria-label="Fechar busca" onClick={onClose} className={botao}>
        <X size={16} />
      </button>
    </div>
  );
}

/** Texto com as ocorrências do termo marcadas; `ativa` é o índice (nesta mensagem) do resultado atual. */
export function Realce({ texto, termo, ativa }: { texto: string; termo: string; ativa: number | null }) {
  const trechos = acharTrechos(texto, termo);
  if (trechos.length === 0) return <>{texto}</>;
  return (
    <>
      {trechos.map(([a, b], k) => {
        const antes = texto.slice(k === 0 ? 0 : trechos[k - 1]![1], a);
        const atual = k === ativa;
        return (
          <Fragment key={a}>
            {antes}
            <mark
              data-busca-ativa={atual ? '' : undefined}
              className={`rounded-[3px] px-px text-ink ${atual ? 'bg-warning/60' : 'bg-warning/25'}`}
            >
              {texto.slice(a, b)}
            </mark>
          </Fragment>
        );
      })}
      {texto.slice(trechos[trechos.length - 1]![1])}
    </>
  );
}
