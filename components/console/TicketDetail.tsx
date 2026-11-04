'use client';

import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Dot, TONE_TEXT } from '@/components/ui/Tag';
import { api } from '@/lib/client/api';
import { AFFECTED_LABEL, CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL, STATUS_TONE, TYPE_LABEL } from '@/lib/contracts/enums';
import type { TicketDetail as Detalhe } from '@/lib/tickets/views';
import { dataHora } from '@/lib/format';
import { TicketHistory } from '@/components/tickets/TicketHistory';


const ENCERRADOS = new Set(['resolved', 'closed']);

/** Detalhe de um chamado dentro do painel "Chamados da Ana" do console. */
export function TicketDetail({ employeeId, code, onBack }: { employeeId: string; code: string; onBack: () => void }) {
  const [data, setData] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState(false);

  const buscar = useCallback(
    () =>
      api<Detalhe>(`/api/v1/employees/${employeeId}/tickets/${encodeURIComponent(code)}`).then(
        (d) => setData(d),
        () => setErro(true),
      ),
    [employeeId, code],
  );

  useEffect(() => {
    void buscar();
  }, [buscar]);

  const tentarDeNovo = () => {
    setErro(false);
    void buscar();
  };

  const t = data?.ticket;
  const campo = (rotulo: string, valor: string) => (
    <div className="flex gap-3 py-1.5">
      <span className="w-[88px] shrink-0 text-label text-ink-3">{rotulo}</span>
      <span className="text-body text-ink">{valor}</span>
    </div>
  );

  return (
    <div data-testid="ticket-detail" className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 rounded-btn py-1 pr-2 text-body font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft size={15} />
        Voltar aos chamados
      </button>

      {erro && (
        <div data-testid="ticket-detail-error" className="flex flex-col items-start gap-2 rounded-bubble bg-warning-soft p-4 text-body text-warning-text">
          <span className="flex items-center gap-2">
            <TriangleAlert size={15} /> Não foi possível carregar o chamado
          </span>
          <button type="button" onClick={tentarDeNovo} className="font-semibold underline">
            Tentar de novo
          </button>
        </div>
      )}
      {!data && !erro && <div className="h-40 rounded-bubble bg-desk" style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }} />}

      {t && data && (
        <>
          <section className="flex flex-col gap-1.5">
            <div className="flex items-center">
              <span className="flex-1 text-label font-medium text-ink-3">
                {t.code} · {TYPE_LABEL[t.type]}
              </span>
              <span className={`flex items-center gap-1.5 text-label font-semibold ${TONE_TEXT[STATUS_TONE[t.status]]}`}>
                <Dot tone={STATUS_TONE[t.status]} />
                {STATUS_LABEL[t.status]}
              </span>
            </div>
            <h4 className="text-[15.5px] font-semibold text-ink">{t.title}</h4>
            <p className="text-body whitespace-pre-wrap text-ink-2">{t.description || 'Sem descrição.'}</p>
          </section>

          <section className="flex flex-col border-y border-rule py-2">
            {campo('Categoria', CATEGORY_LABEL[t.category] + (t.subcategory ? ` · ${t.subcategory}` : ''))}
            {campo('Prioridade', PRIORITY_LABEL[t.priority])}
            {campo('Afeta', AFFECTED_LABEL[t.affected])}
            {campo('Responsável', t.assignee_name ?? 'Ainda sem analista')}
            {campo('Aberto em', dataHora(t.created_at))}
            {ENCERRADOS.has(t.status)
              ? campo('Resolvido em', dataHora(t.resolved_at ?? t.last_update_at))
              : campo('Prazo', dataHora(t.due_at) + (t.overdue ? ` · ${t.overdue_label ?? 'vencido'}` : ''))}
          </section>

          <TicketHistory events={data.events} />
        </>
      )}
    </div>
  );
}
