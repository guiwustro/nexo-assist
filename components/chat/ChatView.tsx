'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner } from '@/components/ui/Banner';
import { LoadOlderButton } from '@/components/ui/LoadOlderButton';
import {
  api,
  ApiFailure,
  apiWithMeta,
  parseChatError,
  type AttendanceSummary,
  type CurrentData,
} from '@/lib/client/api';
import { mergeLatest, prependOlder } from '@/lib/client/message-pages';
import { useConversationScroller } from '@/lib/client/use-keep-scroll';
import { useJumpToMessage } from '@/lib/client/use-jump-to-message';
import { useEvents } from '@/lib/client/use-events';
import type { ActionTrace } from '@/lib/contracts/decision';
import type { DraftEdit } from '@/lib/contracts/drafts';
import type { MessagePart } from '@/lib/contracts/parts';
import type { NexoDataParts, NexoUIMessage } from '@/lib/contracts/ui';
import type { ApiMessage } from '@/lib/conversations/serialize';
import { AgentMessage, OVERDUE_OFFER, type DraftHandlers } from './AgentMessage';
import { Composer } from './Composer';
import { DecisionPanel } from './DecisionPanel';
import { UserBubble } from './MessageBubble';
import { SystemEvent } from './SystemEvent';
import { TicketCard } from './TicketCard';
import { AttendanceSwitcher } from './AttendanceSwitcher';

const TICKETS_DOWN_MESSAGE = 'O sistema de chamados está fora do ar agora. Seu rascunho está guardado.';

function Skeleton() {
  return (
    <div data-testid="chat-loading" className="flex flex-col gap-5 px-[200px] py-7">
      <div
        className="ml-auto h-11 w-72 rounded-bubble bg-desk"
        style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }}
      />
      <div
        className="h-20 w-[480px] rounded-bubble bg-desk"
        style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }}
      />
      <div
        className="ml-auto h-11 w-56 rounded-bubble bg-desk"
        style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }}
      />
    </div>
  );
}

export function ChatView({
  aboutTicket,
  conversationId,
  jumpTo,
}: {
  aboutTicket?: string;
  conversationId?: string;
  jumpTo?: string | null;
} = {}) {
  const endpoint = conversationId
    ? `/api/v1/me/conversations/${conversationId}`
    : '/api/v1/conversations/current';
  const [data, setData] = useState<CurrentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataEndpoint, setDataEndpoint] = useState(endpoint);
  const [errorEndpoint, setErrorEndpoint] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const fresh = await api<CurrentData>(endpoint);
      // A janela nova são as últimas 50; o que já estava na tela e saiu dela (mais antigo) continua.
      setData((prev) => {
        if (!prev || prev.conversation.id !== fresh.conversation.id) return fresh;
        const messages = mergeLatest(prev.messages, fresh.messages);
        const keptOlder = messages.length > fresh.messages.length;
        return { ...fresh, messages, next_cursor: keptOlder ? prev.next_cursor : fresh.next_cursor };
      });
      setError(null);
      setDataEndpoint(endpoint);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : 'Não foi possível carregar a conversa');
      setErrorEndpoint(endpoint);
    }
  }, [endpoint]);

  useEffect(() => {
    let alive = true;
    api<CurrentData>(endpoint)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setDataEndpoint(endpoint);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiFailure ? e.message : 'Não foi possível carregar o atendimento');
        setErrorEndpoint(endpoint);
      });
    return () => {
      alive = false;
    };
  }, [endpoint]);

  if (!data || dataEndpoint !== endpoint || (conversationId && data.conversation.id !== conversationId)) {
    const currentError = errorEndpoint === endpoint ? error : null;
    return (
      <div className="flex h-full flex-col">
        {currentError ? (
          <div className="px-[200px] py-7">
            <Banner
              action={
                <button onClick={() => void reload()} className="font-semibold">
                  Tentar de novo
                </button>
              }
            >
              {currentError}
            </Banner>
          </div>
        ) : (
          <Skeleton />
        )}
      </div>
    );
  }
  const loadOlder = async (): Promise<boolean> => {
    const { id } = data.conversation;
    if (!data.next_cursor) return false;
    const page = await apiWithMeta<ApiMessage[]>(
      `/api/v1/conversations/${id}/messages?cursor=${encodeURIComponent(data.next_cursor)}`,
    );
    const next = typeof page.meta.next_cursor === 'string' ? page.meta.next_cursor : null;
    setData((prev) =>
      prev && prev.conversation.id === id
        ? { ...prev, messages: prependOlder(prev.messages, page.data), next_cursor: next }
        : prev,
    );
    return page.data.length > 0;
  };

  return (
    <ChatSession
      key={data.conversation.id}
      data={data}
      reload={reload}
      loadOlder={loadOlder}
      aboutTicket={aboutTicket}
      jumpTo={jumpTo ?? null}
    />
  );
}

