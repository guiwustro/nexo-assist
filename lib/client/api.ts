'use client';

import type { ApiMessage } from '@/lib/conversations/serialize';

export type CurrentData = {
  conversation: { id: string; status: 'ai_handling' | 'pending' | 'claimed' | 'closed'; focus_ticket_code: string | null };
  messages: ApiMessage[];
  next_cursor: string | null;
  session: { count: number; limit: number };
};

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiFailure(0, 'network_error', 'Sem conexão');
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null;
  if (!res.ok || !json || json.data === undefined) {
    const ra = Number(res.headers.get('retry-after'));
    throw new ApiFailure(
      res.status,
      json?.error?.code ?? `http_${res.status}`,
      json?.error?.message ?? 'Erro',
      Number.isFinite(ra) && ra > 0 ? ra : undefined,
    );
  }
  return json.data;
}

/** Erro do transport do useChat: o corpo vem como texto JSON do envelope `{ error }`. */
export function parseChatError(e: Error): { code: string; message: string } {
  try {
    const j = JSON.parse(e.message) as { error?: { code: string; message: string } };
    if (j.error) return j.error;
  } catch {
    // não é JSON
  }
  return { code: 'network_error', message: e.message };
}
