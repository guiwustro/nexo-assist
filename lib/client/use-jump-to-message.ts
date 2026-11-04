'use client';

import { useEffect, useRef, useState } from 'react';

export function useJumpToMessage(
  targetId: string | null,
  opts: { has: (id: string) => boolean; loadOlder: () => Promise<boolean>; maxPages?: number },
): { highlighted: string | null } {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tracker = useRef<{
    targetId: string | null;
    pages: number;
    loading: boolean;
    exhausted: boolean;
    highlighted: boolean;
  }>({ targetId: null, pages: 0, loading: false, exhausted: false, highlighted: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const state = tracker.current;
    if (state.targetId !== targetId) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      tracker.current = { targetId, pages: 0, loading: false, exhausted: false, highlighted: false };
      setHighlighted(null);
    }
    if (!targetId) return;

    const current = tracker.current;
    if (opts.has(targetId)) {
      if (!current.highlighted) {
        current.highlighted = true;
        const element = [...document.querySelectorAll<HTMLElement>('[data-message-id]')].find(
          (node) => node.dataset.messageId === targetId,
        );
        element?.scrollIntoView({ block: 'center' });
        setHighlighted(targetId);
        timer.current = setTimeout(() => setHighlighted(null), 3000);
      }
      return;
    }
    if (current.loading || current.exhausted || current.pages >= (opts.maxPages ?? 10)) return;

    current.loading = true;
    void opts
      .loadOlder()
      .then((loaded) => {
        current.loading = false;
        if (loaded) current.pages += 1;
        else current.exhausted = true;
        setAttempt((n) => n + 1);
      })
      .catch(() => {
        current.loading = false;
        current.exhausted = true;
        setAttempt((n) => n + 1);
      });
  }, [targetId, opts, attempt]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { highlighted };
}
