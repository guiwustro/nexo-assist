'use client';

import { ArrowRightLeft, CheckCheck, CircleCheck, Headset, Info } from 'lucide-react';
import type { ApiMessage } from '@/lib/conversations/serialize';
import { summarizeParts } from '@/lib/conversations/parts-summary';
import { time } from '@/lib/format';
import { isSameDayInSaoPaulo } from '@/lib/rules/deadline';
import { Highlighted } from './ConversationSearch';
import { HandoffCard, type HandoffView } from './HandoffCard';

/** Busca aberta na conversa: o termo e qual resultado está ativo (mensagem e índice dentro dela). */
export type SearchHighlight = { term: string; active: { id: string; k: number } | null };

function SystemLine({ m, highlight: highlight }: { m: ApiMessage; highlight?: SearchHighlight }) {
  const Icon = /^Transferida/.test(m.body)
    ? ArrowRightLeft
    : /assumiu/.test(m.body)
      ? Headset
      : /criado|atualizado|reaberto/.test(m.body)
        ? CircleCheck
        : Info;
  return (
    <div data-testid="console-system" className="flex items-center gap-3 pt-[18px] pb-1">
      <span className="h-px flex-1 bg-[#1B243114]" />
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Icon size={13} />
        <MessageBody m={m} highlight={highlight} />
      </span>
      <span className="h-px flex-1 bg-[#1B243114]" />
    </div>
  );
}

function MessageBody({ m, highlight: highlight }: { m: ApiMessage; highlight?: SearchHighlight }) {
  if (!highlight?.term.trim()) return <>{m.body}</>;
  return (
    <Highlighted
      text={m.body}
      term={highlight.term}
      activeIndex={highlight.active?.id === m.id ? highlight.active.k : null}
    />
  );
}

export function ConsoleThread({
  messages,
  handoffs,
  employeeName,
  onWhy,
  highlight: highlight,
  highlightedMessage = null,
}: {
  messages: ApiMessage[];
  handoffs: HandoffView[];
  employeeName: string;
  onWhy: (runId: string) => void;
  highlight?: SearchHighlight;
  highlightedMessage?: string | null;
}) {
  const today = messages.length > 0 && isSameDayInSaoPaulo(new Date(messages[0]!.created_at), new Date());
  return (
    <div data-testid="console-thread" className="flex flex-col">
      {messages.length > 0 && (
        <div className="flex justify-center pb-1">
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-ink-3">
            {today ? 'Hoje' : 'Histórico'}
          </span>
        </div>
      )}
      {messages.map((m, i) => {
        const previous = messages[i - 1];
        const isGrouped =
          previous &&
          previous.direction === m.direction &&
          previous.sent_via === m.sent_via &&
          m.type !== 'system';
        const isJumpTarget = highlightedMessage === m.id;
        if (m.type === 'system') {
          const handoff = m.handoff_id ? handoffs.find((h) => h.id === m.handoff_id) : undefined;
          return (
            <div
              key={m.id}
              data-message-id={m.id}
              data-testid={isJumpTarget ? 'message-highlight' : undefined}
              className={isJumpTarget ? 'rounded-bubble ring-2 ring-primary ring-offset-2' : undefined}
            >
              <SystemLine m={m} highlight={highlight} />
              {handoff && <HandoffCard h={handoff} employeeName={employeeName} />}
            </div>
          );
        }
        if (m.direction === 'inbound') {
          return (
            <div
              key={m.id}
              data-message-id={m.id}
              data-testid={isJumpTarget ? 'message-highlight' : undefined}
              className={`flex flex-col ${isGrouped ? 'pt-[3px]' : 'pt-4'} ${isJumpTarget ? 'rounded-bubble ring-2 ring-primary ring-offset-2' : ''}`}
            >
              <div className="flex w-fit max-w-[520px] items-end gap-2.5 rounded-[4px_12px_12px_12px] bg-paper px-3 pt-2 pb-1.5">
                <span className="text-value whitespace-pre-wrap text-ink">
                  <MessageBody m={m} highlight={highlight} />
                </span>
                <span className="pb-px text-tag text-ink-3">{time(m.created_at)}</span>
              </div>
            </div>
          );
        }
        const isAi = m.sent_via === 'ai';
        const extras = isAi ? summarizeParts(m.parts) : [];
        return (
          <div
            key={m.id}
            data-message-id={m.id}
            data-testid={isJumpTarget ? 'message-highlight' : isAi ? 'ai-message' : 'human-message'}
            className={`flex flex-col items-end gap-1 ${isGrouped ? 'pt-[3px]' : 'pt-4'} ${isJumpTarget ? 'rounded-bubble ring-2 ring-primary ring-offset-2' : ''}`}
          >
            {!isGrouped && (
              <span className="flex items-center gap-1.5 px-1 text-xs font-semibold text-ink-2">
                {isAi ? 'Nexo Assist' : (m.sender_name ?? 'Analista')}
                <span
                  className={`rounded-tag px-1.5 py-px text-tag font-semibold ${
                    isAi ? 'bg-primary-soft text-primary-text' : 'bg-success-soft text-success-text'
                  }`}
                >
                  {isAi ? 'IA' : `Suporte ${m.sender_level ?? 'N1'}`}
                </span>
              </span>
            )}
            <div
              className={`flex max-w-[420px] flex-col gap-0.5 rounded-[12px_4px_12px_12px] px-3 pt-2 pb-1.5 ${isAi ? 'bg-bubble-ai' : 'bg-bubble-human'}`}
            >
              <span className="text-value whitespace-pre-wrap text-ink">
                <MessageBody m={m} highlight={highlight} />
              </span>
              {extras.map((x) => (
                <span key={x} className="text-label text-ink-3">
                  {x}
                </span>
              ))}
              <span className="flex items-center justify-end gap-[3px] pb-px">
                {isAi && m.agent_run_id && (
                  <button
                    type="button"
                    onClick={() => onWhy(m.agent_run_id!)}
                    className="mr-auto text-tag font-semibold text-primary-text hover:underline"
                  >
                    Por quê?
                  </button>
                )}
                <span className="text-tag text-ink-3">{time(m.created_at)}</span>
                <CheckCheck size={14} className="text-primary" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
