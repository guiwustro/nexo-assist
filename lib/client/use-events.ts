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

/**
 * Tempo real do console e do chat: SSE em /api/v1/events. Se o SSE cair, vira polling de 3 s
 * (o consumidor recebe `{ type: 'poll' }` e recarrega o que precisa).
 */
export function useEvents(onEvent: (e: LiveEvent) => void): { mode: 'sse' | 'polling' } {
  const [mode, setMode] = useState<'sse' | 'polling'>('sse');
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (mode !== 'sse') {
      const t = setInterval(() => handler.current({ type: 'poll' }), POLL_MS);
      return () => clearInterval(t);
    }
    if (typeof EventSource === 'undefined') {
      const t = setTimeout(() => setMode('polling'), 0);
      return () => clearTimeout(t);
    }
    const es = new EventSource('/api/v1/events');
    const listener = (ev: MessageEvent) => {
      try {
        handler.current(JSON.parse(String(ev.data)) as LiveEvent);
      } catch {
        // evento malformado: ignora
      }
    };
    for (const t of EVENT_TYPES) es.addEventListener(t, listener as EventListener);
    es.addEventListener('error', () => {
      es.close();
      setMode('polling');
    });
    return () => es.close();
  }, [mode]);

  return { mode };
}
