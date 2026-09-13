import dotenv from 'dotenv'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { z } from 'zod'

dotenv.config()

const _insecureSecrets = new Set([
  'change-me-in-production-please',
  'coloque-uma-senha-secreta-e-longa-aqui-123',
  'troque-por-um-segredo-longo-e-aleatorio',
])


const isPublicHostname = (raw: string) => {
  const value = raw.trim().toLowerCase().replace(/\.$/, '')
  const ascii = domainToASCII(value)
  if (!ascii || ascii.length > 253 || isIP(ascii)) return false
  const labels = ascii.split('.')
  return labels.length >= 2 && labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
}

const splitCsv = (raw?: string) => (raw ?? '').split(',').map((value) => value.trim()).filter(Boolean)

const envBoolean = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value.trim() === '') return defaultValue
      const normalized = value.trim().toLowerCase()
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Booleano inválido: ${value}` })
      return z.NEVER
    })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .optional()
    .transform((value) => {
      const raw = (value ?? '').trim()
      return raw ? Number(raw) : 3000
    })
    .pipe(z.number().int().positive().max(65535)),
  DATABASE_PATH: z.string().default(process.env.NODE_ENV === 'production' ? '../db_data/app.db' : './data/app.db'),
  WHATSAPP_MEDIA_DIR: z.string().default(process.env.NODE_ENV === 'production' ? '../media' : './data/whatsapp-media'),
  APP_ENCRYPTION_KEY: z.string().optional(),
  INFINITEPAY_HANDLE: z.string().min(2).optional(),
  INFINITEPAY_BASE_URL: z.string().url().default('https://api.checkout.infinitepay.io'),
  APP_BASE_URL: z.string().url().optional(),
  SUBSCRIPTION_PRICE_CENTS: z.coerce.number().int().positive().default(59880),
  PLAN_MONTHLY_CENTS: z.coerce.number().int().positive().default(5990),
  PLAN_QUARTERLY_CENTS: z.coerce.number().int().positive().default(16990),
  PLAN_SEMIANNUAL_CENTS: z.coerce.number().int().positive().default(32990),
  PLAN_ANNUAL_CENTS: z.coerce.number().int().positive().default(59880),
  OPENROUTER_API_KEY: z.string().min(20).optional(),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().min(2).default('deepseek/deepseek-v4-flash-0731'),
  OPENROUTER_SETUP_MODEL: z.string().min(2).default('google/gemini-3.1-flash-lite'),
  OPENROUTER_VISION_MODEL: z.string().min(2).default('google/gemini-3.1-flash-lite'),
  OPENROUTER_BATCH_MODEL: z.string().min(2).default('deepseek/deepseek-v4-flash-0731'),
  // Legacy aliases kept for installations upgrading from an OpenAI-compatible setup.
  OPENAI_API_KEY: z.string().min(20).optional(),
  AI_API_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().min(2).default('gpt-5.4-nano'),
  OPENAI_VISION_MODEL: z.string().min(2).optional(),
  AI_ASSISTANT_ENABLED: envBoolean(false),
  LUMA_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(500).default(40),
  LUMA_MONTHLY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(5000).default(500),
  LUMA_DAILY_COST_CAP_USD: z.coerce.number().positive().max(10).default(0.10),
  LUMA_MONTHLY_COST_CAP_USD: z.coerce.number().positive().max(50).default(0.75),
  LUMA_MAX_REQUEST_COST_USD: z.coerce.number().positive().max(1).default(0.01),
  LUMA_MAX_AGENT_STEPS: z.coerce.number().int().min(1).max(5).default(3),
  LUMA_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(4096).default(700),
  LUMA_MAX_IMAGE_BYTES: z.coerce.number().int().min(64_000).max(5_000_000).default(1_048_576),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().min(16).optional(),
  EVOLUTION_INSTANCE_NAME: z.string().min(2).max(80).default('lashdesigner-global'),
  EVOLUTION_WEBHOOK_SECRET: z.string().min(16).optional(),
  FRONTEND_ORIGIN: z.string().url().optional(),
  DEV_HOST: z.string().optional(),
  VITE_DEV_HOST: z.string().optional(),
  VITE_APP_BASE_URL: z.string().url().optional(),
  VITE_SALES_URL: z.string().url().optional(),
  VITE_SUPPORT_URL: z.string().url().optional(),
  VITE_PRIVACY_URL: z.string().url().optional(),
  VITE_TERMS_URL: z.string().url().optional(),
  VITE_SUBSCRIPTION_PRICE_CENTS: z.coerce.number().int().positive().optional(),
  LEGAL_PROVIDER_NAME: z.string().trim().min(2).max(160).optional(),
  LEGAL_PROVIDER_TAX_ID: z.string().trim().min(5).max(40).optional(),
  LEGAL_PROVIDER_ADDRESS: z.string().trim().min(8).max(300).optional(),
  LEGAL_CONTACT_EMAIL: z.string().email().optional(),
  PRIVACY_CONTACT_EMAIL: z.string().email().optional(),
  WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED: envBoolean(false),
  WHATSAPP_CAMPAIGN_MAX_RECIPIENTS: z.coerce.number().int().min(1).max(500).default(50),
  WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS: z.coerce.number().int().min(8).max(300).default(15),
  CUSTOM_DOMAIN_CNAME_TARGET: z.string().optional(),
  CUSTOM_DOMAIN_IPV4: z.string().optional(),
  CUSTOM_DOMAIN_IPV6: z.string().optional(),
  DOMAIN_AUTH_SECRET: z.string().min(24).optional(),
  DEV_BOOTSTRAP_SECRET: z.string().min(24).optional(),
  DOMAIN_VERIFY_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(10),
  DOMAIN_ACTIVE_REVERIFY_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

type EnvParsed = z.infer<typeof envSchema>
export type Env = Omit<EnvParsed, 'APP_ENCRYPTION_KEY'> & { APP_ENCRYPTION_KEY: string }

export const env: Env = (() => {
  const parsed = envSchema.parse(process.env)
  const encryptionKeyCandidate = (parsed.APP_ENCRYPTION_KEY ?? '').trim()
  const encryptionKey = (() => {
    if (/^[A-Za-z0-9_-]{43,}$/.test(encryptionKeyCandidate) && Buffer.from(encryptionKeyCandidate, 'base64url').length >= 32) {
      return encryptionKeyCandidate
    }
    if (parsed.NODE_ENV === 'production') {
      throw new Error('APP_ENCRYPTION_KEY deve ser uma chave base64url aleatória de pelo menos 32 bytes.')
    }
    return 'ZGV2LWVuY3J5cHRpb24ta2V5LWNoYW5nZS1tZS1ub3c'
  })()

  if (parsed.NODE_ENV === 'production') {
    const missing: string[] = []
    if (!parsed.APP_BASE_URL) missing.push('APP_BASE_URL')
    if (!parsed.FRONTEND_ORIGIN) missing.push('FRONTEND_ORIGIN')
    if (!parsed.DEV_HOST) missing.push('DEV_HOST')
    if (!parsed.VITE_DEV_HOST) missing.push('VITE_DEV_HOST')
    if (!parsed.VITE_APP_BASE_URL) missing.push('VITE_APP_BASE_URL')
    if (!parsed.VITE_SUBSCRIPTION_PRICE_CENTS) missing.push('VITE_SUBSCRIPTION_PRICE_CENTS')
    if (parsed.VITE_SUBSCRIPTION_PRICE_CENTS && parsed.VITE_SUBSCRIPTION_PRICE_CENTS !== parsed.SUBSCRIPTION_PRICE_CENTS) {
      throw new Error('VITE_SUBSCRIPTION_PRICE_CENTS deve ser igual a SUBSCRIPTION_PRICE_CENTS.')
    }
    if (parsed.PLAN_ANNUAL_CENTS !== parsed.SUBSCRIPTION_PRICE_CENTS) {
      throw new Error('PLAN_ANNUAL_CENTS deve ser igual a SUBSCRIPTION_PRICE_CENTS e ao preço anual exibido no frontend.')
    }
    if (parsed.DEV_HOST && parsed.VITE_DEV_HOST && parsed.DEV_HOST.toLowerCase() !== parsed.VITE_DEV_HOST.toLowerCase()) {
      throw new Error('DEV_HOST e VITE_DEV_HOST devem ter o mesmo hostname.')
    }
    const productionUrls = [
      ['APP_BASE_URL', parsed.APP_BASE_URL],
      ['VITE_APP_BASE_URL', parsed.VITE_APP_BASE_URL],
      ['FRONTEND_ORIGIN', parsed.FRONTEND_ORIGIN],
    ] as const
    for (const [name, raw] of productionUrls) {
      if (!raw) continue
      const url = new URL(raw)
      if (url.protocol !== 'https:') throw new Error(`${name} deve usar HTTPS em produção.`)
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
        throw new Error(`${name} deve conter somente a origem pública, sem caminho, credenciais, consulta ou fragmento.`)
      }
    }
    if (new URL(parsed.AI_API_BASE_URL).protocol !== 'https:') throw new Error('AI_API_BASE_URL deve usar HTTPS em produção.')
    if (new URL(parsed.OPENROUTER_BASE_URL).protocol !== 'https:') throw new Error('OPENROUTER_BASE_URL deve usar HTTPS em produção.')
    if (parsed.VITE_SALES_URL) {
      const salesUrl = new URL(parsed.VITE_SALES_URL)
      if (salesUrl.protocol !== 'https:') throw new Error('VITE_SALES_URL deve usar HTTPS em produção.')
      if (salesUrl.username || salesUrl.password) throw new Error('VITE_SALES_URL não pode conter credenciais.')
    }
    if (Boolean(parsed.EVOLUTION_API_URL) !== Boolean(parsed.EVOLUTION_API_KEY)) {
      throw new Error('EVOLUTION_API_URL e EVOLUTION_API_KEY devem ser configurados juntos quando usados como bootstrap do MFA.')
    }
    if (parsed.EVOLUTION_API_URL) {
      const evolutionUrl = new URL(parsed.EVOLUTION_API_URL)
      if (evolutionUrl.protocol !== 'https:') throw new Error('EVOLUTION_API_URL deve usar HTTPS em produção.')
      if (evolutionUrl.username || evolutionUrl.password || evolutionUrl.search || evolutionUrl.hash || evolutionUrl.pathname !== '/') {
        throw new Error('EVOLUTION_API_URL deve conter somente a origem HTTPS, sem caminho, credenciais, consulta ou fragmento.')
      }
    }
    if (parsed.APP_BASE_URL && parsed.VITE_APP_BASE_URL && parsed.FRONTEND_ORIGIN) {
      const serverOrigin = new URL(parsed.APP_BASE_URL).origin.toLowerCase()
      const clientOrigin = new URL(parsed.VITE_APP_BASE_URL).origin.toLowerCase()
      const corsOrigin = new URL(parsed.FRONTEND_ORIGIN).origin.toLowerCase()
      if (serverOrigin !== clientOrigin || serverOrigin !== corsOrigin) {
        throw new Error('APP_BASE_URL, VITE_APP_BASE_URL e FRONTEND_ORIGIN devem apontar para a mesma origem.')
      }
    }
    for (const [name, host] of [
      ['DEV_HOST', parsed.DEV_HOST],
      ['VITE_DEV_HOST', parsed.VITE_DEV_HOST],
      ['CUSTOM_DOMAIN_CNAME_TARGET', parsed.CUSTOM_DOMAIN_CNAME_TARGET],
    ] as const) {
      if (host && (host.includes('://') || host.includes('/') || host.includes(':') || !isPublicHostname(host))) {
        throw new Error(`${name} deve conter somente um hostname público válido, sem protocolo, porta ou caminho.`)
      }
    }
    for (const address of splitCsv(parsed.CUSTOM_DOMAIN_IPV4)) {
      if (isIP(address) !== 4) throw new Error(`CUSTOM_DOMAIN_IPV4 contém endereço inválido: ${address}`)
    }
    for (const address of splitCsv(parsed.CUSTOM_DOMAIN_IPV6)) {
      if (isIP(address) !== 6) throw new Error(`CUSTOM_DOMAIN_IPV6 contém endereço inválido: ${address}`)
    }
    if (!parsed.INFINITEPAY_HANDLE) missing.push('INFINITEPAY_HANDLE')
    if (!parsed.LEGAL_PROVIDER_NAME) missing.push('LEGAL_PROVIDER_NAME')
    if (!parsed.LEGAL_PROVIDER_TAX_ID) missing.push('LEGAL_PROVIDER_TAX_ID')
    if (!parsed.LEGAL_PROVIDER_ADDRESS) missing.push('LEGAL_PROVIDER_ADDRESS')
    if (!parsed.LEGAL_CONTACT_EMAIL) missing.push('LEGAL_CONTACT_EMAIL')
    if (!parsed.PRIVACY_CONTACT_EMAIL) missing.push('PRIVACY_CONTACT_EMAIL')
    if (!parsed.DOMAIN_AUTH_SECRET) missing.push('DOMAIN_AUTH_SECRET')
    else if (!/^[A-Za-z0-9_-]+$/.test(parsed.DOMAIN_AUTH_SECRET)) {
      throw new Error('DOMAIN_AUTH_SECRET deve usar somente letras, números, hífen e sublinhado.')
    }
    if (!parsed.DEV_BOOTSTRAP_SECRET) missing.push('DEV_BOOTSTRAP_SECRET')
    if (!parsed.CUSTOM_DOMAIN_CNAME_TARGET && !parsed.CUSTOM_DOMAIN_IPV4 && !parsed.CUSTOM_DOMAIN_IPV6) {
      missing.push('CUSTOM_DOMAIN_CNAME_TARGET ou CUSTOM_DOMAIN_IPV4/CUSTOM_DOMAIN_IPV6')
    }
    if (missing.length) throw new Error(`Variáveis obrigatórias ausentes em produção: ${missing.join(', ')}`)
  }


  if (parsed.AI_ASSISTANT_ENABLED && !parsed.OPENROUTER_API_KEY && !parsed.OPENAI_API_KEY) {
    throw new Error('OPENROUTER_API_KEY é obrigatória quando AI_ASSISTANT_ENABLED=true.')
  }

  return { ...parsed, APP_ENCRYPTION_KEY: encryptionKey }
})()