type Live = {
  text: string;
  parts: MessagePart[];
  actions: ActionTrace[];
  systems: string[];
  runId: string | null;
  decisionReady: boolean;
};

function fromUI(m: NexoUIMessage): Live {
  const live: Live = { text: '', parts: [], actions: [], systems: [], runId: null, decisionReady: false };
  for (const p of m.parts) {
    if (p.type === 'text') live.text += p.text;
    else if (p.type === 'data-action') live.actions.push(p.data as NexoDataParts['action']);
    else if (p.type === 'data-card') live.parts.push(p.data as NexoDataParts['card']);
    else if (p.type === 'data-system') live.systems.push((p.data as NexoDataParts['system']).text);
    else if (p.type === 'data-run') {
      const r = p.data as NexoDataParts['run'];
      live.runId = r.run_id;
      live.decisionReady = Boolean(r.decision_ready);
    }
  }
  return live;
}

const userText = (m: NexoUIMessage) => m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');

function ChatSession({
  data,
  reload,
  loadOlder,
  aboutTicket,
  jumpTo,
}: {
  data: CurrentData;
  reload: () => Promise<void>;
  loadOlder: () => Promise<boolean>;
  aboutTicket?: string;
  jumpTo: string | null;
}) {
  const router = useRouter();
  const convId = data.conversation.id;
  const [now, setNow] = useState(() => new Date());
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | undefined>(() =>
    aboutTicket ? { text: `Sobre o ${aboutTicket}: `, n: 1 } : undefined,
  );
  const [openingAnother, setOpeningAnother] = useState(false);
  const responseConversationId = useRef<string | null>(null);
  // O ?sobre= já virou rascunho no composer: tira da URL para um recarregar não escrever de novo.
  useEffect(() => {
    if (aboutTicket) window.history.replaceState(null, '', '/atendimento');
  }, [aboutTicket]);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const closeRun = useCallback(() => setOpenRun(null), []);
  const { scroller, keepScroll, scrollToBottom } = useConversationScroller(data.messages[0]?.id);
  const lastSent = useRef<string>('');

  const transport = useMemo(
    () =>
      new DefaultChatTransport<NexoUIMessage>({
        api: `/api/v1/conversations/${convId}/messages`,
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          responseConversationId.current = response.headers.get('x-conversation-id');
          return response;
        },
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages[messages.length - 1];
          return { body: { text: last ? userText(last) : '' } };
        },
      }),
    [convId],
  );

  const chat = useChat<NexoUIMessage>({
    id: convId,
    transport,
    onFinish: async () => {
      const nextId = responseConversationId.current;
      responseConversationId.current = null;
      if (nextId && nextId !== convId) {
        router.replace(`/atendimento/${nextId}`);
        return;
      }
      await reload();
      chat.setMessages([]);
    },
    onError: async (e) => {
      const err = parseChatError(e);
      if (err.code === 'session_limit_reached') {
        setBanner(err.message || 'Esta sessão chegou ao limite de mensagens.');
        chat.setMessages([]);
        await reload();
        return;
      }
      if (err.code === 'rate_limited') setBanner(err.message);
      setFailed(lastSent.current);
      chat.setMessages([]);
    },
  });
  const busy = chat.status === 'submitted' || chat.status === 'streaming';

  // Tempo real: o analista assumiu, respondeu, devolveu ou encerrou → recarrega o histórico (fora do stream).
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEvents((e) => {
    if (busyRef.current) return;
    if (e.type === 'poll' || ('conversation_id' in e && e.conversation_id === convId)) void reload();
  });

  const send = useCallback(
    (text: string) => {
      if (busy) return;
      lastSent.current = text;
      setFailed(null);
      setBanner(null);
      setNow(new Date());
      void chat.sendMessage({ text });
    },
    [busy, chat],
  );

  // Desce ao fim só quando chega mensagem nova no fim (não ao carregar as antigas no topo).
  const lastId = data.messages[data.messages.length - 1]?.id;
  useEffect(() => {
    scrollToBottom();
  }, [lastId, chat.messages, failed]); // eslint-disable-line react-hooks/exhaustive-deps -- scrollToBottom só lê o ref

  const drafts: DraftHandlers = {
    errors: draftErrors,
    confirm: async (id) => {
      try {
        await api(`/api/v1/drafts/${id}/confirm`, { method: 'POST' });
        setDraftErrors(({ [id]: _, ...rest }) => rest);
        await reload();
      } catch (e) {
        const msg =
          e instanceof ApiFailure && e.status === 503
            ? TICKETS_DOWN_MESSAGE
            : e instanceof Error
              ? e.message
              : 'Erro';
        setDraftErrors((d) => ({ ...d, [id]: msg }));
        if (e instanceof ApiFailure && e.status !== 503) await reload();
      }
    },
    cancel: async (id) => {
      await api(`/api/v1/drafts/${id}/cancel`, { method: 'POST' }).catch(() => null);
      await reload();
    },
    save: async (id, edit: DraftEdit) => {
      try {
        await api(`/api/v1/drafts/${id}`, { method: 'PATCH', body: JSON.stringify(edit) });
      } catch (e) {
        setDraftErrors((d) => ({ ...d, [id]: e instanceof Error ? e.message : 'Não foi possível salvar' }));
      }
      await reload();
    },
  };

  const onOverdueAction = (action: string, code: string) => {
    if (action === OVERDUE_OFFER.addInfo) setPrefill({ text: `Sobre o ${code}: `, n: Date.now() });
    else send(action);
  };

  const hasMessage = useCallback(
    (id: string) => data.messages.some((message) => message.id === id),
    [data.messages],
  );
  const { highlighted } = useJumpToMessage(jumpTo, { has: hasMessage, loadOlder, maxPages: 10 });
  const startAnother = async () => {
    if (openingAnother) return;
    setOpeningAnother(true);
    try {
      const next = await api<AttendanceSummary>('/api/v1/conversations', { method: 'POST' });
      router.push(`/atendimento/${next.id}`);
    } catch (e) {
      setBanner(e instanceof ApiFailure ? e.message : 'Não foi possível abrir outro atendimento');
    } finally {
      setOpeningAnother(false);
    }
  };

  const isWithAnalyst = data.conversation.status === 'pending' || data.conversation.status === 'claimed';
  const historico = data.messages;
  const live = chat.messages;
  const lastAgentId = [...historico].reverse().find((m) => m.sent_via === 'ai')?.id;
  const hasLive = live.length > 0;
  const sentCount = live.filter((m) => m.role === 'user').length;

  return (
    <div className="flex h-full flex-col">
      <AttendanceSwitcher key={data.conversation.id} current={data.conversation} />
      {data.conversation.status === 'closed' && (
        <div className="px-[200px] pt-3">
          <Banner tone="primary" testId="closed-attendance-banner">
            Este atendimento foi encerrado
          </Banner>
        </div>
      )}
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mt-auto flex flex-col gap-5 px-[200px] pt-7 pb-1">
          {data.next_cursor && (
            <LoadOlderButton
              onLoad={async () => {
                keepScroll();
                await loadOlder();
              }}
            />
          )}
          {historico.map((m) => (
            <HistoryItem
              key={m.id}
              m={m}
              now={now}
              isLast={
                !hasLive &&
                !failed &&
                m.id === lastAgentId &&
                historico[historico.length - 1]?.sent_via !== 'user'
              }
              onSend={send}
              onOverdueAction={onOverdueAction}
              drafts={drafts}
              onOpenRun={setOpenRun}
              highlighted={highlighted === m.id}
            />
          ))}
          {live.map((m, i) =>
            m.role === 'user' ? (
              <UserBubble key={m.id}>{userText(m)}</UserBubble>
            ) : (
              <LiveAgent
                key={m.id}
                m={m}
                isLast={i === live.length - 1}
                streaming={busy}
                now={now}
                onSend={send}
                drafts={drafts}
                onOpenRun={setOpenRun}
              />
            ),
          )}
          {busy && !isWithAnalyst && live[live.length - 1]?.role === 'user' && (
            <AgentMessage
              text=""
              parts={[]}
              actions={[]}
              streaming
              isLast={false}
              now={now}
              onSend={send}
              drafts={drafts}
            />
          )}
          {failed && (
            <UserBubble failed onRetry={() => send(failed)}>
              {failed}
            </UserBubble>
          )}
        </div>
      </div>

      {(isWithAnalyst || banner) && (
        <div className="flex flex-col gap-2 px-[200px] pt-2">
          {isWithAnalyst && (
            <Banner tone="primary" testId="analyst-banner">
              <span className="flex items-center justify-between gap-3">
                <span>Um analista vai continuar este atendimento</span>
                <button
                  type="button"
                  disabled={openingAnother}
                  onClick={() => void startAnother()}
                  className="shrink-0 font-semibold underline disabled:opacity-60"
                >
                  {openingAnother ? 'Abrindo…' : 'Falar de outro assunto'}
                </button>
              </span>
            </Banner>
          )}
          {banner && <Banner testId="rate-banner">{banner}</Banner>}
        </div>
      )}
      <Composer
        count={data.session.count + sentCount}
        limit={data.session.limit}
        onSend={send}
        mode={isWithAnalyst ? 'analyst' : 'agent'}
        disabled={busy}
        prefill={prefill}
      />
      {openRun && <DecisionPanel runId={openRun} onClose={closeRun} />}
    </div>
  );
}

