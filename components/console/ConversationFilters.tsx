'use client';

import type { QueueFilter } from '@/lib/conversations/queries';

const FILTERS: Array<{ id: QueueFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'for_you', label: 'Para você' },
  { id: 'with_agent', label: 'Com o agent' },
  { id: 'mine', label: 'Minhas' },
];

export function ConversationFilters({
  value,
  counts,
  onChange,
}: {
  value: QueueFilter;
  counts: Record<QueueFilter, number> | null;
  onChange: (f: QueueFilter) => void;
}) {
  return (
    <div className="flex gap-1">
      {FILTERS.map((f) => {
        const on = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            data-testid={`filter-${f.id}`}
            aria-pressed={on}
            onClick={() => onChange(f.id)}
            className={`flex items-center gap-1.5 rounded-full px-[9px] py-1.5 text-label font-medium ${
              on ? 'bg-primary-soft text-primary-text' : 'bg-desk text-ink-2 hover:brightness-95'
            }`}
          >
            {f.label}
            {f.id !== 'all' && counts && (
              <span className={`font-semibold ${on ? 'text-primary-text' : 'text-ink-3'}`}>{counts[f.id]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
