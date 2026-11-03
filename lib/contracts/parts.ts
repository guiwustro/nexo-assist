import { z } from 'zod';
import { DraftKindSchema, DraftPayloadSchema, DraftStatusSchema } from './drafts';
import { ReasonCodeSchema, SupportLevelSchema } from './enums';
import { TicketSchema } from './tickets';

export const TicketCardPartSchema = z.object({
  kind: z.literal('ticket_card'),
  ticket: TicketSchema,
  overdue: z.boolean(),
  overdue_label: z.string().optional(),
});

export const TicketSelectorPartSchema = z.object({
  kind: z.literal('ticket_selector'),
  tickets: z.array(TicketSchema.pick({ code: true, title: true, status: true, last_update_at: true })),
});

export const DraftCardPartSchema = z.object({
  kind: z.literal('draft_card'),
  draft_id: z.string().uuid(),
  code: z.string(),
  draft_kind: DraftKindSchema,
  target_code: z.string().nullable().optional(),
  status: DraftStatusSchema,
  payload: DraftPayloadSchema,
  result_ticket_code: z.string().nullable().optional(),
});

export const QuickRepliesPartSchema = z.object({
  kind: z.literal('quick_replies'),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(4),
});

export const HandoffNoticePartSchema = z.object({
  kind: z.literal('handoff_notice'),
  reason_code: ReasonCodeSchema,
  level: SupportLevelSchema,
});

export const MessagePartSchema = z.discriminatedUnion('kind', [
  TicketCardPartSchema,
  TicketSelectorPartSchema,
  DraftCardPartSchema,
  QuickRepliesPartSchema,
  HandoffNoticePartSchema,
]);
export type MessagePart = z.infer<typeof MessagePartSchema>;
export type TicketCardPart = z.infer<typeof TicketCardPartSchema>;
export type TicketSelectorPart = z.infer<typeof TicketSelectorPartSchema>;
export type DraftCardPart = z.infer<typeof DraftCardPartSchema>;
export type QuickRepliesPart = z.infer<typeof QuickRepliesPartSchema>;
