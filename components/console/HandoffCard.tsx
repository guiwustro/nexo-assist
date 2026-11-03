import { Check, Hand, TriangleAlert } from 'lucide-react';
import { REASON_LABEL, type ReasonCode } from '@/lib/contracts/enums';
import type { ActionTrace } from '@/lib/contracts/decision';

export type HandoffView = {
  id: string;
  ticket_code: string | null;
  reason_code: ReasonCode;
  support_level: 'N1' | 'N2';
  title: string;
  employee_words: string;
  agent_reading: string;
  attempts: ActionTrace[];
  confidence: number | null;
  due_at: string;
};

/** Briefing da passagem: a fala literal separada da leitura do agent. */
export function HandoffCard({ h, employeeName }: { h: HandoffView; employeeName: string }) {
  const primeiro = employeeName.split(' ')[0];
  return (
    <section data-testid="handoff-card" className="mx-auto my-2 flex w-full max-w-[560px] flex-col gap-3 rounded-card border border-card-border bg-paper p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-text">
          <Hand size={14} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body font-semibold text-ink">{h.title}</span>
          <span className="text-label text-ink-3">
            {REASON_LABEL[h.reason_code]} · Suporte {h.support_level}
            {h.confidence !== null ? ` · confiança ${Math.round(h.confidence * 100)}%` : ''}
            {h.ticket_code ? ` · ${h.ticket_code}` : ''}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-3">Palavras d{primeiro?.endsWith('a') ? 'a funcionária' : 'o funcionário'}</span>
        <blockquote className="border-l-2 border-rule pl-3 text-value text-ink">&quot;{h.employee_words}&quot;</blockquote>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-3">Segundo o agent — confira</span>
        <p className="text-body text-ink-2">{h.agent_reading}</p>
      </div>
      {h.attempts.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-label text-ink-3">O agent já tentou</span>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-label text-ink-2">
            {h.attempts.map((a) => (
              <li key={a.id} className="flex items-center gap-1">
                {a.result === 'error' ? <TriangleAlert size={12} className="text-warning" /> : <Check size={12} />}
                {a.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
