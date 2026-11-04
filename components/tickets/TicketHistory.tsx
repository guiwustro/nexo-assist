import type { TicketEvent } from '@/lib/contracts/tickets';
import { dateTime } from '@/lib/format';

const EVENT_LABEL: Record<TicketEvent['kind'], string> = {
  created: 'Aberto',
  comment: 'Comentário',
  status_changed: 'Status alterado',
  transferred: 'Transferido',
  reopened: 'Reaberto',
};

/** Linha do tempo do chamado, do mais recente para o mais antigo. */
export function TicketHistory({ events }: { events: TicketEvent[] }) {
  return (
    <section data-testid="ticket-history" className="flex flex-col gap-3">
      <h3 className="text-label font-semibold text-ink-3">Histórico</h3>
      <ol className="flex flex-col">
        {[...events].reverse().map((e, i, arr) => (
          <li key={`${e.created_at}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {i < arr.length - 1 && <span className="absolute top-3 left-[3px] h-full w-px bg-rule" />}
            <span className="relative mt-[5px] size-[7px] shrink-0 rounded-full bg-ink-3" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-label text-ink-3">
                {EVENT_LABEL[e.kind]} · {e.actor} · {dateTime(e.created_at)}
              </span>
              {e.body && <span className="text-body whitespace-pre-wrap text-ink">{e.body}</span>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
