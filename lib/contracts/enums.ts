import { z } from 'zod';

export const TICKET_TYPES = ['incident', 'request'] as const;
export const TicketTypeSchema = z.enum(TICKET_TYPES);
export type TicketType = z.infer<typeof TicketTypeSchema>;

export const CATEGORIES = ['access', 'network_vpn', 'hardware', 'software', 'email', 'other'] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const PrioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof PrioritySchema>;

export const AFFECTED = ['me', 'team', 'company'] as const;
export const AffectedSchema = z.enum(AFFECTED);
export type Affected = z.infer<typeof AffectedSchema>;

export const TICKET_STATUSES = ['open', 'in_progress', 'awaiting_analyst', 'approved', 'resolved', 'closed'] as const;
export const TicketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const CONVERSATION_STATUSES = ['ai_handling', 'pending', 'claimed', 'closed'] as const;
export const ConversationStatusSchema = z.enum(CONVERSATION_STATUSES);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export const REASON_CODES = [
  'requested_human',
  'critical_priority',
  'overdue_ticket',
  'low_confidence',
  'session_limit',
  'budget_exceeded',
] as const;
export const ReasonCodeSchema = z.enum(REASON_CODES);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const SUPPORT_LEVELS = ['N1', 'N2'] as const;
export const SupportLevelSchema = z.enum(SUPPORT_LEVELS);
export type SupportLevel = z.infer<typeof SupportLevelSchema>;

export const TYPE_LABEL: Record<TicketType, string> = { incident: 'Incidente', request: 'Solicitação' };
export const TYPE_PREFIX: Record<TicketType, 'INC' | 'REQ'> = { incident: 'INC', request: 'REQ' };

export const CATEGORY_LABEL: Record<Category, string> = {
  access: 'Acesso',
  network_vpn: 'Rede e VPN',
  hardware: 'Hardware',
  software: 'Software',
  email: 'E-mail',
  other: 'Outros',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  awaiting_analyst: 'Aguardando analista',
  approved: 'Aprovado',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};

export const AFFECTED_LABEL: Record<Affected, string> = {
  me: 'Somente você',
  team: 'Sua equipe',
  company: 'Toda a empresa',
};

export const REASON_LABEL: Record<ReasonCode, string> = {
  requested_human: 'pedido do funcionário',
  critical_priority: 'prioridade crítica',
  overdue_ticket: 'chamado vencido',
  low_confidence: 'baixa confiança do agent',
  session_limit: 'limite da sessão',
  budget_exceeded: 'limite de uso do assistente',
};

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'muted';

export const STATUS_TONE: Record<TicketStatus, Tone> = {
  awaiting_analyst: 'warning',
  in_progress: 'primary',
  open: 'primary',
  approved: 'success',
  resolved: 'success',
  closed: 'muted',
};

export const PRIORITY_TONE: Record<Priority, Tone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'neutral',
  low: 'muted',
};
