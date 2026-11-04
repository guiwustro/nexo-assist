'use client';

import type { ActionTrace } from '@/lib/contracts/decision';
import type { DraftEdit } from '@/lib/contracts/drafts';
import type { MessagePart } from '@/lib/contracts/parts';
import { AgentBubble } from './MessageBubble';
import { DraftCard } from './DraftCard';
import { QuickReplies } from './QuickReplies';
import { StatusLine, type DecisionState } from './StatusLine';
import { TicketCard } from './TicketCard';
import { TicketSelector } from './TicketSelector';

export type DraftHandlers = {
  confirm: (draftId: string) => Promise<void>;
  cancel: (draftId: string) => Promise<void>;
  save: (draftId: string, edit: DraftEdit) => Promise<void>;
  errors: Record<string, string>;
};

/** Respostas à oferta de chamado vencido. "Adicionar informação" só preenche o composer; as outras viram mensagem. */
export const OVERDUE_OFFER = { analyst: 'Falar com um analista', addInfo: 'Adicionar informação', decline: 'Não, obrigado' } as const;
const OVERDUE_OFFER_OPTIONS = Object.values(OVERDUE_OFFER);

/** Uma resposta do agent: status line, cards e bolha na ordem do protótipo. */
export function AgentMessage({
  text,
  parts,
  actions,
  streaming = false,
  decision = 'none',
  onOpenDecision,
  isLast,
  now,
  onSend,
  onOverdueAction,
  drafts,
  senderName,
}: {
  text: string;
  parts: MessagePart[];
  actions: ActionTrace[];
  streaming?: boolean;
  decision?: DecisionState;
  onOpenDecision?: () => void;
  isLast: boolean;
  now: Date;
  onSend: (text: string) => void;
  onOverdueAction?: (action: string, ticketCode: string) => void;
  drafts: DraftHandlers;
  senderName?: string | null;
}) {
  const ticketCards = parts.filter((p) => p.kind === 'ticket_card');
  const quick = parts.find((p) => p.kind === 'quick_replies');
  const others = parts.filter((p) => p.kind === 'ticket_selector' || p.kind === 'draft_card');
  const overdue = ticketCards.find((p) => p.overdue);
  const interactive = isLast && !streaming;

  const bubble = (text || quick || overdue) && (
    <AgentBubble testId="agent-bubble">
      {text && <p className="whitespace-pre-wrap">{text}</p>}
      {quick && (
        <QuickReplies question={quick.question} options={quick.options} onSelect={onSend} keyboard={interactive} disabled={!interactive} />
      )}
      {overdue && (
        <QuickReplies
          options={OVERDUE_OFFER_OPTIONS}
          numbered={false}
          disabled={!interactive}
          onSelect={(o) => onOverdueAction?.(o, overdue.ticket.code)}
        />
      )}
    </AgentBubble>
  );

  return (
    <div data-testid="agent-message" className="flex flex-col gap-1.5" data-streaming={streaming}>
      {senderName ? (
        <span className="text-label font-semibold text-ink">{senderName}</span>
      ) : (
        <StatusLine actions={actions} thinking={streaming} decision={decision} onOpen={onOpenDecision} />
      )}
      {ticketCards.map((p, i) => (
        <TicketCard key={`t${i}`} ticket={p.ticket} overdue={p.overdue} overdueLabel={p.overdue_label} now={now} />
      ))}
      {bubble}
      {others.map((p, i) =>
        p.kind === 'ticket_selector' ? (
          <TicketSelector key={`s${i}`} tickets={p.tickets} disabled={!interactive} onPick={(t) => onSend(`${t.code} · ${t.title}`)} />
        ) : p.kind === 'draft_card' ? (
          <DraftCard
            key={p.draft_id}
            part={p}
            now={now}
            keyboard={interactive}
            error={drafts.errors[p.draft_id] ?? null}
            onConfirm={() => drafts.confirm(p.draft_id)}
            onCancel={() => drafts.cancel(p.draft_id)}
            onSave={(edit) => drafts.save(p.draft_id, edit)}
          />
        ) : null,
      )}
    </div>
  );
}
