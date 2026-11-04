'use client';

import { BookOpen, Check, Ticket, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/client/api';
import { ACTION_LABEL, type ActionTrace, type TurnDecision } from '@/lib/contracts/decision';
import { ConfidenceBar } from './ConfidenceBar';

export type RunDetail = {
  run: { id: string; status: string; employee_text: string | null };
  decision: TurnDecision | null;
  tool_calls: ActionTrace[];
  cost: { model: string | null; tokens_in: number; tokens_out: number; cost_cents: number | null; latency_ms: number | null };
};

function Section({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId} className="flex flex-col gap-2 border-b border-rule px-6 py-5 last:border-b-0">
      <h3 className="text-label text-ink-3">{label}</h3>
      <div className="flex flex-col gap-2 text-value text-ink">{children}</div>
    </section>
  );
}

function cost(c: RunDetail['cost']): string {
  const parts = [c.model ?? 'sem modelo (regra)', `${c.tokens_in + c.tokens_out} tokens`];
  parts.push(c.cost_cents === null ? 'custo não medido' : `US$ ${(c.cost_cents / 100).toFixed(4)}`);
  if (c.latency_ms !== null) parts.push(`${(c.latency_ms / 1000).toFixed(1)} s`);
  return parts.join(' · ');
}

/** "Por que o Nexo fez isso?": o que entendeu, o que fez, com que confiança, por quê, o que consultou, quanto custou. */
export function DecisionPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [state, setState] = useState<{ id: string; data: RunDetail | null; error: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    api<RunDetail>(`/api/v1/ai/runs/${runId}`)
      .then((data) => alive && setState({ id: runId, data, error: false }))
      .catch(() => alive && setState({ id: runId, data: null, error: true }));
    return () => {
      alive = false;
    };
  }, [runId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = state?.id === runId ? state : null;
  const d = current?.data?.decision ?? null;
  const actionsText = current?.data?.tool_calls ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Por que o Nexo fez isso?">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-ink/10" onClick={onClose} />
      <aside
        data-testid="decision-panel"
        className="relative flex h-full w-[400px] flex-col overflow-y-auto border-l border-rule bg-paper shadow-[0_0_40px_#1B243114]"
      >
        <header className="flex items-center justify-between border-b border-rule px-6 py-5">
          <h2 className="text-card-title font-semibold text-ink">Por que o Nexo fez isso?</h2>
          <button type="button" onClick={onClose} aria-label="Fechar painel" className="rounded-btn p-1.5 text-ink-3 hover:bg-desk">
            <X size={16} />
          </button>
        </header>

        {!current && (
          <div className="flex items-center gap-2 px-6 py-6 text-body text-ink-3">
            <Spinner size={14} /> carregando…
          </div>
        )}
        {current?.error && <p className="px-6 py-6 text-body text-danger-text">Não foi possível carregar o registro deste turno.</p>}

        {current?.data && !d && (
          <p data-testid="decision-missing" className="px-6 pt-5 text-body text-ink-2">
            O agent não registrou a decisão deste turno.
          </p>
        )}

        {current?.data && d && (
          <>
            <Section label="Entendi que…" testId="decision-understood">
              <p>{d.understanding.summary}</p>
              <blockquote className="border-l-2 border-rule pl-3 text-body text-ink-2 italic">
                Palavras suas: “{d.understanding.evidence}”
              </blockquote>
            </Section>
            <Section label="Então eu…" testId="decision-action">
              <p className="font-medium">{ACTION_LABEL[d.decision.action]}</p>
              <div className="flex flex-col gap-1">
                <span className="text-label text-ink-3">Confiança</span>
                <ConfidenceBar value={d.decision.confidence} />
              </div>
            </Section>
            <Section label="Porque…" testId="decision-why">
              <p>{d.decision.why}</p>
              {d.decision.rules_applied.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {d.decision.rules_applied.map((r) => (
                    <span key={r} data-testid="rule-chip" className="rounded-tag bg-desk px-2 py-1 text-label text-ink-2">
                      {r}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {current?.data && (
          <>
            <Section label="Consultei" testId="decision-sources">
              {actionsText.length === 0 && <p className="text-body text-ink-3">Nenhuma ferramenta neste turno.</p>}
              <ul className="flex flex-col gap-2">
                {actionsText.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-body">
                    {a.result === 'error' ? (
                      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" />
                    ) : (
                      <Check size={14} className="mt-0.5 shrink-0 text-ink-3" />
                    )}
                    <span className="flex flex-col">
                      <span className="text-ink">{a.label}</span>
                      <span className="text-label text-ink-3">
                        {a.summary || a.tool} · {a.duration_ms} ms
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {d && d.decision.sources.length > 0 && (
                <ul className="flex flex-col gap-1.5 pt-1">
                  {d.decision.sources.map((s) => (
                    <li key={`${s.kind}:${s.id}`} className="flex items-center gap-2 text-body text-primary-text">
                      {s.kind === 'article' ? <BookOpen size={14} /> : <Ticket size={14} />}
                      {s.title}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <footer data-testid="decision-cost" className="mt-auto border-t border-rule px-6 py-4 text-label text-ink-3">
              {cost(current.data.cost)}
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
