'use client';

import { ArrowLeft, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Dot, TONE_TEXT } from '@/components/ui/Tag';
import { api } from '@/lib/client/api';
import {
  AFFECTED_LABEL,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
} from '@/lib/contracts/enums';
import type { TicketDetail as Detalhe } from '@/lib/tickets/views';
import { dateTime, shortDate } from '@/lib/format';
import { TicketHistory } from '@/components/tickets/TicketHistory';

const CLOSED_STATUSES = new Set(['resolved', 'closed']);
const RELATION_LABEL = {
  created: 'Criado aqui',
  updated: 'Atualizado aqui',
  reopened: 'Reaberto aqui',
  focus: 'Em foco',
} as const;

/** Detalhe de um chamado dentro do painel "Chamados da Ana" do console. */
export function TicketDetail({
  employeeId,
  code,
  conversationId,
  onBack,
}: {
  employeeId: string;
  code: string;
  conversationId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<Detalhe | null>(null);
  const [error, setError] = useState(false);

  const fetchDetail = useCallback(
    () =>
      api<Detalhe>(`/api/v1/employees/${employeeId}/tickets/${encodeURIComponent(code)}`).then(
        (d) => setData(d),
        () => setError(true),
      ),
    [employeeId, code],
  );

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  const retry = () => {
    setError(false);
    void fetchDetail();
  };

  const t = data?.ticket;
  const field = (label: string, value: string) => (
    <div className="flex gap-3 py-1.5">
      <span className="w-[88px] shrink-0 text-label text-ink-3">{label}</span>
      <span className="text-body text-ink">{value}</span>
    </div>
  );

  return (
    <div data-testid="ticket-detail" className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 rounded-btn py-1 pr-2 text-body font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} />
        Voltar aos chamados
      </button>

      {error && (
        <div
          data-testid="ticket-detail-error"
          className="flex flex-col items-start gap-2 rounded-bubble bg-warning-soft p-4 text-body text-warning-text"
        >
          <span className="flex items-center gap-2">
            <TriangleAlert size={15} /> Não foi possível carregar o chamado
          </span>
          <button type="button" onClick={retry} className="font-semibold underline">
            Tentar de novo
          </button>
        </div>
      )}
      {!data && !error && (
        <div
          className="h-40 rounded-bubble bg-desk"
          style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }}
        />
      )}

      {t && data && (
        <>
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center">
              <span className="flex-1 text-label font-medium text-ink-3">
                {t.code} · {TYPE_LABEL[t.type]}
              </span>
              <span
                className={`flex items-center gap-1.5 text-label font-semibold ${TONE_TEXT[STATUS_TONE[t.status]]}`}
              >
                <Dot tone={STATUS_TONE[t.status]} />
                {STATUS_LABEL[t.status]}
              </span>
            </div>
            <h4 className="text-[15.5px] font-semibold text-ink">{t.title}</h4>
            <p className="text-body whitespace-pre-wrap text-ink-2">{t.description || 'Sem descrição.'}</p>
          </section>

          <section className="flex flex-col border-y border-rule py-2">
            {field('Categoria', CATEGORY_LABEL[t.category] + (t.subcategory ? ` · ${t.subcategory}` : ''))}
            {field('Prioridade', PRIORITY_LABEL[t.priority])}
            {field('Afeta', AFFECTED_LABEL[t.affected])}
            {field('Responsável', t.assignee_name ?? 'Ainda sem analista')}
            {field('Aberto em', dateTime(t.created_at))}
            {CLOSED_STATUSES.has(t.status)
              ? field('Resolvido em', dateTime(t.resolved_at ?? t.last_update_at))
              : field('Prazo', dateTime(t.due_at) + (t.overdue ? ` · ${t.overdue_label ?? 'vencido'}` : ''))}
          </section>

          <section
            data-testid="ticket-attendances"
            className="flex flex-col gap-2 rounded-bubble bg-desk p-3.5"
          >
            <h4 className="text-body font-semibold text-ink">Atendimentos sobre este chamado</h4>
            {data.attendances.length === 0 ? (
              <p className="text-body text-ink-3">Aberto fora do Nexo Assist</p>
            ) : (
              <ul className="flex flex-col divide-y divide-rule">
                {data.attendances.map((attendance) => {
                  const current = attendance.conversation_id === conversationId;
                  const href = `/console/${attendance.conversation_id}${attendance.message_id ? `?msg=${attendance.message_id}` : ''}`;
                  return (
                    <li
                      key={attendance.conversation_id}
                      className="flex items-center gap-2 py-2 first:pt-1 last:pb-1"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-body font-medium text-ink">
                          {attendance.label} · {shortDate(attendance.started_at)}
                        </span>
                        <span className="text-label text-ink-3">{RELATION_LABEL[attendance.relation]}</span>
                      </div>
                      <Link
                        href={href}
                        aria-current={current ? 'page' : undefined}
                        className="shrink-0 text-label font-semibold text-primary-text hover:underline"
                      >
                        {current ? 'Esta conversa' : 'Ver na conversa'}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <TicketHistory events={data.events} />
        </>
      )}
    </div>
  );
}
