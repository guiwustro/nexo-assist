import { ArrowRightLeft, CircleCheck, Headset, Info, TriangleAlert } from 'lucide-react';

const ICON = { transfer: ArrowRightLeft, claim: Headset, ok: CircleCheck, warning: TriangleAlert, info: Info };

export function iconFor(text: string): keyof typeof ICON {
  if (/^Transferida/.test(text)) return 'transfer';
  if (/assumiu/.test(text)) return 'claim';
  if (/criado|atualizado|reaberto/.test(text)) return 'ok';
  if (/ainda não foi criado|fora do ar|limite/.test(text)) return 'warning';
  return 'info';
}

export function SystemEvent({ text, icon }: { text: string; icon?: keyof typeof ICON }) {
  const Icon = ICON[icon ?? iconFor(text)];
  return (
    <div data-testid="system-event" className="flex items-center gap-3 text-label text-ink-3">
      <span className="h-px flex-1 bg-rule" />
      <span className="flex items-center gap-1.5">
        <Icon size={13} />
        {text}
      </span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
