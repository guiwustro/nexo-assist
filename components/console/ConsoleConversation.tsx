'use client';

import { Bot, CircleCheckBig, EllipsisVertical, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DecisionPanel } from '@/components/chat/DecisionPanel';
import { Toast } from '@/components/ui/Toast';
import { LoadOlderButton } from '@/components/ui/LoadOlderButton';
import { api, ApiFailure, apiWithMeta } from '@/lib/client/api';
import { mergeLatest, prependOlder } from '@/lib/client/message-pages';
import { useConversationScroller } from '@/lib/client/use-keep-scroll';
import { useJumpToMessage } from '@/lib/client/use-jump-to-message';
import { useEvents } from '@/lib/client/use-events';
import type { QueueItem } from '@/lib/conversations/queries';
import type { ApiMessage } from '@/lib/conversations/serialize';
import { time } from '@/lib/format';
import { formatShortDeadline } from '@/lib/rules/deadline';
import { findMatches } from '@/lib/text/matches';
import { Avatar } from './avatar';
import { ConsoleThread } from './ConsoleThread';
import { ConversationSearch } from './ConversationSearch';
import { EmployeeTickets, type EmployeeTicketsData } from './EmployeeTickets';
import type { HandoffView } from './HandoffCard';
import { TakeoverBar, type TakeoverMode } from './TakeoverBar';

type State = { item: QueueItem; messages: ApiMessage[]; handoffs: HandoffView[]; nextCursor: string | null };

const cursorOf = (meta: Record<string, unknown>) =>
  typeof meta.next_cursor === 'string' ? meta.next_cursor : null;

