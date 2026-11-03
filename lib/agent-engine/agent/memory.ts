import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { env } from '@/lib/env';

const g = globalThis as unknown as { __nexoMemory?: { memory: Memory; store: PostgresStore } };

/** Memória do agent no Postgres (schema `mastra`): thread = conversa, resource = funcionário. */
export function getMemory(): Memory {
  if (!g.__nexoMemory) {
    const store = new PostgresStore({
      id: 'nexo-memory',
      connectionString: env.DATABASE_URL,
      schemaName: 'mastra',
      max: 5,
    });
    g.__nexoMemory = { store, memory: new Memory({ storage: store, options: { lastMessages: 20 } }) };
  }
  return g.__nexoMemory.memory;
}

/** Nota do sistema na thread do agent (ex.: "Funcionário confirmou o rascunho D-381 → INC-20517"). */
export async function noteToMemory(conversationId: string, employeeId: string, text: string): Promise<void> {
  const memory = getMemory();
  const thread = await memory.getThreadById({ threadId: conversationId });
  if (!thread) {
    await memory.createThread({ threadId: conversationId, resourceId: employeeId, title: 'Atendimento Nexo' });
  }
  await memory.saveMessages({
    messages: [
      {
        id: crypto.randomUUID(),
        threadId: conversationId,
        resourceId: employeeId,
        role: 'assistant',
        createdAt: new Date(),
        content: { format: 2, parts: [{ type: 'text', text: `[nota do sistema] ${text}` }] },
      },
    ],
  });
}

export async function closeMemory(): Promise<void> {
  const m = g.__nexoMemory;
  g.__nexoMemory = undefined;
  await m?.store.close().catch(() => {});
}
