import { Dot, TONE_TEXT } from '@/components/ui/Tag';
import { CATEGORY_LABEL, PRIORITY_LABEL, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE } from '@/lib/contracts/enums';
import type { Ticket } from '@/lib/contracts/tickets';
import { dataHora, haQuanto } from '@/lib/format';

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-label text-ink-3">{label}</span>
      <span className="flex items-center gap-1.5 text-value font-medium text-ink">{children}</span>
    </div>
  );
}

export function TicketCard({
  ticket,
  overdue,
  overdueLabel,
  now,
}: {
  ticket: Ticket;
  overdue: boolean;
  overdueLabel?: string;
  now: Date;
}) {
  const tone = STATUS_TONE[ticket.status];
  const [quando, nota] = overdue && overdueLabel ? overdueLabel.split(' · ') : [haQuanto(ticket.last_update_at, now), null];
  return (
    <section data-testid="ticket-card" className="flex w-full flex-col rounded-card border border-card-border bg-paper">
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center gap-2 pb-0.5 text-label">
          <span className="font-medium text-ink-3">Chamado</span>
          <span className="size-[3px] rounded-full bg-rule" />
          <span className="text-ink-3">{ticket.code}</span>
          <span className="flex-1" />
          <span className={`flex items-center gap-1.5 font-medium ${TONE_TEXT[tone]}`}>
            <Dot tone={tone} className="size-1.5" />
            {STATUS_LABEL[ticket.status]}
          </span>
        </div>
        <h3 className="text-card-title font-semibold text-ink">{ticket.title}</h3>
        <p className="text-body text-ink-2">{ticket.description}</p>
      </div>
      <div className="px-[18px] pb-4">
        <div className="flex gap-6 border-t border-rule pt-3">
          <Campo label="Categoria">
            {CATEGORY_LABEL[ticket.category]}
            {ticket.subcategory ? ` › ${ticket.subcategory}` : ''}
          </Campo>
          <Campo label="Prioridade">
            <Dot tone={PRIORITY_TONE[ticket.priority]} className="size-1.5" />
            {PRIORITY_LABEL[ticket.priority]}
          </Campo>
          <Campo label="Aberto em">{dataHora(ticket.created_at)}</Campo>
          <Campo label="Última atualização">
            <span className={overdue ? 'text-warning-text' : ''}>{quando}</span>
            {nota && <span className="text-body font-normal text-ink-3">· {nota}</span>}
          </Campo>
        </div>
      </div>
    </section>
  );
}