export function ConsoleConversation({
  id,
  me,
  jumpTo = null,
}: {
  id: string;
  me: { id: string; name: string };
  jumpTo?: string | null;
}) {
  const [state, setState] = useState<State | null>(null);
  const [tickets, setTickets] = useState<EmployeeTicketsData | null>(null);
  const [ticketsError, setTicketsError] = useState(false);
  const [panel, setPanel] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchIndex, setSearchIndex] = useState(0);
  const { scroller, keepScroll, scrollToBottom } = useConversationScroller(state?.messages[0]?.id);
  const closeToast = useCallback(() => setToast(null), []);
  const closeWhy = useCallback(() => setWhy(null), []);

  const loadTickets = useCallback(async (employeeId: string) => {
    try {
      setTickets(await api<EmployeeTicketsData>(`/api/v1/employees/${employeeId}/tickets`));
      setTicketsError(false);
    } catch {
      setTicketsError(true);
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
      return {
        item,
        messages,
        handoffs,
        nextCursor: messages.length > page.data.length ? prev.nextCursor : cursorOf(page.meta),
      };
    });
    return item;
  }, [id]);

  const loadOlder = async (): Promise<boolean> => {
    const cursor = state?.nextCursor;
    if (!cursor) return false;
    keepScroll();
    const page = await apiWithMeta<ApiMessage[]>(
      `/api/v1/conversations/${id}/messages?cursor=${encodeURIComponent(cursor)}`,
    );
    setState((prev) =>
      prev
        ? { ...prev, messages: prependOlder(prev.messages, page.data), nextCursor: cursorOf(page.meta) }
        : prev,
    );
    return page.data.length > 0;
  };

  const hasMessage = useCallback(
    (messageId: string) => state?.messages.some((message) => message.id === messageId) ?? false,
    [state?.messages],
  );
  const { highlighted } = useJumpToMessage(state ? jumpTo : null, {
    has: hasMessage,
    loadOlder,
    maxPages: 10,
  });

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- o setState acontece depois da busca (assíncrono)
    load()
      .then((item) => alive && void loadTickets(item.employee.id))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [load, loadTickets]);

  useEvents((e) => {
    if (e.type === 'poll' || ('conversation_id' in e && e.conversation_id === id)) {
      void load().catch(() => null);
      if (e.type === 'ticket.created' || e.type === 'ticket.updated')
        void loadTickets(state?.item.employee.id ?? '');
    }
  });

  const lastId = state?.messages[state.messages.length - 1]?.id;
  useEffect(() => {
    scrollToBottom();
  }, [lastId]); // eslint-disable-line react-hooks/exhaustive-deps -- scrollToBottom só lê o ref

  /** Resultados da busca, da mensagem mais recente para a mais antiga (o primeiro é o que está mais perto do fim). */
  const results = useMemo(() => {
    if (!searchQuery?.trim() || !state) return [];
    return [...state.messages].reverse().flatMap((m) =>
      findMatches(m.body, searchQuery)
        .map((_, k) => ({ id: m.id, k }))
        .reverse(),
    );
  }, [searchQuery, state]);
  const active = results.length > 0 ? (results[Math.min(searchIndex, results.length - 1)] ?? null) : null;

  useEffect(() => {
    scroller.current?.querySelector('[data-busca-ativa]')?.scrollIntoView?.({ block: 'center' });
  }, [active?.id, active?.k]); // eslint-disable-line react-hooks/exhaustive-deps -- o ref é estável

  const closeSearch = useCallback(() => {
    setSearchQuery(null);
    setSearchIndex(0);
  }, []);

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center bg-thread text-body text-ink-3">
        Carregando conversa…
      </div>
    );
  }

  const { item } = state;
  const firstName = item.employee.name.split(' ')[0] ?? item.employee.name;
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

  const action = async (event: 'claim' | 'release' | 'close') => {
    try {
      await api(`/api/v1/conversations/${id}/${event}`, { method: 'POST' });
    } catch (e) {
      setToast(e instanceof ApiFailure ? e.message : 'Não foi possível concluir');
    }
    await load().catch(() => null);
    window.dispatchEvent(new Event('nexo:queue-changed'));
  };

  const send = async (text: string) => {
    await api(`/api/v1/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }).catch((e: unknown) => setToast(e instanceof Error ? e.message : 'Não foi possível enviar'));
    await load().catch(() => null);
  };

  const lastClaim = [...state.messages].reverse().find((m) => m.type === 'system' && /assumiu/.test(m.body));
  const lastHandoff = [...state.messages]
    .reverse()
    .find((m) => m.type === 'system' && /^Transferida/.test(m.body));
  const lastEvent =
    item.status === 'claimed' && lastClaim
      ? {
          kind: 'claim' as const,
          text: `Assumido por ${item.assigned_to?.name ?? ''}`,
          time: time(lastClaim.created_at),
        }
      : lastHandoff
        ? {
            kind: 'transfer' as const,
            text: 'Transferido para um analista',
            time: time(lastHandoff.created_at),
          }
        : null;
  const meta = ['online', item.employee.department, item.focus_ticket_code].filter(Boolean).join(' · ');

  return (
    <>
      <section className="flex min-w-0 flex-1 flex-col bg-thread">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule bg-paper pr-4 pl-5">
          <Avatar name={item.employee.name} size={40} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15.5px] font-semibold whitespace-nowrap text-ink">
              {item.employee.name}
            </span>
            <span className="truncate text-label text-ink-3">{meta}</span>
          </div>
          {mode === 'mine' ? (
            <>
              <button
                type="button"
                data-testid="header-release"
                onClick={() => void action('release')}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-btn border border-input-border pr-3 pl-2.5 text-body font-medium whitespace-nowrap text-ink-2 hover:bg-desk"
              >
                <Bot size={14} />
                Devolver ao agent
              </button>
              <button
                type="button"
                data-testid="header-close"
                onClick={() => void action('close')}
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
            onClick={() => (searchQuery === null ? setSearchQuery('') : closeSearch())}
            aria-pressed={searchQuery !== null}
            className={`flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk ${searchQuery !== null ? 'bg-desk' : ''}`}
            aria-label="Buscar na conversa"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={() => setPanel((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk"
            aria-label="Chamados do funcionário"
          >
            <EllipsisVertical size={18} />
          </button>
        </header>
        {searchQuery !== null && (
          <ConversationSearch
            term={searchQuery}
            onTermChange={setSearchQuery}
            total={results.length}
            current={Math.min(searchIndex, Math.max(results.length - 1, 0))}
            onIndexChange={setSearchIndex}
            onClose={closeSearch}
          />
        )}
        <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-10 pt-5 pb-4">
          <div className="mt-auto">
            {state.nextCursor && <LoadOlderButton onLoad={async () => void (await loadOlder())} />}
            <ConsoleThread
              messages={state.messages}
              handoffs={state.handoffs}
              employeeName={item.employee.name}
              onWhy={setWhy}
              highlight={searchQuery ? { term: searchQuery, active: active } : undefined}
              highlightedMessage={highlighted}
            />
          </div>
        </div>
        <TakeoverBar
          mode={mode}
          firstName={firstName}
          dueLabel={
            item.handoff
              ? formatShortDeadline(new Date(item.handoff.due_at), new Date()).replace('resposta até', 'até')
              : null
          }
          otherName={item.assigned_to?.name ?? null}
          employeeHasAgentAttendance={item.employee_has_agent_attendance}
          onClaim={() => action('claim')}
          onRelease={() => action('release')}
          onSend={send}
        />
      </section>
      {panel && (
        <EmployeeTickets
          employeeId={item.employee.id}
          employeeName={item.employee.name}
          data={tickets}
          error={ticketsError}
          conversationId={item.id}
          conversationCodes={item.ticket_codes}
          lastEvent={lastEvent}
          onRetry={() => void loadTickets(item.employee.id)}
          onClose={() => setPanel(false)}
        />
      )}
      {why && <DecisionPanel runId={why} onClose={closeWhy} />}
      {toast && <Toast text={toast} onDone={closeToast} />}
    </>
  );
}
