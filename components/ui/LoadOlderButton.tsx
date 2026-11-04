'use client';

import { History } from 'lucide-react';
import { useState } from 'react';
import { Spinner } from './Spinner';

/** "Carregar mensagens anteriores", no topo do chat e da conversa do console. */
export function LoadOlderButton({ onLoad }: { onLoad: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const load = async () => {
    setState('loading');
    try {
      await onLoad();
      setState('idle');
    } catch {
      setState('error');
    }
  };
  return (
    <div className="flex justify-center py-1">
      <button
        type="button"
        data-testid="load-older"
        disabled={state === 'loading'}
        onClick={() => void load()}
        className="flex h-8 items-center gap-1.5 rounded-full border border-input-border bg-paper px-3 text-label font-medium text-ink-2 hover:bg-desk disabled:opacity-70"
      >
        {state === 'loading' ? <Spinner size={13} /> : <History size={13} />}
        {state === 'error' ? 'Não foi possível carregar. Tentar de novo' : 'Carregar mensagens anteriores'}
      </button>
    </div>
  );
}
