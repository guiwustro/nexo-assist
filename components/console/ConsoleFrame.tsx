'use client';

import { MessageCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NexoMark } from '@/components/ui/NexoMark';
import { api } from '@/lib/client/api';
import { useEvents } from '@/lib/client/use-events';
import type { QueueFilter, QueueItem } from '@/lib/conversations/queries';
import { iniciaisDe } from './avatar';
import { ConversationList } from './ConversationList';

export function ConsoleFrame({ me, children }: { me: { name: string }; children: React.ReactNode }) {
  const path = usePathname();
  const selectedId = path.split('/')[2] ?? null;
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [counts, setCounts] = useState<Record<QueueFilter, number> | null>(null);
  const [now, setNow] = useState(() => new Date());
  const seq = useRef(0);

  const load = useCallback(async (f: QueueFilter, termo: string) => {
    const meu = ++seq.current;
    const qs = new URLSearchParams({ filter: f, ...(termo.trim() ? { q: termo.trim() } : {}) });
    const [lista, c] = await Promise.all([
      api<QueueItem[]>(`/api/v1/conversations?${qs}`).catch(() => null),
      api<Record<QueueFilter, number>>('/api/v1/conversations/counts').catch(() => null),
    ]);
    if (meu !== seq.current) return;
    if (lista) setItems(lista);
    if (c) setCounts(c);
    setNow(new Date());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(filter, q), q ? 200 : 0);
    return () => clearTimeout(t);
  }, [filter, q, load]);

  const { mode } = useEvents(() => void load(filter, q));
  useEffect(() => {
    const onChange = () => void load(filter, q);
    window.addEventListener('nexo:queue-changed', onChange);
    return () => window.removeEventListener('nexo:queue-changed', onChange);
  }, [filter, q, load]);

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-rule bg-desk py-4">
        <span className="flex size-10 items-center justify-center pb-2">
          <NexoMark size={22} color="#037AF6" />
        </span>
        <span className="relative flex size-10 items-center justify-center rounded-bubble bg-paper" title="Conversas">
          <MessageCircle size={19} className="text-ink" />
          {counts && counts.for_you > 0 && (
            <span
              data-testid="rail-badge"
              className="absolute -top-1 -right-1.5 flex h-4 items-center rounded-full border-2 border-desk bg-cta px-[5px] text-[10px] font-bold text-white"
            >
              {counts.for_you}
            </span>
          )}
        </span>
        <span className="flex-1" />
        <span className="relative flex size-9 items-center justify-center rounded-full bg-primary-soft text-label font-bold text-primary-text">
          {iniciaisDe(me.name)}
          <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-desk bg-success" />
        </span>
      </nav>
      <ConversationList
        items={items}
        counts={counts}
        filter={filter}
        onFilter={setFilter}
        q={q}
        onSearch={setQ}
        selectedId={selectedId}
        mode={mode}
        now={now}
      />
      <main className="flex min-w-0 flex-1">{children}</main>
    </div>
  );
}
