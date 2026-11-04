'use client';

import { Bot, Hand, Headset, SendHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';

export type TakeoverMode = 'waiting' | 'with_agent' | 'mine' | 'other' | 'closed';

export function TakeoverBar({
  mode,
  firstName,
  dueLabel,
  otherName,
  onClaim,
  onRelease,
  onSend,
}: {
  mode: TakeoverMode;
  firstName: string;
  dueLabel: string | null;
  otherName: string | null;
  onClaim: () => Promise<void>;
  onRelease: () => Promise<void>;
  onSend: (text: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'mine') {
    const send = () =>
      run(async () => {
        const t = text.trim();
        if (!t) return;
        await onSend(t);
        setText('');
      });
    return (
      <div className="flex flex-col gap-2.5 border-t border-rule bg-paper px-5 pt-2.5 pb-3.5">
        <div className="flex h-11 items-center gap-3">
          <input
            data-testid="console-composer"
            value={text}
            disabled={busy}
            placeholder={`Responder para ${firstName}…`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            className="h-11 flex-1 rounded-bubble border border-input-border bg-paper px-3.5 text-value text-ink outline-none focus:border-cta"
          />
          <button
            type="button"
            data-testid="console-send"
            disabled={busy || !text.trim()}
            onClick={() => void send()}
            className="flex size-11 items-center justify-center rounded-bubble bg-cta text-white disabled:opacity-50"
            aria-label="Enviar"
          >
            {busy ? <Spinner size={15} /> : <SendHorizontal size={17} />}
          </button>
        </div>
      </div>
    );
  }

  const title =
    mode === 'waiting'
      ? `${firstName} espera um atendente`
      : mode === 'with_agent'
        ? 'O agent está atendendo'
        : mode === 'other'
          ? `Em atendimento por ${otherName ?? 'outro analista'}`
          : 'Atendimento encerrado';
  const body =
    mode === 'waiting'
      ? `Agent pausado · ${dueLabel ?? 'aguardando'}`
      : mode === 'with_agent'
        ? 'Você pode assumir a qualquer momento'
        : mode === 'other'
          ? 'O agent está pausado'
          : 'Se o funcionário escrever de novo, o agent volta a atender';

  return (
    <div data-testid="takeover-bar" className="flex flex-col gap-2.5 border-t border-rule bg-paper px-5 pt-3 pb-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-warning-soft text-warning-text">
          <Hand size={17} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-value font-semibold whitespace-nowrap text-ink">{title}</span>
          <span className="truncate text-label whitespace-nowrap text-ink-3">{body}</span>
        </div>
        {mode === 'waiting' && (
          <button
            type="button"
            data-testid="takeover-release"
            disabled={busy}
            onClick={() => void run(onRelease)}
            className="flex h-9 shrink-0 items-center gap-[7px] rounded-btn border border-input-border pr-3.5 pl-3 text-body font-medium whitespace-nowrap text-ink-2 hover:bg-desk"
          >
            <Bot size={15} />
            Devolver ao agent
          </button>
        )}
        {(mode === 'waiting' || mode === 'with_agent') && (
          <button
            type="button"
            data-testid="takeover-claim"
            disabled={busy}
            onClick={() => void run(onClaim)}
            className="flex h-9 shrink-0 items-center gap-[7px] rounded-btn bg-cta pr-4 pl-3.5 text-body font-semibold whitespace-nowrap text-white hover:brightness-110 disabled:opacity-70"
          >
            {busy ? <Spinner size={14} /> : <Headset size={16} />}
            Assumir atendimento
          </button>
        )}
      </div>
      <input
        data-testid="console-composer"
        disabled
        placeholder="Assuma o atendimento para responder"
        className="h-11 rounded-bubble bg-desk px-3.5 text-value opacity-55 placeholder:text-ink-3"
      />
    </div>
  );
}
