'use client';

import { ArrowRightLeft, ArrowUpRight, ChevronRight, Headset, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { Dot, TONE_TEXT } from '@/components/ui/Tag';
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, STATUS_TONE } from '@/lib/contracts/enums';
import type { Ticket } from '@/lib/contracts/tickets';
import { shortDate } from '@/lib/format';
import { TicketDetail } from './TicketDetail';

export type EmployeeTicketsData = {
  tickets: Array<Ticket & { overdue: boolean; overdue_label: string | null }>;
  open: number;
  closed: number;
};

export function EmployeeTickets({
  employeeId,
  employeeName,
  data,
  error,
  conversationId,
  conversationCodes,
  lastEvent,
  onRetry,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  data: EmployeeTicketsData | null;
  error: boolean;
  conversationId: string;
  conversationCodes: string[];
  lastEvent: { kind: 'transfer' | 'claim'; text: string; time: string } | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const firstName = employeeName.split(' ')[0];
  const conversationTickets = (data?.tickets ?? []).filter((ticket) =>
    conversationCodes.includes(ticket.code),
  );
  const conversationTicketCodes = new Set(conversationCodes);
  const others = data?.tickets.filter((ticket) => !conversationTicketCodes.has(ticket.code)) ?? [];
  const visible = showAll ? others : others.slice(0, 4);

  return (
    <aside
      data-testid="employee-tickets"
      className="flex h-full w-[340px] shrink-0 flex-col border-l border-rule bg-paper"
    >
      <header className="flex h-16 items-center gap-2 border-b border-rule pr-3.5 pl-5">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15.5px] font-semibold text-ink">
            Chamados d{firstName?.endsWith('a') ? 'a' : 'o'} {firstName}
          </span>
          {data && (
            <span className="text-label text-ink-3">{`${data.open} abertos · ${data.closed} encerrados`}</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 pt-6 pb-5">
        {openCode && (
          <TicketDetail
            key={openCode}
            employeeId={employeeId}
            code={openCode}
            conversationId={conversationId}
            onBack={() => setOpenCode(null)}
          />
        )}
        {!openCode && error && (
          <div
            data-testid="tickets-error"
            className="flex flex-col items-start gap-2 rounded-bubble bg-warning-soft p-4 text-body text-warning-text"
          >
            <span className="flex items-center gap-2">
              <TriangleAlert size={15} /> Não foi possível carregar
            </span>
            <button type="button" onClick={onRetry} className="font-semibold underline">
              Tentar de novo
            </button>
          </div>
        )}
        {!openCode && !data && !error && (
          <div
            className="h-28 rounded-bubble bg-desk"
            style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }}
          />
        )}

        {!openCode && conversationTickets.length > 0 && (
          <section className="flex flex-col gap-3">
            <h3 className="text-label font-semibold text-ink-3">Desta conversa</h3>
            {conversationTickets.map((ticket, index) => (
              <div
                key={ticket.code}
                data-testid={index === 0 ? 'focus-ticket' : 'conversation-ticket'}
                className="flex flex-col gap-3.5 rounded-bubble bg-desk p-4"
              >
                <button
                  type="button"
                  data-testid={`employee-ticket-${ticket.code}`}
                  onClick={() => setOpenCode(ticket.code)}
                  className="flex flex-col gap-1.5 text-left"
                >
                  <div className="flex items-center">
                    <span className="flex-1 text-label font-medium text-ink-3">{ticket.code}</span>
                    <span
                      className={`flex items-center gap-1.5 text-label font-semibold ${TONE_TEXT[STATUS_TONE[ticket.status]]}`}
                    >
                      <Dot tone={STATUS_TONE[ticket.status]} />
                      {STATUS_LABEL[ticket.status]}
                    </span>
                  </div>
                  <span className="text-[15.5px] font-semibold text-ink">{ticket.title}</span>
                  <span className="text-body text-ink-3">
                    {CATEGORY_LABEL[ticket.category]} · prioridade{' '}
                    {PRIORITY_LABEL[ticket.priority].toLowerCase()}
                    {ticket.overdue ? ' · prazo vencido' : ''}
                  </span>
                </button>
                {index === 0 && lastEvent && (
                  <div className="flex items-center gap-2 border-t border-rule pt-3">
                    {lastEvent.kind === 'claim' ? (
                      <Headset size={15} className="text-ink-3" />
                    ) : (
                      <ArrowRightLeft size={15} className="text-ink-3" />
                    )}
                    <span className="flex-1 text-body text-ink-2">{lastEvent.text}</span>
                    <span className="text-label text-ink-3">{lastEvent.time}</span>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {!openCode && data && (
          <section data-testid="other-tickets" className="flex flex-col gap-1">
            <h3 className="text-label font-semibold text-ink-3">
              {conversationTickets.length > 0 ? 'Outros chamados' : 'Chamados'}
            </h3>
            {visible.map((t, i) => (
              <button
                type="button"
                key={t.code}
                data-testid={`employee-ticket-${t.code}`}
                onClick={() => setOpenCode(t.code)}
                className={`-mx-2 flex items-center gap-3 rounded-btn px-2 py-3 text-left hover:bg-desk ${i < visible.length - 1 ? 'border-b border-rule' : ''}`}
              >
                <Dot tone={STATUS_TONE[t.status]} />
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-value font-medium text-ink">{t.title}</span>
                  <span className="text-label text-ink-3">
                    {t.code} ·{' '}
                    {t.status === 'resolved' || t.status === 'closed'
                      ? `${STATUS_LABEL[t.status]} em ${shortDate(t.resolved_at ?? t.last_update_at)}`
                      : STATUS_LABEL[t.status]}
                    {t.overdue ? ' · vencido' : ''}
                  </span>
                </div>
                <ChevronRight size={16} className="text-ink-3" />
              </button>
            ))}
            {others.length === 0 && <span className="py-3 text-body text-ink-3">Nenhum outro chamado</span>}
          </section>
        )}
      </div>

      {!openCode && data && others.length > 4 && (
        <footer className="px-4 pt-3 pb-4">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="flex h-9 w-full items-center justify-center gap-[7px] rounded-btn border border-input-border text-body font-medium text-ink-2 hover:bg-desk"
          >
            {showAll
              ? 'Mostrar menos'
              : `Ver todos os chamados d${firstName?.endsWith('a') ? 'a' : 'o'} ${firstName}`}
            <ArrowUpRight size={14} className="text-ink-3" />
          </button>
        </footer>
      )}
    </aside>
  );
}
