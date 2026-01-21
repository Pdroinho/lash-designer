import dotenv from 'dotenv'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'

dotenv.config()

const insecureSecrets = new Set(['change-me-in-production-please', 'coloque-uma-senha-secreta-e-longa-aqui-123'])

function createEphemeralSecret() {
  return randomBytes(32).toString('hex')
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .optional()
    .transform((v) => {
      const raw = (v ?? '').trim()
      return raw ? Number(raw) : 3000
    })
    .pipe(z.number().int().positive()),
  DATABASE_PATH: z.string().default(
    process.env.NODE_ENV === 'production' 
      ? '../db_data/app.db' 
      : './data/app.db'
  ),
  JWT_SECRET: z.string().min(16).optional(),
  APPMAX_WEBHOOK_SECRET: z.string().min(16).optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().min(16).optional(),
  FRONTEND_ORIGIN: z.string().optional(),
  DEV_HOST: z.string().optional(),
})

type EnvParsed = z.infer<typeof envSchema>
export type Env = Omit<EnvParsed, 'JWT_SECRET'> & { JWT_SECRET: string }

export const env: Env = (() => {
  const parsed = envSchema.parse(process.env)

  const candidate = parsed.JWT_SECRET ?? process.env.SESSION_SECRET
  const normalized = typeof candidate === 'string' ? candidate.trim() : ''

  const jwtSecret = (() => {
    if (normalized && normalized.length >= 16 && !insecureSecrets.has(normalized)) return normalized

    if (parsed.NODE_ENV === 'production') {
      console.warn(
        '[Startup] JWT_SECRET ausente/inseguro em produção; usando segredo efêmero. Defina JWT_SECRET para persistir sessões.',
      )
      return createEphemeralSecret()
    }

    return 'dev-secret-change-me-please'
  })()

  return { ...parsed, JWT_SECRET: jwtSecret }
})()
