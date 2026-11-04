'use client';

import { RotateCcwKey } from 'lucide-react';
import { useState } from 'react';

export function ResetPasswordButton() {
  const [notice, setNotice] = useState(false);
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setNotice(true)}
        className="flex h-9 items-center gap-[7px] rounded-btn border border-input-border pr-3.5 pl-3 text-body font-medium text-ink-2 hover:bg-desk"
      >
        <RotateCcwKey size={15} />
        Redefinir senha
      </button>
      {notice && <span className="text-label text-ink-3">Simulado nesta demo</span>}
    </span>
  );
}
