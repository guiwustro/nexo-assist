import { z } from 'zod';

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiOk<T> = { data: T; meta?: Record<string, unknown> };
export type ApiFail = { error: ApiError };
