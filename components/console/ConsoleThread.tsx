'use client';

import { ArrowRightLeft, CheckCheck, CircleCheck, Headset, Info } from 'lucide-react';
import type { ApiMessage } from '@/lib/conversations/serialize';
import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '@/lib/contracts/enums';
import type { MessagePart } from '@/lib/contracts/parts';
import { hora } from '@/lib/format';
import { mesmoDiaSp } from '@/lib/regras/prazo';
import { HandoffCard, type HandoffView } from './HandoffCard';

function Sistema({ m }: { m: ApiMessage }) {
  const Icon = /^Transferida/.test(m.body) ? ArrowRightLeft : /assumiu/.test(m.body) ? Headset : /criado|atualizado|reaberto/.test(m.body) ? CircleCheck : Info;
  return (
    <div data-testid="console-system" className="flex items-center gap-3 pt-[18px] pb-1">
      <span className="h-px flex-1 bg-[#1B243114]" />
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
        <Icon size={13} />
        {m.body}
      </span>
      <span className="h-px flex-1 bg-[#1B243114]" />
    </div>
  );
}

function resumoDasPartes(parts: MessagePart[]): string[] {
  return parts.flatMap((p) => {
    if (p.kind === 'draft_card') return [`Rascunho ${p.code} · ${PRIORITY_LABEL[p.payload.priority]} · ${CATEGORY_LABEL[p.payload.category]}`];
    if (p.kind === 'ticket_card') return [`${p.ticket.code} · ${STATUS_LABEL[p.ticket.status]}${p.overdue ? ' · prazo vencido' : ''}`];
    if (p.kind === 'ticket_selector') return [`Mostrou ${p.tickets.length} chamados para escolher`];
    if (p.kind === 'quick_replies') return [`Perguntou: ${p.question} (${p.options.join(' / ')})`];
    return [];
  });
}

export function ConsoleThread({
  messages,
  handoffs,
  employeeName,
  onWhy,
}: {
  messages: ApiMessage[];
  handoffs: HandoffView[];
  employeeName: string;
  onWhy: (runId: string) => void;
}) {
  const hoje = messages.length > 0 && mesmoDiaSp(new Date(messages[0]!.created_at), new Date());
  return (
    <div data-testid="console-thread" className="flex flex-col">
      {messages.length > 0 && (
        <div className="flex justify-center pb-1">
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-ink-3">{hoje ? 'Hoje' : 'Histórico'}</span>
        </div>
      )}
      {messages.map((m, i) => {
        const anterior = messages[i - 1];
        const colada = anterior && anterior.direction === m.direction && anterior.sent_via === m.sent_via && m.type !== 'system';
        if (m.type === 'system') {
          const handoff = m.handoff_id ? handoffs.find((h) => h.id === m.handoff_id) : undefined;
          return (
            <div key={m.id}>
              <Sistema m={m} />
              {handoff && <HandoffCard h={handoff} employeeName={employeeName} />}
            </div>
          );
        }
        if (m.direction === 'inbound') {
          return (
            <div key={m.id} className={`flex flex-col ${colada ? 'pt-[3px]' : 'pt-4'}`}>
              <div className="flex w-fit max-w-[520px] items-end gap-2.5 rounded-[4px_12px_12px_12px] bg-paper px-3 pt-2 pb-1.5">
                <span className="text-value whitespace-pre-wrap text-ink">{m.body}</span>
                <span className="pb-px text-tag text-ink-3">{hora(m.created_at)}</span>
              </div>
            </div>
          );
        }
        const ia = m.sent_via === 'ai';
        const extras = ia ? resumoDasPartes(m.parts) : [];
        return (
          <div key={m.id} data-testid={ia ? 'ai-message' : 'human-message'} className={`flex flex-col items-end gap-1 ${colada ? 'pt-[3px]' : 'pt-4'}`}>
            {!colada && (
              <span className="flex items-center gap-1.5 px-1 text-xs font-semibold text-ink-2">
                {ia ? 'Nexo Assist' : (m.sender_name ?? 'Analista')}
                <span
                  className={`rounded-tag px-1.5 py-px text-tag font-semibold ${
                    ia ? 'bg-primary-soft text-primary-text' : 'bg-success-soft text-success-text'
                  }`}
                >
                  {ia ? 'IA' : `Suporte ${m.sender_level ?? 'N1'}`}
                </span>
              </span>
            )}
            <div
              className={`flex max-w-[420px] flex-col gap-0.5 rounded-[12px_4px_12px_12px] px-3 pt-2 pb-1.5 ${ia ? 'bg-bubble-ai' : 'bg-bubble-human'}`}
            >
              <span className="text-value whitespace-pre-wrap text-ink">{m.body}</span>
              {extras.map((x) => (
                <span key={x} className="text-label text-ink-3">
                  {x}
                </span>
              ))}
              <span className="flex items-center justify-end gap-[3px] pb-px">
                {ia && m.agent_run_id && (
                  <button type="button" onClick={() => onWhy(m.agent_run_id!)} className="mr-auto text-tag font-semibold text-primary-text hover:underline">
                    Por quê?
                  </button>
                )}
                <span className="text-tag text-ink-3">{hora(m.created_at)}</span>
                <CheckCheck size={14} className="text-primary" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
