'use client';

import { Check, ChevronRight, TriangleAlert } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { ActionTrace } from '@/lib/contracts/decision';

export type DecisionState = 'none' | 'preparing' | 'ready';

/** "Nexo Assist · ✓ consultou seus chamados · ✓ buscou na central de ajuda". Clique abre o "Por quê?". */
export function StatusLine({
  actions,
  thinking = false,
  decision = 'none',
  onOpen,
}: {
  actions: ActionTrace[];
  thinking?: boolean;
  decision?: DecisionState;
  onOpen?: () => void;
}) {
  const clickable = Boolean(onOpen) && decision !== 'none';
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      data-testid="status-line"
      onClick={clickable ? onOpen : undefined}
      className={`group flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-tag text-left text-label ${
        clickable ? 'cursor-pointer hover:bg-desk' : ''
      }`}
    >
      <span className="font-semibold text-ink">Nexo Assist</span>
      {actions.map((a) => (
        <span key={a.id} data-testid="status-item" data-result={a.result} className="flex items-center gap-[5px] text-ink-3">
          {a.result === 'running' ? (
            <Spinner size={11} className="text-ink-3" />
          ) : a.result === 'error' ? (
            <TriangleAlert size={12} className="text-warning" />
          ) : a.result === 'retried' ? (
            <TriangleAlert size={12} className="text-warning" />
          ) : (
            <Check size={12} />
          )}
          <span className={a.result === 'error' ? 'text-warning-text' : ''}>
            {a.result === 'retried' ? `${a.label} · tentando de novo` : a.label}
          </span>
        </span>
      ))}
      {thinking && actions.length === 0 && (
        <span className="flex items-center gap-[5px] text-ink-3">
          <Spinner size={11} />
          pensando…
        </span>
      )}
      {decision === 'preparing' && <span className="text-ink-3">Por quê? · preparando…</span>}
      {decision === 'ready' && (
        <span className="flex items-center text-primary-text opacity-80 group-hover:opacity-100">
          Por quê?
          <ChevronRight size={12} />
        </span>
      )}
    </Tag>
  );
}
