import { MessageCircle } from 'lucide-react';

export const metadata = { title: 'Console · Nexo Assist' };

export default function ConsolePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-thread text-body text-ink-3">
      <MessageCircle size={22} />
      Selecione uma conversa
    </div>
  );
}
