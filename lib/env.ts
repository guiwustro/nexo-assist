import { z } from 'zod';

const optionalNumber = z.preprocess(
  (v) => (v === '' || v === undefined ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    DATABASE_URL_TEST: z.string().min(1).optional(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de pelo menos 32 caracteres'),
    TICKETS_URL: z.string().url().default('http://localhost:4001'),
    TICKETS_INTERNAL_SECRET: z.string().min(8),
    LLM_PROVIDER: z.enum(['deepseek', 'scripted']).default('scripted'),
    MODEL_ID: z.string().min(1).default('deepseek-flash'),
    DEEPSEEK_API_KEY: z.string().min(1).optional(),
    LOW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),
    SESSION_MESSAGE_LIMIT: z.coerce.number().int().positive().default(30),
    LLM_PRICE_IN_CENTS_PER_MTOK: optionalNumber,
    LLM_PRICE_OUT_CENTS_PER_MTOK: optionalNumber,
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    LLM_DAILY_BUDGET_CENTS: optionalNumber,
    E2E: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    NOW_OVERRIDE: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === 'deepseek' && !env.DEEPSEEK_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEEPSEEK_API_KEY'],
        message: 'DEEPSEEK_API_KEY é obrigatória quando LLM_PROVIDER=deepseek',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const limpo = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = EnvSchema.safeParse(limpo);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Variáveis de ambiente inválidas — ${detail}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

/** Env validado, avaliado só no primeiro acesso (não quebra o `next build`). */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    cached ??= parseEnv(process.env);
    return cached[prop as keyof Env];
  },
});

/** Só para testes que mudam process.env entre casos. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** "Agora" do servidor; em E2E pode ser fixado por NOW_OVERRIDE. */
export function serverNow(): Date {
  if (env.E2E && env.NOW_OVERRIDE) return new Date(env.NOW_OVERRIDE);
  return new Date();
}
