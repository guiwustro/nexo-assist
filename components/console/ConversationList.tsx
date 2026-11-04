'use client';

import { CheckCheck, Inbox, MessageSquareText, Search, Ticket } from 'lucide-react';
import Link from 'next/link';
import type { QueueFilter, QueueItem } from '@/lib/conversations/queries';
import { shortWhen } from '@/lib/format';
import { Avatar } from './avatar';
import { ConversationFilters } from './ConversationFilters';
import { Realce } from './ConversationSearch';

const TAG: Record<QueueItem['tag']['kind'], { dot: string; text: string }> = {
  transferred: { dot: 'bg-danger', text: 'text-danger-text' },
  agent_asked_help: { dot: 'bg-warning', text: 'text-warning-text' },
  agent_handling: { dot: 'bg-success', text: 'text-ink-3' },
  resolved_by_agent: { dot: 'bg-[#1B243155]', text: 'text-ink-3' },
  closed: { dot: 'bg-[#1B243155]', text: 'text-ink-3' },
  with_me: { dot: 'bg-primary', text: 'text-primary-text' },
  with_other: { dot: 'bg-primary', text: 'text-ink-3' },
};

export function ConversationList({
  items,
  counts,
  filter,
  onFilter,
  q,
  onSearch,
  selectedId,
  mode,
  now,
}: {
  items: QueueItem[] | null;
  counts: Record<QueueFilter, number> | null;
  filter: QueueFilter;
  onFilter: (f: QueueFilter) => void;
  q: string;
  onSearch: (q: string) => void;
  selectedId: string | null;
  mode: 'sse' | 'polling';
  now: Date;
}) {
  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-r border-rule bg-paper">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-2.5">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-xl font-bold text-ink">Conversas</h1>
          {mode === 'polling' && (
            <span data-testid="polling-indicator" className="flex items-center gap-1.5 text-label text-ink-3">
              <span className="size-[7px] rounded-full bg-warning" />
              Atualizando a cada 3 s
            </span>
          )}
          {/* Selo, não botão: disponibilidade não muda a fila (todos os analistas veem todas as transferências). */}
          <span
            data-testid="analyst-status"
            title="Você aparece como disponível para receber transferências"
            className="flex items-center gap-1.5 text-label font-semibold text-success-text"
          >
            <span className="size-[7px] rounded-full bg-success" />
            Disponível
          </span>
        </div>
        <label className="flex h-9 items-center gap-2.5 rounded-full bg-desk px-3">
          <Search size={15} className="text-ink-3" />
          <input
            data-testid="console-search"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            className="flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <ConversationFilters value={filter} counts={counts} onChange={onFilter} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
        {items === null &&
          [0, 1, 2].map((i) => (
            <div key={i} className="m-2.5 h-[66px] rounded-bubble bg-desk" style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }} />
          ))}
        {items?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-body text-ink-3">
            <Inbox size={22} />
            {q.trim() ? `Nada encontrado para “${q.trim()}”` : 'Nenhuma conversa aqui'}
          </div>
        )}
        {items?.map((c) => {
          const sel = c.id === selectedId;
          const tag = TAG[c.tag.kind];
          const doAgent = c.last_message_preview?.startsWith('Nexo: ');
          const forte = c.unread > 0 || c.status === 'pending';
          const motivo = q.trim() && c.match && c.match.kind !== 'name' ? c.match : null;
          const MotivoIcon = motivo?.kind === 'ticket' ? Ticket : MessageSquareText;
          return (
            <Link
              key={c.id}
              href={`/console/${c.id}`}
              data-testid="conversation-item"
              data-conversation-id={c.id}
              className={`flex items-center gap-3 rounded-bubble p-2.5 ${sel ? 'bg-desk' : 'hover:bg-desk/60'}`}
            >
              <Avatar nome={c.employee.name} online={c.status !== 'closed'} ring={sel ? '#F6F7F9' : '#FFFFFF'} />
              <div className={`flex min-w-0 flex-1 flex-col gap-[3px] pb-2.5 ${sel ? '' : 'border-b border-rule'}`}>
                <div className="flex items-center gap-2">
                  <span className={`flex-1 truncate text-[15.5px] text-ink ${forte ? 'font-semibold' : 'font-medium'}`}>
                    {c.match?.kind === 'name' ? <Realce texto={c.employee.name} termo={q} ativa={null} /> : c.employee.name}
                  </span>
                  <span className={`text-label ${forte ? 'font-semibold text-cta' : 'text-ink-3'}`}>
                    {shortWhen(c.last_message_at, now)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {motivo ? (
                    <span data-testid="conversation-match" className="flex min-w-0 flex-1 items-center gap-1.5 text-body text-ink-2">
                      <MotivoIcon size={14} className="shrink-0 text-ink-3" />
                      <span className="truncate">
                        <Realce texto={motivo.text} termo={q} ativa={null} />
                      </span>
                    </span>
                  ) : (
                    <>
                      {doAgent && <CheckCheck size={15} className="shrink-0 text-primary" />}
                      <span className="flex-1 truncate text-body text-ink-3">{c.last_message_preview ?? '—'}</span>
                    </>
                  )}
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cta px-1.5 text-tag-list font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
                <span data-testid="conversation-tag" className={`flex items-center gap-[5px] text-tag-list font-medium ${tag.text}`}>
                  <span className={`size-1.5 rounded-full ${tag.dot}`} />
                  {c.tag.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
