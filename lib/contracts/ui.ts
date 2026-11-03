import type { UIMessage } from 'ai';
import type { ActionTrace } from './decision';
import type { MessagePart } from './parts';

/** Partes customizadas do stream do chat (AI SDK UI). */
export type NexoDataParts = {
  action: ActionTrace;
  card: MessagePart;
  run: { run_id: string; decision_ready?: boolean };
  system: { text: string; kind: 'paused' | 'transferred' | 'limit' | 'guardrail' | 'budget' | 'error' };
  message: { id: string; conversation_status: string; session_count: number; session_limit: number };
};

export type NexoUIMessage = UIMessage<never, NexoDataParts>;
