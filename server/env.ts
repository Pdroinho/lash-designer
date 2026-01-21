import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 3000))
    .pipe(z.number().int().positive()),
  DATABASE_PATH: z.string().default(
    process.env.NODE_ENV === 'production' 
      ? '../db_data/app.db' 
      : './data/app.db'
  ),
  JWT_SECRET: z.string().min(16).default('change-me-in-production-please'),
  APPMAX_WEBHOOK_SECRET: z.string().min(16).optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().min(16).optional(),
  FRONTEND_ORIGIN: z.string().optional(),
  DEV_HOST: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export const env: Env = (() => {
  const parsed = envSchema.parse(process.env)
  if (parsed.NODE_ENV === 'production' && parsed.JWT_SECRET === 'change-me-in-production-please') {
    throw new Error('JWT_SECRET inseguro em produção')
  }
  return parsed
})()
