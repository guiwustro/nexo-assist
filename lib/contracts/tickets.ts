import { z } from 'zod';
import {
  AffectedSchema,
  CategorySchema,
  PrioritySchema,
  SupportLevelSchema,
  TicketStatusSchema,
  TicketTypeSchema,
} from './enums';

export const TicketCodeSchema = z.string().regex(/^(INC|REQ)-\d+$/);

export const TicketSchema = z.object({
  code: TicketCodeSchema,
  type: TicketTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  category: CategorySchema,
  subcategory: z.string().nullable().default(null),
  priority: PrioritySchema,
  affected: AffectedSchema,
  status: TicketStatusSchema,
  requester_id: z.string().uuid(),
  assignee_name: z.string().nullable(),
  due_at: z.string(),
  last_update_at: z.string(),
  resolved_at: z.string().nullable(),
  created_at: z.string(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const CreateTicketInputSchema = z.object({
  requester_id: z.string().uuid(),
  type: TicketTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(4000),
  category: CategorySchema,
  subcategory: z.string().nullable().optional(),
  priority: PrioritySchema,
  affected: AffectedSchema,
});
export type CreateTicketInput = z.infer<typeof CreateTicketInputSchema>;

export const UpdateTicketInputSchema = z.object({
  requester_id: z.string().uuid(),
  comment: z.string().min(1).max(4000),
  status: TicketStatusSchema.optional(),
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketInputSchema>;

export const ReopenTicketInputSchema = z.object({
  requester_id: z.string().uuid(),
  comment: z.string().max(4000).optional(),
});
export type ReopenTicketInput = z.infer<typeof ReopenTicketInputSchema>;

export const TransferInputSchema = z.object({
  requester_id: z.string().uuid(),
  level: SupportLevelSchema,
  summary: z.string().min(1).max(4000),
});
export type TransferInput = z.infer<typeof TransferInputSchema>;
