import { getDb } from '@/lib/db/client';
import { apiAuditLog } from '@/lib/db/schema';

export type AuditCtx = {
  request_id?: string;
  user_id?: string | null;
  method?: string;
  path?: string;
  status?: number;
  metadata?: Record<string, unknown>;
};

/** Auditoria de mutações, fire-and-forget: nunca derruba a requisição. */
export function audit(action: string, ctx: AuditCtx = {}): void {
  void getDb()
    .insert(apiAuditLog)
    .values({ action, ...ctx, user_id: ctx.user_id ?? null, metadata: ctx.metadata ?? {} })
    .catch((e: unknown) => console.warn('[audit] falhou', action, e));
}
