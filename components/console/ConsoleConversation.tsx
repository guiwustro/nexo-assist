'use client';

import { Bot, CircleCheckBig, EllipsisVertical, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DecisionPanel } from '@/components/chat/DecisionPanel';
import { Toast } from '@/components/ui/Toast';
import { LoadOlderButton } from '@/components/ui/LoadOlderButton';
import { api, ApiFailure, apiWithMeta } from '@/lib/client/api';
import { mergeLatest, prependOlder } from '@/lib/client/message-pages';
import { useConversationScroller } from '@/lib/client/use-keep-scroll';
import { useEvents } from '@/lib/client/use-events';
import type { QueueItem } from '@/lib/conversations/queries';
import type { ApiMessage } from '@/lib/conversations/serialize';
import { hora } from '@/lib/format';
import { formatarPrazoCurto } from '@/lib/regras/prazo';
import { acharTrechos } from '@/lib/text/trechos';
import { Avatar } from './avatar';
import { ConsoleThread } from './ConsoleThread';
import { ConversationSearch } from './ConversationSearch';
import { EmployeeTickets, type EmployeeTicketsData } from './EmployeeTickets';
import type { HandoffView } from './HandoffCard';
import { TakeoverBar, type TakeoverMode } from './TakeoverBar';

type State = { item: QueueItem; messages: ApiMessage[]; handoffs: HandoffView[]; nextCursor: string | null };

const cursorOf = (meta: Record<string, unknown>) => (typeof meta.next_cursor === 'string' ? meta.next_cursor : null);

