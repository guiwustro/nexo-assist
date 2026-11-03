'use client';

import { useEffect } from 'react';

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      data-testid="toast"
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-bubble bg-ink px-4 py-2.5 text-body text-white shadow-lg"
    >
      {text}
    </div>
  );
}
