'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Ref da área rolável da conversa. Ao pôr mensagens antigas no topo, mantém na tela o que o usuário estava
 * vendo: chame `keepScroll()` antes de buscar; a posição volta quando a primeira mensagem (`firstId`) mudar.
 */
export function useConversationScroller(firstId: string | undefined) {
  const scroller = useRef<HTMLDivElement>(null);
  const fromBottom = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && fromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - fromBottom.current;
      fromBottom.current = null;
    }
  }, [firstId]);
  const keepScroll = () => {
    const el = scroller.current;
    if (el) fromBottom.current = el.scrollHeight - el.scrollTop;
  };
  const scrollToBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  return { scroller, keepScroll, scrollToBottom };
}