export function ConsoleConversation({ id, me }: { id: string; me: { id: string; name: string } }) {
  const [state, setState] = useState<State | null>(null);
  const [tickets, setTickets] = useState<EmployeeTicketsData | null>(null);
  const [ticketsErro, setTicketsErro] = useState(false);
  const [painel, setPainel] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busca, setBusca] = useState<string | null>(null);
  const [buscaAtual, setBuscaAtual] = useState(0);
  const { scroller, keepScroll, scrollToBottom } = useConversationScroller(state?.messages[0]?.id);
  const fecharToast = useCallback(() => setToast(null), []);
  const fecharWhy = useCallback(() => setWhy(null), []);

  const loadTickets = useCallback(async (employeeId: string) => {
    try {
      setTickets(await api<EmployeeTicketsData>(`/api/v1/employees/${employeeId}/tickets`));
      setTicketsErro(false);
    } catch {
      setTicketsErro(true);
    }
  }, []);

  const load = useCallback(async () => {
    const [item, page, handoffs] = await Promise.all([
      api<QueueItem>(`/api/v1/conversations/${id}`),
      apiWithMeta<ApiMessage[]>(`/api/v1/conversations/${id}/messages`),
      api<HandoffView[]>(`/api/v1/conversations/${id}/handoffs`),
    ]);
    // Últimas 50; as antigas já carregadas continuam na tela.
    setState((prev) => {
      if (!prev) return { item, messages: page.data, handoffs, nextCursor: cursorOf(page.meta) };
      const messages = mergeLatest(prev.messages, page.data);
      return { item, messages, handoffs, nextCursor: messages.length > page.data.length ? prev.nextCursor : cursorOf(page.meta) };
    });
    return item;
  }, [id]);

  const loadOlder = async () => {
    const cursor = state?.nextCursor;
    if (!cursor) return;
    keepScroll();
    const page = await apiWithMeta<ApiMessage[]>(`/api/v1/conversations/${id}/messages?cursor=${encodeURIComponent(cursor)}`);
    setState((prev) => (prev ? { ...prev, messages: prependOlder(prev.messages, page.data), nextCursor: cursorOf(page.meta) } : prev));
  };

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o setState acontece depois da busca (assíncrono)
    load()
      .then((item) => vivo && void loadTickets(item.employee.id))
      .catch(() => null);
    return () => {
      vivo = false;
    };
  }, [load, loadTickets]);

  useEvents((e) => {
    if (e.type === 'poll' || ('conversation_id' in e && e.conversation_id === id)) {
      void load().catch(() => null);
      if (e.type === 'ticket.created' || e.type === 'ticket.updated') void loadTickets(state?.item.employee.id ?? '');
    }
  });

  const lastId = state?.messages[state.messages.length - 1]?.id;
  useEffect(() => {
    scrollToBottom();
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps -- scrollToBottom só lê o ref

  /** Resultados da busca, da mensagem mais recente para a mais antiga (o primeiro é o que está mais perto do fim). */
  const resultados = useMemo(() => {
    if (!busca?.trim() || !state) return [];
    return [...state.messages]
      .reverse()
      .flatMap((m) => acharTrechos(m.body, busca).map((_, k) => ({ id: m.id, k })).reverse());
  }, [busca, state]);
  const ativo = resultados.length > 0 ? (resultados[Math.min(buscaAtual, resultados.length - 1)] ?? null) : null;

  useEffect(() => {
    scroller.current?.querySelector('[data-busca-ativa]')?.scrollIntoView?.({ block: 'center' });
  }, [ativo?.id, ativo?.k]); // eslint-disable-line react-hooks/exhaustive-deps -- o ref é estável

  const fecharBusca = useCallback(() => {
    setBusca(null);
    setBuscaAtual(0);
  }, []);

  if (!state) {
    return <div className="flex flex-1 items-center justify-center bg-thread text-body text-ink-3">Carregando conversa…</div>;
  }

  const { item } = state;
  const primeiro = item.employee.name.split(' ')[0] ?? item.employee.name;
  const mode: TakeoverMode =
    item.status === 'pending'
      ? 'waiting'
      : item.status === 'ai_handling'
        ? 'with_agent'
        : item.status === 'closed'
          ? 'closed'
          : item.assigned_to?.id === me.id
            ? 'mine'
            : 'other';

  const acao = async (event: 'claim' | 'release' | 'close') => {
    try {
      await api(`/api/v1/conversations/${id}/${event}`, { method: 'POST' });
    } catch (e) {
      setToast(e instanceof ApiFailure ? e.message : 'Não foi possível concluir');
    }
    await load().catch(() => null);
    window.dispatchEvent(new Event('nexo:queue-changed'));
  };

  const enviar = async (text: string) => {
    await api(`/api/v1/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }).catch((e: unknown) =>
      setToast(e instanceof Error ? e.message : 'Não foi possível enviar'),
    );
    await load().catch(() => null);
  };

  const ultimoClaim = [...state.messages].reverse().find((m) => m.type === 'system' && /assumiu/.test(m.body));
  const ultimaPassagem = [...state.messages].reverse().find((m) => m.type === 'system' && /^Transferida/.test(m.body));
  const lastEvent =
    item.status === 'claimed' && ultimoClaim
      ? { kind: 'claim' as const, text: `Assumido por ${item.assigned_to?.name ?? ''}`, time: hora(ultimoClaim.created_at) }
      : ultimaPassagem
        ? { kind: 'transfer' as const, text: 'Transferido para um analista', time: hora(ultimaPassagem.created_at) }
        : null;
  const meta = ['online', item.employee.department, item.focus_ticket_code].filter(Boolean).join(' · ');

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col bg-thread">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule bg-paper pr-4 pl-5">
          <Avatar nome={item.employee.name} size={40} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15.5px] font-semibold whitespace-nowrap text-ink">{item.employee.name}</span>
            <span className="truncate text-label text-ink-3">{meta}</span>
          </div>
          {mode === 'mine' ? (
            <>
              <button
                type="button"
                data-testid="header-release"
                onClick={() => void acao('release')}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-btn border border-input-border pr-3 pl-2.5 text-body font-medium whitespace-nowrap text-ink-2 hover:bg-desk"
              >
                <Bot size={14} />
                Devolver ao agent
              </button>
              <button
                type="button"
                data-testid="header-close"
                onClick={() => void acao('close')}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-btn bg-danger-soft pr-3 pl-2.5 text-body font-semibold whitespace-nowrap text-danger-text hover:brightness-95"
              >
                <CircleCheckBig size={14} />
                Encerrar atendimento
              </button>
            </>
          ) : (
            <span
              data-testid="conversation-mode"
              className={`flex items-center gap-[7px] rounded-full px-[11px] py-1.5 text-label font-semibold ${
                mode === 'waiting' ? 'bg-warning-soft text-warning-text' : 'bg-desk text-ink-2'
              }`}
            >
              <Bot size={14} />
              {mode === 'waiting'
                ? 'Aguardando atendente'
                : mode === 'with_agent'
                  ? 'Com o agent'
                  : mode === 'other'
                    ? `Com ${item.assigned_to?.name ?? 'outro analista'}`
                    : 'Encerrada'}
            </span>
          )}
          <button
            type="button"
            data-testid="header-search"
            onClick={() => (busca === null ? setBusca('') : fecharBusca())}
            aria-pressed={busca !== null}
            className={`flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk ${busca !== null ? 'bg-desk' : ''}`}
            aria-label="Buscar na conversa"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={() => setPainel((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk"
            aria-label="Chamados do funcionário"
          >
            <EllipsisVertical size={18} />
          </button>
        </header>
        {busca !== null && (
          <ConversationSearch
            termo={busca}
            onTermo={setBusca}
            total={resultados.length}
            atual={Math.min(buscaAtual, Math.max(resultados.length - 1, 0))}
            onAtual={setBuscaAtual}
            onClose={fecharBusca}
          />
        )}
        <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-10 pt-5 pb-4">
          <div className="mt-auto">
            {state.nextCursor && <LoadOlderButton onLoad={loadOlder} />}
            <ConsoleThread messages={state.messages} handoffs={state.handoffs} employeeName={item.employee.name} onWhy={setWhy}
              destaque={busca ? { termo: busca, ativo } : undefined}
            />
          </div>
        </div>
        <TakeoverBar
          mode={mode}
          firstName={primeiro}
          dueLabel={item.handoff ? formatarPrazoCurto(new Date(item.handoff.due_at), new Date()).replace('resposta até', 'até') : null}
          otherName={item.assigned_to?.name ?? null}
          onClaim={() => acao('claim')}
          onRelease={() => acao('release')}
          onSend={enviar}
        />
      </section>
      {painel && (
        <EmployeeTickets
          employeeId={item.employee.id}
          employeeName={item.employee.name}
          data={tickets}
          error={ticketsErro}
          focusCode={item.focus_ticket_code}
          lastEvent={lastEvent}
          onRetry={() => void loadTickets(item.employee.id)}
          onClose={() => setPainel(false)}
        />
      )}
      {why && <DecisionPanel runId={why} onClose={fecharWhy} />}
      {toast && <Toast text={toast} onDone={fecharToast} />}
    </>
  );
}
