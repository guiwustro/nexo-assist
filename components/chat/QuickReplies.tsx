'use client';

import { useEffect } from 'react';

function campoDeTexto(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** Composer vazio aceita os atalhos 1–4; qualquer outro campo de texto em foco bloqueia. */
function teclaLiberada(target: EventTarget | null): boolean {
  if (!campoDeTexto(target)) return true;
  return target.dataset.quickreplyOk === 'true' && (target as HTMLTextAreaElement).value === '';
}

export function QuickReplies({
  question,
  options,
  onSelect,
  keyboard = false,
  numbered = true,
  disabled = false,
}: {
  question?: string;
  options: string[];
  onSelect: (option: string) => void;
  keyboard?: boolean;
  numbered?: boolean;
  disabled?: boolean;
}) {
  useEffect(() => {
    if (!keyboard || disabled || !numbered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > options.length) return;
      if (!teclaLiberada(e.target)) return;
      e.preventDefault();
      onSelect(options[n - 1]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, disabled, numbered, options, onSelect]);

  return (
    <div className="flex flex-col gap-3" data-testid="quick-replies">
      {question && <p className="text-value font-semibold text-ink">{question}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <button
            key={o}
            type="button"
            disabled={disabled}
            data-testid={`quick-reply-${i + 1}`}
            onClick={() => onSelect(o)}
            className="group flex items-center gap-[7px] rounded-btn border border-rule bg-paper px-3 py-[7px] text-body font-medium text-ink transition hover:border-primary hover:bg-primary-soft hover:text-primary-text focus-visible:border-primary focus-visible:bg-primary-soft focus-visible:text-primary-text focus-visible:outline-none disabled:opacity-50"
          >
            {numbered && (
              <span className="flex size-4 items-center justify-center rounded-tag bg-desk text-label font-normal text-ink-3 group-hover:bg-primary group-hover:text-white">
                {i + 1}
              </span>
            )}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
