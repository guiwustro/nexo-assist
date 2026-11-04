'use client';

import { ChevronRight, Inbox, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Dot, TONE_TEXT } from '@/components/ui/Tag';
import { api } from '@/lib/client/api';
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from '@/lib/contracts/enums';
import { shortDate, daysAgo } from '@/lib/format';
import type { TicketList } from '@/lib/tickets/views';

export type TicketTab = 'open' | 'closed';

const CLOSED = new Set(['resolved', 'closed']);

/** Tela "Meus chamados" do funcionário: em andamento e resolvidos, cada um abrindo o detalhe. */
export function MyTickets({ initialTab }: { initialTab: TicketTab }) {
  const [tab, setTab] = useState<TicketTab>(initialTab);
  const [data, setData] = useState<TicketList | null>(null);
  const [failed, setFailed] = useState(false);

  const fetchList = useCallback(
    () =>
      api<TicketList>('/api/v1/me/tickets').then(
        (d) => setData(d),
        () => setFailed(true),
      ),
    [],
  );
  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const retry = () => {
    setFailed(false);
    void fetchList();
  };

  const now = new Date();
  const visible = data?.tickets.filter((t) => CLOSED.has(t.status) === (tab === 'closed')) ?? [];
  const tabs: Array<{ id: TicketTab; label: string; count: number | null }> = [
    { id: 'open', label: 'Em andamento', count: data?.open ?? null },
    { id: 'closed', label: 'Resolvidos', count: data?.closed ?? null },
  ];

  return (
    <div className="flex h-full justify-center overflow-y-auto px-10 py-12">
      <div className="flex w-full max-w-[800px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold text-ink">Meus chamados</h1>
          <p className="text-value text-ink-3">Tudo o que você abriu com o service desk, do mais recente ao mais antigo.</p>
        </div>

        <div role="tablist" aria-label="Situação dos chamados" className="flex gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-body font-medium ${
                tab === t.id ? 'bg-primary-soft text-primary-text' : 'text-ink-2 hover:bg-desk'
              }`}
            >
              {t.label}
              {t.count !== null && <span className={tab === t.id ? 'text-primary-text' : 'text-ink-3'}>{t.count}</span>}
            </button>
          ))}
        </div>

        {failed && (
          <div data-testid="my-tickets-error" className="flex flex-col items-start gap-2 rounded-bubble bg-warning-soft p-4 text-body text-warning-text">
            <span className="flex items-center gap-2">
              <TriangleAlert size={15} /> O sistema de chamados não respondeu agora.
            </span>
            <button type="button" onClick={retry} className="font-semibold underline">
              Tentar de novo
            </button>
          </div>
        )}
        {!data && !failed && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[76px] rounded-card bg-desk" style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        )}

        {data && visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-card-border py-14 text-body text-ink-3">
            <Inbox size={22} />
            {tab === 'open' ? 'Nenhum chamado em andamento.' : 'Nenhum chamado resolvido ainda.'}
            {tab === 'open' && (
              <Link href="/atendimento" className="font-semibold text-primary-text hover:underline">
                Precisa de ajuda? Fale com o assistente
              </Link>
            )}
          </div>
        )}

        {data && visible.length > 0 && (
          <ul data-testid="my-tickets" className="flex flex-col overflow-hidden rounded-card border border-card-border bg-paper">
            {visible.map((t) => {
              const tone = STATUS_TONE[t.status];
              const closed = CLOSED.has(t.status);
              return (
                <li key={t.code} className="border-b border-rule last:border-b-0">
                  <Link
                    href={`/chamados/${t.code}`}
                    data-testid={`my-ticket-${t.code}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-desk/60"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-label text-ink-3">
                        {t.code} · {TYPE_LABEL[t.type]} · prioridade {PRIORITY_LABEL[t.priority].toLowerCase()}
                      </span>
                      <span className="truncate text-value font-semibold text-ink">{t.title}</span>
                      <span className="text-label text-ink-3">
                        {closed
                          ? `${STATUS_LABEL[t.status]} em ${shortDate(t.resolved_at ?? t.last_update_at)}`
                          : t.overdue
                            ? <span className="text-warning-text">{t.overdue_label ?? 'Prazo vencido'}</span>
                            : `Atualizado ${daysAgo(t.last_update_at, now)}`}
                      </span>
                    </div>
                    <span className={`flex items-center gap-1.5 text-label font-semibold ${TONE_TEXT[tone]}`}>
                      <Dot tone={tone} />
                      {STATUS_LABEL[t.status]}
                    </span>
                    <ChevronRight size={16} className="text-ink-3" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
