'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/** Encerra a sessão (funcionário ou analista) e volta para o login. */
export function useLogout(): () => Promise<void> {
  const router = useRouter();
  return useCallback(async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  }, [router]);
}