function LiveAgent({
  m,
  isLast,
  streaming,
  now,
  onSend,
  drafts,
  onOpenRun,
}: {
  m: NexoUIMessage;
  isLast: boolean;
  streaming: boolean;
  now: Date;
  onSend: (t: string) => void;
  drafts: DraftHandlers;
  onOpenRun: (id: string) => void;
}) {
  const l = fromUI(m);
  const hasNoAgentContent = !l.runId && !l.text && l.actions.length === 0 && l.parts.length === 0;
  if (hasNoAgentContent) {
    return (
      <>
        {l.systems.map((s, i) => (
          <SystemEvent key={i} text={s} />
        ))}
      </>
    );
  }
  return (
    <>
      <AgentMessage
        text={l.text}
        parts={l.parts}
        actions={l.actions}
        streaming={streaming && isLast}
        decision={l.runId ? (l.decisionReady ? 'ready' : 'preparing') : 'none'}
        onOpenDecision={l.runId && l.decisionReady ? () => onOpenRun(l.runId!) : undefined}
        isLast={isLast}
        now={now}
        onSend={onSend}
        drafts={drafts}
      />
      {l.systems.map((s, i) => (
        <SystemEvent key={i} text={s} />
      ))}
    </>
  );
}

function HistoryItem({
  m,
  now,
  isLast,
  onSend,
  onOverdueAction,
  drafts,
  onOpenRun,
  highlighted,
}: {
  m: ApiMessage;
  now: Date;
  isLast: boolean;
  onSend: (t: string) => void;
  onOverdueAction: (a: string, code: string) => void;
  drafts: DraftHandlers;
  onOpenRun: (id: string) => void;
  highlighted: boolean;
}) {
  const wrapper = {
    'data-message-id': m.id,
    'data-testid': highlighted ? 'message-highlight' : undefined,
    className: `max-w-full ${m.type === 'system' ? 'self-center' : m.direction === 'inbound' ? 'ml-auto' : ''} ${highlighted ? 'rounded-bubble ring-2 ring-primary ring-offset-2' : ''}`,
  };
  if (m.type === 'system') {
    const card = m.parts.find((p) => p.kind === 'ticket_card');
    return (
      <div {...wrapper}>
        <SystemEvent text={m.body} />
        {card && (
          <TicketCard
            ticket={card.ticket}
            overdue={card.overdue}
            overdueLabel={card.overdue_label}
            now={now}
          />
        )}
      </div>
    );
  }
  if (m.direction === 'inbound')
    return (
      <div {...wrapper}>
        <UserBubble>{m.body}</UserBubble>
      </div>
    );
  return (
    <div {...wrapper}>
      <AgentMessage
        text={m.body}
        parts={m.parts}
        actions={m.actions}
        decision={m.agent_run_id ? 'ready' : 'none'}
        onOpenDecision={m.agent_run_id ? () => onOpenRun(m.agent_run_id!) : undefined}
        isLast={isLast}
        now={now}
        onSend={onSend}
        onOverdueAction={onOverdueAction}
        drafts={drafts}
        senderName={m.sent_via === 'user' ? (m.sender_name ?? 'Analista') : null}
      />
    </div>
  );
}
