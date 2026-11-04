'use client';

import { RotateCcw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Kbd } from '@/components/ui/Kbd';
import { Spinner } from '@/components/ui/Spinner';
import { Dot } from '@/components/ui/Tag';
import {
  AFFECTED,
  AFFECTED_LABEL,
  CATEGORIES,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  type Affected,
  type Category,
  type TicketType,
} from '@/lib/contracts/enums';
import type { DraftEdit } from '@/lib/contracts/drafts';
import type { DraftCardPart } from '@/lib/contracts/parts';
import { formatarPrazoCurto } from '@/lib/regras/prazo';

const EYEBROW: Record<DraftCardPart['draft_kind'], (c?: string | null) => string> = {
  create: () => 'Novo chamado',
  update: (c) => `Atualizar chamado · ${c ?? ''}`,
  reopen: (c) => `Reabrir chamado · ${c ?? ''}`,
};

function Estado({ part, error }: { part: DraftCardPart; error?: string | null }) {
  if (part.status === 'confirmed') {
    return (
      <span className="flex items-center gap-1.5 font-medium text-success-text">
        <Dot tone="success" className="size-1.5" />
        {`${part.draft_kind === 'create' ? 'Criado' : part.draft_kind === 'update' ? 'Atualizado' : 'Reaberto'} como ${part.result_ticket_code ?? ''}`}
      </span>
    );
  }
  if (part.status === 'cancelled') {
    return (
      <span className="flex items-center gap-1.5 font-medium text-ink-3">
        <Dot tone="muted" className="size-1.5" />
        Cancelado
      </span>
    );
  }
  if (part.status === 'failed' || error) {
    return (
      <span className="flex items-center gap-1.5 font-medium text-danger-text">
        <Dot tone="danger" className="size-1.5" />
        Não foi possível criar
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 font-medium text-warning-text">
      <Dot tone="warning" className="size-1.5" />
      Aguardando confirmação
    </span>
  );
}

function Campo({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-label text-ink-3">
          {label}
        </label>
      ) : (
        <span className="text-label text-ink-3">{label}</span>
      )}
      <div className="flex items-center gap-1.5 text-value font-medium text-ink">{children}</div>
    </div>
  );
}

const inputCls =
  'h-9 w-full rounded-btn border border-input-border bg-paper px-2.5 text-body text-ink outline-none focus:border-cta';

