'use client';

import { useEffect, useRef, useState } from 'react';

export type LiveEvent =
  | { type: 'poll' }
  | { type: string; id: number; conversation_id: string | null; payload: Record<string, unknown> };

export const EVENT_TYPES = [
  'conversation.message_created',
  'conversation.transferred',
  'conversation.claimed',
  'conversation.released',
  'conversation.closed',
  'draft.created',
  'draft.confirmed',
  'ticket.created',
  'ticket.updated',
] as const;

const POLL_MS = 3000;
/** Espera para abrir um SSE novo depois que o navegador desistiu (resposta não 200, por exemplo). */
const RECONNECT_MS = [5000, 10_000, 20_000, 30_000];

/**
 * Tempo real do console e do chat: SSE em /api/v1/events. Enquanto o SSE está fora, vira polling de 3 s
 * (o consumidor recebe `{ type: 'poll' }` e recarrega o que precisa). Quando o SSE volta — o navegador reconecta
 * sozinho numa queda de rede, ou abrimos outro com espera crescente se ele desistiu —, o polling para e a tela
 * recarrega uma vez para pegar o que passou.
 */
export function useEvents(onEvent: (e: LiveEvent) => void): { mode: 'sse' | 'polling' } {
  const [mode, setMode] = useState<'sse' | 'polling'>('sse');
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let falhas = 0;
    let ativo = true;

    const iniciarPolling = () => {
      if (poll) return;
      poll = setInterval(() => handler.current({ type: 'poll' }), POLL_MS);
      setMode('polling');
    };
    const pararPolling = () => {
      if (!poll) return;
      clearInterval(poll);
      poll = null;
      setMode('sse');
      handler.current({ type: 'poll' });
    };

    const conectar = () => {
      if (!ativo) return;
      if (typeof EventSource === 'undefined') {
        retry = setTimeout(iniciarPolling, 0);
        return;
      }
      const atual = new EventSource('/api/v1/events');
      es = atual;
      const listener = (ev: MessageEvent) => {
        try {
          handler.current(JSON.parse(String(ev.data)) as LiveEvent);
        } catch {
          // evento malformado: ignora
        }
      };
      for (const t of EVENT_TYPES) atual.addEventListener(t, listener as EventListener);
      atual.addEventListener('open', () => {
        falhas = 0;
        pararPolling();
      });
      atual.addEventListener('error', () => {
        iniciarPolling();
        // CONNECTING: o navegador tenta de novo sozinho (retry: 3000). CLOSED: ele desistiu; abrimos outro depois.
        if (atual.readyState === EventSource.CLOSED) {
          atual.close();
          retry = setTimeout(conectar, RECONNECT_MS[Math.min(falhas, RECONNECT_MS.length - 1)]);
          falhas += 1;
        }
      });
    };
    conectar();

    return () => {
      ativo = false;
      es?.close();
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
    };
  }, []);

  return { mode };
}
