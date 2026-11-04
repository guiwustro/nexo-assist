'use client';

import { ArrowLeft, MessageSquare, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TicketCard } from '@/components/chat/TicketCard';
import { api, ApiFailure } from '@/lib/client/api';
import { dateTime, shortDate } from '@/lib/format';
import type { TicketDetail } from '@/lib/tickets/views';
import { TicketHistory } from './TicketHistory';

const CLOSED = new Set(['resolved', 'closed']);
const RELATION_LABEL = {
  created: 'Criado aqui',
  updated: 'Atualizado aqui',
  reopened: 'Reaberto aqui',
  focus: 'Em foco',
} as const;

/** Detalhe de um chamado do funcionário: o mesmo card do chat, responsável, prazo e histórico. */
export function MyTicketDetail({ code }: { code: string }) {
  const [data, setData] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<'not_found' | 'unavailable' | null>(null);

  const fetchDetail = useCallback(
    () =>
      api<TicketDetail>(`/api/v1/me/tickets/${encodeURIComponent(code)}`).then(
        (d) => setData(d),
        (e: unknown) => setError(e instanceof ApiFailure && e.status === 404 ? 'not_found' : 'unavailable'),
      ),
    [code],
  );
  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const retry = () => {
    setError(null);
    void fetchDetail();
  };

  const t = data?.ticket;
  const closed = t ? CLOSED.has(t.status) : false;

  return (
    <div className="flex h-full justify-center overflow-y-auto px-10 py-12">
      <div data-testid="my-ticket-detail" className="flex w-full max-w-[800px] flex-col gap-6">
        <Link
          href={closed ? '/chamados?aba=resolvidos' : '/chamados'}
          className="flex w-fit items-center gap-1.5 text-body font-medium text-ink-2 hover:text-ink"
        >
          <ArrowLeft size={15} />
          Meus chamados
        </Link>

        {error === 'not_found' && (
          <div className="rounded-bubble bg-desk p-4 text-body text-ink-2">
            Não encontramos o chamado {code} entre os seus.
          </div>
        )}
        {error === 'unavailable' && (
          <div className="flex flex-col items-start gap-2 rounded-bubble bg-warning-soft p-4 text-body text-warning-text">
            <span className="flex items-center gap-2">
              <TriangleAlert size={15} /> O sistema de chamados não respondeu agora.
            </span>
            <button type="button" onClick={retry} className="font-semibold underline">
              Tentar de novo
            </button>
          </div>
        )}
        {!data && !error && (
          <div
            className="h-56 rounded-card bg-desk"
            style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }}
          />
        )}

        {t && data && (
          <>
            <TicketCard
              ticket={t}
              overdue={t.overdue}
              overdueLabel={t.overdue_label ?? undefined}
              now={new Date()}
            />
            <div className="flex gap-6 rounded-card border border-card-border bg-paper px-[18px] py-3.5 text-body">
              <span className="flex flex-col gap-1">
                <span className="text-label text-ink-3">Responsável</span>
                <span className="font-medium text-ink">{t.assignee_name ?? 'Ainda sem analista'}</span>
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-label text-ink-3">{closed ? 'Resolvido em' : 'Prazo'}</span>
                <span className={`font-medium ${t.overdue && !closed ? 'text-warning-text' : 'text-ink'}`}>
                  {closed ? dateTime(t.resolved_at ?? t.last_update_at) : dateTime(t.due_at)}
                </span>
              </span>
              <span className="flex-1" />
              <Link
                href={`/atendimento?sobre=${t.code}`}
                data-testid="talk-about-ticket"
                className="flex h-9 items-center gap-[7px] self-center rounded-btn border border-input-border px-3 font-medium text-ink-2 hover:bg-desk"
              >
                <MessageSquare size={15} />
                {closed ? 'Voltou a acontecer?' : 'Falar sobre este chamado'}
              </Link>
            </div>
            <section
              data-testid="ticket-attendances"
              className="flex flex-col gap-2 rounded-card border border-card-border bg-paper p-4"
            >
              <h3 className="text-value font-semibold text-ink">Atendimentos sobre este chamado</h3>
              {data.attendances.length === 0 ? (
                <p className="text-body text-ink-3">Aberto fora do Nexo Assist</p>
              ) : (
                <ul className="flex flex-col divide-y divide-rule">
                  {data.attendances.map((attendance) => (
                    <li
                      key={attendance.conversation_id}
                      className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-body font-medium text-ink">
                          {attendance.label} · {shortDate(attendance.started_at)}
                        </span>
                        <span className="text-label text-ink-3">{RELATION_LABEL[attendance.relation]}</span>
                      </div>
                      <Link
                        href={`/atendimento/${attendance.conversation_id}${attendance.message_id ? `?msg=${attendance.message_id}` : ''}`}
                        className="shrink-0 text-body font-semibold text-primary-text hover:underline"
                      >
                        Ver na conversa
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <TicketHistory events={data.events} />
          </>
        )}
      </div>
    </div>
  );
}