export function DraftCard({
  part,
  now,
  onConfirm,
  onCancel,
  onSave,
  keyboard = false,
  error = null,
}: {
  part: DraftCardPart;
  now: Date;
  onConfirm: () => Promise<void> | void;
  onCancel: () => Promise<void> | void;
  onSave: (edit: DraftEdit) => Promise<void> | void;
  keyboard?: boolean;
  error?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DraftEdit>({});
  const ids = useId();
  const p = part.payload;
  const pending = part.status === 'pending';

  async function confirmar() {
    if (busyRef.current || !pending || editing) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!keyboard || !pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void confirmar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function abrirEdicao() {
    setForm({
      title: p.title,
      description: p.description,
      category: p.category,
      affected: p.affected,
      type: p.type,
      blocks_work: p.blocks_work,
      deadline_today: p.deadline_today,
    });
    setEditing(true);
  }

  async function salvar() {
    setBusy(true);
    try {
      await onSave(form);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="draft-card"
      data-status={part.status}
      className={`flex w-full flex-col overflow-hidden rounded-card border border-card-border bg-paper ${
        part.status === 'cancelled' ? 'opacity-60' : ''
      }`}
    >
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center gap-2 pb-0.5 text-label">
          <span className="font-medium text-ink-3">{EYEBROW[part.draft_kind](part.target_code)}</span>
          <span className="size-[3px] rounded-full bg-rule" />
          <span className="text-ink-3">Rascunho {part.code}</span>
          <span className="flex-1" />
          <Estado part={part} error={error} />
        </div>
        {editing ? (
          <div className="flex flex-col gap-2 pt-1">
            <input
              data-testid="draft-field-title"
              className={`${inputCls} text-value font-semibold`}
              value={form.title ?? ''}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <textarea
              data-testid="draft-field-description"
              className={`${inputCls} h-20 py-2`}
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        ) : (
          <>
            <h3 className="text-card-title font-semibold text-ink">{p.title}</h3>
            <p className="text-body whitespace-pre-wrap text-ink-2">{p.description}</p>
          </>
        )}
      </div>
      <div className="px-[18px] pb-4">
        <div className="flex gap-6 border-t border-rule pt-3">
          <Campo label="Categoria" htmlFor={editing ? `${ids}-category` : undefined}>
            {editing ? (
              <select
                id={`${ids}-category`}
                data-testid="draft-field-category"
                className={inputCls}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            ) : (
              CATEGORY_LABEL[p.category]
            )}
          </Campo>
          <Campo label={editing ? 'Tipo' : 'Prioridade'} htmlFor={editing ? `${ids}-type` : undefined}>
            {editing ? (
              <select
                id={`${ids}-type`}
                data-testid="draft-field-type"
                className={inputCls}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as TicketType })}
              >
                <option value="incident">Incidente</option>
                <option value="request">Solicitação</option>
              </select>
            ) : (
              <>
                <Dot tone={PRIORITY_TONE[p.priority]} className="size-1.5" />
                <span>{PRIORITY_LABEL[p.priority]}</span>
                <span className="text-body font-normal text-ink-3">{`· ${formatarPrazoCurto(new Date(p.due_at), now)}`}</span>
              </>
            )}
          </Campo>
          <Campo label="Afetados" htmlFor={editing ? `${ids}-affected` : undefined}>
            {editing ? (
              <select
                id={`${ids}-affected`}
                data-testid="draft-field-affected"
                className={inputCls}
                value={form.affected}
                onChange={(e) => setForm({ ...form, affected: e.target.value as Affected })}
              >
                {AFFECTED.map((a) => (
                  <option key={a} value={a}>
                    {AFFECTED_LABEL[a]}
                  </option>
                ))}
              </select>
            ) : (
              AFFECTED_LABEL[p.affected]
            )}
          </Campo>
        </div>
        {editing && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-3 text-body text-ink-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="draft-field-blocks-work"
                className="size-4 accent-cta"
                checked={form.blocks_work ?? false}
                onChange={(e) => setForm({ ...form, blocks_work: e.target.checked })}
              />
              Impede de trabalhar
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                data-testid="draft-field-deadline-today"
                className="size-4 accent-cta"
                checked={form.deadline_today ?? false}
                onChange={(e) => setForm({ ...form, deadline_today: e.target.checked })}
              />
              Compromisso hoje
            </label>
            <span className="w-full text-label text-ink-3">A prioridade e o prazo são recalculados ao salvar.</span>
          </div>
        )}
      </div>

      {(pending || part.status === 'failed') && (
        <div className="flex items-center gap-1.5 border-t border-rule bg-desk py-2 pr-3.5 pl-2">
          {editing ? (
            <>
              <button
                type="button"
                data-testid="draft-save"
                disabled={busy}
                onClick={salvar}
                className="flex h-9 items-center gap-2 rounded-btn bg-cta px-3.5 text-body font-semibold text-white disabled:opacity-70"
              >
                {busy && <Spinner size={13} />}
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex h-9 items-center rounded-btn px-3.5 text-body font-medium text-ink-2 hover:bg-paper"
              >
                Descartar
              </button>
            </>
          ) : pending ? (
            <>
              <button
                type="button"
                data-testid="draft-confirm"
                disabled={busy}
                onClick={confirmar}
                className="flex h-9 items-center gap-2 rounded-btn bg-cta pr-2.5 pl-3.5 text-body font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
              >
                {busy && <Spinner size={13} />}
                {error ? 'Tentar de novo' : 'Confirmar'}
                {!error && <Kbd className="bg-white/15 text-tag-list text-white/80">⌘↵</Kbd>}
              </button>
              {/* Depois de uma tentativa de envio o servidor não aceita mais edição (idempotência). */}
              {!error && (
                <button
                  type="button"
                  data-testid="draft-edit"
                  disabled={busy}
                  onClick={abrirEdicao}
                  className="flex h-9 items-center rounded-btn border border-input-border bg-paper px-3.5 text-body font-medium text-ink hover:bg-desk"
                >
                  Editar
                </button>
              )}
              <button
                type="button"
                data-testid="draft-cancel"
                disabled={busy}
                onClick={() => void onCancel()}
                className="flex h-9 items-center rounded-btn px-3.5 text-body font-medium text-ink-2 hover:bg-paper"
              >
                Cancelar
              </button>
            </>
          ) : (
            <span className="flex items-center gap-2 px-2 text-label text-danger-text">
              <RotateCcw size={13} />
              O serviço recusou este rascunho. Peça ao Nexo para montar outro.
            </span>
          )}
        </div>
      )}
      {error && pending && (
        <div data-testid="draft-error" className="border-t border-rule bg-warning-soft px-[18px] py-2.5 text-body text-warning-text">
          {error}
        </div>
      )}
    </section>
  );
}
