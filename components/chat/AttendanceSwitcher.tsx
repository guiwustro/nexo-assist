'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiFailure, type AttendanceSummary } from '@/lib/client/api';
import { shortDate } from '@/lib/format';

export function AttendanceSwitcher({ current }: { current: AttendanceSummary }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AttendanceSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items || loading) return;
    setLoading(true);
    try {
      const fetched = await api<AttendanceSummary[]>('/api/v1/me/conversations');
      setItems(fetched.some((item) => item.id === current.id) ? fetched : [current, ...fetched]);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Não foi possível carregar os atendimentos');
    } finally {
      setLoading(false);
    }
  };

  const openCount = items?.filter((item) => item.status !== 'closed').length ?? 0;

  return (
    <div className="relative z-10 border-b border-rule bg-paper px-[200px] py-2.5">
      <button
        type="button"
        data-testid="attendance-switcher"
        aria-expanded={open}
        onClick={() => void toggle()}
        className="flex h-9 items-center gap-2 rounded-btn border border-input-border bg-paper px-3 text-body font-medium text-ink-2 hover:bg-desk"
      >
        Atendimentos{openCount > 1 ? ` · ${openCount}` : ''}
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="absolute top-full left-[200px] mt-1 flex max-h-[min(420px,70vh)] w-[min(560px,calc(100vw-240px))] flex-col overflow-y-auto rounded-card border border-card-border bg-paper p-2 shadow-lg">
          {loading && <p className="px-3 py-2 text-body text-ink-3">Carregando atendimentos…</p>}
          {error && (
            <p role="alert" className="px-3 py-2 text-body text-danger-text">
              {error}
            </p>
          )}
          {items?.map((item) => (
            <Link
              key={item.id}
              data-testid="attendance-item"
              href={`/atendimento/${item.id}`}
              aria-current={item.id === current.id ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={`flex items-start gap-3 rounded-bubble px-3 py-2.5 hover:bg-desk ${item.id === current.id ? 'bg-primary-soft' : ''}`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 text-body font-semibold text-ink">
                  {item.label}
                  <span className="text-label font-normal text-ink-3">
                    {shortDate(item.last_message_at ?? item.started_at)}
                  </span>
                </span>
                <span className="truncate text-label text-ink-2">
                  {item.ticket_codes.join(' · ') || 'Sem chamado relacionado'}
                </span>
              </span>
            </Link>
          ))}
          {items?.length === 0 && (
            <p className="px-3 py-2 text-body text-ink-3">Nenhum atendimento com mensagens.</p>
          )}
        </div>
      )}
    </div>
  );
}
