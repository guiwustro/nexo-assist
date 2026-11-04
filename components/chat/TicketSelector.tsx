'use client';

import { useState } from 'react';
import { Dot } from '@/components/ui/Tag';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/contracts/enums';
import type { TicketSelectorPart } from '@/lib/contracts/parts';
import { shortDate } from '@/lib/format';

export function TicketSelector({
  tickets,
  onPick,
  disabled,
}: {
  tickets: TicketSelectorPart['tickets'];
  onPick: (t: TicketSelectorPart['tickets'][number]) => void;
  disabled?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <section data-testid="ticket-selector" role="radiogroup" className="flex w-full flex-col overflow-hidden rounded-card border border-card-border bg-paper">
      {tickets.map((t, i) => {
        const on = picked === t.code;
        return (
          <button
            key={t.code}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || picked !== null}
            data-testid={`ticket-option-${t.code}`}
            onClick={() => {
              setPicked(t.code);
              onPick(t);
            }}
            className={`flex h-[46px] items-center gap-3.5 px-4 text-left transition hover:bg-[#0062C40A] disabled:cursor-default ${
              i > 0 ? 'border-t border-rule' : ''
            } ${on ? 'bg-[#0062C40A]' : ''}`}
          >
            <span
              className={`size-4 shrink-0 rounded-full bg-paper ${on ? 'border-[5px] border-cta' : 'border-[1.5px] border-[#1B243133]'}`}
            />
            <span className="text-label font-medium text-ink-3">{t.code}</span>
            <span className="min-w-0 flex-1 truncate text-value font-medium text-ink">{t.title}</span>
            <span className="flex items-center gap-1.5 text-label text-ink-3">
              <Dot tone={STATUS_TONE[t.status]} className="size-1.5" />
              {STATUS_LABEL[t.status]}
            </span>
            <span className="w-11 text-label text-ink-3">{shortDate(t.last_update_at)}</span>
          </button>
        );
      })}
    </section>
  );
}
