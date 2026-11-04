import { fail, ok } from '@/lib/api/wrappers';
import { resetTicketsClient } from '@/lib/agent-engine/edge/tickets/client';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Só em E2E: zera o estado em memória do processo (disjuntor, limites) entre testes. */
export async function POST(): Promise<Response> {
  if (!env.E2E) return fail('not_found', 'Rota inexistente', 404);
  resetTicketsClient();
  const g = globalThis as unknown as { __nexoResetHooks?: Array<() => void> };
  for (const h of g.__nexoResetHooks ?? []) h();
  return ok({ reset: true });
}
