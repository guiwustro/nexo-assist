'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner } from '@/components/ui/Banner';
import { LoadOlderButton } from '@/components/ui/LoadOlderButton';
import { api, ApiFailure, apiWithMeta, parseChatError, type CurrentData } from '@/lib/client/api';
import { mergeLatest, prependOlder } from '@/lib/client/message-pages';
import { useConversationScroller } from '@/lib/client/use-keep-scroll';
import { useEvents } from '@/lib/client/use-events';
import type { ActionTrace } from '@/lib/contracts/decision';
import type { DraftEdit } from '@/lib/contracts/drafts';
import type { MessagePart } from '@/lib/contracts/parts';
import type { NexoDataParts, NexoUIMessage } from '@/lib/contracts/ui';
import type { ApiMessage } from '@/lib/conversations/serialize';
import { AgentMessage, type DraftHandlers } from './AgentMessage';
import { Composer } from './Composer';
import { DecisionPanel } from './DecisionPanel';
import { UserBubble } from './MessageBubble';
import { SystemEvent } from './SystemEvent';
import { TicketCard } from './TicketCard';

const FORA_DO_AR = 'O sistema de chamados está fora do ar agora. Seu rascunho está guardado.';

function Skeleton() {
  return (
    <div data-testid="chat-loading" className="flex flex-col gap-5 px-[200px] py-7">
      <div className="ml-auto h-11 w-72 rounded-bubble bg-desk" style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }} />
      <div className="h-20 w-[480px] rounded-bubble bg-desk" style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }} />
      <div className="ml-auto h-11 w-56 rounded-bubble bg-desk" style={{ animation: 'nexo-pulse 1.4s ease-in-out infinite' }} />
    </div>
  );
}

export function ChatView({ aboutTicket }: { aboutTicket?: string } = {}) {
  const [data, setData] = useState<CurrentData | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const fresh = await api<CurrentData>('/api/v1/conversations/current');
      // A janela nova são as últimas 50; o que já estava na tela e saiu dela (mais antigo) continua.
      setData((prev) => {
        if (!prev || prev.conversation.id !== fresh.conversation.id) return fresh;
        const messages = mergeLatest(prev.messages, fresh.messages);
        const keptOlder = messages.length > fresh.messages.length;
        return { ...fresh, messages, next_cursor: keptOlder ? prev.next_cursor : fresh.next_cursor };
      });
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiFailure ? e.message : 'Não foi possível carregar a conversa');
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    api<CurrentData>('/api/v1/conversations/current')
      .then((d) => vivo && setData(d))
      .catch((e: unknown) => vivo && setErro(e instanceof ApiFailure ? e.message : 'Não foi possível carregar a conversa'));
    return () => {
      vivo = false;
    };
  }, []);

  if (!data) {
    return (
      <div className="flex h-full flex-col">
        {erro ? (
          <div className="px-[200px] py-7">
            <Banner action={<button onClick={() => void reload()} className="font-semibold">Tentar de novo</button>}>{erro}</Banner>
          </div>
        ) : (
          <Skeleton />
        )}
      </div>
    );
  }
  const loadOlder = async () => {
    const { id } = data.conversation;
    if (!data.next_cursor) return;
    const page = await apiWithMeta<ApiMessage[]>(
      `/api/v1/conversations/${id}/messages?cursor=${encodeURIComponent(data.next_cursor)}`,
    );
    const next = typeof page.meta.next_cursor === 'string' ? page.meta.next_cursor : null;
    setData((prev) =>
      prev && prev.conversation.id === id ? { ...prev, messages: prependOlder(prev.messages, page.data), next_cursor: next } : prev,
    );
  };

  return <ChatSession key={data.conversation.id} data={data} reload={reload} loadOlder={loadOlder} aboutTicket={aboutTicket} />;
}

type Live = { text: string; parts: MessagePart[]; actions: ActionTrace[]; systems: string[]; runId: string | null; decisionReady: boolean };

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
}: {
  data: CurrentData;
  reload: () => Promise<void>;
  loadOlder: () => Promise<void>;
  aboutTicket?: string;
}) {
  const convId = data.conversation.id;
  const [now, setNow] = useState(() => new Date());
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; n: number } | undefined>(() =>
    aboutTicket ? { text: `Sobre o ${aboutTicket}: `, n: 1 } : undefined,
  );
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
        const msg = e instanceof ApiFailure && e.status === 503 ? FORA_DO_AR : e instanceof Error ? e.message : 'Erro';
        setDraftErrors((d) => ({ ...d, [id]: msg }));
        if (e instanceof ApiFailure && e.status !== 503) await reload();
      }
    },
    cancel: async (id) => {
      await api(`/api/v1/drafts/${id}/cancel`, { method: 'POST' }).catch(() => null);
      await reload();
    },
    save: async (id, edit: DraftEdit) => {
      await api(`/api/v1/drafts/${id}`, { method: 'PATCH', body: JSON.stringify(edit) });
      await reload();
    },
  };

  const onOverdueAction = (action: string, code: string) => {
    if (action === 'Adicionar informação') setPrefill({ text: `Sobre o ${code}: `, n: Date.now() });
    else send(action);
  };

  const comAnalista = data.conversation.status === 'pending' || data.conversation.status === 'claimed';
  const historico = data.messages;
  const live = chat.messages;
  const ultimoAgentId = [...historico].reverse().find((m) => m.sent_via === 'ai')?.id;
  const temLive = live.length > 0;
  const enviadas = live.filter((m) => m.role === 'user').length;

  return (
    <div className="flex h-full flex-col">
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
              isLast={!temLive && !failed && m.id === ultimoAgentId && historico[historico.length - 1]?.sent_via !== 'user'}
              onSend={send}
              onOverdueAction={onOverdueAction}
              drafts={drafts}
              onOpenRun={setOpenRun}
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
          {busy && !comAnalista && live[live.length - 1]?.role === 'user' && (
            <AgentMessage text="" parts={[]} actions={[]} streaming isLast={false} now={now} onSend={send} drafts={drafts} />
          )}
          {failed && (
            <UserBubble failed onRetry={() => send(failed)}>
              {failed}
            </UserBubble>
          )}
        </div>
      </div>

      {(comAnalista || banner) && (
        <div className="flex flex-col gap-2 px-[200px] pt-2">
          {comAnalista && (
            <Banner tone="primary" testId="analyst-banner">
              Um analista vai continuar este atendimento
            </Banner>
          )}
          {banner && <Banner testId="rate-banner">{banner}</Banner>}
        </div>
      )}
      <Composer
        count={data.session.count + enviadas}
        limit={data.session.limit}
        onSend={send}
        mode={comAnalista ? 'analyst' : 'agent'}
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
  const semAgent = !l.runId && !l.text && l.actions.length === 0 && l.parts.length === 0;
  if (semAgent) {
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
}: {
  m: ApiMessage;
  now: Date;
  isLast: boolean;
  onSend: (t: string) => void;
  onOverdueAction: (a: string, code: string) => void;
  drafts: DraftHandlers;
  onOpenRun: (id: string) => void;
}) {
  if (m.type === 'system') {
    const card = m.parts.find((p) => p.kind === 'ticket_card');
    return (
      <>
        <SystemEvent text={m.body} />
        {card && <TicketCard ticket={card.ticket} overdue={card.overdue} overdueLabel={card.overdue_label} now={now} />}
      </>
    );
  }
  if (m.direction === 'inbound') return <UserBubble>{m.body}</UserBubble>;
  return (
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
  );
}
