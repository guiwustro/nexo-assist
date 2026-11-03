'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function Composer({
  count,
  limit,
  onSend,
  mode,
  disabled = false,
  prefill,
}: {
  count: number;
  limit: number;
  onSend: (text: string) => void;
  mode: 'agent' | 'analyst';
  disabled?: boolean;
  prefill?: { text: string; n: number };
}) {
  const [text, setText] = useState('');
  const [prefillVisto, setPrefillVisto] = useState<number | undefined>();
  const ref = useRef<HTMLTextAreaElement>(null);

  if (prefill && prefill.n !== prefillVisto) {
    setPrefillVisto(prefill.n);
    setText(prefill.text);
  }
  useEffect(() => {
    if (prefill) ref.current?.focus();
  }, [prefill]);

  function enviar() {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  }

  const noLimite = count >= limit;
  return (
    <div className="flex flex-col gap-1.5 px-[200px] pt-2.5 pb-[18px]">
      <div className="flex min-h-12 items-center gap-2 rounded-bubble border border-input-border bg-paper py-1.5 pr-1.5 pl-4 focus-within:border-cta">
        <textarea
          ref={ref}
          data-testid="composer-input"
          data-quickreply-ok="true"
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={mode === 'analyst' ? 'Conversa com analista' : 'Escreva para o Nexo…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              enviar();
            }
          }}
          className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-value text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          data-testid="composer-send"
          disabled={disabled || !text.trim()}
          onClick={enviar}
          className="flex h-9 items-center gap-1.5 rounded-tag bg-cta px-3 text-body font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          <ArrowUp size={14} />
          Enviar
        </button>
      </div>
      <div className="flex justify-end">
        <span data-testid="session-counter" className={`text-label ${noLimite ? 'font-semibold text-danger-text' : 'text-ink-3'}`}>
          {`${Math.min(count, limit)}/${limit} mensagens nesta sessão`}
        </span>
      </div>
    </div>
  );
}
