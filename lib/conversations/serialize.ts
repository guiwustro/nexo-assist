import type { Conversation, Message } from './service';

export type ApiMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'system';
  sent_via: 'user' | 'ai' | 'system';
  sent_by_user_id: string | null;
  sender_name: string | null;
  body: string;
  parts: Message['parts'];
  agent_run_id: string | null;
  created_at: string;
};

export function toApiMessage(m: Message, senderName: string | null = null): ApiMessage {
  return {
    id: m.id,
    direction: m.direction as ApiMessage['direction'],
    type: m.type as ApiMessage['type'],
    sent_via: m.sent_via as ApiMessage['sent_via'],
    sent_by_user_id: m.sent_by_user_id,
    sender_name: senderName,
    body: m.body,
    parts: m.parts,
    agent_run_id: m.agent_run_id,
    created_at: m.created_at.toISOString(),
  };
}

export function toApiConversation(c: Conversation) {
  return {
    id: c.id,
    employee_id: c.employee_id,
    status: c.status as 'ai_handling' | 'pending' | 'claimed' | 'closed',
    assigned_to_user_id: c.assigned_to_user_id,
    focus_ticket_code: c.focus_ticket_code,
    last_message_at: c.last_message_at?.toISOString() ?? null,
    session_message_count: c.session_message_count,
  };
}
