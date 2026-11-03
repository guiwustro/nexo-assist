import { z } from 'zod';
import { AffectedSchema, CategorySchema, PrioritySchema, TicketTypeSchema } from './enums';

export const DRAFT_KINDS = ['create', 'update', 'reopen'] as const;
export const DraftKindSchema = z.enum(DRAFT_KINDS);
export type DraftKind = z.infer<typeof DraftKindSchema>;

export const DRAFT_STATUSES = ['pending', 'confirmed', 'cancelled', 'failed'] as const;
export const DraftStatusSchema = z.enum(DRAFT_STATUSES);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const DraftPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000),
  type: TicketTypeSchema,
  category: CategorySchema,
  affected: AffectedSchema,
  blocks_work: z.boolean(),
  deadline_today: z.boolean(),
  priority: PrioritySchema,
  priority_rule: z.string().min(1),
  due_at: z.string(),
  comment: z.string().max(4000).optional(),
});
export type DraftPayload = z.infer<typeof DraftPayloadSchema>;

/** Campos que o funcionário pode editar no card; prioridade e prazo são recalculados no servidor. */
export const DraftEditSchema = DraftPayloadSchema.pick({
  title: true,
  description: true,
  type: true,
  category: true,
  affected: true,
  blocks_work: true,
  deadline_today: true,
}).partial();
export type DraftEdit = z.infer<typeof DraftEditSchema>;
