import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { sessionMiddleware, requireAuth, requireRole, requireActiveSubscription } from './auth.js'
import { nextAnnualPeriodEnd } from './billing.js'
import { buildBillingPlans, nextBillingPeriodEnd, type BillingCycle } from './plans.js'
import {
  DEFAULT_INVITEE_DISCOUNT_PERCENT,
  DEFAULT_REFERRER_REWARD_PERCENT,
  discountQuote,
  highValueLinkPolicy,
  renewalRewardPercent,
} from './referrals.js'
import { ASSISTANT_DAILY_LIMIT, ASSISTANT_MAX_IMAGE_BYTES, ASSISTANT_MAX_INPUT_CHARS, ASSISTANT_MONTHLY_LIMIT, assistantProvider, generateAssistantAnswer, generateBrandSetupSuggestions } from './assistant.js'
import { confirmLumaAction } from './lumaBridge.js'
import { closeDb, getDb } from './db.js'
import { dayBoundsUtc, getZonedDateTimeParts, monthBoundsUtc, parseYmd, shiftYearMonth, utcForLocalTime } from './dateTime.js'
import { financeExpenseCategories, financeMonthSnapshot, financeRecentMonths, tenantFinanceTimeZone } from './finance.js'
import {
  assertDomainIsNotReserved,
  domainVerificationRecord,
  domainVerificationValue,
  normalizeCustomDomain,
  verifyCustomDomain,
  type DomainVerificationConfig,
} from './domains.js'
import { env } from './env.js'
import { normalizeBrazilPhone } from './phone.js'
import { resolveExternalHttpsBaseUrl } from './externalUrl.js'
import { badRequest, forbidden, handleError, notFound, unauthorized } from './http.js'
import { migrate } from './migrate.js'
import { hashPassword, verifyPassword } from './security.js'
import { decryptSecret, encryptSecret, isEncryptedSecret, secretHmac } from './secretCrypto.js'
import { createSession, revokeSession, revokeSessionsForTenant, revokeSessionsForUser } from './session.js'
import {
  createTrustedDevice,
  TRUSTED_DEVICE_TTL_MS,
  createWhatsappOtpChallenge,
  listSecurityState,
  logSecurityEvent,
  refreshWhatsappOtpChallenge,
  resolveAuthChallenge,
  resolveTrustedDevice,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
  verifyAndConsumeWhatsappOtpChallenge,
} from './mfa.js'
import { renderClientIndexHtml } from './seo.js'
import { confirmationReplyIntent, marketingWhatsappOptOutIntent } from './whatsappIntent.js'
import { campaignMessageWithOptOut, renderMarketingCampaignMessage } from './marketingCampaign.js'
import { normalizeWhatsappMediaPayload, resolvePrivateWhatsappMediaPath, safeWhatsappMediaRelativePath } from './whatsappMedia.js'
import { extractEvolutionConnectionState, extractEvolutionMessageUpdates, nextWhatsappDeliveryStatus, normalizeEvolutionConnectionState } from './whatsappWebhook.js'
import { LEGAL_BUNDLE_VERSION, PLATFORM_MARKETING_WHATSAPP_TEXT, PLATFORM_MARKETING_WHATSAPP_VERSION, PRIVACY_VERSION, TERMS_VERSION, currentLegalBundleHash, legalAcceptanceSnapshot, legalEvidenceFingerprint, legalPublicConfig } from './legal.js'

process.on('uncaughtException', (err) => {
  console.error('[Fatal] uncaughtException', err)
  process.exit(1)
})

process.on('unhandledRejection', (err) => {
  console.error('[Fatal] unhandledRejection', err)
  process.exit(1)
})

console.log(`[Startup] NODE_ENV: ${env.NODE_ENV}`)
console.log(`[Startup] PORT: ${env.PORT}`)
console.log('[Startup] Database configured')

const OFFICIAL_BILLING_PRICES = {
  MONTHLY: 5_990,
  QUARTERLY: 16_990,
  SEMIANNUAL: 32_990,
  ANNUAL: 59_880,
} as const
const FIRST_MONTH_PROMO_CENTS = 3_990

// Pricing is product policy, not an environment-specific secret. Keeping the
// official catalog here prevents stale production .env values from silently
// restoring legacy prices after a deploy.
const billingPlans = buildBillingPlans(OFFICIAL_BILLING_PRICES)
const billingPlanByCycle = new Map(billingPlans.map((plan) => [plan.cycle, plan]))

migrate()
const db = getDb()
const appVersion = (() => {
  try {
    const manifest = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version.trim() : 'unknown'
  } catch {
    return 'unknown'
  }
})()
const evolutionPlatformSecretPurpose = 'evolution:platform:api-key'
const evolutionTenantSecretPurpose = (tenantId: string) => `evolution:tenant:${tenantId}:api-key`

function storedSecretPlaintext(value: string | null | undefined, purpose: string) {
  if (!value) return null
  return isEncryptedSecret(value) ? decryptSecret(value, purpose) : value
}

function migrateEvolutionSecretsAtRest() {
  const tx = db.transaction(() => {
    const platform = db.prepare(`SELECT value FROM platform_settings WHERE key = 'evolution_api_key' LIMIT 1`).get() as { value: string } | undefined
    if (platform?.value && !isEncryptedSecret(platform.value)) {
      db.prepare(`UPDATE platform_settings SET value = ?, encrypted = 1, updated_at = ? WHERE key = 'evolution_api_key'`)
        .run(encryptSecret(platform.value, evolutionPlatformSecretPurpose), new Date().toISOString())
    }

    const tenantRows = db.prepare(`SELECT id, tenant_id as tenantId, api_key as apiKey FROM whatsapp_instances WHERE api_key IS NOT NULL AND api_key <> ''`).all() as Array<{ id: string; tenantId: string; apiKey: string }>
    const update = db.prepare(`UPDATE whatsapp_instances SET api_key = ?, updated_at = ? WHERE id = ?`)
    for (const row of tenantRows) {
      if (isEncryptedSecret(row.apiKey)) {
        // Fail startup on a wrong/missing root key instead of silently replacing a valid secret.
        decryptSecret(row.apiKey, evolutionTenantSecretPurpose(row.tenantId))
        continue
      }
      update.run(encryptSecret(row.apiKey, evolutionTenantSecretPurpose(row.tenantId)), new Date().toISOString(), row.id)
    }

    const encryptedPlatform = db.prepare(`SELECT value FROM platform_settings WHERE key = 'evolution_api_key' LIMIT 1`).get() as { value: string } | undefined
    if (encryptedPlatform?.value) {
      decryptSecret(encryptedPlatform.value, evolutionPlatformSecretPurpose)
      db.prepare(`UPDATE platform_settings SET encrypted = 1 WHERE key = 'evolution_api_key'`).run()
    }
  })
  tx()
}

migrateEvolutionSecretsAtRest()

const platformEvolutionDefaultInstanceName = env.EVOLUTION_INSTANCE_NAME || 'lashdesigner-global'

function platformEvolutionConfig() {
  const rows = db
    .prepare(`SELECT key, value FROM platform_settings WHERE key IN ('evolution_api_url', 'evolution_api_key', 'evolution_instance_name')`)
    .all() as Array<{ key: string; value: string }>
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, string>
  return {
    baseUrl: values.evolution_api_url || env.EVOLUTION_API_URL || null,
    apiKey: storedSecretPlaintext(values.evolution_api_key, evolutionPlatformSecretPurpose) || env.EVOLUTION_API_KEY || null,
    instanceName: (values.evolution_instance_name || env.EVOLUTION_INSTANCE_NAME || platformEvolutionDefaultInstanceName).trim() || platformEvolutionDefaultInstanceName,
  }
}

function normalizeUserE164Phone(raw: string) {
  const phone = normalizeBrazilPhone(raw)
  if (!phone) throw badRequest('WhatsApp inválido. Use um número brasileiro com DDD.', 'INVALID_PHONE')
  return `+${phone}`
}

function maskE164Phone(raw: string) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length < 6) return 'WhatsApp cadastrado'
  const country = digits.slice(0, 2)
  const ddd = digits.slice(2, 4)
  const last = digits.slice(-4)
  return `+${country} ${ddd} *****-${last}`
}

async function sendPlatformWhatsappText(phone: string, text: string) {
  const config = platformEvolutionConfig()
  if (!config.baseUrl || !config.apiKey || !config.instanceName) return false
  const normalized = normalizeBrazilPhone(phone)
  if (!normalized) return false
  const response = await fetch(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/message/sendText/${encodeURIComponent(config.instanceName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ number: normalized, text, textMessage: text }),
  }).catch(() => null)
  return Boolean(response?.ok)
}

const subscriptionCheckoutQuote = (plan: (typeof billingPlans)[number], discountPercent: number, firstPurchase: boolean) => {
  const regular = discountQuote(plan.amountCents, discountPercent)
  if (firstPurchase && plan.cycle === 'MONTHLY' && FIRST_MONTH_PROMO_CENTS < regular.amountCents) {
    return {
      grossAmountCents: plan.amountCents,
      discountPercent: Math.round(((plan.amountCents - FIRST_MONTH_PROMO_CENTS) / plan.amountCents) * 100),
      discountAmountCents: plan.amountCents - FIRST_MONTH_PROMO_CENTS,
      amountCents: FIRST_MONTH_PROMO_CENTS,
      promoApplied: true,
    }
  }
  return { ...regular, promoApplied: false }
}

const hasPaidSubscriptionPurchase = (tenantId: string) => Boolean(db.prepare(`
  SELECT 1 FROM infinitepay_orders
  WHERE tenant_id = ? AND status = 'PAID' AND billing_cycle IN ('MONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL')
  LIMIT 1
`).get(tenantId))

const referralToken = () => randomBytes(24).toString('base64url')

const publicReferralUrl = (token: string) => {
  const base = env.APP_BASE_URL || env.FRONTEND_ORIGIN
  if (!base) return `/?ref=${encodeURIComponent(token)}`
  const url = new URL(base)
  url.pathname = '/'
  url.search = `?ref=${encodeURIComponent(token)}`
  url.hash = ''
  return url.toString()
}

const createInfinitePayLink = async (input: {
  orderNsu: string
  amountCents: number
  customerName: string
  customerEmail: string
  planLabel: string
  months: number
  redirectUrl: string
  itemDescription?: string
}) => {
  if (!env.INFINITEPAY_HANDLE || !env.APP_BASE_URL) {
    throw badRequest('Configure INFINITEPAY_HANDLE e APP_BASE_URL no .env', 'PAYMENT_NOT_CONFIGURED')
  }
  const response = await fetch(`${env.INFINITEPAY_BASE_URL}/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      handle: env.INFINITEPAY_HANDLE,
      redirect_url: input.redirectUrl,
      webhook_url: `${env.APP_BASE_URL.replace(/\/$/, '')}/api/webhooks/infinitepay`,
      order_nsu: input.orderNsu,
      customer: { name: input.customerName, email: input.customerEmail },
      items: [{
        quantity: 1,
        price: input.amountCents,
        description: input.itemDescription || `Lash Designer Pro — plano ${input.planLabel.toLowerCase()} (${input.months} ${input.months === 1 ? 'mês' : 'meses'})`,
      }],
    }),
  })
  const payload = await response.json().catch(() => null) as { url?: string; message?: string } | null
  if (!response.ok || !payload?.url) throw badRequest(payload?.message || 'Não foi possível gerar o checkout', 'CHECKOUT_FAILED')
  try {
    const checkoutUrl = new URL(payload.url)
    if (checkoutUrl.protocol !== 'https:') throw new Error('Checkout sem HTTPS')
    return checkoutUrl.toString()
  } catch {
    throw badRequest('A operadora retornou um endereço de checkout inválido.', 'INVALID_CHECKOUT_URL')
  }
}


const infinitePayWebhookPayloadSchema = z.object({
  order_nsu: z.string().trim().min(1).max(200),
  transaction_nsu: z.string().trim().min(1).max(200),
  amount: z.coerce.number().int().positive(),
  invoice_slug: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().min(1).max(200).optional(),
  receipt_url: z.string().trim().max(2048).optional(),
  capture_method: z.string().trim().max(80).optional(),
}).passthrough().superRefine((value, ctx) => {
  if (!value.invoice_slug && !value.slug) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['invoice_slug'], message: 'invoice_slug obrigatório' })
})

const infinitePayPaymentCheckSchema = z.object({
  paid: z.boolean(),
  amount: z.coerce.number().int().positive(),
  capture_method: z.string().trim().max(80).optional(),
}).passthrough()

type _InfinitePayWebhookPayload = z.infer<typeof infinitePayWebhookPayloadSchema>

const safeInfinitePayReceiptUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : ''
  } catch {
    return ''
  }
}

const infinitePayWebhookHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')

const logInfinitePayWebhookEvent = (input: { orderNsu?: string | null; eventHash: string; outcome: string; errorCode?: string | null }) => {
  db.prepare(`
    INSERT INTO infinitepay_webhook_events (id, order_nsu, event_hash, outcome, error_code, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), input.orderNsu || null, input.eventHash, input.outcome.slice(0, 80), input.errorCode?.slice(0, 120) || null, new Date().toISOString())
}

const verifyInfinitePayPayment = async (input: { orderNsu: string; transactionNsu: string; invoiceSlug: string; expectedAmountCents: number }) => {
  const response = await fetch(`${env.INFINITEPAY_BASE_URL}/payment_check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      handle: env.INFINITEPAY_HANDLE,
      order_nsu: input.orderNsu,
      transaction_nsu: input.transactionNsu,
      slug: input.invoiceSlug,
    }),
  })
  const raw = await response.json().catch(() => null)
  const parsed = infinitePayPaymentCheckSchema.safeParse(raw)
  if (!response.ok || !parsed.success || !parsed.data.paid || parsed.data.amount !== input.expectedAmountCents) {
    throw badRequest('Pagamento não confirmado', 'PAYMENT_NOT_CONFIRMED')
  }
  return parsed.data
}

const splitCsv = (value?: string) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

const domainVerificationConfig: DomainVerificationConfig = {
  appBaseUrl: env.APP_BASE_URL,
  devHost: env.DEV_HOST,
  cnameTarget: env.CUSTOM_DOMAIN_CNAME_TARGET,
  expectedIpv4: splitCsv(env.CUSTOM_DOMAIN_IPV4),
  expectedIpv6: splitCsv(env.CUSTOM_DOMAIN_IPV6),
}

const configuredPlatformHostname = (() => {
  for (const raw of [env.APP_BASE_URL, env.FRONTEND_ORIGIN]) {
    if (!raw) continue
    try {
      return new URL(raw).hostname.toLowerCase()
    } catch {
      // A validação de ambiente reporta URLs inválidas na inicialização.
    }
  }
  return null
})()

const sessionCookieName = env.NODE_ENV === 'production' ? '__Host-session' : 'session'
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
}

const setSessionCookie = (res: Response, token: string, persistent = false) => {
  res.cookie(sessionCookieName, token, {
    ...sessionCookieOptions,
    ...(persistent ? { maxAge: 1000 * 60 * 60 * 24 * 30 } : {}),
  })
}

const preauthCookieName = env.NODE_ENV === 'production' ? '__Host-preauth' : 'preauth'
const trustedDeviceCookieName = env.NODE_ENV === 'production' ? '__Host-device' : 'device'

const setPreauthCookie = (res: Response, token: string) => {
  res.cookie(preauthCookieName, token, { ...sessionCookieOptions, maxAge: 10 * 60 * 1000 })
}

const clearPreauthCookie = (res: Response) => {
  res.clearCookie(preauthCookieName, { path: '/', sameSite: 'lax', secure: env.NODE_ENV === 'production' })
}

const setTrustedDeviceCookie = (res: Response, token: string) => {
  res.cookie(trustedDeviceCookieName, token, { ...sessionCookieOptions, maxAge: TRUSTED_DEVICE_TTL_MS })
}

const clearTrustedDeviceCookie = (res: Response) => {
  res.clearCookie(trustedDeviceCookieName, { path: '/', sameSite: 'lax', secure: env.NODE_ENV === 'production' })
}

const requestSecurityMetadata = (req: Request) => ({
  ipAddress: req.ip || req.socket.remoteAddress || null,
  userAgent: req.get('user-agent') || null,
})

const createAndSetSession = (req: Request, res: Response, userId: string, persistent = false, trustedDeviceId?: string | null) => {
  const session = createSession(db, {
    userId,
    persistent,
    trustedDeviceId: trustedDeviceId ?? null,
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
  })
  setSessionCookie(res, session.token, persistent)
  return session
}

const app = express()

app.disable('x-powered-by')
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

type RateLimiterOptions = {
  windowMs: number
  max: number
  keyPrefix: string
  keyFn?: (req: Request) => string
  persistent?: boolean
}

const createRateLimiter = (opts: RateLimiterOptions) => {
  const hits = new Map<string, { count: number; resetAt: number }>()
  const prune = (now: number) => {
    if (hits.size < 15_000) return
    for (const [k, v] of hits) {
      if (v.resetAt <= now) hits.delete(k)
    }
  }
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    prune(now)
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString()
    const k = (() => {
      if (!opts.keyFn) return ip
      try {
        const v = String(opts.keyFn(req) ?? '').trim().toLowerCase()
        return v ? v : ip
      } catch {
        return ip
      }
    })()
    const key = `${opts.keyPrefix}:${k}`

    if (opts.persistent) {
      const decision = db.transaction(() => {
        const row = db.prepare(`
          SELECT count, window_started_at as windowStartedAt, blocked_until as blockedUntil,
                 penalty_level as penaltyLevel, updated_at as updatedAt
          FROM security_rate_limits WHERE key = ? LIMIT 1
        `).get(key) as { count: number; windowStartedAt: string; blockedUntil: string | null; penaltyLevel: number; updatedAt: string } | undefined
        const nowIso = new Date(now).toISOString()
        const blockedUntilMs = row?.blockedUntil ? Date.parse(row.blockedUntil) : 0
        if (blockedUntilMs > now) return { allowed: false, retryAt: blockedUntilMs }

        const windowStarted = row ? Date.parse(row.windowStartedAt) : 0
        const stalePenalty = row ? Date.parse(row.updatedAt) + 24 * 60 * 60 * 1000 <= now : false
        const penaltyLevel = stalePenalty ? 0 : (row?.penaltyLevel ?? 0)
        const count = !row || !Number.isFinite(windowStarted) || windowStarted + opts.windowMs <= now ? 1 : row.count + 1
        const nextWindowStarted = count === 1 ? nowIso : row!.windowStartedAt

        if (count > opts.max) {
          const nextPenalty = Math.min(6, penaltyLevel + 1)
          const blockMs = Math.min(24 * 60 * 60 * 1000, Math.max(opts.windowMs, 60_000) * 2 ** (nextPenalty - 1))
          const retryAt = now + blockMs
          db.prepare(`
            INSERT INTO security_rate_limits (key, count, window_started_at, blocked_until, penalty_level, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_started_at = excluded.window_started_at,
              blocked_until = excluded.blocked_until, penalty_level = excluded.penalty_level, updated_at = excluded.updated_at
          `).run(key, count, nextWindowStarted, new Date(retryAt).toISOString(), nextPenalty, nowIso)
          return { allowed: false, retryAt }
        }

        db.prepare(`
          INSERT INTO security_rate_limits (key, count, window_started_at, blocked_until, penalty_level, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?)
          ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_started_at = excluded.window_started_at,
            blocked_until = NULL, penalty_level = excluded.penalty_level, updated_at = excluded.updated_at
        `).run(key, count, nextWindowStarted, penaltyLevel, nowIso)
        return { allowed: true, retryAt: 0 }
      })()

      if (!decision.allowed) {
        const retryAfterSec = Math.max(1, Math.ceil((decision.retryAt - now) / 1000))
        res.setHeader('Retry-After', String(retryAfterSec))
        res.status(429).json({ message: 'Muitas tentativas. Tente novamente mais tarde.', code: 'RATE_LIMITED' })
        return
      }
      next()
      return
    }

    const v = hits.get(key)
    if (!v || v.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs })
      next()
      return
    }

    v.count += 1
    hits.set(key, v)
    if (v.count > opts.max) {
      const retryAfterSec = Math.max(1, Math.ceil((v.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSec))
      res.status(429).json({ message: 'Muitas requisições', code: 'RATE_LIMITED' })
      return
    }
    next()
  }
}

const requireSameOrigin = (req: Request, res: Response, next: NextFunction) => {
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  const p = req.path || ''
  if (!p.startsWith('/api/')) return next()
  if (p.startsWith('/api/webhooks/')) return next()
  if (env.NODE_ENV !== 'production') return next()

  const source = (req.headers.origin || req.headers.referer || '').toString()
  if (!source) {
    res.status(403).json({ message: 'Origem inválida', code: 'ORIGIN_REQUIRED' })
    return
  }

  let sourceOrigin: string | null = null
  try {
    sourceOrigin = new URL(source).origin.toLowerCase()
  } catch {
    sourceOrigin = null
  }
  const requestHost = String(req.get('host') ?? '').toLowerCase()
  const expectedOrigin = requestHost ? `${req.protocol}://${requestHost}`.toLowerCase() : null
  if (!sourceOrigin || !expectedOrigin || sourceOrigin !== expectedOrigin) {
    res.status(403).json({ message: 'Origem inválida', code: 'ORIGIN_MISMATCH' })
    return
  }
  next()
}

const isLoopbackAddress = (value: string | undefined) => {
  const normalized = String(value ?? '').replace(/^::ffff:/, '')
  return normalized === '127.0.0.1' || normalized === '::1'
}

const safeTimingEqual = (a: string, b: string) => {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  if (aa.length !== bb.length) return false
  return timingSafeEqual(aa, bb)
}

const getWebhookSecret = (req: Request) => {
  const header = (() => {
    const v = req.headers['x-webhook-secret']
    if (typeof v === 'string') return v
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
    return null
  })()
  if (header && header.trim()) return header.trim()

  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    const v = auth.slice('bearer '.length).trim()
    if (v) return v
  }

  return null
}

const requireWebhookSecret = (secret?: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!secret) {
      res.status(503).json({ message: 'Webhook não configurado', code: 'WEBHOOK_NOT_CONFIGURED' })
      return
    }
    const provided = getWebhookSecret(req)
    if (!provided) {
      res.status(401).json({ message: 'Não autorizado', code: 'WEBHOOK_SECRET_REQUIRED' })
      return
    }
    if (!safeTimingEqual(provided, secret)) {
      res.status(401).json({ message: 'Não autorizado', code: 'WEBHOOK_SECRET_INVALID' })
      return
    }
    next()
  }
}

const isDevHost = (hostname: string) => {
  const host = (hostname ?? '').toLowerCase()
  if (env.DEV_HOST) return host === env.DEV_HOST.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return env.NODE_ENV !== 'production'
  return false
}

const reservedTenantSlugs = new Set(['www', 'app', 'api', 'dev', 'domains', 'admin', 'support', 'status'])

const assertTenantSlugIsAvailable = (slug: string) => {
  if (reservedTenantSlugs.has(slug)) {
    throw badRequest('Esse endereço é reservado pela plataforma', 'TENANT_SLUG_RESERVED')
  }
}

const requireDevHost = (req: Request, _res: Response, next: NextFunction) => {
  if (!isDevHost(req.hostname)) return next(notFound())
  next()
}

const getTenantSlugFromHostname = (hostname: string) => {
  const host = (hostname ?? '').trim().toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || isDevHost(host)) return null

  if (host.endsWith('.localhost')) {
    const label = host.slice(0, -'.localhost'.length)
    return /^[a-z0-9-]+$/.test(label) && !label.includes('.') ? label : null
  }

  const platformHost = configuredPlatformHostname
  if (!platformHost || host === platformHost || !host.endsWith(`.${platformHost}`)) return null

  const label = host.slice(0, -(platformHost.length + 1))
  if (!label || label.includes('.') || reservedTenantSlugs.has(label) || !/^[a-z0-9-]+$/.test(label)) return null
  return label
}

const resolveTenantFromSubdomain = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const host = (req.hostname ?? '').trim().toLowerCase()
    if (!host) return next()
    if (!isDevHost(host)) {
      const mapped = db
        .prepare(
          `
            SELECT t.id, t.slug
            FROM tenant_domains d
            JOIN tenants t ON t.id = d.tenant_id
            WHERE d.domain = ? AND d.status = 'ACTIVE' AND t.status = 'ACTIVE'
            LIMIT 1
          `,
        )
        .get(host) as { id: string; slug: string } | undefined
      if (mapped) {
        req.resolvedTenant = mapped
        return next()
      }
    }

    const slug = getTenantSlugFromHostname(host)
    if (!slug) return next()

    const tenant = db
      .prepare(
        `
          SELECT id, slug
          FROM tenants
          WHERE slug = ? AND status = 'ACTIVE'
        `,
      )
      .get(slug) as { id: string; slug: string } | undefined

    if (tenant) req.resolvedTenant = tenant
    next()
  } catch (err) {
    next(err)
  }
}

app.disable('x-powered-by')
app.use((req, res, next) => {
  const requestId = typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()
    ? req.headers['x-request-id'].trim().slice(0, 128)
    : randomUUID()
  res.setHeader('X-Request-Id', requestId)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)')
  next()
})
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (env.NODE_ENV !== 'production') return cb(null, true)

      try {
        const source = new URL(origin)
        const hostname = source.hostname.toLowerCase()
        if (source.protocol !== 'https:' || source.port) return cb(null, false)

        if (configuredPlatformHostname && hostname === configuredPlatformHostname) return cb(null, true)
        if (env.DEV_HOST && hostname === env.DEV_HOST.toLowerCase()) return cb(null, true)

        const tenantSlug = getTenantSlugFromHostname(hostname)
        if (tenantSlug) {
          const tenant = db.prepare("SELECT 1 as ok FROM tenants WHERE slug = ? AND status = 'ACTIVE' LIMIT 1").get(tenantSlug)
          return cb(null, Boolean(tenant))
        }

        const mapped = db
          .prepare("SELECT 1 as ok FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id WHERE d.domain = ? AND d.status = 'ACTIVE' AND t.status = 'ACTIVE' LIMIT 1")
          .get(hostname)
        return cb(null, Boolean(mapped))
      } catch {
        return cb(null, false)
      }
    },
    credentials: true,
  }),
)
app.use(
  helmet({
    contentSecurityPolicy:
      env.NODE_ENV === 'production'
        ? {
            useDefaults: true,
            directives: {
              "base-uri": ["'self'"],
              "object-src": ["'none'"],
              "frame-ancestors": ["'none'"],
              "img-src": ["'self'", 'data:', 'https:'],
              "script-src": ["'self'"],
              "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              "connect-src": ["'self'", 'https:'],
              "font-src": ["'self'", 'data:', "https://fonts.gstatic.com"],
            },
          }
        : false,
    crossOriginEmbedderPolicy: false,
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: false, preload: false } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }),
)

app.use(express.json({ limit: '2mb' }))

app.use(express.urlencoded({ extended: false, limit: '64kb' }))
app.use(cookieParser())
app.use(resolveTenantFromSubdomain)
app.use(sessionMiddleware)
app.use(requireSameOrigin)

app.use((req, res, next) => {
  if ((req.path || '').startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})

const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 600, keyPrefix: 'api' })
app.use('/api', (req, res, next) => {
  if ((req.path || '').startsWith('/webhooks/')) return next()
  apiLimiter(req, res, next)
})

const webhooksLimiter = createRateLimiter({ windowMs: 60_000, max: 120, keyPrefix: 'webhooks' })
const infinitePayWebhookLimiter = createRateLimiter({ windowMs: 60_000, max: 60, keyPrefix: 'webhooks:infinitepay' })
app.use('/api/webhooks', (req, res, next) => {
  webhooksLimiter(req, res, next)
})

const normalizePhone = (raw: string) => {
  const phone = normalizeBrazilPhone(raw)
  if (!phone) throw badRequest('Telefone inválido', 'INVALID_PHONE')
  return phone
}

const authLoginLimiter = createRateLimiter({ windowMs: 60_000, max: 12, keyPrefix: 'auth:login', persistent: true })
const authWhatsappOtpSendLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 4,
  keyPrefix: 'auth:whatsapp-otp:send',
  persistent: true,
  keyFn: (req) => {
    const token = req.cookies?.[preauthCookieName]
    return typeof token === 'string' ? createHash('sha256').update(token).digest('hex') : ''
  },
})
const publicCheckoutLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 8, keyPrefix: 'public:checkout' })
const publicCheckoutEmailLimiter = createRateLimiter({
  windowMs: 60 * 60_000,
  max: 4,
  keyPrefix: 'public:checkout:email',
  keyFn: (req) => typeof req.body?.email === 'string' ? req.body.email : '',
})
const authPasswordLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 8, keyPrefix: 'auth:password', persistent: true })
const authLoginUserLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 20,
  keyPrefix: 'auth:login:user',
  persistent: true,
  keyFn: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : ''
    const v = email.trim().toLowerCase()
    return v && v.includes('@') ? v : ''
  },
})
const devBootstrapLimiter = createRateLimiter({ windowMs: 60_000, max: 4, keyPrefix: 'dev:bootstrap', persistent: true })
const referralMutationLimiter = createRateLimiter({ windowMs: 60_000, max: 12, keyPrefix: 'referrals:mutation' })
const onboardingAssistantLimiter = createRateLimiter({ windowMs: 60_000, max: 4, keyPrefix: 'onboarding:assistant' })
const lumaAssistantLimiter = createRateLimiter({ windowMs: 60_000, max: 10, keyPrefix: 'admin:luma', keyFn: (req) => req.sessionUser?.id ?? '' })
const devBackupExportLimiter = createRateLimiter({ windowMs: 60_000, max: 6, keyPrefix: 'dev:backup:export' })
const domainVerifyLimiter = createRateLimiter({ windowMs: 60_000, max: 20, keyPrefix: 'admin:domain:verify' })
const whatsappSendLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyPrefix: 'admin:whatsapp:send',
  keyFn: (req) => req.sessionUser?.id ?? '',
})

type TenantDomainRow = {
  id: string
  tenantId: string
  domain: string
  status: 'PENDING' | 'ACTIVE' | 'ERROR'
  verificationToken: string | null
  createdAt: string
  lastCheckedAt: string | null
  verifiedAt: string | null
  verificationError: string | null
  isPrimary: number
}

const domainSetupPayload = (row: TenantDomainRow) => ({
  id: row.id,
  domain: row.domain,
  status: row.status,
  createdAt: row.createdAt,
  lastCheckedAt: row.lastCheckedAt,
  verifiedAt: row.verifiedAt,
  verificationError: row.verificationError,
  isPrimary: Boolean(row.isPrimary),
  dns: {
    verification: {
      type: 'TXT',
      name: domainVerificationRecord(row.domain),
      value: row.verificationToken ? domainVerificationValue(row.verificationToken) : null,
    },
    routing: env.CUSTOM_DOMAIN_CNAME_TARGET
      ? { type: 'CNAME', name: row.domain, value: env.CUSTOM_DOMAIN_CNAME_TARGET }
      : {
          type: 'A/AAAA',
          name: row.domain,
          ipv4: domainVerificationConfig.expectedIpv4,
          ipv6: domainVerificationConfig.expectedIpv6,
        },
  },
})

const getDomainRow = (id: string, tenantId?: string) => {
  const whereTenant = tenantId ? ' AND tenant_id = ?' : ''
  const params = tenantId ? [id, tenantId] : [id]
  return db
    .prepare(
      `SELECT id,
              tenant_id AS tenantId,
              domain,
              status,
              verification_token AS verificationToken,
              created_at AS createdAt,
              last_checked_at AS lastCheckedAt,
              verified_at AS verifiedAt,
              verification_error AS verificationError,
              is_primary AS isPrimary
       FROM tenant_domains
       WHERE id = ?${whereTenant}
       LIMIT 1`,
    )
    .get(...params) as TenantDomainRow | undefined
}

const verifyDomainRow = async (row: TenantDomainRow) => {
  if (!row.verificationToken) {
    const token = randomBytes(24).toString('hex')
    db.prepare('UPDATE tenant_domains SET verification_token = ? WHERE id = ?').run(token, row.id)
    row.verificationToken = token
  }

  const result = await verifyCustomDomain(row.domain, row.verificationToken, domainVerificationConfig)
  const nextStatus = result.verified ? 'ACTIVE' : row.status === 'ACTIVE' ? 'ERROR' : 'PENDING'
  db.prepare(
    `UPDATE tenant_domains
     SET status = ?, last_checked_at = ?, verified_at = CASE WHEN ? = 'ACTIVE' THEN COALESCE(verified_at, ?) ELSE verified_at END,
         verification_error = ?
     WHERE id = ?`,
  ).run(nextStatus, result.checkedAt, nextStatus, result.checkedAt, result.error, row.id)

  return { ...result, row: getDomainRow(row.id) }
}

let domainVerificationRunning = false
const verifyPendingDomains = async () => {
  if (domainVerificationRunning) return
  domainVerificationRunning = true
  try {
    const rows = db
      .prepare(
        `SELECT id,
                tenant_id AS tenantId,
                domain,
                status,
                verification_token AS verificationToken,
                created_at AS createdAt,
                last_checked_at AS lastCheckedAt,
                verified_at AS verifiedAt,
                verification_error AS verificationError,
                is_primary AS isPrimary
         FROM tenant_domains
         WHERE (
           status IN ('PENDING', 'ERROR')
           AND (last_checked_at IS NULL OR last_checked_at <= ?)
         ) OR (
           status = 'ACTIVE'
           AND (last_checked_at IS NULL OR last_checked_at <= ?)
         )
         ORDER BY CASE status WHEN 'ACTIVE' THEN 1 ELSE 0 END, created_at ASC
         LIMIT 25`,
      )
      .all(
        new Date(Date.now() - env.DOMAIN_VERIFY_INTERVAL_MINUTES * 60_000).toISOString(),
        new Date(Date.now() - env.DOMAIN_ACTIVE_REVERIFY_HOURS * 60 * 60_000).toISOString(),
      ) as TenantDomainRow[]

    for (const row of rows) {
      try {
        await verifyDomainRow(row)
      } catch (error) {
        const checkedAt = new Date().toISOString()
        const message = error instanceof Error ? error.message.slice(0, 500) : 'Falha temporária ao consultar DNS'
        db.prepare(
          `UPDATE tenant_domains SET last_checked_at = ?, verification_error = ? WHERE id = ?`,
        ).run(checkedAt, message, row.id)
      }
    }
  } finally {
    domainVerificationRunning = false
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'lashdesigner', version: appVersion })
})

app.get('/api/ready', (_req, res) => {
  try {
    db.prepare('SELECT 1 as ok').get()
    res.json({ ok: true, database: 'ready' })
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' })
  }
})

app.get('/api/internal/domains/authorize/:secret', (req, res) => {
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    res.status(404).end()
    return
  }
  if (!env.DOMAIN_AUTH_SECRET) {
    res.status(503).json({ message: 'Autorização de domínio não configurada' })
    return
  }

  const provided = typeof req.params.secret === 'string' ? req.params.secret : ''
  if (!provided || !safeTimingEqual(provided, env.DOMAIN_AUTH_SECRET)) {
    res.status(401).end()
    return
  }

  let domain: string
  try {
    domain = normalizeCustomDomain(typeof req.query.domain === 'string' ? req.query.domain : '')
  } catch {
    res.status(400).end()
    return
  }

  let authorized = false

  if (configuredPlatformHostname && domain === configuredPlatformHostname) {
    authorized = true
  } else if (env.DEV_HOST && domain === env.DEV_HOST.toLowerCase()) {
    authorized = true
  } else if (configuredPlatformHostname && domain.endsWith(`.${configuredPlatformHostname}`)) {
    const slug = getTenantSlugFromHostname(domain)
    if (slug) {
      authorized = Boolean(
        db.prepare("SELECT 1 as ok FROM tenants WHERE slug = ? AND status = 'ACTIVE' LIMIT 1").get(slug),
      )
    }
  } else {
    authorized = Boolean(
      db
        .prepare("SELECT 1 as ok FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id WHERE d.domain = ? AND d.status = 'ACTIVE' AND t.status = 'ACTIVE' LIMIT 1")
        .get(domain),
    )
  }

  if (!authorized) {
    res.status(403).end()
    return
  }
  res.status(204).end()
})

app.get('/api/public/tenant/:slug', (req, res, next) => {
  try {
    const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
    const tenant = db
      .prepare(
        `
          SELECT t.id, t.slug, t.name, t.primary_color as primaryColor, t.logo_url as logoUrl,
                 (
                   SELECT 'https://' || d.domain
                   FROM tenant_domains d
                   WHERE d.tenant_id = t.id AND d.status = 'ACTIVE'
                   ORDER BY d.is_primary DESC, d.verified_at DESC, d.created_at DESC
                   LIMIT 1
                 ) as publicBaseUrl
          FROM tenants t
          WHERE t.slug = ? AND t.status = 'ACTIVE'
        `,
      )
      .get(slug)

    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
    res.json({ tenant })
  } catch (err) {
    next(err)
  }
})



app.get('/api/public/tenant', (req, res, next) => {
  try {
    const t = req.resolvedTenant
    if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const tenant = db
      .prepare(
        `
          SELECT t.id, t.slug, t.name, t.primary_color as primaryColor, t.logo_url as logoUrl,
                 (
                   SELECT 'https://' || d.domain
                   FROM tenant_domains d
                   WHERE d.tenant_id = t.id AND d.status = 'ACTIVE'
                   ORDER BY d.is_primary DESC, d.verified_at DESC, d.created_at DESC
                   LIMIT 1
                 ) as publicBaseUrl
          FROM tenants t
          WHERE t.id = ?
        `,
      )
      .get(t.id)

    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
    res.json({ tenant })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/services', (req, res, next) => {
  try {
    const t = req.resolvedTenant
    if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const services = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents
          FROM services
          WHERE tenant_id = ? AND active = 1
          ORDER BY created_at DESC
        `,
      )
      .all(t.id)

    res.json({ services })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/booking', (req, res, next) => {
  try {
    const t = req.resolvedTenant
    if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const settings = db
      .prepare(
        `
          SELECT timezone, currency
          FROM tenant_settings
          WHERE tenant_id = ?
        `,
      )
      .get(t.id) as { timezone: string; currency: string } | undefined

    const bookingRules = db
      .prepare(
        `
          SELECT min_notice_minutes as minNoticeMinutes,
                 max_future_days as maxFutureDays,
                 slot_step_minutes as slotStepMinutes
          FROM booking_rules
          WHERE tenant_id = ?
        `,
      )
      .get(t.id) as
      | { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number }
      | undefined

    const businessHours = db
      .prepare(
        `
          SELECT weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE tenant_id = ?
          ORDER BY weekday ASC, start_minute ASC
        `,
      )
      .all(t.id)

    res.json({
      timezone: settings?.timezone ?? 'America/Sao_Paulo',
      currency: settings?.currency ?? 'BRL',
      bookingRules: bookingRules ?? { minNoticeMinutes: 60, maxFutureDays: 60, slotStepMinutes: 15 },
      businessHours,
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/availability', (req, res, next) => {
  try {
    const t = req.resolvedTenant
    if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const q = z
      .object({
        date: z.string().min(10).max(10),
      })
      .parse({ date: typeof req.query.date === 'string' ? req.query.date : '' })

    const settings = db
      .prepare(
        `
          SELECT timezone
          FROM tenant_settings
          WHERE tenant_id = ?
        `,
      )
      .get(t.id) as { timezone: string } | undefined

    const timeZone = settings?.timezone ?? 'America/Sao_Paulo'
    const { start, endExclusive } = dayBoundsUtc({ timeZone, ymd: q.date })

    const appointments = db
      .prepare(
        `
          SELECT starts_at as startsAt, ends_at as endsAt, 'appointment' as kind
          FROM appointments
          WHERE tenant_id = ?
            AND status IN ('CONFIRMED', 'PENDING')
            AND starts_at < ?
            AND ends_at > ?
        `,
      )
      .all(t.id, endExclusive.toISOString(), start.toISOString()) as Array<{ startsAt: string; endsAt: string }>

    const timeOff = db
      .prepare(
        `
          SELECT starts_at as startsAt, ends_at as endsAt, 'time_off' as kind
          FROM time_off
          WHERE tenant_id = ?
            AND starts_at < ?
            AND ends_at > ?
        `,
      )
      .all(t.id, endExclusive.toISOString(), start.toISOString()) as Array<{ startsAt: string; endsAt: string }>

    // Combine and return blocks
    res.json({ blocks: [...appointments, ...timeOff] })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/tenant/:slug/services', (req, res, next) => {
  try {
    const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
    const tenant = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'").get(slug) as
      | { id: string }
      | undefined
    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const services = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
          FROM services
          WHERE tenant_id = ? AND active = 1
          ORDER BY created_at DESC
        `,
      )
      .all(tenant.id)

    res.json({ services })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/tenant/:slug/booking', (req, res, next) => {
  try {
    const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
    const tenant = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'").get(slug) as
      | { id: string }
      | undefined
    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const settings = db
      .prepare(
        `
          SELECT timezone, currency
          FROM tenant_settings
          WHERE tenant_id = ?
        `,
      )
      .get(tenant.id) as { timezone: string; currency: string } | undefined

    const bookingRules = db
      .prepare(
        `
          SELECT min_notice_minutes as minNoticeMinutes,
                 max_future_days as maxFutureDays,
                 slot_step_minutes as slotStepMinutes
          FROM booking_rules
          WHERE tenant_id = ?
        `,
      )
      .get(tenant.id) as
      | { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number }
      | undefined

    const businessHours = db
      .prepare(
        `
          SELECT weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE tenant_id = ?
          ORDER BY weekday ASC, start_minute ASC
        `,
      )
      .all(tenant.id)

    res.json({
      timezone: settings?.timezone ?? 'America/Sao_Paulo',
      currency: settings?.currency ?? 'BRL',
      bookingRules: bookingRules ?? { minNoticeMinutes: 60, maxFutureDays: 60, slotStepMinutes: 15 },
      businessHours,
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/tenant/:slug/availability', (req, res, next) => {
  try {
    const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
    const tenant = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'").get(slug) as
      | { id: string }
      | undefined
    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const q = z
      .object({
        date: z.string().min(10).max(10),
      })
      .parse({ date: typeof req.query.date === 'string' ? req.query.date : '' })

    const settings = db
      .prepare(
        `
          SELECT timezone
          FROM tenant_settings
          WHERE tenant_id = ?
        `,
      )
      .get(tenant.id) as { timezone: string } | undefined

    const timeZone = settings?.timezone ?? 'America/Sao_Paulo'
    const { start, endExclusive } = dayBoundsUtc({ timeZone, ymd: q.date })

    const appointments = db
      .prepare(
        `
          SELECT starts_at as startsAt, ends_at as endsAt, 'appointment' as kind
          FROM appointments
          WHERE tenant_id = ?
            AND status IN ('CONFIRMED', 'PENDING')
            AND starts_at < ?
            AND ends_at > ?
        `,
      )
      .all(tenant.id, endExclusive.toISOString(), start.toISOString()) as Array<{ startsAt: string; endsAt: string }>

    const timeOff = db
      .prepare(
        `
          SELECT starts_at as startsAt, ends_at as endsAt, 'time_off' as kind
          FROM time_off
          WHERE tenant_id = ?
            AND starts_at < ?
            AND ends_at > ?
        `,
      )
      .all(tenant.id, endExclusive.toISOString(), start.toISOString()) as Array<{ startsAt: string; endsAt: string }>

    res.json({ blocks: [...appointments, ...timeOff] })
  } catch (err) {
    next(err)
  }
})

app.get('/api/auth/me', (req, res, next) => {
  try {
    const allowDevBootstrap =
      isDevHost(req.hostname) &&
      (db.prepare(`SELECT COUNT(1) as n FROM users WHERE role = 'DEV'`).get() as { n: number }).n === 0

    if (!req.sessionUser) {
      res.json({ user: null, allowDevBootstrap, bootstrapRequiresSecret: env.NODE_ENV === 'production' })
      return
    }

    const u = db
      .prepare(
        `
          SELECT u.id, u.email, u.role, u.tenant_id as tenantId,
                 t.slug as tenantSlug,
                 (
                   SELECT status
                   FROM subscriptions
                   WHERE tenant_id = u.tenant_id
                   ORDER BY updated_at DESC LIMIT 1
                 ) as subscriptionStatus,
                 (
                   SELECT current_period_end
                   FROM subscriptions
                   WHERE tenant_id = u.tenant_id
                   ORDER BY updated_at DESC LIMIT 1
                 ) as subscriptionPeriodEnd
          FROM users u
          LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE u.id = ?
        `,
      )
      .get(req.sessionUser.id)

    const testMode = env.NODE_ENV !== 'production' && (db.prepare(`SELECT value FROM platform_settings WHERE key = 'test_mode'`).get() as { value: string } | undefined)?.value === 'true'
    const user = u as
      | (Record<string, unknown> & { subscriptionStatus?: string | null; subscriptionPeriodEnd?: string | null })
      | undefined
    if (
      user?.subscriptionStatus === 'ACTIVE' &&
      user.subscriptionPeriodEnd &&
      Date.parse(user.subscriptionPeriodEnd) <= Date.now()
    ) {
      user.subscriptionStatus = 'EXPIRED'
    }

    res.json({ user: user ?? null, allowDevBootstrap, bootstrapRequiresSecret: env.NODE_ENV === 'production', isTestMode: testMode })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/login', authLoginLimiter, authLoginUserLimiter, async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        keepSigned: z.boolean().optional().default(false),
      })
      .parse(req.body)

    const email = body.email.toLowerCase()
    const isDev = isDevHost(req.hostname)
    const tenantId = req.resolvedTenant?.id ?? null

    const row = (():
      | {
          id: string
          tenantId: string | null
          email: string
          passwordHash: string
          phone: string | null
          role: 'DEV' | 'ADMIN' | 'CLIENT'
        }
      | undefined => {
      if (isDev) {
        return db
          .prepare(
            `
              SELECT id, tenant_id as tenantId, email, password_hash as passwordHash, phone, role
              FROM users
              WHERE email = ?
                AND tenant_id IS NULL
              LIMIT 1
            `,
          )
          .get(email) as
          | {
              id: string
              tenantId: string | null
              email: string
              passwordHash: string
              phone: string | null
              role: 'DEV' | 'ADMIN' | 'CLIENT'
            }
          | undefined
      }

      if (!tenantId) throw unauthorized('Use o subdomínio do seu espaço para entrar.', 'TENANT_REQUIRED')

      return db
        .prepare(
          `
            SELECT id, tenant_id as tenantId, email, password_hash as passwordHash, phone, role
            FROM users
            WHERE email = ?
              AND tenant_id = ?
            LIMIT 1
          `,
        )
        .get(email, tenantId) as
        | {
            id: string
            tenantId: string | null
            email: string
            passwordHash: string
            phone: string | null
            role: 'DEV' | 'ADMIN' | 'CLIENT'
          }
        | undefined
    })()

    if (!row) throw unauthorized('E-mail ou senha inválidos', 'INVALID_CREDENTIALS')
    const ok = await verifyPassword(body.password, row.passwordHash)
    if (!ok) {
      logSecurityEvent(db, { eventType: 'LOGIN_FAILED', userId: row.id, tenantId: row.tenantId, ...requestSecurityMetadata(req) })
      throw unauthorized('E-mail ou senha inválidos', 'INVALID_CREDENTIALS')
    }

    if (row.role === 'CLIENT') {
      throw unauthorized('Clientes entram pelo código enviado ao WhatsApp.', 'CLIENT_OTP_REQUIRED')
    }
    if (row.role === 'DEV' && !isDevHost(req.hostname)) {
      throw unauthorized('Acesso DEV somente no subdomínio dev.', 'DEV_SUBDOMAIN_ONLY')
    }
    if (row.role !== 'DEV' && tenantId && row.tenantId && tenantId !== row.tenantId) {
      throw unauthorized('Use o subdomínio da sua loja para entrar.', 'TENANT_HOST_MISMATCH')
    }

    const trustedToken = req.cookies?.[trustedDeviceCookieName]
    const trustedDevice = typeof trustedToken === 'string' ? resolveTrustedDevice(db, row.id, trustedToken) : null
    if (trustedToken && !trustedDevice) clearTrustedDeviceCookie(res)

    const tenantSlug =
      row.tenantId && row.role !== 'DEV'
        ? ((db.prepare('SELECT slug FROM tenants WHERE id = ?').get(row.tenantId) as { slug: string } | undefined)?.slug ?? null)
        : null

    if (trustedDevice) {
      createAndSetSession(req, res, row.id, body.keepSigned, trustedDevice.id)
      logSecurityEvent(db, {
        eventType: 'LOGIN_SUCCESS_TRUSTED_DEVICE',
        userId: row.id,
        tenantId: row.tenantId,
        ...requestSecurityMetadata(req),
        details: { trustedDeviceId: trustedDevice.id },
      })
      res.json({ user: { id: row.id, email: row.email, role: row.role, tenantId: row.tenantId, tenantSlug } })
      return
    }

    const challenge = createWhatsappOtpChallenge(db, {
      userId: row.id,
      keepSigned: body.keepSigned,
      phone: row.phone ?? '',
    })
    setPreauthCookie(res, challenge.token)

    if (!row.phone) {
      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_PHONE_REQUIRED', userId: row.id, tenantId: row.tenantId, ...requestSecurityMetadata(req) })
      res.status(202).json({ whatsappOtpRequired: true, phoneEnrollmentRequired: true })
      return
    }

    const delivered = await sendPlatformWhatsappText(
      row.phone,
      `Seu código de verificação Lash Designer: ${challenge.code}. Ele expira em 5 minutos. Não compartilhe este código.`,
    )
    if (!delivered) {
      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_DELIVERY_FAILED', userId: row.id, tenantId: row.tenantId, ...requestSecurityMetadata(req) })
      throw badRequest('Não foi possível enviar o código pelo WhatsApp. Verifique a Evolution API Global.', 'WHATSAPP_MFA_DELIVERY_FAILED')
    }

    logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_OTP_SENT', userId: row.id, tenantId: row.tenantId, ...requestSecurityMetadata(req) })
    res.status(202).json({ whatsappOtpRequired: true, phoneMasked: maskE164Phone(row.phone) })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/whatsapp-otp/send', authLoginLimiter, authWhatsappOtpSendLimiter, async (req, res, next) => {
  try {
    const token = req.cookies?.[preauthCookieName]
    if (typeof token !== 'string') throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_REQUIRED')
    const challenge = resolveAuthChallenge(db, token)
    if (!challenge) throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_INVALID')

    const body = z.object({ phone: z.string().min(8).max(40).optional() }).parse(req.body ?? {})
    const user = db.prepare(`SELECT phone FROM users WHERE id = ? LIMIT 1`).get(challenge.userId) as { phone: string | null } | undefined
    if (!user) throw unauthorized()

    let phone = user.phone
    if (!phone) {
      if (!body.phone) throw badRequest('Informe seu WhatsApp para ativar a verificação em duas etapas.', 'MFA_PHONE_REQUIRED')
      phone = normalizeUserE164Phone(body.phone)
    } else if (body.phone && normalizeUserE164Phone(body.phone) !== phone) {
      throw badRequest('O WhatsApp desta conta deve ser alterado na área Segurança após o login.', 'MFA_PHONE_MISMATCH')
    }

    const refreshed = refreshWhatsappOtpChallenge(db, challenge.id, challenge.userId, phone)
    if (!refreshed) throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_INVALID')
    const delivered = await sendPlatformWhatsappText(
      phone,
      `Seu código de verificação Lash Designer: ${refreshed.code}. Ele expira em 5 minutos. Não compartilhe este código.`,
    )
    if (!delivered) {
      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_DELIVERY_FAILED', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req) })
      throw badRequest('Não foi possível enviar o código pelo WhatsApp. Verifique a Evolution API Global.', 'WHATSAPP_MFA_DELIVERY_FAILED')
    }

    logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_OTP_SENT', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req), details: { resend: true } })
    res.json({ sent: true, phoneMasked: maskE164Phone(phone) })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/whatsapp-otp/verify', authLoginLimiter, (req, res, next) => {
  try {
    const token = req.cookies?.[preauthCookieName]
    if (typeof token !== 'string') throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_REQUIRED')
    const challenge = resolveAuthChallenge(db, token)
    if (!challenge || !challenge.phone) throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_INVALID')
    const body = z.object({ code: z.string().regex(/^\d{6}$/), trustDevice: z.boolean().optional().default(false) }).parse(req.body)

    const currentUser = db.prepare(`SELECT phone FROM users WHERE id = ? LIMIT 1`).get(challenge.userId) as { phone: string | null } | undefined
    if (!currentUser) throw unauthorized()
    if (currentUser.phone && currentUser.phone !== challenge.phone) {
      throw unauthorized('O WhatsApp da conta foi alterado. Entre novamente.', 'MFA_PHONE_CHANGED')
    }

    if (!verifyAndConsumeWhatsappOtpChallenge(db, challenge.id, challenge.userId, body.code)) {
      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_FAILED', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req) })
      throw unauthorized('Código inválido ou expirado.', 'INVALID_MFA_CODE')
    }

    if (!currentUser.phone) {
      db.prepare(`UPDATE users SET phone = ? WHERE id = ? AND phone IS NULL`).run(challenge.phone, challenge.userId)
      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_PHONE_ENROLLED', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req) })
    }

    let trustedDeviceId: string | null = null
    if (body.trustDevice) {
      const device = createTrustedDevice(db, challenge.userId, req.get('user-agent'))
      trustedDeviceId = device.id
      setTrustedDeviceCookie(res, device.token)
      logSecurityEvent(db, { eventType: 'TRUSTED_DEVICE_CREATED', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req), details: { trustedDeviceId: device.id } })
    }

    createAndSetSession(req, res, challenge.userId, challenge.keepSigned, trustedDeviceId)
    clearPreauthCookie(res)
    logSecurityEvent(db, { eventType: 'LOGIN_SUCCESS_WHATSAPP_MFA', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req) })

    const tenantSlug = challenge.tenantId
      ? ((db.prepare('SELECT slug FROM tenants WHERE id = ?').get(challenge.tenantId) as { slug: string } | undefined)?.slug ?? null)
      : null
    res.json({ user: { id: challenge.userId, email: challenge.email, role: challenge.role, tenantId: challenge.tenantId, tenantSlug } })
  } catch (err) {
    next(err)
  }
})


app.get('/api/auth/legal-preferences', requireRole('ADMIN', 'DEV'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const row = db.prepare(`
      SELECT platform_marketing_whatsapp_opt_in as whatsappPromotions
      FROM users WHERE id = ? LIMIT 1
    `).get(sessionUser.id) as { whatsappPromotions: number } | undefined
    const acceptance = db.prepare(`
      SELECT terms_version as termsVersion, privacy_version as privacyVersion, bundle_hash as bundleHash, accepted_at as acceptedAt
      FROM user_legal_acceptances
      WHERE user_id = ?
      ORDER BY accepted_at DESC LIMIT 1
    `).get(sessionUser.id) as { termsVersion: string; privacyVersion: string; bundleHash: string; acceptedAt: string } | undefined
    res.json({
      whatsappPromotions: Boolean(row?.whatsappPromotions),
      marketingConsentText: PLATFORM_MARKETING_WHATSAPP_TEXT,
      currentDocuments: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, bundleHash: currentLegalBundleHash() },
      latestAcceptance: acceptance ?? null,
    })
  } catch (err) { next(err) }
})

app.get('/api/auth/legal-acceptance/:bundleHash', requireRole('ADMIN', 'DEV'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const bundleHash = z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.bundleHash)
    const row = db.prepare(`
      SELECT bundle_hash as bundleHash, terms_version as termsVersion, privacy_version as privacyVersion,
             source, snapshot_json as snapshotJson, accepted_at as acceptedAt
      FROM user_legal_acceptances
      WHERE user_id = ? AND bundle_hash = ?
      ORDER BY accepted_at DESC LIMIT 1
    `).get(sessionUser.id, bundleHash) as { bundleHash: string; termsVersion: string; privacyVersion: string; source: string; snapshotJson: string; acceptedAt: string } | undefined
    if (!row) return next(notFound('Versão legal aceita não encontrada para esta conta.', 'LEGAL_ACCEPTANCE_NOT_FOUND'))
    let legal: ReturnType<typeof legalPublicConfig>
    try { legal = JSON.parse(row.snapshotJson) as ReturnType<typeof legalPublicConfig> }
    catch { throw new Error('LEGAL_SNAPSHOT_INVALID') }
    res.json({
      legal,
      acceptance: { bundleHash: row.bundleHash, termsVersion: row.termsVersion, privacyVersion: row.privacyVersion, source: row.source, acceptedAt: row.acceptedAt },
    })
  } catch (err) { next(err) }
})

app.post('/api/auth/legal-acceptance', requireRole('ADMIN', 'DEV'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const body = z.object({
      accepted: z.literal(true),
      termsVersion: z.string().max(80),
      privacyVersion: z.string().max(80),
      bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
    }).strict().parse(req.body)
    if (body.termsVersion !== TERMS_VERSION || body.privacyVersion !== PRIVACY_VERSION || body.bundleHash !== currentLegalBundleHash()) {
      return next(badRequest('Os documentos legais foram atualizados. Recarregue a página e revise a versão vigente.', 'LEGAL_VERSION_STALE'))
    }
    recordLegalAcceptance({ userId: sessionUser.id, tenantId: sessionUser.tenantId, source: 'ACCOUNT_REACCEPTANCE', req })
    res.json({ ok: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, bundleHash: currentLegalBundleHash(), acceptedAt: new Date().toISOString() })
  } catch (err) { next(err) }
})

app.put('/api/auth/legal-preferences', requireRole('ADMIN', 'DEV'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const body = z.object({ whatsappPromotions: z.boolean() }).strict().parse(req.body)
    const result = db.transaction(() => recordPlatformMarketingChoice({ userId: sessionUser.id, tenantId: sessionUser.tenantId, granted: body.whatsappPromotions, source: 'ACCOUNT_SETTINGS' }))()
    res.json({ ...result, ok: true })
  } catch (err) { next(err) }
})

app.put('/api/auth/security/phone', requireRole('ADMIN', 'DEV'), authPasswordLimiter, async (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const body = z.object({ currentPassword: z.string().min(8).max(128), phone: z.string().min(8).max(40) }).parse(req.body)
    const row = db.prepare(`SELECT password_hash as passwordHash FROM users WHERE id = ? LIMIT 1`).get(sessionUser.id) as { passwordHash: string } | undefined
    if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_PHONE_CHANGE_FAILED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
      throw unauthorized('Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD')
    }
    const phone = normalizeUserE164Phone(body.phone)
    db.prepare(`UPDATE users SET phone = ? WHERE id = ?`).run(phone, sessionUser.id)
    logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_PHONE_CHANGED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
    res.json({ ok: true, phone })
  } catch (err) {
    next(err)
  }
})

app.get('/api/auth/security', requireRole('ADMIN', 'DEV'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const state = listSecurityState(db, sessionUser.id)
    res.json({
      ...state,
      devices: (state.devices as Array<Record<string, unknown> & { id: string }>).map((device) => ({ ...device, current: device.id === sessionUser.trustedDeviceId })),
      sessions: (state.sessions as Array<Record<string, unknown> & { id: string }>).map((session) => ({ ...session, current: session.id === sessionUser.sessionId })),
    })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/auth/security/devices/:deviceId', requireRole('ADMIN', 'DEV'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const deviceId = z.string().uuid().parse(req.params.deviceId)
    const currentSessionRevoked = sessionUser.trustedDeviceId === deviceId
    revokeTrustedDevice(db, sessionUser.id, deviceId)
    if (currentSessionRevoked) {
      clearTrustedDeviceCookie(res)
      res.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax', secure: env.NODE_ENV === 'production' })
    }
    logSecurityEvent(db, { eventType: 'TRUSTED_DEVICE_REVOKED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req), details: { trustedDeviceId: deviceId } })
    res.json({ ok: true, currentSessionRevoked })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/security/devices/revoke-all', requireRole('ADMIN', 'DEV'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    revokeAllTrustedDevices(db, sessionUser.id)
    clearTrustedDeviceCookie(res)
    logSecurityEvent(db, { eventType: 'TRUSTED_DEVICES_REVOKED_ALL', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/auth/security/sessions/:sessionId', requireRole('ADMIN', 'DEV'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const sessionId = z.string().uuid().parse(req.params.sessionId)
    const now = new Date().toISOString()
    const result = db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).run(now, sessionId, sessionUser.id)
    if (result.changes !== 1) return next(notFound('Sessão não encontrada', 'SESSION_NOT_FOUND'))
    const currentSessionRevoked = sessionUser.sessionId === sessionId
    if (currentSessionRevoked) {
      res.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax', secure: env.NODE_ENV === 'production' })
    }
    logSecurityEvent(db, { eventType: 'SESSION_REVOKED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req), details: { sessionId, currentSessionRevoked } })
    res.json({ ok: true, currentSessionRevoked })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/logout', (req, res) => {
  if (req.sessionUser) {
    revokeSession(db, req.sessionUser.sessionId)
    logSecurityEvent(db, { eventType: 'LOGOUT', userId: req.sessionUser.id, tenantId: req.sessionUser.tenantId, ...requestSecurityMetadata(req) })
  }
  res.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax', secure: env.NODE_ENV === 'production' })
  res.json({ ok: true })
})

app.post('/api/auth/logout-all', requireAuth, (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())

    revokeSessionsForUser(db, sessionUser.id)
    logSecurityEvent(db, { eventType: 'LOGOUT_ALL', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
    res.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax', secure: env.NODE_ENV === 'production' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/change-password', requireAuth, authPasswordLimiter, async (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())

    const body = z
      .object({
        currentPassword: z.string().min(8).max(128),
        newPassword: z.string().min(8).max(128),
      })
      .parse(req.body)

    if (body.currentPassword === body.newPassword) {
      throw badRequest('A nova senha deve ser diferente da senha atual.', 'PASSWORD_UNCHANGED')
    }

    const row = db
      .prepare('SELECT password_hash as passwordHash FROM users WHERE id = ? LIMIT 1')
      .get(sessionUser.id) as { passwordHash: string } | undefined
    if (!row) throw unauthorized()

    const valid = await verifyPassword(body.currentPassword, row.passwordHash)
    if (!valid) throw unauthorized('Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD')

    const passwordHash = await hashPassword(body.newPassword)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, sessionUser.id)
    revokeSessionsForUser(db, sessionUser.id)
    createAndSetSession(req, res, sessionUser.id, sessionUser.persistent, sessionUser.trustedDeviceId)
    logSecurityEvent(db, { eventType: 'PASSWORD_CHANGED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/bootstrap', requireDevHost, devBootstrapLimiter, async (req, res, next) => {
  try {
    const allowDevBootstrap =
      (db.prepare(`SELECT COUNT(1) as n FROM users WHERE role = 'DEV'`).get() as { n: number })
        .n === 0
    if (!allowDevBootstrap) throw badRequest('Bootstrap DEV indisponível', 'BOOTSTRAP_DISABLED')

    const body = z
      .object({ email: z.string().email(), phone: z.string().min(8).max(40), password: z.string().min(8), bootstrapSecret: z.string().optional() })
      .parse(req.body)

    if (env.NODE_ENV === 'production') {
      const provided = body.bootstrapSecret?.trim() ?? ''
      if (!env.DEV_BOOTSTRAP_SECRET || !provided || !safeTimingEqual(provided, env.DEV_BOOTSTRAP_SECRET)) {
        throw unauthorized('Código de bootstrap inválido', 'INVALID_BOOTSTRAP_SECRET')
      }
    }

    const email = body.email.toLowerCase()
    const exists = db
      .prepare(`SELECT id FROM users WHERE email = ? AND tenant_id IS NULL LIMIT 1`)
      .get(email)
    if (exists) throw badRequest('E-mail já cadastrado', 'EMAIL_ALREADY_USED')

    const now = new Date().toISOString()
    const id = randomUUID()
    const passwordHash = await hashPassword(body.password)
    const phone = normalizeUserE164Phone(body.phone)
    db.prepare(
      `INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
       VALUES (?, NULL, ?, ?, ?, 'DEV', ?)`
    ).run(id, email, passwordHash, phone, now)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/settings', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const row = db
      .prepare(`SELECT value FROM platform_settings WHERE key = 'dev_primary_color' LIMIT 1`)
      .get() as { value: string } | undefined
    res.json({ settings: row ? { dev_primary_color: row.value } : {} })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/dev-theme', requireDevHost, (req, res, next) => {
  try {
    const row = db
      .prepare(`SELECT value FROM platform_settings WHERE key = 'dev_primary_color' LIMIT 1`)
      .get() as { value: string } | undefined

    res.json({ primaryColor: row?.value ?? null })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/settings', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const body = z
      .object({ dev_primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
      .strict()
      .parse(req.body)
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('dev_primary_color', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(body.dev_primary_color.toLowerCase(), now)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/users', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const users = db
      .prepare(`SELECT id, email, phone, created_at as createdAt FROM users WHERE role = 'DEV' ORDER BY created_at DESC`)
      .all()
    res.json({ users })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/users', requireDevHost, requireRole('DEV'), async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().email(), phone: z.string().min(8).max(40), password: z.string().min(8) }).parse(req.body)
    const email = body.email.toLowerCase()
    
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (exists) throw badRequest('E-mail já cadastrado', 'EMAIL_ALREADY_USED')

    const id = randomUUID()
    const passwordHash = await hashPassword(body.password)
    const phone = normalizeUserE164Phone(body.phone)
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
       VALUES (?, NULL, ?, ?, ?, 'DEV', ?)`
    ).run(id, email, passwordHash, phone, now)

    res.json({ user: { id, email, phone, createdAt: now } })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/dev/users/:id', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    if (id === req.sessionUser?.id) throw badRequest('Não é possível excluir o próprio usuário', 'CANNOT_DELETE_SELF')

    db.prepare('DELETE FROM users WHERE id = ? AND role = \'DEV\'').run(id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/tenants', requireDevHost, requireRole('DEV'), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(2),
        slug: z
          .string()
          .min(2)
          .regex(/^[a-z0-9-]+$/),
        primaryColor: z.string().min(4),
        logoUrl: z
          .string()
          .trim()
          .optional()
          .transform((v) => {
            if (typeof v !== 'string') return null
            const s = v.trim()
            return s ? s : null
          })
          .refine(
            (v) => {
              if (v === null) return true
              if (v.startsWith('data:image/')) return v.length <= 250_000
              try {
                new URL(v)
                return true
              } catch {
                return false
              }
            },
            { message: 'Logo inválida' },
          ),
        adminEmail: z.string().email(),
        adminPhone: z.string().min(8).max(40),
        adminPassword: z.string().min(8),
      })
      .parse(req.body)

    const slug = body.slug.trim().toLowerCase()
    assertTenantSlugIsAvailable(slug)
    const existsTenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)
    if (existsTenant) throw badRequest('Slug já existe', 'TENANT_SLUG_TAKEN')

    const adminEmail = body.adminEmail.toLowerCase()
    const adminPhone = normalizeUserE164Phone(body.adminPhone)
    const existsUser = db
      .prepare(`SELECT id FROM users WHERE email = ? AND tenant_id IS NULL LIMIT 1`)
      .get(adminEmail)
    if (existsUser) throw badRequest('E-mail do admin já existe (usuário DEV)', 'EMAIL_ALREADY_USED')

    const now = new Date().toISOString()
    const tenantId = randomUUID()
    const adminId = randomUUID()
    const passwordHash = await hashPassword(body.adminPassword)

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO tenants (id, slug, name, primary_color, logo_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(tenantId, slug, body.name, body.primaryColor, body.logoUrl ?? null, now)

      db.prepare(
        `INSERT INTO tenant_settings (tenant_id, secondary_color, timezone, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(tenantId, '#0f172a', 'America/Sao_Paulo', 'BRL', now, now)

      db.prepare(
        `INSERT INTO booking_rules (tenant_id, min_notice_minutes, max_future_days, slot_step_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(tenantId, 60, 60, 30, now, now)

      const insertBusinessHours = db.prepare(
        `INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const weekday of [1, 2, 3, 4, 5]) {
        insertBusinessHours.run(randomUUID(), tenantId, weekday, 9 * 60, 18 * 60, now)
      }
      insertBusinessHours.run(randomUUID(), tenantId, 6, 9 * 60, 14 * 60, now)

      db.prepare(
        `INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
         VALUES (?, ?, ?, ?, ?, 'ADMIN', ?)`
      ).run(adminId, tenantId, adminEmail, passwordHash, adminPhone, now)
    })

    tx()

    // O tenant está pronto para uso no domínio principal ou via proxy reverso.

    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl
          FROM tenants
          WHERE id = ?
        `,
      )
      .get(tenantId)

    res.json({
      tenant,
      adminUser: {
        id: adminId,
        email: adminEmail,
        role: 'ADMIN',
        tenantId,
        tenantSlug: slug,
      }
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/tenants', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenants = db
      .prepare(
        `
          SELECT t.id,
                 t.slug,
                 t.name,
                 t.primary_color as primaryColor,
                 t.logo_url as logoUrl,
                 t.status,
                 t.created_at as createdAt,
                 (
                   SELECT u.email
                   FROM users u
                   WHERE u.tenant_id = t.id AND u.role = 'ADMIN'
                   ORDER BY u.created_at ASC
                   LIMIT 1
                 ) as adminEmail,
                 (
                   SELECT COUNT(1)
                   FROM users u
                   WHERE u.tenant_id = t.id
                 ) as userCount
                 ,(
                   SELECT s.status
                   FROM subscriptions s
                   WHERE s.tenant_id = t.id
                   ORDER BY s.updated_at DESC, s.created_at DESC
                   LIMIT 1
                 ) as subscriptionStatus
                 ,(
                   SELECT s.current_period_end
                   FROM subscriptions s
                   WHERE s.tenant_id = t.id
                   ORDER BY s.updated_at DESC, s.created_at DESC
                   LIMIT 1
                 ) as subscriptionPeriodEnd
          FROM tenants t
          ORDER BY t.created_at DESC
        `,
      )
      .all()

    res.json({ tenants })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenantId = z.string().uuid().parse(req.params.tenantId)
    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl, status, created_at as createdAt
          FROM tenants
          WHERE id = ?
        `,
      )
      .get(tenantId)

    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const settings = db
      .prepare(
        `
          SELECT secondary_color as secondaryColor, timezone, currency, created_at as createdAt, updated_at as updatedAt
          FROM tenant_settings
          WHERE tenant_id = ?
        `,
      )
      .get(tenantId)

    const bookingRules = db
      .prepare(
        `
          SELECT min_notice_minutes as minNoticeMinutes,
                 max_future_days as maxFutureDays,
                 slot_step_minutes as slotStepMinutes,
                 created_at as createdAt,
                 updated_at as updatedAt
          FROM booking_rules
          WHERE tenant_id = ?
        `,
      )
      .get(tenantId)

    res.json({ tenant, settings: settings ?? null, bookingRules: bookingRules ?? null })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/dev/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenantId = z.string().uuid().parse(req.params.tenantId)
    const body = z
      .object({
        name: z.string().min(2).optional(),
        slug: z
          .string()
          .min(2)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
        primaryColor: z.string().min(4).optional(),
        logoUrl: z.string().url().nullable().optional(),
        status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
      })
      .parse(req.body)

    const exists = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId) as
      | { id: string }
      | undefined
    if (!exists) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.name === 'string') updates.push({ sql: 'name = ?', params: [body.name] })
    if (typeof body.primaryColor === 'string')
      updates.push({ sql: 'primary_color = ?', params: [body.primaryColor] })
    if ('logoUrl' in body) updates.push({ sql: 'logo_url = ?', params: [body.logoUrl ?? null] })
    if (typeof body.status === 'string') updates.push({ sql: 'status = ?', params: [body.status] })

    if (typeof body.slug === 'string') {
      const slug = body.slug.trim().toLowerCase()
      assertTenantSlugIsAvailable(slug)
      const taken = db.prepare('SELECT id FROM tenants WHERE slug = ? AND id <> ?').get(slug, tenantId)
      if (taken) return next(badRequest('Slug já existe', 'TENANT_SLUG_TAKEN'))
      updates.push({ sql: 'slug = ?', params: [slug] })
    }

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE tenants SET ${setSql} WHERE id = ?`).run(...params, tenantId)

    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl, status, created_at as createdAt
          FROM tenants
          WHERE id = ?
        `,
      )
      .get(tenantId)

    res.json({ tenant })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/dev/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenantId = z.string().uuid().parse(req.params.tenantId)
    const row = db.prepare('SELECT id, status FROM tenants WHERE id = ?').get(tenantId) as
      | { id: string; status: string }
      | undefined
    if (!row) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const now = new Date().toISOString()
    const tx = db.transaction(() => {
      db.prepare(`UPDATE tenants SET status = 'DISABLED' WHERE id = ?`).run(tenantId)
      revokeSessionsForTenant(db, tenantId)
      db.prepare(`
        UPDATE tenant_domains
        SET status = 'ERROR', is_primary = 0, last_checked_at = ?, verification_error = 'Espaço desativado pela plataforma.'
        WHERE tenant_id = ?
      `).run(now, tenantId)
    })
    tx()

    res.json({ ok: true, mode: 'disabled' })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/tenants/:tenantId/permanent-delete', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenantId = z.string().uuid().parse(req.params.tenantId)
    const body = z.object({ confirmation: z.string().trim().min(1), acknowledgeBackup: z.literal(true) }).parse(req.body)
    const tenant = db.prepare(`SELECT id, slug, name, status FROM tenants WHERE id = ?`).get(tenantId) as { id: string; slug: string; name: string; status: string } | undefined
    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
    if (tenant.status !== 'DISABLED') return next(badRequest('Desative o espaço antes da exclusão definitiva.', 'TENANT_MUST_BE_DISABLED'))
    const expected = `EXCLUIR ${tenant.slug}`
    if (body.confirmation !== expected) return next(badRequest(`Digite exatamente: ${expected}`, 'INVALID_CONFIRMATION'))
    const requestedBy = req.sessionUser?.id
    if (!requestedBy) return next(unauthorized())
    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare(`INSERT INTO tenant_deletion_audit (id, tenant_id, tenant_slug, tenant_name, requested_by_user_id, confirmation_text, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), tenant.id, tenant.slug, tenant.name, requestedBy, body.confirmation, now)
      db.prepare(`DELETE FROM tenants WHERE id = ?`).run(tenant.id)
    })()
    res.json({ ok: true, mode: 'permanent', deletedAt: now })
  } catch (err) { next(err) }
})

app.get('/api/dev/platform-overview', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const totals = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'DISABLED' THEN 1 ELSE 0 END) AS disabled FROM tenants`).get() as { total: number; active: number; disabled: number }
    const subscriptions = db.prepare(`SELECT COUNT(*) AS active FROM subscriptions WHERE status = 'ACTIVE' AND current_period_end > ?`).get(new Date().toISOString()) as { active: number }
    const pendingOrders = db.prepare(`SELECT COUNT(*) AS count FROM infinitepay_orders WHERE status = 'PENDING'`).get() as { count: number }
    const ai = db.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens FROM assistant_usage WHERE request_day >= ?`).get(new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10)) as { requests: number; tokens: number }
    res.json({ totals, activeSubscriptions: subscriptions.active, pendingOrders: pendingOrders.count, ai30d: ai })
  } catch (err) { next(err) }
})

app.get('/api/dev/referrals', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const metrics = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM referral_links WHERE active = 1) as activeLinks,
        (SELECT COUNT(*) FROM referral_redemptions) as totalRedemptions,
        (SELECT COUNT(*) FROM referral_redemptions WHERE status = 'PAID') as paidRedemptions,
        (SELECT COALESCE(SUM(discount_amount_cents), 0) FROM referral_redemptions WHERE status = 'PAID') as grantedDiscountCents,
        (SELECT COUNT(*) FROM referral_credits WHERE status = 'AVAILABLE') as availableCredits
    `).get() as { activeLinks: number; totalRedemptions: number; paidRedemptions: number; grantedDiscountCents: number; availableCredits: number }
    const links = db.prepare(`
      SELECT rl.id, rl.label, rl.token, rl.invitee_discount_percent as inviteeDiscountPercent,
             rl.referrer_reward_percent as referrerRewardPercent, rl.max_redemptions as maxRedemptions,
             rl.redemptions_count as redemptionsCount, rl.expires_at as expiresAt, rl.active,
             rl.created_at as createdAt, t.name as ownerName
      FROM referral_links rl
      LEFT JOIN tenants t ON t.id = rl.owner_tenant_id
      ORDER BY rl.created_at DESC LIMIT 100
    `).all() as Array<{ id: string; label: string; token: string; inviteeDiscountPercent: number; referrerRewardPercent: number; maxRedemptions: number; redemptionsCount: number; expiresAt: string | null; active: number; createdAt: string; ownerName: string | null }>
    const recent = db.prepare(`
      SELECT rr.id, rr.status, rr.gross_amount_cents as grossAmountCents,
             rr.discount_amount_cents as discountAmountCents, rr.created_at as createdAt,
             rr.paid_at as paidAt, invited.name as invitedName, owner.name as ownerName
      FROM referral_redemptions rr
      JOIN referral_links rl ON rl.id = rr.link_id
      JOIN tenants invited ON invited.id = rr.invited_tenant_id
      LEFT JOIN tenants owner ON owner.id = rl.owner_tenant_id
      ORDER BY rr.created_at DESC LIMIT 100
    `).all()
    res.json({ metrics, links: links.map((link) => ({ ...link, active: Boolean(link.active), url: publicReferralUrl(link.token) })), recent })
  } catch (err) { next(err) }
})

app.post('/api/dev/referrals/links', requireDevHost, referralMutationLimiter, requireRole('DEV'), (req, res, next) => {
  try {
    const userId = req.sessionUser?.id
    if (!userId) throw unauthorized()
    const body = z.object({
      label: z.string().trim().min(2).max(120),
      inviteeDiscountPercent: z.number().int().min(0).max(100),
      referrerRewardPercent: z.number().int().min(0).max(30).default(0),
      maxRedemptions: z.number().int().min(1).max(100000).default(1),
      expiresAt: z.string().datetime().nullable().optional().default(null),
      confirmation: z.string().optional(),
    }).parse(req.body ?? {})
    if (body.inviteeDiscountPercent === 100 && body.confirmation !== 'GERAR 100%') {
      throw badRequest('Confirme exatamente “GERAR 100%”.', 'HIGH_DISCOUNT_CONFIRMATION_REQUIRED')
    }
    const policy = highValueLinkPolicy(body)
    if (policy.expiresAt && Date.parse(policy.expiresAt) <= Date.now()) throw badRequest('A validade precisa estar no futuro.', 'INVALID_EXPIRY')
    const id = randomUUID()
    const token = referralToken()
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO referral_links (id, owner_tenant_id, created_by_user_id, label, token, invitee_discount_percent, referrer_reward_percent, max_redemptions, expires_at, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, body.label, token, policy.percent, body.referrerRewardPercent, policy.maxRedemptions, policy.expiresAt, now)
    res.json({ link: { id, label: body.label, url: publicReferralUrl(token), inviteeDiscountPercent: policy.percent, referrerRewardPercent: body.referrerRewardPercent, maxRedemptions: policy.maxRedemptions, expiresAt: policy.expiresAt, active: true } })
  } catch (err) { next(err) }
})

app.patch('/api/dev/referrals/links/:id', requireDevHost, referralMutationLimiter, requireRole('DEV'), (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    const body = z.object({ active: z.boolean() }).parse(req.body ?? {})
    const result = db.prepare(`UPDATE referral_links SET active = ? WHERE id = ?`).run(body.active ? 1 : 0, id)
    if (result.changes !== 1) throw notFound('Link não encontrado.', 'REFERRAL_LINK_NOT_FOUND')
    res.json({ ok: true, active: body.active })
  } catch (err) { next(err) }
})

app.get('/api/dev/evolution/config', requireDevHost, requireRole('DEV'), (_req, res, next) => {
  try {
    const config = platformEvolutionConfig()
    res.json({
      config: {
        url: config.baseUrl ?? '',
        instanceName: config.instanceName,
        hasApiKey: Boolean(config.apiKey),
      },
    })
  } catch (err) {
    next(err)
  }
})

app.put('/api/dev/evolution/config', requireDevHost, requireRole('DEV'), async (req, res, next) => {
  try {
    const body = z.object({
      url: z.string().trim().min(1).max(500).optional(),
      apiKey: z.string().trim().min(16).max(500).optional(),
    }).strict().parse(req.body ?? {})
    if (!body.url && !body.apiKey) throw badRequest('Nada para atualizar', 'NO_UPDATES')

    const normalizedUrl = body.url ? await resolveExternalHttpsBaseUrl(body.url) : null
    const now = new Date().toISOString()
    const stmt = db.prepare(`
      INSERT INTO platform_settings (key, value, encrypted, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, encrypted = excluded.encrypted, updated_at = excluded.updated_at
    `)
    db.transaction(() => {
      if (normalizedUrl) stmt.run('evolution_api_url', normalizedUrl, 0, now)
      if (body.apiKey) stmt.run('evolution_api_key', encryptSecret(body.apiKey, evolutionPlatformSecretPurpose), 1, now)
      stmt.run('evolution_instance_name', platformEvolutionDefaultInstanceName, 0, now)
    })()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/evolution/status', requireDevHost, requireRole('DEV'), async (_req, res, next) => {
  try {
    const config = platformEvolutionConfig()
    if (!config.baseUrl || !config.apiKey) {
      res.json({ state: 'NOT_CONFIGURED', instanceName: config.instanceName })
      return
    }
    const response = await fetch(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/instance/connectionState/${encodeURIComponent(config.instanceName)}`, {
      headers: { apikey: config.apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null)
    if (!response) {
      res.json({ state: 'OFFLINE', instanceName: config.instanceName })
      return
    }
    const raw = await response.json().catch(() => null)
    const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const instance = root.instance && typeof root.instance === 'object' ? root.instance as Record<string, unknown> : {}
    const state = normalizeEvolutionConnectionState(instance.state ?? root.state) ?? (response.ok ? 'UNKNOWN' : 'OFFLINE')
    res.json({ state, instanceName: config.instanceName })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/evolution/connect', requireDevHost, requireRole('DEV'), async (_req, res, next) => {
  try {
    const config = platformEvolutionConfig()
    if (!config.baseUrl || !config.apiKey) throw badRequest('Configure URL e API Key da Evolution primeiro.', 'EVOLUTION_GLOBAL_NOT_CONFIGURED')
    const baseUrl = await resolveExternalHttpsBaseUrl(config.baseUrl)
    const headers = { apikey: config.apiKey, 'Content-Type': 'application/json' }
    const encodedInstance = encodeURIComponent(config.instanceName)
    const connectUrl = `${baseUrl}/instance/connect/${encodedInstance}`

    const stateResponse = await fetch(`${baseUrl}/instance/connectionState/${encodedInstance}`, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null)
    const stateRaw = stateResponse ? await stateResponse.json().catch(() => null) : null
    const stateRoot = stateRaw && typeof stateRaw === 'object' ? stateRaw as Record<string, unknown> : {}
    const stateInstance = stateRoot.instance && typeof stateRoot.instance === 'object' ? stateRoot.instance as Record<string, unknown> : {}
    const currentState = normalizeEvolutionConnectionState(stateInstance.state ?? stateRoot.state)

    if (currentState === 'CONNECTED') {
      const restartResponse = await fetch(`${baseUrl}/instance/restart/${encodedInstance}`, {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      }).catch(() => null)
      if (!restartResponse?.ok) throw badRequest('Não foi possível reconectar a instância global.', 'EVOLUTION_GLOBAL_RECONNECT_FAILED')
      const restartRaw = await restartResponse.json().catch(() => null)
      const restartRoot = restartRaw && typeof restartRaw === 'object' ? restartRaw as Record<string, unknown> : {}
      const restartInstance = restartRoot.instance && typeof restartRoot.instance === 'object' ? restartRoot.instance as Record<string, unknown> : {}
      const restartState = normalizeEvolutionConnectionState(restartInstance.status ?? restartInstance.state ?? restartRoot.state) ?? 'CONNECTING'
      res.json({ state: restartState, qrCode: null, instanceName: config.instanceName })
      return
    }

    let response = await fetch(connectUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(12_000) }).catch(() => null)
    let raw = response ? await response.json().catch(() => null) : null
    let qrCode = extractQrCode(raw)

    if (!response?.ok || !qrCode) {
      const createResponse = await fetch(`${baseUrl}/instance/create`, {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({ instanceName: config.instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
      }).catch(() => null)
      const createRaw = createResponse ? await createResponse.json().catch(() => null) : null
      qrCode = extractQrCode(createRaw)

      if (!createResponse?.ok && !response?.ok) {
        throw badRequest('Não foi possível criar ou conectar a instância global.', 'EVOLUTION_GLOBAL_CONNECT_FAILED')
      }
      if (!qrCode) {
        response = await fetch(connectUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(12_000) }).catch(() => null)
        raw = response ? await response.json().catch(() => null) : null
        qrCode = extractQrCode(raw)
      }
    }

    res.json({ state: qrCode ? 'QR_SCAN' : 'CONNECTING', qrCode, instanceName: config.instanceName })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/dev/evolution/disconnect', requireDevHost, requireRole('DEV'), async (_req, res, next) => {
  try {
    const config = platformEvolutionConfig()
    if (!config.baseUrl || !config.apiKey) throw badRequest('Evolution API Global não configurada.', 'EVOLUTION_GLOBAL_NOT_CONFIGURED')
    const response = await fetch(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/instance/logout/${encodeURIComponent(config.instanceName)}`, {
      method: 'DELETE',
      headers: { apikey: config.apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(12_000),
    }).catch(() => null)
    if (!response?.ok) throw badRequest('Não foi possível desconectar a instância global.', 'EVOLUTION_GLOBAL_DISCONNECT_FAILED')
    res.json({ ok: true, state: 'DISCONNECTED' })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/test-mode', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    if (env.NODE_ENV === 'production') {
      throw forbidden('Modo de teste é bloqueado em produção.', 'TEST_MODE_DISABLED')
    }
    const body = z.object({ enabled: z.boolean() }).parse(req.body)
    const now = new Date().toISOString()
    
    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('test_mode', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(body.enabled), now)

    res.json({ ok: true, enabled: body.enabled })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/notifications', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const limit = 20
    const events = db.prepare(`
      SELECT id, event_type as eventType, payload_json as payload, received_at as receivedAt
      FROM payment_events
      WHERE event_type IN ('payment_approved', 'order_created', 'OrderCreated', 'PaymentApproved')
      ORDER BY received_at DESC
      LIMIT ?
    `).all(limit) as Array<{ id: string; eventType: string; payload: string; receivedAt: string }>

    const notifications = events.map((e) => {
      const data: Record<string, unknown> = (() => {
        try {
          const parsed: unknown = JSON.parse(e.payload)
          if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
          return {}
        } catch {
          return {}
        }
      })()

      const customerRaw = data.customer
      const customer =
        customerRaw && typeof customerRaw === 'object' ? (customerRaw as Record<string, unknown>) : null
      const firstName = customer && typeof customer.firstname === 'string' ? customer.firstname : ''
      const lastName = customer && typeof customer.lastname === 'string' ? customer.lastname : ''
      const customerName = firstName ? `${firstName} ${lastName}`.trim() : 'Cliente'

      const totalRaw = data.total
      let totalNumber: number | null = null
      if (typeof totalRaw === 'number' && Number.isFinite(totalRaw)) totalNumber = totalRaw
      if (typeof totalRaw === 'string') {
        const n = Number(totalRaw)
        if (Number.isFinite(n)) totalNumber = n
      }
      const total = totalNumber !== null ? (totalNumber / 100).toFixed(2) : '0.00'

      return {
        id: e.id,
        title:
          e.eventType === 'payment_approved' || e.eventType === 'PaymentApproved'
            ? 'Pagamento Aprovado'
            : 'Novo Pedido',
        desc: `${customerName} - R$ ${total}`,
        time: e.receivedAt,
        type: e.eventType,
      }
    })

    res.json({ notifications })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/backup/export', requireDevHost, devBackupExportLimiter, requireRole('DEV'), async (_req, res, next) => {
  const exportPath = path.join(tmpdir(), `lashdesigner-export-${randomUUID()}.db`)
  try {
    await db.backup(exportPath)
    res.download(exportPath, `lashdesigner-backup-${new Date().toISOString().slice(0, 10)}.db`, (err) => {
      try {
        if (existsSync(exportPath)) unlinkSync(exportPath)
      } catch (cleanupError) {
        console.error('[Backup] Temporary export cleanup failed:', cleanupError)
      }
      if (err && !res.headersSent) next(err)
    })
  } catch (err) {
    try {
      if (existsSync(exportPath)) unlinkSync(exportPath)
    } catch {
      // Best-effort cleanup; the original export error is more relevant.
    }
    next(err)
  }
})

// Test Mode: Simulate Payment
app.post('/api/admin/subscription/test-pay', requireRole('ADMIN'), (req, res, next) => {
    try {
        if (env.NODE_ENV === 'production') {
            throw forbidden('Pagamento simulado é bloqueado em produção.', 'TEST_PAYMENT_DISABLED')
        }
        if (!req.sessionUser?.tenantId) return next(badRequest('Tenant inválido'))
        
        const tenantId = req.sessionUser.tenantId
        const now = new Date().toISOString()
        const subId = randomUUID()
        const existing = db.prepare(`SELECT id, current_period_end as currentPeriodEnd FROM subscriptions WHERE tenant_id = ?`).get(tenantId) as { id: string; currentPeriodEnd: string | null } | undefined
        const periodEnd = nextAnnualPeriodEnd(existing?.currentPeriodEnd, new Date(now))

        if (existing) {
            db.prepare(`UPDATE subscriptions SET status = 'ACTIVE', current_period_end = ?, updated_at = ? WHERE tenant_id = ?`).run(periodEnd, now, tenantId)
        } else {
            db.prepare(`INSERT INTO subscriptions (id, tenant_id, status, current_period_end, created_at, updated_at) VALUES (?, ?, 'ACTIVE', ?, ?, ?)`).run(subId, tenantId, periodEnd, now, now)
        }
        
        // Also log a fake event for notifications
        const eventId = randomUUID()
        const payload = JSON.stringify({
            event: 'payment_approved',
            total: 9700,
            customer: {
                firstname: 'Test',
                lastname: 'User',
                email: 'test@example.com'
            }
        })
        db.prepare(`INSERT INTO payment_events (id, event_type, payload_json, received_at) VALUES (?, ?, ?, ?)`).run(eventId, 'payment_approved', payload, now)

        res.json({ ok: true, status: 'ACTIVE' })
    } catch (err) {
        next(err)
    }
})


app.get('/api/public/legal', (_req, res) => {
  res.json(legalPublicConfig())
})

function recordPlatformMarketingChoice(input: { userId: string; tenantId: string | null; granted: boolean; source: string }) {
  const now = new Date().toISOString()
  const current = db.prepare(`SELECT platform_marketing_whatsapp_opt_in as optedIn FROM users WHERE id = ? LIMIT 1`).get(input.userId) as { optedIn: number } | undefined
  if (!current) throw notFound('Usuário não encontrado', 'USER_NOT_FOUND')
  const alreadyGranted = Boolean(current.optedIn)
  const action = input.granted ? 'GRANTED' : (alreadyGranted ? 'WITHDRAWN' : 'DECLINED')
  db.prepare(`
    UPDATE users
    SET platform_marketing_whatsapp_opt_in = ?,
        platform_marketing_whatsapp_opt_in_at = CASE WHEN ? = 1 THEN ? ELSE platform_marketing_whatsapp_opt_in_at END,
        platform_marketing_whatsapp_opt_out_at = CASE WHEN ? = 0 THEN ? ELSE NULL END
    WHERE id = ?
  `).run(input.granted ? 1 : 0, input.granted ? 1 : 0, now, input.granted ? 1 : 0, now, input.userId)
  db.prepare(`
    INSERT INTO platform_marketing_consent_events
      (id, user_id, tenant_id, channel, action, policy_version, consent_text, source, created_at)
    VALUES (?, ?, ?, 'WHATSAPP', ?, ?, ?, ?, ?)
  `).run(randomUUID(), input.userId, input.tenantId, action, PLATFORM_MARKETING_WHATSAPP_VERSION, PLATFORM_MARKETING_WHATSAPP_TEXT, input.source, now)
  return { whatsappPromotions: input.granted, changed: alreadyGranted !== input.granted }
}

function recordLegalAcceptance(input: { userId: string; tenantId: string | null; source: string; req: Request }) {
  const now = new Date().toISOString()
  const evidence = legalEvidenceFingerprint(input.req)
  db.prepare(`
    INSERT INTO user_legal_acceptances
      (id, user_id, tenant_id, bundle_version, bundle_hash, terms_version, privacy_version, source, ip_hash, user_agent_hash, snapshot_json, accepted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), input.userId, input.tenantId, LEGAL_BUNDLE_VERSION, currentLegalBundleHash(), TERMS_VERSION, PRIVACY_VERSION, input.source, evidence.ipHash, evidence.userAgentHash, legalAcceptanceSnapshot(), now)
}

// Billing catalog: valores sempre vêm do servidor para evitar divergência comercial.
app.get('/api/public/billing/plans', (_req, res) => {
  res.json({ plans: billingPlans, checkoutProvider: 'INFINITEPAY', methods: ['PIX', 'CARD'] })
})

app.get('/api/public/referrals/:token', (req, res, next) => {
  try {
    const token = z.string().min(20).max(80).parse(req.params.token)
    const now = new Date().toISOString()
    const link = db.prepare(`
      SELECT label, invitee_discount_percent as inviteeDiscountPercent, expires_at as expiresAt,
             max_redemptions as maxRedemptions, redemptions_count as redemptionsCount
      FROM referral_links
      WHERE token = ? AND active = 1 AND redemptions_count < max_redemptions
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `).get(token, now) as { label: string; inviteeDiscountPercent: number; expiresAt: string | null; maxRedemptions: number; redemptionsCount: number } | undefined
    if (!link) return next(notFound('Link de indicação inválido ou expirado.', 'REFERRAL_NOT_FOUND'))
    res.json({ referral: { label: link.label, inviteeDiscountPercent: link.inviteeDiscountPercent, expiresAt: link.expiresAt } })
  } catch (err) { next(err) }
})

app.post('/api/public/onboarding/checkout', publicCheckoutLimiter, publicCheckoutEmailLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      ownerName: z.string().trim().min(2).max(100),
      studioName: z.string().trim().min(2).max(120),
      slug: z.string().trim().toLowerCase().min(2).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      email: z.string().email().transform((value) => value.toLowerCase()),
      phone: z.string().min(8).max(40),
      password: z.string().min(8).max(128),
      cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).default('ANNUAL'),
      referralToken: z.string().trim().min(20).max(80).optional(),
      legal: z.object({
        accepted: z.literal(true),
        termsVersion: z.string().max(80),
        privacyVersion: z.string().max(80),
        bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
      }).strict(),
      platformMarketingWhatsapp: z.boolean().optional().default(false),
    }).parse(req.body ?? {})
    if (body.legal.termsVersion !== TERMS_VERSION || body.legal.privacyVersion !== PRIVACY_VERSION || body.legal.bundleHash !== currentLegalBundleHash()) {
      throw badRequest('Os documentos legais foram atualizados. Revise os Termos e a Política de Privacidade antes de continuar.', 'LEGAL_VERSION_STALE')
    }
    assertTenantSlugIsAvailable(body.slug)
    if (db.prepare(`SELECT 1 FROM tenants WHERE slug = ? LIMIT 1`).get(body.slug)) throw badRequest('Esse endereço já está em uso.', 'TENANT_SLUG_TAKEN')
    if (db.prepare(`SELECT 1 FROM users WHERE email = ? AND tenant_id IS NULL LIMIT 1`).get(body.email)) throw badRequest('Use outro e-mail para criar o espaço.', 'EMAIL_ALREADY_USED')
    const plan = billingPlanByCycle.get(body.cycle as BillingCycle)
    if (!plan) throw badRequest('Plano inválido.', 'INVALID_PLAN')

    const now = new Date().toISOString()
    const link = body.referralToken ? db.prepare(`
      SELECT id, owner_tenant_id as ownerTenantId, invitee_discount_percent as inviteeDiscountPercent,
             referrer_reward_percent as referrerRewardPercent
      FROM referral_links
      WHERE token = ? AND active = 1 AND redemptions_count < max_redemptions
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `).get(body.referralToken, now) as { id: string; ownerTenantId: string | null; inviteeDiscountPercent: number; referrerRewardPercent: number } | undefined : undefined
    if (body.referralToken && !link) throw badRequest('Link de indicação inválido ou expirado.', 'REFERRAL_INVALID')
    if (link?.ownerTenantId && db.prepare(`SELECT 1 FROM users WHERE tenant_id = ? AND lower(email) = ? LIMIT 1`).get(link.ownerTenantId, body.email)) {
      throw badRequest('O link não pode ser usado pela própria conta que indicou.', 'SELF_REFERRAL')
    }

    const quote = subscriptionCheckoutQuote(plan, link?.inviteeDiscountPercent ?? 0, true)
    const tenantId = randomUUID()
    const userId = randomUUID()
    const orderId = randomUUID()
    const orderNsu = `ld-public-${body.cycle.toLowerCase()}-${orderId}`
    const redemptionId = link ? randomUUID() : null
    const passwordHash = await hashPassword(body.password)
    const phone = normalizeUserE164Phone(body.phone)
    const periodEnd = nextBillingPeriodEnd(null, plan.months, new Date(now))

    db.transaction(() => {
      if (link) {
        const consumed = db.prepare(`UPDATE referral_links SET redemptions_count = redemptions_count + 1 WHERE id = ? AND active = 1 AND redemptions_count < max_redemptions AND (expires_at IS NULL OR expires_at > ?)`)
          .run(link.id, now)
        if (consumed.changes !== 1) throw badRequest('Link de indicação esgotado.', 'REFERRAL_EXHAUSTED')
      }
      db.prepare(`INSERT INTO tenants (id, slug, name, primary_color, logo_url, status, created_at) VALUES (?, ?, ?, '#972d57', NULL, ?, ?)`)
        .run(tenantId, body.slug, body.studioName, quote.amountCents === 0 ? 'ACTIVE' : 'ONBOARDING', now)
      db.prepare(`INSERT INTO tenant_settings (tenant_id, secondary_color, timezone, currency, created_at, updated_at) VALUES (?, '#2d2028', 'America/Sao_Paulo', 'BRL', ?, ?)`)
        .run(tenantId, now, now)
      db.prepare(`INSERT INTO tenant_onboarding (tenant_id, status, current_step, answers_json, created_at, updated_at) VALUES (?, 'PENDING', 0, '{}', ?, ?)`)
        .run(tenantId, now, now)
      db.prepare(`INSERT INTO booking_rules (tenant_id, min_notice_minutes, max_future_days, slot_step_minutes, created_at, updated_at) VALUES (?, 60, 60, 30, ?, ?)`)
        .run(tenantId, now, now)
      const hours = db.prepare(`INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      for (const weekday of [1, 2, 3, 4, 5]) hours.run(randomUUID(), tenantId, weekday, 9 * 60, 18 * 60, now)
      hours.run(randomUUID(), tenantId, 6, 9 * 60, 14 * 60, now)
      db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at) VALUES (?, ?, ?, ?, ?, 'ADMIN', ?)`)
        .run(userId, tenantId, body.email, passwordHash, phone, now)
      recordLegalAcceptance({ userId, tenantId, source: 'PUBLIC_CHECKOUT', req })
      recordPlatformMarketingChoice({ userId, tenantId, granted: body.platformMarketingWhatsapp, source: 'PUBLIC_CHECKOUT' })
      db.prepare(`INSERT INTO infinitepay_orders (id, tenant_id, order_nsu, amount_cents, gross_amount_cents, discount_amount_cents, billing_cycle, period_months, status, capture_method, created_at, paid_at, referral_redemption_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(orderId, tenantId, orderNsu, quote.amountCents, quote.grossAmountCents, quote.discountAmountCents, plan.cycle, plan.months, quote.amountCents === 0 ? 'PAID' : 'PENDING', quote.amountCents === 0 ? 'ADMIN_DISCOUNT' : null, now, quote.amountCents === 0 ? now : null, redemptionId)
      if (link && redemptionId) {
        db.prepare(`INSERT INTO referral_redemptions (id, link_id, invited_tenant_id, order_nsu, status, gross_amount_cents, discount_amount_cents, referrer_reward_percent, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(redemptionId, link.id, tenantId, orderNsu, quote.amountCents === 0 ? 'PAID' : 'PENDING', quote.grossAmountCents, quote.discountAmountCents, link.referrerRewardPercent, now, quote.amountCents === 0 ? now : null)
      }
      if (quote.amountCents === 0) {
        db.prepare(`INSERT INTO subscriptions (id, tenant_id, external_id, status, current_period_end, billing_cycle, plan_code, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, 'PRO', ?, ?)`)
          .run(randomUUID(), tenantId, `discount:${orderNsu}`, periodEnd, plan.cycle, now, now)
      }
    })()

    if (quote.amountCents === 0) {
      return res.json({ activated: true, workspaceSlug: body.slug, orderNsu, discount: quote })
    }

    try {
      const rootOrigin = new URL(env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).origin
      const checkoutUrl = await createInfinitePayLink({
        orderNsu,
        amountCents: quote.amountCents,
        customerName: body.ownerName,
        customerEmail: body.email,
        planLabel: plan.label,
        months: plan.months,
        redirectUrl: `${rootOrigin}/?checkout=return&workspace=${encodeURIComponent(body.slug)}`,
      })
      db.prepare(`UPDATE infinitepay_orders SET checkout_url = ? WHERE id = ?`).run(checkoutUrl, orderId)
      return res.json({ activated: false, url: checkoutUrl, workspaceSlug: body.slug, orderNsu, discount: quote })
    } catch (error) {
      db.transaction(() => {
        db.prepare(`UPDATE infinitepay_orders SET status = 'FAILED' WHERE id = ?`).run(orderId)
        if (redemptionId && link) {
          db.prepare(`UPDATE referral_redemptions SET status = 'CANCELLED' WHERE id = ? AND status = 'PENDING'`).run(redemptionId)
          db.prepare(`UPDATE referral_links SET redemptions_count = MAX(0, redemptions_count - 1) WHERE id = ?`).run(link.id)
        }
        // A conta ainda não foi entregue e não existe pagamento: libere slug e
        // credenciais para que a compradora possa tentar novamente sem suporte.
        db.prepare(`DELETE FROM tenants WHERE id = ? AND status = 'ONBOARDING' AND NOT EXISTS (SELECT 1 FROM infinitepay_orders WHERE tenant_id = ? AND status = 'PAID')`)
          .run(tenantId, tenantId)
      })()
      throw error
    }
  } catch (err) { next(err) }
})

// InfinitePay subscription checkout
app.get('/api/admin/billing/overview', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const subscription = db.prepare(`
      SELECT id, external_id as externalId, status, current_period_end as currentPeriodEnd,
             billing_cycle as billingCycle, plan_code as planCode,
             created_at as createdAt, updated_at as updatedAt
      FROM subscriptions WHERE tenant_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(tenantId) as {
      id: string
      externalId: string | null
      status: string
      currentPeriodEnd: string | null
      createdAt: string
      updatedAt: string
      billingCycle: string
      planCode: string
    } | undefined
    const orders = db.prepare(`
      SELECT order_nsu as orderNsu, amount_cents as amountCents, status,
             receipt_url as receiptUrl, created_at as createdAt, paid_at as paidAt
      FROM infinitepay_orders
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(tenantId) as Array<{
      orderNsu: string
      amountCents: number
      status: string
      receiptUrl: string | null
      createdAt: string
      paidAt: string | null
    }>
    const availableCredits = db.prepare(`SELECT discount_percent as discountPercent FROM referral_credits WHERE owner_tenant_id = ? AND status = 'AVAILABLE' ORDER BY created_at ASC LIMIT 12`)
      .all(tenantId) as Array<{ discountPercent: number }>
    res.json({ subscription: subscription ?? null, orders, plans: billingPlans, referralDiscountPercent: renewalRewardPercent(availableCredits.map((credit) => credit.discountPercent)), firstMonthPromoEligible: !hasPaidSubscriptionPurchase(tenantId), firstMonthPromoCents: FIRST_MONTH_PROMO_CENTS })
  } catch (err) { next(err) }
})

app.get('/api/admin/subscription/order-status', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const orderNsu = typeof req.query.orderNsu === 'string' ? req.query.orderNsu.trim() : ''
    if (!tenantId || !orderNsu) return next(badRequest('Pedido inválido', 'INVALID_ORDER'))
    const order = db.prepare(`
      SELECT status, paid_at as paidAt
      FROM infinitepay_orders
      WHERE tenant_id = ? AND order_nsu = ?
      LIMIT 1
    `).get(tenantId, orderNsu) as { status: string; paidAt: string | null } | undefined
    if (!order) return next(notFound('Pedido não encontrado', 'ORDER_NOT_FOUND'))
    res.json({ order })
  } catch (err) { next(err) }
})

app.post('/api/admin/subscription/checkout-url', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const sessionUser = req.sessionUser
    if (!tenantId || !sessionUser) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    if (env.NODE_ENV === 'production' && req.resolvedTenant?.id !== tenantId) {
      return next(forbidden('Abra o checkout pelo endereço do seu espaço.', 'TENANT_HOST_REQUIRED'))
    }
    const body = z.object({ cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).default('ANNUAL') }).parse(req.body ?? {})
    const plan = billingPlanByCycle.get(body.cycle as BillingCycle)
    if (!plan) return next(badRequest('Plano inválido', 'INVALID_PLAN'))
    const requestOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin
    const orderId = randomUUID()
    const orderNsu = `ld-${body.cycle.toLowerCase()}-${orderId}`
    const now = new Date().toISOString()
    db.prepare(`UPDATE referral_credits SET status = 'AVAILABLE', applied_order_nsu = NULL, reserved_at = NULL WHERE owner_tenant_id = ? AND status = 'RESERVED' AND reserved_at < ?`)
      .run(tenantId, new Date(Date.now() - 24 * 60 * 60_000).toISOString())
    const availableCredits = db.prepare(`SELECT id, discount_percent as discountPercent FROM referral_credits WHERE owner_tenant_id = ? AND status = 'AVAILABLE' ORDER BY created_at ASC LIMIT 12`)
      .all(tenantId) as Array<{ id: string; discountPercent: number }>
    const rewardPercent = renewalRewardPercent(availableCredits.map((credit) => credit.discountPercent))
    const quote = subscriptionCheckoutQuote(plan, rewardPercent, !hasPaidSubscriptionPurchase(tenantId))
    const appliedRewardPercent = quote.promoApplied ? 0 : rewardPercent
    const reservedIds: string[] = []
    let reservedPercent = 0
    for (const credit of availableCredits) {
      if (reservedPercent >= appliedRewardPercent) break
      reservedIds.push(credit.id)
      reservedPercent += credit.discountPercent
    }

    db.transaction(() => {
      db.prepare(`INSERT INTO infinitepay_orders (id, tenant_id, order_nsu, amount_cents, gross_amount_cents, discount_amount_cents, referrer_discount_percent, billing_cycle, period_months, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`)
        .run(orderId, tenantId, orderNsu, quote.amountCents, quote.grossAmountCents, quote.discountAmountCents, appliedRewardPercent, plan.cycle, plan.months, now)
      const reserve = db.prepare(`UPDATE referral_credits SET status = 'RESERVED', applied_order_nsu = ?, reserved_at = ? WHERE id = ? AND owner_tenant_id = ? AND status = 'AVAILABLE'`)
      for (const id of reservedIds) reserve.run(orderNsu, now, id, tenantId)
    })()

    const account = db.prepare(`SELECT email FROM users WHERE id = ?`).get(sessionUser.id) as { email: string } | undefined
    const email = account?.email || 'cliente@lashdesigner.local'
    try {
      const checkoutUrl = await createInfinitePayLink({
        orderNsu,
        amountCents: quote.amountCents,
        customerName: email.split('@')[0],
        customerEmail: email,
        planLabel: plan.label,
        months: plan.months,
        redirectUrl: `${requestOrigin}/admin?payment=return`,
      })
      db.prepare(`UPDATE infinitepay_orders SET checkout_url = ? WHERE id = ?`).run(checkoutUrl, orderId)
      res.json({ url: checkoutUrl, orderNsu, discount: { percent: quote.discountPercent, amountCents: quote.discountAmountCents }, promoApplied: quote.promoApplied })
    } catch (error) {
      db.transaction(() => {
        db.prepare(`UPDATE infinitepay_orders SET status = 'FAILED' WHERE id = ?`).run(orderId)
        db.prepare(`UPDATE referral_credits SET status = 'AVAILABLE', applied_order_nsu = NULL, reserved_at = NULL WHERE owner_tenant_id = ? AND applied_order_nsu = ? AND status = 'RESERVED'`).run(tenantId, orderNsu)
      })()
      throw error
    }
  } catch (err) { next(err) }
})


app.post('/api/admin/assistant/credits/checkout-url', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const sessionUser = req.sessionUser
    if (!tenantId || !sessionUser) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    if (env.NODE_ENV === 'production' && req.resolvedTenant?.id !== tenantId) {
      return next(forbidden('Abra a compra de créditos pelo endereço do seu espaço.', 'TENANT_HOST_REQUIRED'))
    }

    const body = z.object({ packId: z.enum(['starter', 'growth', 'power']) }).parse(req.body ?? {})
    const pack = lumaCreditPackById.get(body.packId)
    if (!pack) return next(badRequest('Pacote de créditos inválido.', 'INVALID_LUMA_CREDIT_PACK'))

    const account = db.prepare(`SELECT email FROM users WHERE id = ?`).get(sessionUser.id) as { email: string } | undefined
    const email = account?.email || 'cliente@lashdesigner.local'
    const requestOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin
    const orderId = randomUUID()
    const orderNsu = `ld-luma-${pack.id}-${orderId}`
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO assistant_credit_orders (
        id, tenant_id, user_id, order_nsu, pack_id, credits, amount_cents, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
    `).run(orderId, tenantId, sessionUser.id, orderNsu, pack.id, pack.credits, pack.amountCents, now)

    try {
      const checkoutUrl = await createInfinitePayLink({
        orderNsu,
        amountCents: pack.amountCents,
        customerName: email.split('@')[0],
        customerEmail: email,
        planLabel: 'Luma',
        months: 1,
        itemDescription: `Luma — ${pack.credits} créditos extras (1 crédito = 1 mensagem, sem expiração)`,
        redirectUrl: `${requestOrigin}/admin?lumaCredits=return`,
      })
      db.prepare(`UPDATE assistant_credit_orders SET checkout_url = ? WHERE id = ?`).run(checkoutUrl, orderId)
      return res.json({ url: checkoutUrl, orderNsu, pack })
    } catch (error) {
      db.prepare(`UPDATE assistant_credit_orders SET status = 'FAILED' WHERE id = ? AND status = 'PENDING'`).run(orderId)
      throw error
    }
  } catch (err) { next(err) }
})

app.get('/api/admin/assistant/credits/order-status', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const orderNsu = typeof req.query.orderNsu === 'string' ? req.query.orderNsu.trim() : ''
    if (!tenantId || !orderNsu) return next(badRequest('Pedido inválido', 'INVALID_ORDER'))
    const order = db.prepare(`
      SELECT status, credits, amount_cents as amountCents, paid_at as paidAt
      FROM assistant_credit_orders
      WHERE tenant_id = ? AND order_nsu = ?
      LIMIT 1
    `).get(tenantId, orderNsu) as { status: string; credits: number; amountCents: number; paidAt: string | null } | undefined
    if (!order) return next(notFound('Pedido não encontrado', 'ORDER_NOT_FOUND'))
    return res.json({ order, balance: lumaExtraCreditBalance(tenantId) })
  } catch (err) { next(err) }
})

app.post('/api/webhooks/infinitepay', infinitePayWebhookLimiter, async (req, res) => {
  const eventHash = infinitePayWebhookHash(req.body)
  const parsedBody = infinitePayWebhookPayloadSchema.safeParse(req.body ?? {})
  const candidateOrderNsu = typeof req.body?.order_nsu === 'string' ? req.body.order_nsu.slice(0, 200) : null
  if (!parsedBody.success) {
    logInfinitePayWebhookEvent({ orderNsu: candidateOrderNsu, eventHash, outcome: 'REJECTED', errorCode: 'INVALID_PAYLOAD' })
    return res.status(400).json({ success: false, message: 'Payload inválido' })
  }
  if (!env.INFINITEPAY_HANDLE) {
    logInfinitePayWebhookEvent({ orderNsu: parsedBody.data.order_nsu, eventHash, outcome: 'ERROR', errorCode: 'NOT_CONFIGURED' })
    return res.status(503).json({ success: false, message: 'InfinitePay não configurada' })
  }

  const body = parsedBody.data
  const orderNsu = body.order_nsu
  const transactionNsu = body.transaction_nsu
  const amount = body.amount
  const invoiceSlug = body.invoice_slug || body.slug!
  const receiptUrl = safeInfinitePayReceiptUrl(body.receipt_url)

  const creditOrder = db.prepare(`
    SELECT id, tenant_id as tenantId, user_id as userId, amount_cents as amountCents,
           credits, status
    FROM assistant_credit_orders
    WHERE order_nsu = ?
  `).get(orderNsu) as { id: string; tenantId: string; userId: string; amountCents: number; credits: number; status: string } | undefined

  if (creditOrder) {
    if (creditOrder.amountCents !== amount) {
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REJECTED', errorCode: 'AMOUNT_MISMATCH' })
      return res.status(400).json({ success: false, message: 'Pedido não encontrado ou valor inválido' })
    }
    if (creditOrder.status === 'PAID') {
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REPLAY_IGNORED' })
      return res.json({ success: true, message: null })
    }
    if (creditOrder.status !== 'PENDING') {
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REJECTED', errorCode: 'ORDER_NOT_PENDING' })
      return res.status(400).json({ success: false, message: 'Pedido não está pendente' })
    }

    try {
      const checked = await verifyInfinitePayPayment({ orderNsu, transactionNsu, invoiceSlug, expectedAmountCents: creditOrder.amountCents })
      const now = new Date().toISOString()
      const credited = db.transaction(() => {
        const updated = db.prepare(`
          UPDATE assistant_credit_orders
          SET status = 'PAID', transaction_nsu = ?, invoice_slug = ?, receipt_url = ?, capture_method = ?, paid_at = ?
          WHERE id = ? AND status = 'PENDING'
        `).run(transactionNsu, invoiceSlug, receiptUrl, checked.capture_method || '', now, creditOrder.id)
        if (updated.changes !== 1) return false
        db.prepare(`
          INSERT INTO assistant_message_credit_ledger (
            id, tenant_id, user_id, delta_messages, source, note, reference_order_nsu, created_at
          ) VALUES (?, ?, ?, ?, 'PURCHASE', ?, ?, ?)
        `).run(randomUUID(), creditOrder.tenantId, creditOrder.userId, creditOrder.credits, `Compra de ${creditOrder.credits} créditos extras da Luma`, orderNsu, now)
        return true
      })()
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: credited ? 'APPLIED' : 'REPLAY_IGNORED' })
      return res.json({ success: true, message: null, credited: credited ? creditOrder.credits : 0 })
    } catch (err) {
      console.error('[InfinitePay credits verification]', err instanceof Error ? err.message : 'verification failed')
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'ERROR', errorCode: 'PAYMENT_CHECK_FAILED' })
      return res.status(400).json({ success: false, message: 'Falha ao confirmar pagamento' })
    }
  }

  const order = db.prepare(`
    SELECT id, tenant_id as tenantId, amount_cents as amountCents, status,
           billing_cycle as billingCycle, period_months as periodMonths,
           referral_redemption_id as referralRedemptionId
    FROM infinitepay_orders
    WHERE order_nsu = ?
  `).get(orderNsu) as { id: string; tenantId: string; amountCents: number; status: string; billingCycle: BillingCycle; periodMonths: number; referralRedemptionId: string | null } | undefined

  if (!order || order.amountCents !== amount) {
    logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REJECTED', errorCode: order ? 'AMOUNT_MISMATCH' : 'ORDER_NOT_FOUND' })
    return res.status(400).json({ success: false, message: 'Pedido não encontrado ou valor inválido' })
  }
  if (order.status === 'PAID') {
    logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REPLAY_IGNORED' })
    return res.json({ success: true, message: null })
  }
  if (order.status !== 'PENDING') {
    logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REJECTED', errorCode: 'ORDER_NOT_PENDING' })
    return res.status(400).json({ success: false, message: 'Pedido não está pendente' })
  }

  try {
    const checked = await verifyInfinitePayPayment({ orderNsu, transactionNsu, invoiceSlug, expectedAmountCents: order.amountCents })
    const now = new Date().toISOString()
    const applied = db.transaction(() => {
      const updated = db.prepare(`
        UPDATE infinitepay_orders
        SET status = 'PAID', transaction_nsu = ?, invoice_slug = ?, receipt_url = ?, capture_method = ?, paid_at = ?
        WHERE id = ? AND status = 'PENDING'
      `).run(transactionNsu, invoiceSlug, receiptUrl, checked.capture_method || '', now, order.id)
      if (updated.changes !== 1) return false

      const existing = db.prepare(`SELECT id, current_period_end as currentPeriodEnd FROM subscriptions WHERE tenant_id = ?`).get(order.tenantId) as { id: string; currentPeriodEnd: string | null } | undefined
      const periodEnd = nextBillingPeriodEnd(existing?.currentPeriodEnd, order.periodMonths || 12, new Date(now))
      if (existing) {
        db.prepare(`UPDATE subscriptions SET status = 'ACTIVE', current_period_end = ?, external_id = ?, billing_cycle = ?, plan_code = 'PRO', updated_at = ? WHERE tenant_id = ?`)
          .run(periodEnd, transactionNsu, order.billingCycle || 'ANNUAL', now, order.tenantId)
      } else {
        db.prepare(`INSERT INTO subscriptions (id, tenant_id, external_id, status, current_period_end, billing_cycle, plan_code, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, 'PRO', ?, ?)`)
          .run(randomUUID(), order.tenantId, transactionNsu, periodEnd, order.billingCycle || 'ANNUAL', now, now)
      }
      db.prepare(`UPDATE tenants SET status = 'ACTIVE' WHERE id = ? AND status = 'ONBOARDING'`).run(order.tenantId)
      db.prepare(`UPDATE referral_credits SET status = 'APPLIED', applied_at = ?, reserved_at = NULL WHERE owner_tenant_id = ? AND applied_order_nsu = ? AND status = 'RESERVED'`)
        .run(now, order.tenantId, orderNsu)
      if (order.referralRedemptionId) {
        const redemption = db.prepare(`
          SELECT rr.id, rr.referrer_reward_percent as rewardPercent, rl.owner_tenant_id as ownerTenantId
          FROM referral_redemptions rr
          JOIN referral_links rl ON rl.id = rr.link_id
          WHERE rr.id = ? AND rr.status = 'PENDING'
        `).get(order.referralRedemptionId) as { id: string; rewardPercent: number; ownerTenantId: string | null } | undefined
        if (redemption) {
          db.prepare(`UPDATE referral_redemptions SET status = 'PAID', paid_at = ? WHERE id = ? AND status = 'PENDING'`).run(now, redemption.id)
          if (redemption.ownerTenantId && redemption.ownerTenantId !== order.tenantId && redemption.rewardPercent > 0) {
            db.prepare(`INSERT OR IGNORE INTO referral_credits (id, owner_tenant_id, redemption_id, discount_percent, status, created_at) VALUES (?, ?, ?, ?, 'AVAILABLE', ?)`)
              .run(randomUUID(), redemption.ownerTenantId, redemption.id, Math.min(30, redemption.rewardPercent), now)
          }
        }
      }
      return true
    })()
    logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: applied ? 'APPLIED' : 'REPLAY_IGNORED' })
    return res.json({ success: true, message: null })
  } catch (err) {
    console.error('[InfinitePay verification]', err instanceof Error ? err.message : 'verification failed')
    logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'ERROR', errorCode: 'PAYMENT_CHECK_FAILED' })
    return res.status(400).json({ success: false, message: 'Falha ao confirmar pagamento' })
  }
})

// Middleware for admin routes - Check Subscription
app.use('/api/admin', requireActiveSubscription)

app.get('/api/admin/referrals/overview', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) throw badRequest('Tenant inválido.', 'INVALID_TENANT')
    const link = db.prepare(`
      SELECT id, token, invitee_discount_percent as inviteeDiscountPercent,
             referrer_reward_percent as referrerRewardPercent, redemptions_count as redemptionsCount,
             max_redemptions as maxRedemptions, active, created_at as createdAt
      FROM referral_links
      WHERE owner_tenant_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(tenantId) as { id: string; token: string; inviteeDiscountPercent: number; referrerRewardPercent: number; redemptionsCount: number; maxRedemptions: number; active: number; createdAt: string } | undefined
    const metrics = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN rr.status = 'PAID' THEN 1 ELSE 0 END) as paid,
             COALESCE(SUM(CASE WHEN rr.status = 'PAID' THEN rr.discount_amount_cents ELSE 0 END), 0) as customerSavingsCents
      FROM referral_redemptions rr
      JOIN referral_links rl ON rl.id = rr.link_id
      WHERE rl.owner_tenant_id = ?
    `).get(tenantId) as { total: number; paid: number | null; customerSavingsCents: number }
    const credits = db.prepare(`SELECT discount_percent as discountPercent, status, created_at as createdAt FROM referral_credits WHERE owner_tenant_id = ? ORDER BY created_at DESC LIMIT 30`)
      .all(tenantId) as Array<{ discountPercent: number; status: string; createdAt: string }>
    res.json({
      link: link ? { ...link, active: Boolean(link.active), url: publicReferralUrl(link.token) } : null,
      metrics: { total: metrics.total, paid: metrics.paid ?? 0, customerSavingsCents: metrics.customerSavingsCents },
      credits,
      rules: { inviteeDiscountPercent: DEFAULT_INVITEE_DISCOUNT_PERCENT, referrerRewardPercent: DEFAULT_REFERRER_REWARD_PERCENT, renewalCapPercent: 30 },
    })
  } catch (err) { next(err) }
})

app.post('/api/admin/referrals/link', referralMutationLimiter, requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const userId = req.sessionUser?.id
    if (!tenantId || !userId) throw badRequest('Tenant inválido.', 'INVALID_TENANT')
    const existing = db.prepare(`SELECT id, token FROM referral_links WHERE owner_tenant_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1`)
      .get(tenantId) as { id: string; token: string } | undefined
    if (existing) return res.json({ id: existing.id, url: publicReferralUrl(existing.token), reused: true })
    const tenant = db.prepare(`SELECT name FROM tenants WHERE id = ?`).get(tenantId) as { name: string } | undefined
    const id = randomUUID()
    const token = referralToken()
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO referral_links (id, owner_tenant_id, created_by_user_id, label, token, invitee_discount_percent, referrer_reward_percent, max_redemptions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 100000, ?)`)
      .run(id, tenantId, userId, `Indicação de ${tenant?.name || 'uma cliente Lash Designer'}`, token, DEFAULT_INVITEE_DISCOUNT_PERCENT, DEFAULT_REFERRER_REWARD_PERCENT, now)
    res.json({ id, url: publicReferralUrl(token), reused: false })
  } catch (err) { next(err) }
})

const curatedBrandPalettes = (preferences: string) => {
  const warm = /quente|terracota|dourad|marrom|bege/i.test(preferences)
  const bold = /forte|marcante|colorid|vibrante/i.test(preferences)
  return warm ? [
    { name: 'Terracota editorial', primary: '#9A493C', secondary: '#3A2825', background: '#FBF5F0', rationale: 'Acolhedora, sofisticada e com presença sem pesar.' },
    { name: 'Cacau rosé', primary: '#8C4055', secondary: '#36272D', background: '#FAF4F5', rationale: 'Une beleza e confiança com contraste confortável.' },
    { name: 'Oliva dourado', primary: '#6C6844', secondary: '#302F26', background: '#F8F5EA', rationale: 'Natural, madura e diferente do rosa convencional.' },
  ] : bold ? [
    { name: 'Vinho assinatura', primary: '#8B1747', secondary: '#2D2028', background: '#FFF8FA', rationale: 'Marcante, feminina e muito legível na interface.' },
    { name: 'Ameixa moderna', primary: '#70405F', secondary: '#29222A', background: '#F9F5F8', rationale: 'Autoral e contemporânea sem perder delicadeza.' },
    { name: 'Azul petróleo', primary: '#28636A', secondary: '#203235', background: '#F2F8F7', rationale: 'Profissional e memorável fora do óbvio.' },
  ] : [
    { name: 'Rosé essencial', primary: '#9B4266', secondary: '#33272D', background: '#FCF7F9', rationale: 'Delicada, profissional e fácil de aplicar.' },
    { name: 'Nude sofisticado', primary: '#82605B', secondary: '#312927', background: '#FAF7F3', rationale: 'Minimalista e acolhedora para uma marca premium.' },
    { name: 'Grafite lavanda', primary: '#66566E', secondary: '#29252C', background: '#F8F6FA', rationale: 'Elegante, atual e com personalidade discreta.' },
  ]
}

app.get('/api/admin/onboarding', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const onboarding = db.prepare(`
      SELECT status, mode, current_step as currentStep, answers_json as answersJson,
             ai_attempts as aiAttempts, completed_at as completedAt
      FROM tenant_onboarding WHERE tenant_id = ?
    `).get(tenantId) as { status: string; mode: string | null; currentStep: number; answersJson: string; aiAttempts: number; completedAt: string | null } | undefined
    res.json({
      onboarding: onboarding ? { ...onboarding, answers: JSON.parse(onboarding.answersJson || '{}'), answersJson: undefined } : { status: 'COMPLETED', mode: null, currentStep: 4, answers: {}, aiAttempts: 0, completedAt: null },
      assistantEnabled: Boolean(env.AI_ASSISTANT_ENABLED && assistantProvider.apiKey),
      visionModel: assistantProvider.visionModel,
    })
  } catch (err) { next(err) }
})

app.post('/api/admin/onboarding/brand-suggestions', onboardingAssistantLimiter, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const userId = req.sessionUser?.id
    if (!tenantId || !userId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const body = z.object({
      businessName: z.string().trim().min(2).max(120),
      preferences: z.string().trim().max(280).default(''),
      logoDataUrl: z.string().max(450_000).refine((value) => /^data:image\/(?:png|jpeg|webp);base64,/i.test(value), 'Logo inválida').nullable().optional(),
    }).parse(req.body ?? {})
    const fallback = curatedBrandPalettes(body.preferences)
    if (!env.AI_ASSISTANT_ENABLED || !assistantProvider.apiKey) return res.json({ palettes: fallback, source: 'CURATED' })

    const reserved = db.prepare(`UPDATE tenant_onboarding SET ai_attempts = ai_attempts + 1, updated_at = ? WHERE tenant_id = ? AND status = 'PENDING' AND ai_attempts < 3`)
      .run(new Date().toISOString(), tenantId)
    if (reserved.changes !== 1) return res.json({ palettes: fallback, source: 'CURATED', limitReached: true })
    try {
      const answer = await generateBrandSetupSuggestions(body)
      const now = new Date().toISOString()
      db.prepare(`INSERT INTO assistant_usage (id, tenant_id, user_id, request_day, input_chars, input_tokens, output_tokens, cost_usd, vision_inputs, status, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`)
        .run(randomUUID(), tenantId, userId, now.slice(0, 10), body.preferences.length, answer.inputTokens, answer.outputTokens, answer.costUsd, body.logoDataUrl ? 1 : 0, answer.model, now)
      return res.json({ palettes: answer.palettes, source: 'VISION' })
    } catch (error) {
      console.warn('[Onboarding visual]', error instanceof Error ? error.message : error)
      return res.json({ palettes: fallback, source: 'CURATED', fallback: true })
    }
  } catch (err) { next(err) }
})

app.post('/api/admin/onboarding/complete', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const imageUrl = z.string().max(450_000).refine((value) => /^data:image\/(?:png|jpeg|webp);base64,/i.test(value) || /^https:\/\//i.test(value), 'Logo inválida')
    const body = z.object({
      mode: z.enum(['ASSISTED', 'MANUAL']),
      businessName: z.string().trim().min(2).max(120),
      primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
      secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
      logoUrl: imageUrl.nullable().optional(),
      workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      startMinute: z.number().int().min(0).max(1380),
      endMinute: z.number().int().min(60).max(1440),
      services: z.array(z.object({
        name: z.string().trim().min(2).max(100),
        durationMinutes: z.number().int().min(15).max(480),
        priceCents: z.number().int().min(0).max(10_000_000),
      })).min(1).max(8),
      answers: z.record(z.string(), z.union([z.string().max(280), z.number(), z.boolean()])).default({}),
    }).refine((value) => value.endMinute > value.startMinute, { message: 'Horário final deve ser posterior ao inicial', path: ['endMinute'] }).parse(req.body ?? {})
    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare(`UPDATE tenants SET name = ?, primary_color = ?, logo_url = ? WHERE id = ?`)
        .run(body.businessName, body.primaryColor.toUpperCase(), body.logoUrl || null, tenantId)
      db.prepare(`UPDATE tenant_settings SET secondary_color = ?, updated_at = ? WHERE tenant_id = ?`)
        .run(body.secondaryColor.toUpperCase(), now, tenantId)
      db.prepare(`DELETE FROM business_hours WHERE tenant_id = ?`).run(tenantId)
      const insertHour = db.prepare(`INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      for (const weekday of [...new Set(body.workingDays)].sort()) insertHour.run(randomUUID(), tenantId, weekday, body.startMinute, body.endMinute, now)
      const activeServices = Number((db.prepare(`SELECT COUNT(*) AS count FROM services WHERE tenant_id = ? AND active = 1`).get(tenantId) as { count: number }).count)
      if (activeServices === 0) {
        const insertService = db.prepare(`INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, cover_url, active, created_at) VALUES (?, ?, ?, ?, ?, NULL, 1, ?)`)
        for (const service of body.services) insertService.run(randomUUID(), tenantId, service.name, service.durationMinutes, service.priceCents, now)
      }
      db.prepare(`UPDATE tenant_onboarding SET status = 'COMPLETED', mode = ?, current_step = 4, answers_json = ?, completed_at = ?, updated_at = ? WHERE tenant_id = ?`)
        .run(body.mode, JSON.stringify(body.answers), now, now, tenantId)
    })()
    const tenant = db.prepare(`SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl FROM tenants WHERE id = ?`).get(tenantId)
    res.json({ onboarding: { status: 'COMPLETED' }, tenant })
  } catch (err) { next(err) }
})

app.post('/api/admin/onboarding/skip', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const now = new Date().toISOString()
    db.prepare(`UPDATE tenant_onboarding SET status = 'SKIPPED', current_step = 4, completed_at = ?, updated_at = ? WHERE tenant_id = ? AND status = 'PENDING'`).run(now, now, tenantId)
    res.json({ onboarding: { status: 'SKIPPED' } })
  } catch (err) { next(err) }
})

const lumaRequestDay = (tenantId: string, now = new Date()) => {
  const timezoneRow = db.prepare(`SELECT timezone FROM tenant_settings WHERE tenant_id = ?`).get(tenantId) as { timezone?: string } | undefined
  const timezone = timezoneRow?.timezone || 'America/Sao_Paulo'
  const parts = getZonedDateTimeParts(now, timezone)
  if (!parts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
  return { timezone, day: parts.ymd }
}

const lumaUsageWindow = (tenantId: string) => {
  const now = new Date()
  const { day, timezone } = lumaRequestDay(tenantId, now)
  const nowParts = getZonedDateTimeParts(now, timezone)
  if (!nowParts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
  const monthStart = monthBoundsUtc({ timeZone: timezone, year: nowParts.year, month: nowParts.month }).start.toISOString()
  const daily = db.prepare(`
    SELECT COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS costUsd
    FROM assistant_usage
    WHERE tenant_id = ? AND request_day = ? AND status != 'ERROR'
  `).get(tenantId, day) as { requests: number; costUsd: number }
  const monthly = db.prepare(`
    SELECT COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS costUsd
    FROM assistant_usage
    WHERE tenant_id = ? AND created_at >= ? AND status != 'ERROR'
  `).get(tenantId, monthStart) as { requests: number; costUsd: number }
  return {
    day,
    monthStart,
    daily: { requests: Number(daily?.requests ?? 0), costUsd: Number(daily?.costUsd ?? 0) },
    monthly: { requests: Number(monthly?.requests ?? 0), costUsd: Number(monthly?.costUsd ?? 0) },
  }
}

const LUMA_CREDIT_PACKS = [
  { id: 'starter', label: '25 créditos', credits: 25, amountCents: 490 },
  { id: 'growth', label: '100 créditos', credits: 100, amountCents: 1290, featured: true },
  { id: 'power', label: '250 créditos', credits: 250, amountCents: 2490 },
] as const
const lumaCreditPackById = new Map(LUMA_CREDIT_PACKS.map((pack) => [pack.id, pack]))

const lumaExtraCreditBalance = (tenantId: string) => {
  const row = db.prepare(`SELECT COALESCE(SUM(delta_messages), 0) AS balance FROM assistant_message_credit_ledger WHERE tenant_id = ?`).get(tenantId) as { balance?: number } | undefined
  return Math.max(0, Number(row?.balance ?? 0))
}

const consumeLumaExtraCredit = (tenantId: string, userId: string, usageId: string) => {
  db.prepare(`INSERT INTO assistant_message_credit_ledger (id, tenant_id, user_id, delta_messages, source, note, created_at) VALUES (?, ?, ?, -1, 'CONSUMED', ?, ?)`)
    .run(randomUUID(), tenantId, userId, `Reserva de mensagem extra da Luma · ${usageId}`, new Date().toISOString())
}

const refundLumaExtraCredit = (tenantId: string, userId: string, usageId: string) => {
  db.prepare(`INSERT INTO assistant_message_credit_ledger (id, tenant_id, user_id, delta_messages, source, note, created_at) VALUES (?, ?, ?, 1, 'REFUND', ?, ?)`)
    .run(randomUUID(), tenantId, userId, `Estorno automático de mensagem extra · ${usageId}`, new Date().toISOString())
}

const lumaBudgetState = (tenantId: string) => {
  const usage = lumaUsageWindow(tenantId)
  const blocked =
    usage.daily.requests >= ASSISTANT_DAILY_LIMIT ||
    usage.monthly.requests >= ASSISTANT_MONTHLY_LIMIT ||
    usage.daily.costUsd >= env.LUMA_DAILY_COST_CAP_USD ||
    usage.monthly.costUsd >= env.LUMA_MONTHLY_COST_CAP_USD
  return { usage, blocked, extraCreditBalance: lumaExtraCreditBalance(tenantId) }
}

app.get('/api/admin/assistant/usage', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const state = lumaBudgetState(tenantId)
    res.json({
      enabled: Boolean(env.AI_ASSISTANT_ENABLED && assistantProvider.apiKey),
      used: state.usage.daily.requests,
      limit: ASSISTANT_DAILY_LIMIT,
      monthlyUsed: state.usage.monthly.requests,
      monthlyLimit: ASSISTANT_MONTHLY_LIMIT,
      dailyCostUsd: state.usage.daily.costUsd,
      dailyCostCapUsd: env.LUMA_DAILY_COST_CAP_USD,
      monthlyCostUsd: state.usage.monthly.costUsd,
      monthlyCostCapUsd: env.LUMA_MONTHLY_COST_CAP_USD,
      extraCreditBalance: state.extraCreditBalance,
      creditPacks: LUMA_CREDIT_PACKS,
      model: assistantProvider.model,
      provider: assistantProvider.name,
    })
  } catch (err) { next(err) }
})

app.post('/api/admin/assistant/message', lumaAssistantLimiter, requireRole('ADMIN'), async (req, res, next) => {
  const usageId = randomUUID()
  let usageInserted = false
  let extraCreditReserved = false
  try {
    if (!env.AI_ASSISTANT_ENABLED || !assistantProvider.apiKey) return next(forbidden('A assistente Luma ainda não está habilitada para este ambiente.', 'ASSISTANT_DISABLED'))
    const tenantId = req.sessionUser?.tenantId
    const userId = req.sessionUser?.id
    if (!tenantId || !userId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const attachmentSchema = z.object({
      type: z.literal('image'),
      name: z.string().trim().min(1).max(120).optional(),
      mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      dataUrl: z.string().min(32).max(Math.ceil(ASSISTANT_MAX_IMAGE_BYTES * 1.45) + 100),
    }).superRefine((attachment, ctx) => {
      const prefix = `data:${attachment.mime};base64,`
      if (!attachment.dataUrl.startsWith(prefix)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Imagem inválida.' })
        return
      }
      const encoded = attachment.dataUrl.slice(prefix.length)
      const estimatedBytes = Math.floor(encoded.length * 0.75)
      if (estimatedBytes > ASSISTANT_MAX_IMAGE_BYTES) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Imagem muito grande.' })
    })

    const { message, history, attachment } = z.object({
      message: z.string().trim().min(2).max(ASSISTANT_MAX_INPUT_CHARS),
      history: z.array(z.object({
        role: z.enum(['assistant', 'user']),
        text: z.string().trim().min(1).max(ASSISTANT_MAX_INPUT_CHARS),
      })).max(8).default([]),
      attachment: attachmentSchema.optional(),
    }).parse(req.body)

    const boundedHistory = history.reduce<{ role: 'assistant' | 'user'; text: string }[]>((items, item) => {
      const total = items.reduce((sum, current) => sum + current.text.length, 0)
      if (total + item.text.length > 5_000) return items
      items.push(item)
      return items
    }, [])

    const reservation = db.transaction(() => {
      const budget = lumaBudgetState(tenantId)
      const needsExtraCredit = budget.usage.daily.requests >= ASSISTANT_DAILY_LIMIT || budget.usage.monthly.requests >= ASSISTANT_MONTHLY_LIMIT
      if (budget.usage.daily.costUsd + env.LUMA_MAX_REQUEST_COST_USD > env.LUMA_DAILY_COST_CAP_USD) return { ok: false as const, code: 'ASSISTANT_DAILY_BUDGET', message: 'Limite de uso inteligente de hoje atingido. A Luma volta a ficar disponível amanhã.' }
      if (budget.usage.monthly.costUsd + env.LUMA_MAX_REQUEST_COST_USD > env.LUMA_MONTHLY_COST_CAP_USD) return { ok: false as const, code: 'ASSISTANT_MONTHLY_BUDGET', message: 'Limite inteligente deste mês atingido.' }
      if (budget.usage.daily.requests >= ASSISTANT_DAILY_LIMIT && budget.extraCreditBalance <= 0) return { ok: false as const, code: 'ASSISTANT_DAILY_LIMIT', message: 'O limite diário da Luma acabou. Você pode continuar com créditos extras quando quiser.' }
      if (budget.usage.monthly.requests >= ASSISTANT_MONTHLY_LIMIT && budget.extraCreditBalance <= 0) return { ok: false as const, code: 'ASSISTANT_MONTHLY_LIMIT', message: 'O limite mensal da Luma acabou. Você pode continuar com créditos extras quando quiser.' }

      db.prepare(`
        INSERT INTO assistant_usage (
          id, tenant_id, user_id, request_day, input_chars, input_tokens, output_tokens,
          reasoning_tokens, cost_usd, tool_calls, vision_inputs, agent_steps, status, model, created_at
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, 1, 'RESERVED', ?, ?)
      `).run(usageId, tenantId, userId, budget.usage.day, message.length, env.LUMA_MAX_REQUEST_COST_USD, attachment ? 1 : 0, assistantProvider.model, new Date().toISOString())
      if (needsExtraCredit) consumeLumaExtraCredit(tenantId, userId, usageId)
      return { ok: true as const, day: budget.usage.day, usedExtraCredit: needsExtraCredit }
    }).immediate()
    if (!reservation.ok) return next(forbidden(reservation.message, reservation.code))
    usageInserted = true
    extraCreditReserved = reservation.usedExtraCredit

    const { timezone, day: localDate } = lumaRequestDay(tenantId)

    const answer = await generateAssistantAnswer({
      message,
      context: { tenantId, userId, timezone, localDate },
      history: boundedHistory,
      attachment,
    })

    db.transaction(() => {
      db.prepare(`
        UPDATE assistant_usage
        SET input_tokens = ?, output_tokens = ?, reasoning_tokens = ?, cost_usd = ?, tool_calls = ?, vision_inputs = ?, agent_steps = ?, status = 'COMPLETED', model = ?
        WHERE id = ?
      `).run(
        answer.inputTokens,
        answer.outputTokens,
        answer.reasoningTokens,
        answer.costUsd,
        answer.toolCalls,
        answer.visionInputs,
        answer.steps,
        answer.model,
        usageId,
      )
    })()

    const nextUsage = lumaUsageWindow(tenantId)
    res.json({
      answer: answer.text,
      actions: answer.pendingActions,
      usage: {
        used: nextUsage.daily.requests,
        limit: ASSISTANT_DAILY_LIMIT,
        monthlyUsed: nextUsage.monthly.requests,
        monthlyLimit: ASSISTANT_MONTHLY_LIMIT,
        extraCreditBalance: lumaExtraCreditBalance(tenantId),
        creditPacks: LUMA_CREDIT_PACKS,
      },
    })
  } catch (error) {
    if (usageInserted) {
      db.transaction(() => {
        const reverted = db.prepare(`UPDATE assistant_usage SET status = 'ERROR' WHERE id = ? AND status = 'RESERVED'`).run(usageId)
        if (reverted.changes === 1 && extraCreditReserved) refundLumaExtraCredit(req.sessionUser?.tenantId || '', req.sessionUser?.id || '', usageId)
      })()
    }
    next(error)
  }
})

app.post('/api/admin/assistant/actions/:id/confirm', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const userId = req.sessionUser?.id
    if (!tenantId || !userId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const actionId = z.string().uuid().parse(req.params.id)
    const result = confirmLumaAction({ tenantId, userId }, actionId)
    if (!result.ok) return next(badRequest(result.message, result.code))
    res.json(result)
  } catch (err) { next(err) }
})

app.post('/api/webhooks/evolution/:tenantId', requireWebhookSecret(env.EVOLUTION_WEBHOOK_SECRET), async (req, res) => {
  const tenantIdRaw = String(req.params.tenantId ?? '')
  const inbound = extractEvolutionInbound(req.body)
  let tenantId = tenantIdRaw
  try {
    tenantId = z.string().uuid().parse(tenantIdRaw)
    const instance = inbound.instanceName
      ? db.prepare(`SELECT tenant_id as tenantId FROM whatsapp_instances WHERE instance_name = ? AND tenant_id = ? LIMIT 1`).get(inbound.instanceName, tenantId) as { tenantId: string } | undefined
      : undefined
    if (!instance) {
      recordEvolutionWebhookEvent({ tenantId, instanceName: inbound.instanceName || null, eventType: inbound.event || 'UNKNOWN', payload: req.body, outcome: 'IGNORED', errorCode: 'UNKNOWN_INSTANCE' })
      return res.json({ ok: true, handled: false })
    }

    touchEvolutionWebhook(instance.tenantId, inbound.instanceName)
    let handled = false

    if (inbound.event === 'MESSAGES_UPSERT' && inbound.phone && !inbound.isGroup) {
      const recorded = recordWhatsappMessage({
        tenantId: instance.tenantId,
        phone: inbound.phone,
        direction: inbound.fromMe ? 'OUTBOUND' : 'INBOUND',
        type: inbound.messageType,
        text: inbound.text,
        source: 'WEBHOOK',
        providerMessageId: inbound.providerMessageId,
        sentAt: inbound.sentAt,
        displayName: inbound.fromMe ? null : inbound.pushName,
        providerRemoteJid: inbound.providerRemoteJid,
      })
      handled = handled || recorded.inserted
      if (!inbound.fromMe && inbound.text && recorded.clientUserId && marketingWhatsappOptOutIntent(inbound.text)) {
        const consent = setClientWhatsappMarketingConsent({ tenantId: instance.tenantId, userId: recorded.clientUserId, granted: false, source: 'WHATSAPP_KEYWORD' })
        if (consent.changed) {
          await sendWhatsappTextForTenant(instance.tenantId, inbound.phone, 'Tudo certo. Você não receberá mais novidades e ofertas por WhatsApp. Mensagens sobre seus agendamentos e acesso continuam funcionando normalmente.', { purpose: 'SYSTEM' }).catch(() => false)
        }
        handled = true
      }
    }

    if (inbound.event === 'MESSAGES_UPDATE') {
      const updates = extractEvolutionMessageUpdates(req.body)
      for (const update of updates) handled = updateWhatsappDeliveryStatus(instance.tenantId, update.providerMessageId, update.status) || handled
    }

    if (inbound.event === 'CONNECTION_UPDATE') {
      const state = extractEvolutionConnectionState(req.body)
      if (state) {
        updateEvolutionConnectionFromWebhook(instance.tenantId, inbound.instanceName, state)
        handled = true
      }
    }

    const confirmation = await handleEvolutionConfirmationWebhook(req.body, tenantId)
    handled = handled || Boolean(confirmation.handled)
    recordEvolutionWebhookEvent({ tenantId: instance.tenantId, instanceName: inbound.instanceName, eventType: inbound.event || 'UNKNOWN', providerMessageId: inbound.providerMessageId, payload: req.body, outcome: handled ? 'HANDLED' : 'IGNORED' })
    res.json({ ...confirmation, ok: true, handled })
  } catch (err) {
    // Ack provider webhooks even on internal errors to avoid provider retry storms; keep a redacted audit record instead.
    console.error('[Evolution webhook]', err)
    try {
      recordEvolutionWebhookEvent({ tenantId, instanceName: inbound.instanceName || null, eventType: inbound.event || 'UNKNOWN', providerMessageId: inbound.providerMessageId, payload: req.body, outcome: 'ERROR', errorCode: err instanceof Error ? err.name : 'INTERNAL_ERROR' })
    } catch { /* best-effort observability only */ }
    res.json({ ok: true, handled: false })
  }
})

app.get('/api/admin/services', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const services = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
          FROM services
          WHERE tenant_id = ? AND active = 1
          ORDER BY created_at DESC
        `,
      )
      .all(tenantId)
    res.json({ services })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/services', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const body = z
      .object({
        name: z.string().min(2),
        durationMinutes: z.number().int().positive(),
        priceCents: z.number().int().nonnegative(),
        coverUrl: z.string().max(350_000).optional(),
      })
      .parse(req.body)

    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, cover_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, tenantId, body.name, body.durationMinutes, body.priceCents, body.coverUrl ?? null, now)

    const service = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
          FROM services
          WHERE id = ?
        `,
      )
      .get(id)

    res.json({ service })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/services/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const body = z
      .object({
        name: z.string().min(2).optional(),
        durationMinutes: z.number().int().positive().optional(),
        priceCents: z.number().int().nonnegative().optional(),
        coverUrl: z.string().max(350_000).nullable().optional(),
      })
      .parse(req.body)

    const row = db
      .prepare('SELECT id FROM services WHERE id = ? AND tenant_id = ? AND active = 1')
      .get(id, tenantId) as { id: string } | undefined
    if (!row) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.name === 'string') updates.push({ sql: 'name = ?', params: [body.name] })
    if (typeof body.durationMinutes === 'number')
      updates.push({ sql: 'duration_minutes = ?', params: [body.durationMinutes] })
    if (typeof body.priceCents === 'number') updates.push({ sql: 'price_cents = ?', params: [body.priceCents] })
    if ('coverUrl' in body) {
      const nextCover = body.coverUrl === null ? null : (body.coverUrl ?? '').trim()
      updates.push({ sql: 'cover_url = ?', params: [nextCover ? nextCover : null] })
    }

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE services SET ${setSql} WHERE id = ? AND tenant_id = ?`).run(...params, id, tenantId)

    const service = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
          FROM services
          WHERE id = ?
        `,
      )
      .get(id)

    res.json({ service })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/services/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const r = db.prepare('UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ? AND active = 1').run(id, tenantId)
    if (r.changes === 0) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/appointments', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const q = z
      .object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        limit: z
          .string()
          .regex(/^\d+$/)
          .transform((v) => Number(v))
          .pipe(z.number().int().min(1).max(2000))
          .optional(),
      })
      .parse({
        start: typeof req.query.start === 'string' ? req.query.start : undefined,
        end: typeof req.query.end === 'string' ? req.query.end : undefined,
        limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      })

    const where: string[] = [`a.tenant_id = ?`]
    const params: unknown[] = [tenantId]
    if (q.start) {
      where.push(`a.starts_at >= ?`)
      params.push(q.start)
    }
    if (q.end) {
      where.push(`a.starts_at < ?`)
      params.push(q.end)
    }

    const limit = q.limit ?? 800
    const appointments = db
      .prepare(
        `
          SELECT a.id,
                 a.service_id as serviceId,
                 a.starts_at as startsAt,
                 a.ends_at as endsAt,
                 a.status,
                 a.confirmation_status as confirmationStatus,
                 a.confirmation_sent_at as confirmationSentAt,
                 a.confirmation_reminder_sent_at as confirmationReminderSentAt,
                 a.confirmation_responded_at as confirmationRespondedAt,
                 a.appointment_reminder_sent_at as appointmentReminderSentAt,
                 u.email as clientEmail,
                 c.name as clientName,
                 c.phone as clientPhone,
                 s.name as serviceName,
                 s.price_cents as priceCents
          FROM appointments a
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          JOIN services s ON s.id = a.service_id
          WHERE ${where.join(' AND ')}
          ORDER BY a.starts_at ASC
          LIMIT ${limit}
        `,
      )
      .all(...params)
    res.json({ appointments })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/appointments', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        clientName: z.string().min(2),
        clientPhone: z.string().min(8).optional(),
        serviceId: z.string().uuid(),
        startsAt: z.string().datetime(),
        status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
      })
      .parse(req.body)

    const service = db
      .prepare(
        `
          SELECT id, duration_minutes as durationMinutes
          FROM services
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(body.serviceId, tenantId) as { id: string; durationMinutes: number } | undefined
    if (!service) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

    const now = new Date().toISOString()
    const startsAt = new Date(body.startsAt)
    if (Number.isNaN(startsAt.getTime())) throw badRequest('Data inválida', 'INVALID_DATE')
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)

    const normalizedPhone = body.clientPhone ? normalizePhone(body.clientPhone) : null
    const existingClient = normalizedPhone
      ? (db
          .prepare(
            `
              SELECT c.user_id as userId
              FROM clients c
              WHERE c.tenant_id = ? AND c.phone_normalized = ?
              LIMIT 1
            `,
          )
          .get(tenantId, normalizedPhone) as { userId: string } | undefined)
      : undefined

    let clientUserId = existingClient?.userId ?? null
    const newClient = clientUserId
      ? null
      : {
          userId: randomUUID(),
          clientId: randomUUID(),
          email: `client+${randomUUID()}@lashdesigner.local`,
          passwordHash: await hashPassword(randomUUID()),
        }

    const appointmentId = randomUUID()

    const tx = db.transaction(() => {
      const overlap = db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ?
          AND status IN ('PENDING', 'CONFIRMED')
          AND NOT (ends_at <= ? OR starts_at >= ?)
        LIMIT 1
      `).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
      if (overlap) throw badRequest('Já existe um agendamento nesse período', 'SLOT_UNAVAILABLE')

      const timeOffOverlap = db.prepare(`
        SELECT id FROM time_off
        WHERE tenant_id = ?
          AND NOT (ends_at <= ? OR starts_at >= ?)
        LIMIT 1
      `).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
      if (timeOffOverlap) throw badRequest('O período está bloqueado na agenda', 'SLOT_UNAVAILABLE')

      if (!clientUserId) {
        if (!newClient) throw new Error('Falha ao criar cliente')
        clientUserId = newClient.userId
        db.prepare(
          `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
           VALUES (?, ?, ?, ?, 'CLIENT', ?)`
        ).run(newClient.userId, tenantId, newClient.email, newClient.passwordHash, now)

        db.prepare(
          `INSERT INTO clients (id, tenant_id, user_id, name, phone, phone_normalized, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newClient.clientId,
          tenantId,
          newClient.userId,
          body.clientName.trim(),
          body.clientPhone?.trim() || null,
          normalizedPhone,
          now,
        )
      }

      db.prepare(
        `
          INSERT INTO appointments (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        appointmentId,
        tenantId,
        body.serviceId,
        clientUserId,
        startsAt.toISOString(),
        endsAt.toISOString(),
        body.status ?? 'CONFIRMED',
        now,
      )
    })

    tx.immediate()

    if (existingClient?.userId) {
      db.prepare(`UPDATE clients SET name = ?, phone = COALESCE(?, phone), phone_normalized = COALESCE(?, phone_normalized) WHERE tenant_id = ? AND user_id = ?`).run(
        body.clientName.trim(),
        body.clientPhone?.trim() || null,
        normalizedPhone,
        tenantId,
        existingClient.userId,
      )
    }

    scheduleAppointmentAutomationJobs(tenantId, appointmentId)

    const appointment = db
      .prepare(
        `
          SELECT a.id,
                 a.service_id as serviceId,
                 a.starts_at as startsAt,
                 a.ends_at as endsAt,
                 a.status,
                 a.confirmation_status as confirmationStatus,
                 a.confirmation_sent_at as confirmationSentAt,
                 a.confirmation_reminder_sent_at as confirmationReminderSentAt,
                 a.confirmation_responded_at as confirmationRespondedAt,
                 a.appointment_reminder_sent_at as appointmentReminderSentAt,
                 u.email as clientEmail,
                 c.name as clientName,
                 c.phone as clientPhone,
                 s.name as serviceName,
                 s.price_cents as priceCents
          FROM appointments a
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          JOIN services s ON s.id = a.service_id
          WHERE a.id = ? AND a.tenant_id = ?
        `,
      )
      .get(appointmentId, tenantId)

    res.json({ appointment })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/appointments/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const body = z
      .object({
        status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']),
      })
      .parse(req.body)

    const row = db
      .prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as { id: string } | undefined
    if (!row) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))

    db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(body.status, id)
    if (body.status === 'CANCELLED') cancelAppointmentJobs(tenantId, id)
    else scheduleAppointmentAutomationJobs(tenantId, id)

    const appointment = db
      .prepare(
        `
          SELECT a.id,
                 a.service_id as serviceId,
                 a.starts_at as startsAt,
                 a.ends_at as endsAt,
                 a.status,
                 a.confirmation_status as confirmationStatus,
                 a.confirmation_sent_at as confirmationSentAt,
                 a.confirmation_reminder_sent_at as confirmationReminderSentAt,
                 a.confirmation_responded_at as confirmationRespondedAt,
                 a.appointment_reminder_sent_at as appointmentReminderSentAt,
                 u.email as clientEmail,
                 c.name as clientName,
                 c.phone as clientPhone,
                 s.name as serviceName,
                 s.price_cents as priceCents
          FROM appointments a
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          JOIN services s ON s.id = a.service_id
          WHERE a.id = ?
        `,
      )
      .get(id)

    res.json({ appointment })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/appointments/:id/confirmation/resend', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)
    const appointment = confirmationAppointmentById(tenantId, id)
    if (!appointment) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))
    if (appointment.status === 'CANCELLED') return next(badRequest('Agendamento cancelado não pode receber confirmação.', 'APPOINTMENT_CANCELLED'))
    if (!appointment.clientPhone) return next(badRequest('Cadastre o WhatsApp da cliente antes de enviar a confirmação.', 'NO_CLIENT_PHONE'))
    const result = await sendAppointmentConfirmation(appointment, appointment.confirmationSentAt ? 'RESENT' : 'REQUEST_SENT')
    if (!result.ok) return next(badRequest('Não foi possível enviar a confirmação pelo WhatsApp.', result.code))
    scheduleAppointmentAutomationJobs(tenantId, id)
    res.json({ confirmationStatus: 'AWAITING_CONFIRMATION' })
  } catch (err) { next(err) }
})

app.post('/api/admin/appointments/:id/confirmation/manual', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)
    const appointment = confirmationAppointmentById(tenantId, id)
    if (!appointment) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))
    if (appointment.status === 'CANCELLED') return next(badRequest('Agendamento cancelado não pode ser confirmado.', 'APPOINTMENT_CANCELLED'))
    const now = new Date().toISOString()
    db.prepare(`UPDATE appointments SET confirmation_status = 'MANUALLY_CONFIRMED', confirmation_responded_at = ? WHERE id = ? AND tenant_id = ?`).run(now, id, tenantId)
    cancelAppointmentJobs(tenantId, id, ['CONFIRMATION_REQUEST','CONFIRMATION_RETRY','NO_RESPONSE_CUTOFF'])
    confirmationEvent({ tenantId, appointmentId: id, eventType: 'MANUALLY_CONFIRMED', channel: 'OWNER' })
    scheduleAppointmentAutomationJobs(tenantId, id)
    res.json({ confirmationStatus: 'MANUALLY_CONFIRMED', confirmationRespondedAt: now })
  } catch (err) { next(err) }
})

app.get('/api/admin/appointments/:id/confirmation/events', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)
    const appointment = db.prepare(`SELECT id FROM appointments WHERE id = ? AND tenant_id = ?`).get(id, tenantId)
    if (!appointment) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))
    const events = db.prepare(`SELECT id, event_type as eventType, channel, details_json as detailsJson, created_at as createdAt FROM appointment_confirmation_events WHERE tenant_id = ? AND appointment_id = ? ORDER BY created_at DESC LIMIT 50`).all(tenantId, id)
    res.json({ events })
  } catch (err) { next(err) }
})

app.delete('/api/admin/appointments/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const r = db.prepare('DELETE FROM appointments WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    if (r.changes === 0) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/business-hours', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const businessHours = db
      .prepare(
        `
          SELECT id, weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE tenant_id = ?
          ORDER BY weekday ASC, start_minute ASC
        `,
      )
      .all(tenantId)

    res.json({ businessHours })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/business-hours', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
      })
      .parse(req.body)

    if (body.endMinute <= body.startMinute) {
      return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))
    }

    const overlap = db
      .prepare(
        `
          SELECT id
          FROM business_hours
          WHERE tenant_id = ?
            AND weekday = ?
            AND NOT (end_minute <= ? OR start_minute >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, body.weekday, body.startMinute, body.endMinute) as { id: string } | undefined

    if (overlap) return next(badRequest('Horário sobreposto', 'OVERLAPPING_RANGE'))

    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `
        INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(id, tenantId, body.weekday, body.startMinute, body.endMinute, now)

    const businessHour = db
      .prepare(
        `
          SELECT id, weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId)

    res.json({ businessHour })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/business-hours/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const body = z
      .object({
        weekday: z.number().int().min(0).max(6).optional(),
        startMinute: z.number().int().min(0).max(1440).optional(),
        endMinute: z.number().int().min(0).max(1440).optional(),
      })
      .parse(req.body)

    const row = db
      .prepare(
        `
          SELECT weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId) as { weekday: number; startMinute: number; endMinute: number } | undefined

    if (!row) return next(notFound('Horário não encontrado', 'BUSINESS_HOUR_NOT_FOUND'))

    const nextWeekday = body.weekday ?? row.weekday
    const nextStart = body.startMinute ?? row.startMinute
    const nextEnd = body.endMinute ?? row.endMinute
    if (nextEnd <= nextStart) return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))

    const overlap = db
      .prepare(
        `
          SELECT id
          FROM business_hours
          WHERE tenant_id = ?
            AND weekday = ?
            AND id <> ?
            AND NOT (end_minute <= ? OR start_minute >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, nextWeekday, id, nextStart, nextEnd) as { id: string } | undefined

    if (overlap) return next(badRequest('Horário sobreposto', 'OVERLAPPING_RANGE'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.weekday === 'number') updates.push({ sql: 'weekday = ?', params: [body.weekday] })
    if (typeof body.startMinute === 'number') updates.push({ sql: 'start_minute = ?', params: [body.startMinute] })
    if (typeof body.endMinute === 'number') updates.push({ sql: 'end_minute = ?', params: [body.endMinute] })

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE business_hours SET ${setSql} WHERE id = ? AND tenant_id = ?`).run(...params, id, tenantId)

    const businessHour = db
      .prepare(
        `
          SELECT id, weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId)

    res.json({ businessHour })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/business-hours/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const r = db.prepare('DELETE FROM business_hours WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    if (r.changes === 0) return next(notFound('Horário não encontrado', 'BUSINESS_HOUR_NOT_FOUND'))

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/time-off', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const q = z
      .object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        limit: z
          .string()
          .regex(/^\d+$/)
          .transform((v) => Number(v))
          .pipe(z.number().int().min(1).max(2000))
          .optional(),
      })
      .parse({
        start: typeof req.query.start === 'string' ? req.query.start : undefined,
        end: typeof req.query.end === 'string' ? req.query.end : undefined,
        limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      })

    const where: string[] = ['tenant_id = ?']
    const params: unknown[] = [tenantId]
    if (q.start) {
      where.push('ends_at > ?')
      params.push(q.start)
    }
    if (q.end) {
      where.push('starts_at < ?')
      params.push(q.end)
    }

    const limit = q.limit ?? 500
    const timeOff = db
      .prepare(
        `
          SELECT id, starts_at as startsAt, ends_at as endsAt, reason, created_at as createdAt
          FROM time_off
          WHERE ${where.join(' AND ')}
          ORDER BY starts_at ASC
          LIMIT ${limit}
        `,
      )
      .all(...params) as Array<{ id: string; startsAt: string; endsAt: string; reason: string | null; createdAt: string }>

    res.json({ timeOff })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/time-off', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        reason: z.string().max(200).optional().nullable(),
      })
      .parse(req.body)

    const startsAt = new Date(body.startsAt)
    const endsAt = new Date(body.endsAt)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return next(badRequest('Data inválida', 'INVALID_DATE'))
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))
    }

    const overlapExisting = db
      .prepare(
        `
          SELECT id
          FROM time_off
          WHERE tenant_id = ?
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, startsAt.toISOString(), endsAt.toISOString()) as { id: string } | undefined

    if (overlapExisting) return next(badRequest('Bloqueio sobreposto', 'OVERLAPPING_TIME_OFF'))

    const overlapAppt = db
      .prepare(
        `
          SELECT id
          FROM appointments
          WHERE tenant_id = ?
            AND status IN ('CONFIRMED', 'PENDING')
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, startsAt.toISOString(), endsAt.toISOString()) as { id: string } | undefined

    if (overlapAppt) return next(badRequest('Existe agendamento nesse intervalo', 'TIME_OFF_CONFLICT_APPOINTMENT'))

    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `
        INSERT INTO time_off (id, tenant_id, starts_at, ends_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(id, tenantId, startsAt.toISOString(), endsAt.toISOString(), body.reason ? body.reason.trim() : null, now)

    const timeOff = db
      .prepare(
        `
          SELECT id, starts_at as startsAt, ends_at as endsAt, reason, created_at as createdAt
          FROM time_off
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId)

    res.json({ timeOff })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/time-off/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const body = z
      .object({
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
        reason: z.string().max(200).optional().nullable(),
      })
      .parse(req.body)

    const row = db
      .prepare(
        `
          SELECT starts_at as startsAt, ends_at as endsAt, reason
          FROM time_off
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId) as { startsAt: string; endsAt: string; reason: string | null } | undefined

    if (!row) return next(notFound('Bloqueio não encontrado', 'TIME_OFF_NOT_FOUND'))

    const nextStartsAt = body.startsAt ?? row.startsAt
    const nextEndsAt = body.endsAt ?? row.endsAt
    const startsAt = new Date(nextStartsAt)
    const endsAt = new Date(nextEndsAt)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return next(badRequest('Data inválida', 'INVALID_DATE'))
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))
    }

    const overlapExisting = db
      .prepare(
        `
          SELECT id
          FROM time_off
          WHERE tenant_id = ?
            AND id <> ?
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, id, startsAt.toISOString(), endsAt.toISOString()) as { id: string } | undefined

    if (overlapExisting) return next(badRequest('Bloqueio sobreposto', 'OVERLAPPING_TIME_OFF'))

    const overlapAppt = db
      .prepare(
        `
          SELECT id
          FROM appointments
          WHERE tenant_id = ?
            AND status IN ('CONFIRMED', 'PENDING')
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, startsAt.toISOString(), endsAt.toISOString()) as { id: string } | undefined

    if (overlapAppt) return next(badRequest('Existe agendamento nesse intervalo', 'TIME_OFF_CONFLICT_APPOINTMENT'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.startsAt === 'string') updates.push({ sql: 'starts_at = ?', params: [startsAt.toISOString()] })
    if (typeof body.endsAt === 'string') updates.push({ sql: 'ends_at = ?', params: [endsAt.toISOString()] })
    if ('reason' in body) updates.push({ sql: 'reason = ?', params: [body.reason ? body.reason.trim() : null] })

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE time_off SET ${setSql} WHERE id = ? AND tenant_id = ?`).run(...params, id, tenantId)

    const timeOff = db
      .prepare(
        `
          SELECT id, starts_at as startsAt, ends_at as endsAt, reason, created_at as createdAt
          FROM time_off
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId)

    res.json({ timeOff })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/time-off/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const r = db.prepare('DELETE FROM time_off WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    if (r.changes === 0) return next(notFound('Bloqueio não encontrado', 'TIME_OFF_NOT_FOUND'))

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/dashboard', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const now = new Date()
    const settings = db.prepare(`SELECT timezone FROM tenant_settings WHERE tenant_id = ?`).get(tenantId) as
      | { timezone: string }
      | undefined
    const timeZone = settings?.timezone || 'America/Sao_Paulo'
    const todayParts = getZonedDateTimeParts(now, timeZone)
    if (!todayParts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
    const { start, endExclusive: end } = dayBoundsUtc({ timeZone, ymd: todayParts.ymd })

    const today = db
      .prepare(
        `
          SELECT
            COUNT(1) as appointmentsCount,
            COALESCE(SUM(s.price_cents), 0) as expectedRevenueCents
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.starts_at >= ?
            AND a.starts_at < ?
            AND a.status IN ('PENDING', 'CONFIRMED')
        `,
      )
      .get(tenantId, start.toISOString(), end.toISOString()) as
      | { appointmentsCount: number; expectedRevenueCents: number }
      | undefined

    const upcoming = db
      .prepare(
        `
          SELECT a.id,
                 a.starts_at as startsAt,
                 a.status,
                 a.confirmation_status as confirmationStatus,
                 a.confirmation_sent_at as confirmationSentAt,
                 a.confirmation_responded_at as confirmationRespondedAt,
                 s.name as serviceName,
                 s.price_cents as priceCents,
                 u.email as clientEmail,
                 c.name as clientName,
                 c.phone as clientPhone
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          WHERE a.tenant_id = ?
            AND a.starts_at >= ?
            AND a.status != 'CANCELLED'
          ORDER BY a.starts_at ASC
          LIMIT 30
        `,
      )
      .all(tenantId, new Date().toISOString()) as Array<{
      id: string
      startsAt: string
      status: string
      confirmationStatus: AppointmentConfirmationStatus
      confirmationSentAt: string | null
      confirmationRespondedAt: string | null
      serviceName: string
      priceCents: number
      clientEmail: string
      clientName: string | null
      clientPhone: string | null
    }>

    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const newClients = db
      .prepare(
        `
          SELECT COUNT(1) as newClientsCount
          FROM clients
          WHERE tenant_id = ?
            AND created_at >= ?
        `,
      )
      .get(tenantId, thirtyDaysAgo.toISOString()) as { newClientsCount: number } | undefined

    const pending = db
      .prepare(
        `
          SELECT COUNT(1) as pendingAppointmentsCount
          FROM appointments
          WHERE tenant_id = ?
            AND status = 'PENDING'
            AND starts_at >= ?
        `,
      )
      .get(tenantId, now.toISOString()) as { pendingAppointmentsCount: number } | undefined

    const confirmationSummary = db.prepare(`
      SELECT
        SUM(CASE WHEN confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED') THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN confirmation_status = 'AWAITING_CONFIRMATION' THEN 1 ELSE 0 END) as awaiting,
        SUM(CASE WHEN confirmation_status = 'NO_RESPONSE' THEN 1 ELSE 0 END) as noResponse,
        SUM(CASE WHEN confirmation_status = 'DELIVERY_FAILED' THEN 1 ELSE 0 END) as deliveryFailed,
        SUM(CASE WHEN confirmation_status = 'DECLINED' THEN 1 ELSE 0 END) as declined,
        SUM(CASE WHEN confirmation_status = 'NOT_REQUESTED' THEN 1 ELSE 0 END) as notRequested
      FROM appointments
      WHERE tenant_id = ? AND status != 'CANCELLED' AND starts_at >= ? AND starts_at < ?
    `).get(tenantId, start.toISOString(), end.toISOString()) as { confirmed: number | null; awaiting: number | null; noResponse: number | null; deliveryFailed: number | null; declined: number | null; notRequested: number | null } | undefined

    const attentionEnd = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString()
    const confirmationAttention = db.prepare(`
      SELECT a.id, a.starts_at as startsAt, a.status, a.confirmation_status as confirmationStatus,
             a.confirmation_sent_at as confirmationSentAt, s.name as serviceName,
             c.name as clientName, c.phone as clientPhone
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      LEFT JOIN clients c ON c.user_id = a.client_user_id AND c.tenant_id = a.tenant_id
      WHERE a.tenant_id = ?
        AND a.status != 'CANCELLED'
        AND a.starts_at >= ? AND a.starts_at <= ?
        AND a.confirmation_status IN ('NO_RESPONSE','DELIVERY_FAILED','DECLINED')
      ORDER BY CASE a.confirmation_status WHEN 'DECLINED' THEN 0 ELSE 1 END, a.starts_at ASC
      LIMIT 12
    `).all(tenantId, now.toISOString(), attentionEnd)

    const recentActivity = db
      .prepare(
        `
          SELECT kind,
                 at,
                 clientName,
                 clientEmail,
                 serviceName,
                 priceCents,
                 amountCents,
                 note
          FROM (
            SELECT 'APPOINTMENT_CREATED' as kind,
                   a.created_at as at,
                   c.name as clientName,
                   u.email as clientEmail,
                   s.name as serviceName,
                   s.price_cents as priceCents,
                   NULL as amountCents,
                   NULL as note
            FROM appointments a
            JOIN services s ON s.id = a.service_id
            JOIN users u ON u.id = a.client_user_id
            LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
            WHERE a.tenant_id = ?

            UNION ALL

            SELECT 'EXPENSE_CREATED' as kind,
                   t.created_at as at,
                   NULL as clientName,
                   NULL as clientEmail,
                   NULL as serviceName,
                   NULL as priceCents,
                   t.amount_cents as amountCents,
                   t.note as note
            FROM cash_transactions t
            WHERE t.tenant_id = ?
              AND t.type = 'EXPENSE'
          )
          ORDER BY at DESC
          LIMIT 12
        `,
      )
      .all(tenantId, tenantId) as Array<{
      kind: string
      at: string
      clientName: string | null
      clientEmail: string | null
      serviceName: string | null
      priceCents: number | null
      amountCents: number | null
      note: string | null
    }>

    const primaryDomain = db
      .prepare(
        `SELECT domain
         FROM tenant_domains
         WHERE tenant_id = ? AND status = 'ACTIVE'
         ORDER BY is_primary DESC, verified_at DESC, created_at DESC
         LIMIT 1`,
      )
      .get(tenantId) as { domain: string } | undefined

    res.json({
      timeZone,
      publicBaseUrl: primaryDomain ? `https://${primaryDomain.domain}` : null,
      today: {
        appointmentsCount: today?.appointmentsCount ?? 0,
        expectedRevenueCents: today?.expectedRevenueCents ?? 0,
      },
      newClients30d: newClients?.newClientsCount ?? 0,
      pendingAppointments: pending?.pendingAppointmentsCount ?? 0,
      confirmationSummary: {
        confirmed: Number(confirmationSummary?.confirmed ?? 0),
        awaiting: Number(confirmationSummary?.awaiting ?? 0),
        noResponse: Number(confirmationSummary?.noResponse ?? 0),
        deliveryFailed: Number(confirmationSummary?.deliveryFailed ?? 0),
        declined: Number(confirmationSummary?.declined ?? 0),
        notRequested: Number(confirmationSummary?.notRequested ?? 0),
      },
      confirmationAttention,
      upcoming,
      recentActivity,
    })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/tenant', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        name: z.string().min(2).optional(),
        primaryColor: z.string().min(4).optional(),
        logoUrl: z
          .string()
          .max(450_000)
          .nullable()
          .optional()
          .refine(
            (v) => {
              if (typeof v === 'undefined') return true
              if (v === null) return true
              if (typeof v !== 'string') return false
              const s = v.trim()
              if (!s) return true
              return s.startsWith('data:image/') || /^https?:\/\//.test(s)
            },
            { message: 'Logo inválida' },
          ),
      })
      .parse(req.body)

    const row = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId) as { id: string } | undefined
    if (!row) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.name === 'string') updates.push({ sql: 'name = ?', params: [body.name] })
    if (typeof body.primaryColor === 'string')
      updates.push({ sql: 'primary_color = ?', params: [body.primaryColor] })
    if ('logoUrl' in body) {
      const nextLogo = body.logoUrl === null ? null : (body.logoUrl ?? '').trim()
      updates.push({ sql: 'logo_url = ?', params: [nextLogo ? nextLogo : null] })
    }

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE tenants SET ${setSql} WHERE id = ?`).run(...params, tenantId)

    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl
          FROM tenants
          WHERE id = ?
        `,
      )
      .get(tenantId)

    res.json({ tenant })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/clients', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const clients = db
      .prepare(
        `
          SELECT
            c.id,
            c.name,
            c.phone,
            c.marketing_whatsapp_opt_in as marketingWhatsappOptIn,
            u.email as email,
            COALESCE(SUM(CASE WHEN a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED')) THEN s.price_cents ELSE 0 END), 0) as totalSpentCents,
            MAX(CASE WHEN a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED')) THEN a.starts_at ELSE NULL END) as lastVisitAt
          FROM clients c
          JOIN users u ON u.id = c.user_id
          LEFT JOIN appointments a ON a.tenant_id = c.tenant_id AND a.client_user_id = c.user_id
          LEFT JOIN services s ON s.id = a.service_id
          WHERE c.tenant_id = ?
          GROUP BY c.id
          ORDER BY (lastVisitAt IS NULL) ASC, lastVisitAt DESC, totalSpentCents DESC
          LIMIT 500
        `,
      )
      .all(tenantId) as Array<{
      id: string
      name: string
      phone: string | null
      marketingWhatsappOptIn: number
      email: string
      totalSpentCents: number
      lastVisitAt: string | null
    }>

    res.json({ clients })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/finance', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const timeZone = tenantFinanceTimeZone(tenantId)
    const nowParts = getZonedDateTimeParts(new Date(), timeZone)
    if (!nowParts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')

    const goals = db.prepare(`
      SELECT monthly_revenue_goal_cents as revenueGoalCents,
             monthly_new_clients_goal as newClientsGoal
      FROM tenant_settings
      WHERE tenant_id = ?
    `).get(tenantId) as { revenueGoalCents: number; newClientsGoal: number } | undefined

    const historicalEntries = db.prepare(`
      SELECT COALESCE(SUM(s.price_cents), 0) as entriesCents
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      WHERE a.tenant_id = ?
        AND a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED'))
    `).get(tenantId) as { entriesCents: number } | undefined

    const historicalCash = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount_cents ELSE 0 END), 0) as expensesCents,
        COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount_cents ELSE 0 END), 0) as incomeCents
      FROM cash_transactions
      WHERE tenant_id = ?
    `).get(tenantId) as { expensesCents: number; incomeCents: number } | undefined

    const lastCashTransactions = db.prepare(`
      SELECT id,
             type,
             amount_cents as amountCents,
             method,
             note,
             created_at as createdAt
      FROM cash_transactions
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(tenantId) as Array<{
      id: string
      type: 'INCOME' | 'EXPENSE'
      amountCents: number
      method: string
      note: string | null
      createdAt: string
    }>

    const lastEntries = db.prepare(`
      SELECT a.id,
             a.starts_at as startsAt,
             a.status,
             s.name as serviceName,
             s.price_cents as priceCents,
             u.email as clientEmail,
             c.name as clientName
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      JOIN users u ON u.id = a.client_user_id
      LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
      WHERE a.tenant_id = ?
        AND a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED'))
      ORDER BY a.starts_at DESC
      LIMIT 100
    `).all(tenantId) as Array<{
      id: string
      startsAt: string
      status: string
      serviceName: string
      priceCents: number
      clientEmail: string
      clientName: string | null
    }>

    const monthly = financeRecentMonths({ tenantId, timeZone, months: 6 })
    const currentMonth = financeMonthSnapshot({ tenantId, timeZone, year: nowParts.year, month: nowParts.month })
    const previousYm = shiftYearMonth({ year: nowParts.year, month: nowParts.month }, -1)
    const previousMonth = financeMonthSnapshot({ tenantId, timeZone, ...previousYm })
    const expenseCategories = financeExpenseCategories({ tenantId, timeZone, year: nowParts.year, month: nowParts.month, limit: 5 })

    const currentBounds = monthBoundsUtc({ timeZone, year: nowParts.year, month: nowParts.month })
    const currentMonthNewClients = db.prepare(`
      SELECT COUNT(1) as newClientsCount
      FROM clients
      WHERE tenant_id = ?
        AND created_at >= ?
        AND created_at < ?
    `).get(tenantId, currentBounds.start.toISOString(), currentBounds.endExclusive.toISOString()) as { newClientsCount: number } | undefined

    const historicalEntriesCents = Number(historicalEntries?.entriesCents ?? 0) + Number(historicalCash?.incomeCents ?? 0)
    const historicalExpensesCents = Number(historicalCash?.expensesCents ?? 0)
    const revenueGoalCents = goals?.revenueGoalCents ?? 1000000
    const newClientsGoal = goals?.newClientsGoal ?? 10

    res.json({
      timeZone,
      todayYmd: nowParts.ymd,
      currentMonthYm: currentMonth.ym,
      currentMonth,
      previousMonth,
      totals: {
        entriesCents: historicalEntriesCents,
        expensesCents: historicalExpensesCents,
        profitCents: historicalEntriesCents - historicalExpensesCents,
      },
      goals: {
        revenueCents: revenueGoalCents,
        newClients: newClientsGoal,
        currentRevenueCents: currentMonth.entriesCents,
        currentNewClients: currentMonthNewClients?.newClientsCount ?? 0,
      },
      expenseCategories,
      lastCashTransactions,
      lastEntries,
      monthly,
    })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/finance/goals', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        revenueGoalCents: z.number().int().nonnegative().optional(),
        newClientsGoal: z.number().int().nonnegative().optional(),
      })
      .parse(req.body)

    const updates: string[] = []
    const params: Array<string | number> = []

    if (body.revenueGoalCents !== undefined) {
      updates.push('monthly_revenue_goal_cents = ?')
      params.push(body.revenueGoalCents)
    }
    if (body.newClientsGoal !== undefined) {
      updates.push('monthly_new_clients_goal = ?')
      params.push(body.newClientsGoal)
    }

    if (updates.length > 0) {
      params.push(tenantId)
      db.prepare(`UPDATE tenant_settings SET ${updates.join(', ')} WHERE tenant_id = ?`).run(...params)
    }

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/domains', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const domains = db
      .prepare(
        `SELECT id,
                tenant_id AS tenantId,
                domain,
                status,
                verification_token AS verificationToken,
                created_at AS createdAt,
                last_checked_at AS lastCheckedAt,
                verified_at AS verifiedAt,
                verification_error AS verificationError,
                is_primary AS isPrimary
         FROM tenant_domains
         WHERE tenant_id = ?
         ORDER BY is_primary DESC, created_at DESC`,
      )
      .all(tenantId) as TenantDomainRow[]

    res.json({ domains: domains.map(domainSetupPayload) })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/domains', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const currentCount = (db.prepare('SELECT COUNT(1) as count FROM tenant_domains WHERE tenant_id = ?').get(tenantId) as { count: number }).count
    if (currentCount >= 5) return next(badRequest('Limite de 5 domínios por espaço atingido', 'DOMAIN_LIMIT_REACHED'))

    const body = z.object({ domain: z.string().min(1).max(253) }).parse(req.body)
    const domain = normalizeCustomDomain(body.domain)
    assertDomainIsNotReserved(domain, domainVerificationConfig)

    const id = randomUUID()
    const now = new Date().toISOString()
    const token = randomBytes(24).toString('hex')

    try {
      db.prepare(
        `INSERT INTO tenant_domains
           (id, tenant_id, domain, status, verification_token, verification_method, created_at, is_primary)
         VALUES (?, ?, ?, 'PENDING', ?, 'DNS_TXT', ?, 0)`,
      ).run(id, tenantId, domain, token, now)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return next(badRequest('Domínio já cadastrado por outro espaço', 'DOMAIN_TAKEN'))
      }
      throw err
    }

    const row = getDomainRow(id, tenantId)
    if (!row) throw new Error('Falha ao carregar domínio criado')
    res.status(201).json({ domain: domainSetupPayload(row) })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/domains/:id/verify', domainVerifyLimiter, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)
    const row = getDomainRow(id, tenantId)
    if (!row) return next(notFound('Domínio não encontrado', 'DOMAIN_NOT_FOUND'))

    const result = await verifyDomainRow(row)
    const updated = result.row
    if (!updated) throw new Error('Falha ao recarregar domínio')
    res.json({
      domain: domainSetupPayload(updated),
      verification: {
        verified: result.verified,
        ownershipVerified: result.ownershipVerified,
        routingVerified: result.routingVerified,
        error: result.error,
      },
    })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/domains/:id/primary', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)
    const row = getDomainRow(id, tenantId)
    if (!row) return next(notFound('Domínio não encontrado', 'DOMAIN_NOT_FOUND'))
    if (row.status !== 'ACTIVE') return next(badRequest('Verifique o domínio antes de torná-lo principal', 'DOMAIN_NOT_ACTIVE'))

    const tx = db.transaction(() => {
      db.prepare('UPDATE tenant_domains SET is_primary = 0 WHERE tenant_id = ?').run(tenantId)
      db.prepare('UPDATE tenant_domains SET is_primary = 1 WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    })
    tx()

    const updated = getDomainRow(id, tenantId)
    if (!updated) throw new Error('Falha ao recarregar domínio')
    res.json({ domain: domainSetupPayload(updated) })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/domains/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)
    const row = getDomainRow(id, tenantId)
    if (!row) return next(notFound('Domínio não encontrado', 'DOMAIN_NOT_FOUND'))

    db.prepare('DELETE FROM tenant_domains WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/finance/expenses', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        amountCents: z.number().int().positive(),
        method: z.string().min(1).optional(),
        note: z.string().optional(),
      })
      .parse(req.body)

    const now = new Date().toISOString()
    const id = randomUUID()
    const method = body.method?.trim() || 'MANUAL'
    const note = body.note?.trim() || null
    db.prepare(
      `
        INSERT INTO cash_transactions (id, tenant_id, type, amount_cents, method, note, created_at)
        VALUES (?, ?, 'EXPENSE', ?, ?, ?, ?)
      `,
    ).run(id, tenantId, body.amountCents, method, note, now)

    res.status(201).json({
      transaction: { id, type: 'EXPENSE', amountCents: body.amountCents, method, note, createdAt: now },
    })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/finance/transactions', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        type: z.enum(['INCOME', 'EXPENSE']),
        amountCents: z.number().int().positive(),
        method: z.string().min(1).optional(),
        note: z.string().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        createdAt: z.string().datetime().optional(),
      })
      .refine((value) => !(value.date && value.createdAt), { message: 'Envie date ou createdAt, não os dois.' })
      .parse(req.body)

    const now = new Date().toISOString()
    let createdAt = body.createdAt || now
    if (body.date) {
      const parsed = parseYmd(body.date)
      if (!parsed) return next(badRequest('Data inválida', 'INVALID_DATE'))
      const timeZone = tenantFinanceTimeZone(tenantId)
      createdAt = utcForLocalTime({ timeZone, ...parsed, hour: 12, minute: 0 }).toISOString()
    }
    const id = randomUUID()
    
    db.prepare(
      `
        INSERT INTO cash_transactions (id, tenant_id, type, amount_cents, method, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(id, tenantId, body.type, body.amountCents, body.method?.trim() || 'MANUAL', body.note?.trim() || null, createdAt)

    res.json({
      transaction: {
        id,
        type: body.type,
        amountCents: body.amountCents,
        method: body.method?.trim() || 'MANUAL',
        note: body.note?.trim() || null,
        createdAt,
      },
    })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/finance/transactions/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const { id } = req.params

    const result = db.prepare('DELETE FROM cash_transactions WHERE id = ? AND tenant_id = ?').run(id, tenantId)

    if (result.changes === 0) {
      return next(notFound('Transação não encontrada', 'TRANSACTION_NOT_FOUND'))
    }

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/finance/extract', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const q = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
      type: z.enum(['all', 'income', 'expense']).optional(),
    }).parse({
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
      start: typeof req.query.start === 'string' ? req.query.start : undefined,
      end: typeof req.query.end === 'string' ? req.query.end : undefined,
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
    })

    const type = q.type || 'all'
    if (q.startDate && q.endDate && q.startDate > q.endDate) return next(badRequest('Período inválido: a data inicial deve vir antes da data final.', 'INVALID_DATE_RANGE'))
    const timeZone = tenantFinanceTimeZone(tenantId)
    const nowParts = getZonedDateTimeParts(new Date(), timeZone)
    if (!nowParts) return next(badRequest('Fuso horário inválido', 'INVALID_TIMEZONE'))

    let start = q.start || new Date(0).toISOString()
    let endExclusive = q.end || new Date(Date.now() + 1).toISOString()

    if (q.startDate || q.endDate) {
      const startDate = q.startDate || `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-01`
      const endDate = q.endDate || nowParts.ymd
      const startBounds = dayBoundsUtc({ timeZone, ymd: startDate })
      const endBounds = dayBoundsUtc({ timeZone, ymd: endDate })
      start = startBounds.start.toISOString()
      endExclusive = endBounds.endExclusive.toISOString()
    }

    const transactions = db.prepare(`
      SELECT * FROM (
        SELECT 
          'appointment_' || a.id as id,
          'INCOME' as type,
          s.price_cents as amountCents,
          'Serviço' as category,
          COALESCE(c.name, u.email) as description,
          a.starts_at as date,
          'CONFIRMED' as status
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        JOIN users u ON u.id = a.client_user_id
        LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
        WHERE a.tenant_id = ? 
          AND a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED'))
          AND a.starts_at >= ?
          AND a.starts_at < ?
          AND (? = 'all' OR ? = 'income')

        UNION ALL

        SELECT 
          'transaction_' || t.id as id,
          t.type,
          t.amount_cents as amountCents,
          t.method as category,
          t.note as description,
          t.created_at as date,
          'COMPLETED' as status
        FROM cash_transactions t
        WHERE t.tenant_id = ?
          AND t.created_at >= ?
          AND t.created_at < ?
          AND (
            ? = 'all' 
            OR (? = 'income' AND t.type = 'INCOME')
            OR (? = 'expense' AND t.type = 'EXPENSE')
          )
      )
      ORDER BY date DESC
    `).all(
      tenantId, start, endExclusive, type, type,
      tenantId, start, endExclusive, type, type, type
    )

    res.json({ transactions, timeZone, start, endExclusive })
  } catch (err) {
    next(err)
  }
})

const requireWhatsappConfig = (tenantId: string) => {
  const row = db
    .prepare(
      `
        SELECT id,
               provider,
               base_url as baseUrl,
               api_key as apiKey,
               instance_name as instanceName,
               status,
               updated_at as updatedAt
        FROM whatsapp_instances
        WHERE tenant_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(tenantId) as
    | {
        id: string
        provider: string
        baseUrl: string | null
        apiKey: string | null
        instanceName: string | null
        status: string
        updatedAt: string
      }
    | undefined

  if (!row) return undefined
  const globals = db
    .prepare(`SELECT key, value FROM platform_settings WHERE key IN ('evolution_api_url', 'evolution_api_key')`)
    .all() as Array<{ key: string; value: string }>
  const defaults = Object.fromEntries(globals.map((item) => [item.key, item.value])) as Record<string, string>
  const tenantApiKey = storedSecretPlaintext(row.apiKey, evolutionTenantSecretPurpose(tenantId))
  const globalApiKey = storedSecretPlaintext(defaults.evolution_api_key, evolutionPlatformSecretPurpose)
  const platformOnly = env.NODE_ENV === 'production'
  return {
    ...row,
    storedBaseUrl: row.baseUrl,
    storedApiKeyCiphertext: row.apiKey,
    baseUrl: platformOnly ? (defaults.evolution_api_url || null) : (row.baseUrl || defaults.evolution_api_url || null),
    apiKey: platformOnly ? (globalApiKey || null) : (tenantApiKey || globalApiKey || null),
    usesGlobalBaseUrl: platformOnly ? Boolean(defaults.evolution_api_url) : (!row.baseUrl && Boolean(defaults.evolution_api_url)),
    usesGlobalApiKey: platformOnly ? Boolean(globalApiKey) : (!row.apiKey && Boolean(globalApiKey)),
  }
}

const ensurePlatformWhatsappConfig = (tenantId: string) => {
  const existing = requireWhatsappConfig(tenantId)
  if (existing) return existing
  const globals = db
    .prepare(`SELECT key, value FROM platform_settings WHERE key IN ('evolution_api_url', 'evolution_api_key')`)
    .all() as Array<{ key: string; value: string }>
  const defaults = Object.fromEntries(globals.map((item) => [item.key, item.value])) as Record<string, string>
  const globalApiKey = storedSecretPlaintext(defaults.evolution_api_key, evolutionPlatformSecretPurpose)
  if (!defaults.evolution_api_url || !globalApiKey) return undefined
  const tenant = db.prepare(`SELECT slug FROM tenants WHERE id = ?`).get(tenantId) as { slug: string } | undefined
  if (!tenant) return undefined
  const safeSlug = tenant.slug.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48)
  const instanceName = `lash-${safeSlug}-${tenantId.replace(/-/g, '').slice(0, 8)}`.slice(0, 80)
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO whatsapp_instances (id, tenant_id, provider, base_url, api_key, instance_name, status, created_at, updated_at)
    VALUES (?, ?, 'EVOLUTION', NULL, NULL, ?, 'CONFIGURED', ?, ?)
  `).run(randomUUID(), tenantId, instanceName, now, now)
  return requireWhatsappConfig(tenantId)
}

const defaultWhatsappSettings = {
  confirmationsEnabled: true,
  confirmationOffsetHours: 24,
  confirmationRetryHours: 8,
  noResponseCutoffHours: 4,
  confirmationMessage:
    'Oi {{nome}}! Seu horário de {{servico}} no {{espaco}} está chegando. Responda 1 para confirmar ou 2 se não puder comparecer.',
  autoCancelDeclined: false,
  remindersEnabled: true,
  reminderOffsetHours: 2,
  reminderMessage:
    'Oi {{nome}}! Passando para lembrar que seu horário de {{servico}} é hoje às {{hora}} no {{espaco}}. Até já!',
  promoEnabled: false,
  promoMessage:
    'Oi {{nome}}, temos uma novidade especial para você esta semana no {{espaco}}. Responda esta mensagem para saber mais.',
}

const requireWhatsappSettings = (tenantId: string) => {
  const row = db
    .prepare(
      `
        SELECT tenant_id as tenantId,
               confirmations_enabled as confirmationsEnabled,
               confirmation_offset_hours as confirmationOffsetHours,
               confirmation_retry_hours as confirmationRetryHours,
               no_response_cutoff_hours as noResponseCutoffHours,
               confirmation_message as confirmationMessage,
               auto_cancel_declined as autoCancelDeclined,
               reminders_enabled as remindersEnabled,
               reminder_offset_hours as reminderOffsetHours,
               reminder_message as reminderMessage,
               promo_enabled as promoEnabled,
               promo_message as promoMessage,
               updated_at as updatedAt
        FROM whatsapp_settings
        WHERE tenant_id = ?
        LIMIT 1
      `,
    )
    .get(tenantId) as
    | {
        tenantId: string
        confirmationsEnabled: number
        confirmationOffsetHours: number
        confirmationRetryHours: number
        noResponseCutoffHours: number
        confirmationMessage: string
        autoCancelDeclined: number
        remindersEnabled: number
        reminderOffsetHours: number
        reminderMessage: string
        promoEnabled: number
        promoMessage: string
        updatedAt: string
      }
    | undefined

  if (!row) return null
  return {
    confirmationsEnabled: Boolean(row.confirmationsEnabled),
    confirmationOffsetHours: row.confirmationOffsetHours,
    confirmationRetryHours: row.confirmationRetryHours,
    noResponseCutoffHours: row.noResponseCutoffHours,
    confirmationMessage: row.confirmationMessage,
    autoCancelDeclined: Boolean(row.autoCancelDeclined),
    remindersEnabled: Boolean(row.remindersEnabled),
    reminderOffsetHours: row.reminderOffsetHours,
    reminderMessage: row.reminderMessage,
    promoEnabled: Boolean(row.promoEnabled),
    promoMessage: row.promoMessage,
    updatedAt: row.updatedAt,
  }
}

app.get('/api/admin/whatsapp', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const row = ensurePlatformWhatsappConfig(tenantId)
    if (!row) {
      res.json({ instance: null })
      return
    }

    res.json({
      instance: {
        id: row.id,
        provider: row.provider,
        baseUrl: row.baseUrl,
        instanceName: row.instanceName,
        status: row.status,
        updatedAt: row.updatedAt,
        hasApiKey: Boolean(row.apiKey && row.apiKey.length > 0),
        usesGlobalBaseUrl: row.usesGlobalBaseUrl,
        usesGlobalApiKey: row.usesGlobalApiKey,
        platformManaged: row.usesGlobalBaseUrl && row.usesGlobalApiKey,
      },
    })
  } catch (err) {
    next(err)
  }
})

app.put('/api/admin/whatsapp', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        provider: z.literal('EVOLUTION').optional(),
        baseUrl: z.string().trim().min(1).max(500).optional(),
        apiKey: z.string().trim().min(16).max(500).optional(),
        instanceName: z.string().trim().regex(/^[a-zA-Z0-9_-]{2,80}$/).optional(),
      })
      .strict()
      .parse(req.body)

    if (env.NODE_ENV === 'production' && (body.baseUrl || body.apiKey)) {
      throw forbidden('A integração WhatsApp é gerenciada pela plataforma em produção.', 'WHATSAPP_PLATFORM_MANAGED')
    }

    const now = new Date().toISOString()
    const existing = requireWhatsappConfig(tenantId)
    const provider = body.provider?.trim() || existing?.provider || 'EVOLUTION'
    const baseUrl = body.baseUrl?.trim() ? await resolveExternalHttpsBaseUrl(body.baseUrl) : existing?.storedBaseUrl || null
    const apiKey = body.apiKey?.trim()
      ? encryptSecret(body.apiKey.trim(), evolutionTenantSecretPurpose(tenantId))
      : existing?.storedApiKeyCiphertext || null
    const instanceName = body.instanceName?.trim() || existing?.instanceName || null
    const status = 'CONFIGURED'

    if (existing) {
      db.prepare(
        `
          UPDATE whatsapp_instances
          SET provider = ?, base_url = ?, api_key = ?, instance_name = ?, status = ?, updated_at = ?
          WHERE id = ?
        `,
      ).run(provider, baseUrl, apiKey, instanceName, status, now, existing.id)
      res.json({ ok: true })
      return
    }

    const id = randomUUID()
    db.prepare(
      `
        INSERT INTO whatsapp_instances (id, tenant_id, provider, base_url, api_key, instance_name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(id, tenantId, provider, baseUrl, apiKey, instanceName, status, now, now)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/whatsapp/settings', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const settings = requireWhatsappSettings(tenantId)
    res.json({ settings: settings ?? defaultWhatsappSettings })
  } catch (err) {
    next(err)
  }
})

app.put('/api/admin/whatsapp/settings', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        confirmationsEnabled: z.boolean().optional(),
        confirmationOffsetHours: z.number().int().min(6).max(168).optional(),
        confirmationRetryHours: z.number().int().min(1).max(72).optional(),
        noResponseCutoffHours: z.number().int().min(1).max(24).optional(),
        confirmationMessage: z
          .string()
          .max(2000)
          .transform((v) => v.trim())
          .pipe(z.string().min(1))
          .optional(),
        autoCancelDeclined: z.boolean().optional(),
        remindersEnabled: z.boolean().optional(),
        reminderOffsetHours: z.number().int().min(1).max(24).optional(),
        reminderMessage: z
          .string()
          .max(2000)
          .transform((v) => v.trim())
          .pipe(z.string().min(1))
          .optional(),
        promoEnabled: z.boolean().optional(),
        promoMessage: z
          .string()
          .max(2000)
          .transform((v) => v.trim())
          .pipe(z.string().min(1))
          .optional(),
      })
      .parse(req.body)

    const existing = requireWhatsappSettings(tenantId) ?? defaultWhatsappSettings

    const confirmationsEnabled = body.confirmationsEnabled ?? existing.confirmationsEnabled
    const confirmationOffsetHours = body.confirmationOffsetHours ?? existing.confirmationOffsetHours
    const confirmationRetryHours = body.confirmationRetryHours ?? existing.confirmationRetryHours
    const noResponseCutoffHours = body.noResponseCutoffHours ?? existing.noResponseCutoffHours
    const confirmationMessage = body.confirmationMessage ?? existing.confirmationMessage
    const autoCancelDeclined = body.autoCancelDeclined ?? existing.autoCancelDeclined
    const remindersEnabled = body.remindersEnabled ?? existing.remindersEnabled
    const reminderOffsetHours = body.reminderOffsetHours ?? existing.reminderOffsetHours
    const reminderMessage = body.reminderMessage ?? existing.reminderMessage
    const promoEnabled = body.promoEnabled ?? existing.promoEnabled
    const promoMessage = body.promoMessage ?? existing.promoMessage

    if (noResponseCutoffHours >= confirmationOffsetHours) {
      return next(badRequest('O limite sem resposta precisa acontecer antes do horário do atendimento.', 'INVALID_CONFIRMATION_WINDOW'))
    }
    if (confirmationRetryHours >= confirmationOffsetHours - noResponseCutoffHours) {
      return next(badRequest('O reenvio precisa acontecer antes do limite de sem resposta.', 'INVALID_CONFIRMATION_RETRY'))
    }
    const now = new Date().toISOString()
    const row = db.prepare('SELECT tenant_id as tenantId FROM whatsapp_settings WHERE tenant_id = ?').get(tenantId) as
      | { tenantId: string }
      | undefined

    if (row) {
      db.prepare(
        `
          UPDATE whatsapp_settings
          SET confirmations_enabled = ?,
              confirmation_offset_hours = ?,
              confirmation_retry_hours = ?,
              no_response_cutoff_hours = ?,
              confirmation_message = ?,
              auto_cancel_declined = ?,
              reminders_enabled = ?,
              reminder_offset_hours = ?,
              reminder_message = ?,
              promo_enabled = ?,
              promo_message = ?,
              updated_at = ?
          WHERE tenant_id = ?
        `,
      ).run(
        confirmationsEnabled ? 1 : 0,
        confirmationOffsetHours,
        confirmationRetryHours,
        noResponseCutoffHours,
        confirmationMessage,
        autoCancelDeclined ? 1 : 0,
        remindersEnabled ? 1 : 0,
        reminderOffsetHours,
        reminderMessage,
        promoEnabled ? 1 : 0,
        promoMessage,
        now,
        tenantId,
      )
      scheduleAppointmentAutomationJobsForTenant(tenantId)
      res.json({ ok: true })
      return
    }

    db.prepare(
      `
        INSERT INTO whatsapp_settings (
          tenant_id,
          confirmations_enabled,
          confirmation_offset_hours,
          confirmation_retry_hours,
          no_response_cutoff_hours,
          confirmation_message,
          auto_cancel_declined,
          reminders_enabled,
          reminder_offset_hours,
          reminder_message,
          promo_enabled,
          promo_message,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      tenantId,
      confirmationsEnabled ? 1 : 0,
      confirmationOffsetHours,
      confirmationRetryHours,
      noResponseCutoffHours,
      confirmationMessage,
      autoCancelDeclined ? 1 : 0,
      remindersEnabled ? 1 : 0,
      reminderOffsetHours,
      reminderMessage,
      promoEnabled ? 1 : 0,
      promoMessage,
      now,
      now,
    )
    scheduleAppointmentAutomationJobsForTenant(tenantId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})


type WhatsappMessageDirection = 'INBOUND' | 'OUTBOUND'
type WhatsappMessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'UNKNOWN'
type WhatsappMessageSource = 'WEBHOOK' | 'MANUAL' | 'AUTOMATION' | 'SYSTEM'

function whatsappPhone(raw: string) {
  return normalizeBrazilPhone(raw) ?? normalizePhone(raw)
}

function whatsappMessagePreview(type: WhatsappMessageType, text: string) {
  const clean = text.trim()
  if (clean) return clean.slice(0, 220)
  if (type === 'IMAGE') return 'Imagem recebida'
  if (type === 'AUDIO') return 'Áudio recebido'
  if (type === 'DOCUMENT') return 'Documento recebido'
  return 'Mensagem recebida'
}

function whatsappConversationForPhone(tenantId: string, rawPhone: string, displayName?: string | null) {
  const phone = whatsappPhone(rawPhone)
  if (!phone) return null
  const client = db.prepare(`
    SELECT c.user_id as userId, c.name
    FROM clients c
    WHERE c.tenant_id = ? AND c.phone_normalized = ?
    LIMIT 1
  `).get(tenantId, phone) as { userId: string; name: string } | undefined
  const existing = db.prepare(`
    SELECT id, display_name as displayName, client_user_id as clientUserId
    FROM whatsapp_conversations
    WHERE tenant_id = ? AND phone_normalized = ?
    LIMIT 1
  `).get(tenantId, phone) as { id: string; displayName: string | null; clientUserId: string | null } | undefined
  const now = new Date().toISOString()
  const resolvedName = client?.name || displayName?.trim() || existing?.displayName || null
  if (existing) {
    db.prepare(`
      UPDATE whatsapp_conversations
      SET display_name = ?, client_user_id = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(resolvedName, client?.userId || existing.clientUserId || null, now, existing.id, tenantId)
    return { id: existing.id, phone, displayName: resolvedName, clientUserId: client?.userId || existing.clientUserId || null }
  }
  const id = randomUUID()
  db.prepare(`
    INSERT INTO whatsapp_conversations
      (id, tenant_id, phone_normalized, display_name, client_user_id, unread_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, tenantId, phone, resolvedName, client?.userId || null, now, now)
  return { id, phone, displayName: resolvedName, clientUserId: client?.userId || null }
}

function recordWhatsappMessage(input: {
  tenantId: string
  phone: string
  direction: WhatsappMessageDirection
  type?: WhatsappMessageType
  text?: string
  source?: WhatsappMessageSource
  providerMessageId?: string | null
  sentAt?: string
  displayName?: string | null
  providerRemoteJid?: string | null
}) {
  const conversation = whatsappConversationForPhone(input.tenantId, input.phone, input.displayName)
  if (!conversation) return { inserted: false as const }
  const type = input.type ?? 'TEXT'
  const text = String(input.text ?? '').trim().slice(0, 12_000)
  const sentAt = input.sentAt && !Number.isNaN(new Date(input.sentAt).getTime()) ? new Date(input.sentAt).toISOString() : new Date().toISOString()
  const providerMessageId = input.providerMessageId?.trim() || null
  if (providerMessageId) {
    const duplicate = db.prepare(`SELECT id FROM whatsapp_messages WHERE tenant_id = ? AND provider_message_id = ? LIMIT 1`).get(input.tenantId, providerMessageId) as { id: string } | undefined
    if (duplicate) return { inserted: false as const, id: duplicate.id, conversationId: conversation.id, clientUserId: conversation.clientUserId }
  } else {
    const recentDuplicate = db.prepare(`
      SELECT id FROM whatsapp_messages
      WHERE tenant_id = ? AND conversation_id = ? AND direction = ? AND body_text = ? AND sent_at >= ?
      LIMIT 1
    `).get(input.tenantId, conversation.id, input.direction, text, new Date(Date.now() - 8_000).toISOString()) as { id: string } | undefined
    if (recentDuplicate) return { inserted: false as const, id: recentDuplicate.id, conversationId: conversation.id, clientUserId: conversation.clientUserId }
  }
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO whatsapp_messages
      (id, tenant_id, conversation_id, phone_normalized, direction, message_type, body_text, source, provider_message_id, sent_at, created_at,
       delivery_status, status_updated_at, media_status, media_remote_jid, media_next_attempt_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.tenantId, conversation.id, conversation.phone, input.direction, type, text, input.source ?? 'WEBHOOK', providerMessageId, sentAt, now,
    input.direction === 'OUTBOUND' ? 'SENT' : 'RECEIVED', now,
    input.direction === 'INBOUND' && ['IMAGE','AUDIO','DOCUMENT'].includes(type) && providerMessageId ? 'PENDING' : 'NONE',
    input.providerRemoteJid ?? null,
    input.direction === 'INBOUND' && ['IMAGE','AUDIO','DOCUMENT'].includes(type) && providerMessageId ? now : null,
  )
  const preview = whatsappMessagePreview(type, text)
  db.prepare(`
    UPDATE whatsapp_conversations
    SET unread_count = unread_count + ?, last_message_preview = ?, last_message_direction = ?, last_message_at = ?, updated_at = ?
    WHERE id = ? AND tenant_id = ?
  `).run(input.direction === 'INBOUND' ? 1 : 0, preview, input.direction, sentAt, now, conversation.id, input.tenantId)
  return { inserted: true as const, id, conversationId: conversation.id, clientUserId: conversation.clientUserId }
}

function evolutionWebhookPayloadHash(payload: unknown) {
  const serialized = JSON.stringify(payload ?? null)
  return createHash('sha256').update(serialized.length > 250_000 ? serialized.slice(0, 250_000) : serialized).digest('hex')
}

function recordEvolutionWebhookEvent(input: {
  tenantId: string
  instanceName: string | null
  eventType: string
  providerMessageId?: string | null
  payload: unknown
  outcome: 'HANDLED' | 'IGNORED' | 'ERROR'
  errorCode?: string | null
}) {
  db.prepare(`
    INSERT INTO evolution_webhook_events
      (id, tenant_id, instance_name, event_type, provider_message_id, outcome, error_code, payload_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), input.tenantId, input.instanceName, input.eventType.slice(0, 80), input.providerMessageId ?? null,
    input.outcome, input.errorCode?.slice(0, 120) ?? null, evolutionWebhookPayloadHash(input.payload), new Date().toISOString(),
  )
}

function touchEvolutionWebhook(tenantId: string, instanceName: string) {
  db.prepare(`UPDATE whatsapp_instances SET webhook_last_at = ?, updated_at = ? WHERE tenant_id = ? AND instance_name = ?`)
    .run(new Date().toISOString(), new Date().toISOString(), tenantId, instanceName)
}

function updateWhatsappDeliveryStatus(tenantId: string, providerMessageId: string, incomingStatus: string) {
  const row = db.prepare(`
    SELECT id, delivery_status as deliveryStatus
    FROM whatsapp_messages
    WHERE tenant_id = ? AND provider_message_id = ? AND direction = 'OUTBOUND'
    LIMIT 1
  `).get(tenantId, providerMessageId) as { id: string; deliveryStatus: string | null } | undefined
  if (!row) return false
  const next = nextWhatsappDeliveryStatus(row.deliveryStatus, incomingStatus)
  if (!next) return false
  db.prepare(`UPDATE whatsapp_messages SET delivery_status = ?, status_updated_at = ? WHERE id = ? AND tenant_id = ?`)
    .run(next, new Date().toISOString(), row.id, tenantId)
  return true
}

function updateEvolutionConnectionFromWebhook(tenantId: string, instanceName: string, state: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'UNKNOWN') {
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE whatsapp_instances
    SET connection_state = ?, last_health_check_at = ?,
        last_connected_at = CASE WHEN ? = 'CONNECTED' THEN ? ELSE last_connected_at END,
        reconnect_attempts = CASE WHEN ? = 'CONNECTED' THEN 0 ELSE reconnect_attempts END,
        reconnect_after = CASE WHEN ? = 'CONNECTED' THEN NULL ELSE reconnect_after END,
        last_connection_error = CASE WHEN ? = 'CONNECTED' THEN NULL ELSE last_connection_error END,
        updated_at = ?
    WHERE tenant_id = ? AND instance_name = ?
  `).run(state, now, state, now, state, state, state, now, tenantId, instanceName)
}

function extractWhatsappProviderMessageId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const root = value as Record<string, unknown>
  const key = root.key && typeof root.key === 'object' ? root.key as Record<string, unknown> : null
  if (typeof key?.id === 'string' && key.id.trim()) return key.id.trim()
  if (typeof root.id === 'string' && root.id.trim()) return root.id.trim()
  for (const child of Object.values(root)) {
    if (child && typeof child === 'object') {
      const nested = extractWhatsappProviderMessageId(child)
      if (nested) return nested
    }
  }
  return null
}

type AppointmentConfirmationStatus =
  | 'NOT_REQUESTED'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'NO_RESPONSE'
  | 'DELIVERY_FAILED'
  | 'MANUALLY_CONFIRMED'

type AppointmentAutomationKind =
  | 'CONFIRMATION_REQUEST'
  | 'CONFIRMATION_RETRY'
  | 'NO_RESPONSE_CUTOFF'
  | 'APPOINTMENT_REMINDER'

type ConfirmationAppointmentRow = {
  id: string
  tenantId: string
  startsAt: string
  status: string
  confirmationStatus: AppointmentConfirmationStatus
  confirmationCode: string | null
  confirmationSentAt: string | null
  clientName: string | null
  clientPhone: string | null
  clientPhoneNormalized: string | null
  serviceName: string
  tenantName: string
  timeZone: string
}

function confirmationEvent(input: {
  tenantId: string
  appointmentId: string
  eventType: string
  channel?: string
  providerMessageId?: string | null
  details?: unknown
}) {
  db.prepare(`
    INSERT OR IGNORE INTO appointment_confirmation_events
      (id, tenant_id, appointment_id, event_type, channel, provider_message_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.tenantId,
    input.appointmentId,
    input.eventType,
    input.channel ?? 'WHATSAPP',
    input.providerMessageId ?? null,
    typeof input.details === 'undefined' ? null : JSON.stringify(input.details),
    new Date().toISOString(),
  )
}

function confirmationAppointmentById(tenantId: string, appointmentId: string) {
  return db.prepare(`
    SELECT a.id,
           a.tenant_id as tenantId,
           a.starts_at as startsAt,
           a.status,
           a.confirmation_status as confirmationStatus,
           a.confirmation_code as confirmationCode,
           a.confirmation_sent_at as confirmationSentAt,
           c.name as clientName,
           c.phone as clientPhone,
           c.phone_normalized as clientPhoneNormalized,
           s.name as serviceName,
           t.name as tenantName,
           COALESCE(ts.timezone, 'America/Sao_Paulo') as timeZone
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN tenants t ON t.id = a.tenant_id
    LEFT JOIN tenant_settings ts ON ts.tenant_id = a.tenant_id
    LEFT JOIN clients c ON c.user_id = a.client_user_id AND c.tenant_id = a.tenant_id
    WHERE a.id = ? AND a.tenant_id = ?
    LIMIT 1
  `).get(appointmentId, tenantId) as ConfirmationAppointmentRow | undefined
}

function formatAppointmentLocal(iso: string, timeZone: string) {
  const date = new Date(iso)
  const dateText = new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit' }).format(date)
  const timeText = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  return { dateText, timeText }
}

function renderAppointmentTemplate(template: string, appointment: ConfirmationAppointmentRow) {
  const local = formatAppointmentLocal(appointment.startsAt, appointment.timeZone)
  return template
    .replaceAll('{{nome}}', appointment.clientName || 'cliente')
    .replaceAll('{{servico}}', appointment.serviceName)
    .replaceAll('{{data}}', local.dateText)
    .replaceAll('{{hora}}', local.timeText)
    .replaceAll('{{espaco}}', appointment.tenantName)
    // 5.0: confirmation codes are legacy correlation only and are never exposed in new messages.
    .replaceAll('{{codigo}}', '')
}

async function configureEvolutionWebhookForTenant(tenantId: string) {
  const config = requireWhatsappConfig(tenantId)
  if (!config?.baseUrl || !config.apiKey || !config.instanceName || !env.APP_BASE_URL || !env.EVOLUTION_WEBHOOK_SECRET) return false
  const endpoint = `${await resolveExternalHttpsBaseUrl(config.baseUrl)}/webhook/set/${encodeURIComponent(config.instanceName)}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      enabled: true,
      url: `${env.APP_BASE_URL.replace(/\/$/, '')}/api/webhooks/evolution/${encodeURIComponent(tenantId)}`,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      headers: { 'x-webhook-secret': env.EVOLUTION_WEBHOOK_SECRET },
      base64: false,
    }),
  }).catch(() => null)
  return Boolean(response?.ok)
}

async function evolutionWebhookConfiguredForTenant(tenantId: string) {
  const config = requireWhatsappConfig(tenantId)
  if (!config?.baseUrl || !config.apiKey || !config.instanceName || !env.APP_BASE_URL) return null
  const response = await fetch(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/webhook/find/${encodeURIComponent(config.instanceName)}`, {
    headers: { apikey: config.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null)
  if (!response?.ok) return null
  const raw = await response.json().catch(() => null)

  const findWebhookRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object') return null
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findWebhookRecord(item)
        if (found) return found
      }
      return null
    }
    const record = value as Record<string, unknown>
    if (typeof record.url === 'string' && (Array.isArray(record.events) || 'enabled' in record)) return record
    for (const child of Object.values(record)) {
      const found = findWebhookRecord(child)
      if (found) return found
    }
    return null
  }

  const record = findWebhookRecord(raw)
  if (!record) return false
  const expectedUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/api/webhooks/evolution/${encodeURIComponent(tenantId)}`
  const configuredUrl = typeof record.url === 'string' ? record.url.replace(/\/$/, '') : ''
  const events = Array.isArray(record.events) ? record.events.map((event) => String(event).toUpperCase()) : []
  const enabled = typeof record.enabled === 'boolean' ? record.enabled : true
  return enabled && configuredUrl === expectedUrl.replace(/\/$/, '') && ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'].every((event) => events.includes(event))
}


async function fetchEvolutionConnectionState(tenantId: string) {
  const config = requireWhatsappConfig(tenantId)
  if (!config?.baseUrl || !config.apiKey || !config.instanceName) return { state: null, config: null }
  const response = await fetch(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/instance/connectionState/${encodeURIComponent(config.instanceName)}`, {
    headers: { apikey: config.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null)
  if (!response?.ok) return { state: null, config }
  const raw = await response.json().catch(() => null)
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const instance = root.instance && typeof root.instance === 'object' ? root.instance as Record<string, unknown> : {}
  return { state: normalizeEvolutionConnectionState(instance.state ?? root.state), config }
}

let whatsappHealthWorkerRunning = false
async function processWhatsappConnectionHealth() {
  if (whatsappHealthWorkerRunning) return
  whatsappHealthWorkerRunning = true
  try {
    const now = new Date()
    const staleClaim = new Date(now.getTime() - 5 * 60_000).toISOString()
    const rows = db.prepare(`
      SELECT tenant_id as tenantId, instance_name as instanceName, reconnect_attempts as reconnectAttempts,
             reconnect_after as reconnectAfter, reconnect_claimed_at as reconnectClaimedAt
      FROM whatsapp_instances
      WHERE instance_name IS NOT NULL AND instance_name <> ''
      ORDER BY COALESCE(last_health_check_at, created_at) ASC
      LIMIT 60
    `).all() as Array<{ tenantId: string; instanceName: string; reconnectAttempts: number; reconnectAfter: string | null; reconnectClaimedAt: string | null }>

    for (const row of rows) {
      const checkedAt = new Date().toISOString()
      const health = await fetchEvolutionConnectionState(row.tenantId)
      if (health.state === 'CONNECTED') {
        db.prepare(`
          UPDATE whatsapp_instances
          SET connection_state = 'CONNECTED', last_health_check_at = ?, last_connected_at = ?, last_connection_error = NULL,
              reconnect_attempts = 0, reconnect_after = NULL, reconnect_claimed_at = NULL, updated_at = ?
          WHERE tenant_id = ? AND instance_name = ?
        `).run(checkedAt, checkedAt, checkedAt, row.tenantId, row.instanceName)
        continue
      }

      if (health.state === 'CONNECTING') {
        db.prepare(`UPDATE whatsapp_instances SET connection_state = 'CONNECTING', last_health_check_at = ?, reconnect_claimed_at = NULL, updated_at = ? WHERE tenant_id = ? AND instance_name = ?`)
          .run(checkedAt, checkedAt, row.tenantId, row.instanceName)
        continue
      }

      const nextAttempts = Math.min(12, Number(row.reconnectAttempts || 0) + 1)
      const retryAllowed = !row.reconnectAfter || new Date(row.reconnectAfter).getTime() <= Date.now()
      const cooldownMinutes = Math.min(60, 2 ** Math.min(5, Math.max(0, nextAttempts - 1)) * 2)
      const retryAt = new Date(Date.now() + cooldownMinutes * 60_000).toISOString()
      const healthError = health.state === 'DISCONNECTED' ? 'Provider informou conexão fechada' : 'Falha ao consultar estado da conexão'
      db.prepare(`
        UPDATE whatsapp_instances
        SET connection_state = ?, last_health_check_at = ?, last_connection_error = ?, reconnect_attempts = ?,
            reconnect_after = COALESCE(reconnect_after, ?), reconnect_claimed_at = NULL, updated_at = ?
        WHERE tenant_id = ? AND instance_name = ?
      `).run(health.state ?? 'UNKNOWN', checkedAt, healthError, nextAttempts, retryAt, checkedAt, row.tenantId, row.instanceName)

      if (!retryAllowed || nextAttempts < 2 || !health.config?.baseUrl || !health.config.apiKey) continue
      const claimed = db.prepare(`
        UPDATE whatsapp_instances
        SET reconnect_claimed_at = ?, reconnect_after = ?, updated_at = ?
        WHERE tenant_id = ? AND instance_name = ?
          AND (reconnect_claimed_at IS NULL OR reconnect_claimed_at < ?)
          AND (reconnect_after IS NULL OR reconnect_after <= ?)
      `).run(checkedAt, retryAt, checkedAt, row.tenantId, row.instanceName, staleClaim, checkedAt)
      if (!claimed.changes) continue

      try {
        // Current Evolution main reconnects a closed Baileys instance through the connect route.
        const response = await fetch(`${await resolveExternalHttpsBaseUrl(health.config.baseUrl)}/instance/connect/${encodeURIComponent(row.instanceName)}`, {
          headers: { apikey: health.config.apiKey },
          redirect: 'error',
          signal: AbortSignal.timeout(12_000),
        })
        if (!response.ok) throw new Error(`Evolution connect HTTP ${response.status}`)
        db.prepare(`UPDATE whatsapp_instances SET connection_state = 'CONNECTING', reconnect_claimed_at = NULL, last_connection_error = NULL, updated_at = ? WHERE tenant_id = ? AND instance_name = ?`)
          .run(new Date().toISOString(), row.tenantId, row.instanceName)
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
        db.prepare(`UPDATE whatsapp_instances SET reconnect_claimed_at = NULL, last_connection_error = ?, reconnect_after = ?, updated_at = ? WHERE tenant_id = ? AND instance_name = ?`)
          .run(message, retryAt, new Date().toISOString(), row.tenantId, row.instanceName)
      }
    }
  } finally {
    whatsappHealthWorkerRunning = false
  }
}


let whatsappMediaWorkerRunning = false
async function processWhatsappMediaQueue() {
  if (whatsappMediaWorkerRunning) return
  whatsappMediaWorkerRunning = true
  try {
    const now = new Date().toISOString()
    const rows = db.prepare(`
      SELECT id, tenant_id as tenantId, provider_message_id as providerMessageId,
             media_remote_jid as remoteJid, media_attempts as attempts
      FROM whatsapp_messages
      WHERE direction = 'INBOUND'
        AND media_status IN ('PENDING','FAILED')
        AND provider_message_id IS NOT NULL
        AND media_remote_jid IS NOT NULL
        AND media_attempts < 5
        AND (media_next_attempt_at IS NULL OR media_next_attempt_at <= ?)
      ORDER BY sent_at ASC
      LIMIT 12
    `).all(now) as Array<{ id: string; tenantId: string; providerMessageId: string; remoteJid: string; attempts: number }>

    for (const row of rows) {
      const config = requireWhatsappConfig(row.tenantId)
      if (!config?.baseUrl || !config.apiKey || !config.instanceName) {
        db.prepare(`UPDATE whatsapp_messages SET media_status = 'FAILED', media_attempts = media_attempts + 1, media_last_error = ?, media_next_attempt_at = ?, status_updated_at = ? WHERE id = ? AND tenant_id = ?`)
          .run('Integração Evolution indisponível', new Date(Date.now() + 30 * 60_000).toISOString(), new Date().toISOString(), row.id, row.tenantId)
        continue
      }
      try {
        const response = await fetch(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/chat/getBase64FromMediaMessage/${encodeURIComponent(config.instanceName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({ message: { key: { id: row.providerMessageId, remoteJid: row.remoteJid, fromMe: false } }, convertToMp4: false }),
        })
        if (!response.ok) throw new Error(`Evolution media HTTP ${response.status}`)
        const raw = await response.json().catch(() => null)
        const media = normalizeWhatsappMediaPayload(raw)
        if (!media) throw new Error('Mídia vazia, inválida ou acima de 8 MB')
        const relativePath = safeWhatsappMediaRelativePath(row.tenantId, row.id, media.extension)
        const absolutePath = resolvePrivateWhatsappMediaPath(env.WHATSAPP_MEDIA_DIR, relativePath)
        await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o750 })
        await writeFile(absolutePath, media.buffer, { mode: 0o640 })
        db.prepare(`
          UPDATE whatsapp_messages
          SET media_status = 'READY', media_mime_type = ?, media_file_name = ?, media_size_bytes = ?, media_storage_path = ?,
              media_last_error = NULL, media_next_attempt_at = NULL, status_updated_at = ?
          WHERE id = ? AND tenant_id = ?
        `).run(media.mime, media.fileName, media.buffer.length, relativePath, new Date().toISOString(), row.id, row.tenantId)
      } catch (error) {
        const attempts = Number(row.attempts || 0) + 1
        const retryMinutes = Math.min(120, 2 ** Math.max(0, attempts - 1) * 5)
        const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
        db.prepare(`
          UPDATE whatsapp_messages
          SET media_status = 'FAILED', media_attempts = ?, media_last_error = ?, media_next_attempt_at = ?, status_updated_at = ?
          WHERE id = ? AND tenant_id = ?
        `).run(attempts, message, attempts >= 5 ? null : new Date(Date.now() + retryMinutes * 60_000).toISOString(), new Date().toISOString(), row.id, row.tenantId)
      }
    }
  } finally {
    whatsappMediaWorkerRunning = false
  }
}

async function sendAppointmentConfirmation(appointment: ConfirmationAppointmentRow, eventType: 'REQUEST_SENT' | 'RESENT') {
  if (!appointment.clientPhone) return { ok: false as const, code: 'NO_CLIENT_PHONE' }
  const settings = requireWhatsappSettings(appointment.tenantId) ?? defaultWhatsappSettings
  if (!settings.confirmationsEnabled) return { ok: false as const, code: 'CONFIRMATIONS_DISABLED' }
  if (!(await configureEvolutionWebhookForTenant(appointment.tenantId))) {
    confirmationEvent({ tenantId: appointment.tenantId, appointmentId: appointment.id, eventType: 'WEBHOOK_CONFIG_FAILED', details: { eventType } })
    return { ok: false as const, code: 'WHATSAPP_WEBHOOK_NOT_READY' }
  }

  const legacyCode = appointment.confirmationCode || null
  const text = renderAppointmentTemplate(settings.confirmationMessage, appointment)
  let outboundProviderMessageId: string | null = null
  const delivered = await sendWhatsappTextForTenant(appointment.tenantId, appointment.clientPhone, text, {
    purpose: 'APPOINTMENT_AUTOMATION',
    onProviderMessageId: (id) => { outboundProviderMessageId = id },
  })
  if (!delivered) return { ok: false as const, code: 'WHATSAPP_DELIVERY_FAILED' }

  const now = new Date().toISOString()
  if (eventType === 'REQUEST_SENT') {
    db.prepare(`
      UPDATE appointments
      SET confirmation_status = 'AWAITING_CONFIRMATION', confirmation_code = ?, confirmation_sent_at = ?, confirmation_reminder_sent_at = NULL
      WHERE id = ? AND tenant_id = ?
    `).run(legacyCode, now, appointment.id, appointment.tenantId)
  } else if (!appointment.confirmationSentAt) {
    db.prepare(`
      UPDATE appointments
      SET confirmation_status = 'AWAITING_CONFIRMATION', confirmation_code = ?, confirmation_sent_at = ?, confirmation_reminder_sent_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(legacyCode, now, now, appointment.id, appointment.tenantId)
  } else {
    db.prepare(`
      UPDATE appointments
      SET confirmation_status = 'AWAITING_CONFIRMATION', confirmation_code = ?, confirmation_reminder_sent_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(legacyCode, now, appointment.id, appointment.tenantId)
  }
  confirmationEvent({ tenantId: appointment.tenantId, appointmentId: appointment.id, eventType, providerMessageId: outboundProviderMessageId })
  return { ok: true as const }
}

async function sendAppointmentReminder(appointment: ConfirmationAppointmentRow) {
  if (!appointment.clientPhone) return { ok: false as const, code: 'NO_CLIENT_PHONE' }
  const settings = requireWhatsappSettings(appointment.tenantId) ?? defaultWhatsappSettings
  if (!settings.remindersEnabled) return { ok: false as const, code: 'REMINDERS_DISABLED' }
  const text = renderAppointmentTemplate(settings.reminderMessage, appointment)
  const delivered = await sendWhatsappTextForTenant(appointment.tenantId, appointment.clientPhone, text, { purpose: 'APPOINTMENT_AUTOMATION' })
  if (!delivered) return { ok: false as const, code: 'WHATSAPP_DELIVERY_FAILED' }
  const now = new Date().toISOString()
  db.prepare(`UPDATE appointments SET appointment_reminder_sent_at = ? WHERE id = ? AND tenant_id = ?`).run(now, appointment.id, appointment.tenantId)
  confirmationEvent({ tenantId: appointment.tenantId, appointmentId: appointment.id, eventType: 'APPOINTMENT_REMINDER_SENT' })
  return { ok: true as const }
}

function upsertAutomationJob(tenantId: string, appointmentId: string, kind: AppointmentAutomationKind, scheduledAt: Date) {
  const now = new Date().toISOString()
  const key = `${appointmentId}:${kind}`
  db.prepare(`
    INSERT INTO appointment_automation_jobs
      (id, tenant_id, appointment_id, kind, idempotency_key, scheduled_at, status, attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
    ON CONFLICT(idempotency_key) DO UPDATE SET
      scheduled_at = CASE WHEN appointment_automation_jobs.status IN ('PENDING','CANCELLED') THEN excluded.scheduled_at ELSE appointment_automation_jobs.scheduled_at END,
      status = CASE WHEN appointment_automation_jobs.status IN ('PENDING','CANCELLED') THEN 'PENDING' ELSE appointment_automation_jobs.status END,
      attempts = CASE WHEN appointment_automation_jobs.status = 'CANCELLED' THEN 0 ELSE appointment_automation_jobs.attempts END,
      claimed_at = CASE WHEN appointment_automation_jobs.status IN ('PENDING','CANCELLED') THEN NULL ELSE appointment_automation_jobs.claimed_at END,
      last_error = CASE WHEN appointment_automation_jobs.status IN ('PENDING','CANCELLED') THEN NULL ELSE appointment_automation_jobs.last_error END,
      updated_at = excluded.updated_at
  `).run(randomUUID(), tenantId, appointmentId, kind, key, scheduledAt.toISOString(), now, now)
}

function cancelAppointmentJobs(tenantId: string, appointmentId: string, kinds?: AppointmentAutomationKind[]) {
  const now = new Date().toISOString()
  if (!kinds?.length) {
    db.prepare(`UPDATE appointment_automation_jobs SET status = 'CANCELLED', claimed_at = NULL, updated_at = ? WHERE tenant_id = ? AND appointment_id = ? AND status IN ('PENDING','FAILED','PROCESSING')`).run(now, tenantId, appointmentId)
    return
  }
  const placeholders = kinds.map(() => '?').join(',')
  db.prepare(`UPDATE appointment_automation_jobs SET status = 'CANCELLED', claimed_at = NULL, updated_at = ? WHERE tenant_id = ? AND appointment_id = ? AND kind IN (${placeholders}) AND status IN ('PENDING','FAILED','PROCESSING')`)
    .run(now, tenantId, appointmentId, ...kinds)
}

function scheduleAppointmentAutomationJobs(tenantId: string, appointmentId: string) {
  const appointment = confirmationAppointmentById(tenantId, appointmentId)
  if (!appointment || appointment.status === 'CANCELLED') {
    cancelAppointmentJobs(tenantId, appointmentId)
    return
  }
  const settings = requireWhatsappSettings(tenantId) ?? defaultWhatsappSettings
  const startMs = new Date(appointment.startsAt).getTime()
  if (!Number.isFinite(startMs) || startMs <= Date.now()) {
    cancelAppointmentJobs(tenantId, appointmentId)
    return
  }

  if (settings.confirmationsEnabled && !['CONFIRMED','MANUALLY_CONFIRMED','DECLINED'].includes(appointment.confirmationStatus)) {
    if (!appointment.clientPhoneNormalized) {
      if (appointment.confirmationStatus !== 'DELIVERY_FAILED') {
        db.prepare(`UPDATE appointments SET confirmation_status = 'DELIVERY_FAILED' WHERE id = ? AND tenant_id = ? AND confirmation_status NOT IN ('CONFIRMED','MANUALLY_CONFIRMED','DECLINED')`).run(appointmentId, tenantId)
        confirmationEvent({ tenantId, appointmentId, eventType: 'NO_CLIENT_PHONE' })
      }
      cancelAppointmentJobs(tenantId, appointmentId, ['CONFIRMATION_REQUEST','CONFIRMATION_RETRY','NO_RESPONSE_CUTOFF'])
    } else {
      const nowMs = Date.now()
      const requestMs = Math.max(nowMs, startMs - settings.confirmationOffsetHours * 60 * 60_000)
      const retryMs = requestMs + settings.confirmationRetryHours * 60 * 60_000
      const cutoffMs = startMs - settings.noResponseCutoffHours * 60 * 60_000
      upsertAutomationJob(tenantId, appointmentId, 'CONFIRMATION_REQUEST', new Date(requestMs))
      if (retryMs < cutoffMs && retryMs > nowMs + 15 * 60_000) upsertAutomationJob(tenantId, appointmentId, 'CONFIRMATION_RETRY', new Date(retryMs))
      else cancelAppointmentJobs(tenantId, appointmentId, ['CONFIRMATION_RETRY'])
      if (cutoffMs > nowMs + 15 * 60_000) upsertAutomationJob(tenantId, appointmentId, 'NO_RESPONSE_CUTOFF', new Date(cutoffMs))
      else cancelAppointmentJobs(tenantId, appointmentId, ['NO_RESPONSE_CUTOFF'])
    }
  } else {
    cancelAppointmentJobs(tenantId, appointmentId, ['CONFIRMATION_REQUEST','CONFIRMATION_RETRY','NO_RESPONSE_CUTOFF'])
  }

  if (settings.remindersEnabled) {
    const reminderMs = startMs - settings.reminderOffsetHours * 60 * 60_000
    if (reminderMs > Date.now()) upsertAutomationJob(tenantId, appointmentId, 'APPOINTMENT_REMINDER', new Date(reminderMs))
    else cancelAppointmentJobs(tenantId, appointmentId, ['APPOINTMENT_REMINDER'])
  } else {
    cancelAppointmentJobs(tenantId, appointmentId, ['APPOINTMENT_REMINDER'])
  }
}

function scheduleAppointmentAutomationJobsForTenant(tenantId: string) {
  const rows = db.prepare(`SELECT id FROM appointments WHERE tenant_id = ? AND status != 'CANCELLED' AND starts_at > ? ORDER BY starts_at ASC LIMIT 1000`).all(tenantId, new Date().toISOString()) as Array<{ id: string }>
  for (const row of rows) scheduleAppointmentAutomationJobs(tenantId, row.id)
}

function ensureUpcomingAppointmentAutomationJobs() {
  const now = new Date()
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60_000).toISOString()
  // Appointment writes are job-first. The periodic pass is only a safety reconciler for
  // appointments that somehow ended up with no runnable jobs at all.
  const rows = db.prepare(`
    SELECT a.id, a.tenant_id as tenantId
    FROM appointments a
    WHERE a.status != 'CANCELLED'
      AND a.starts_at > ? AND a.starts_at <= ?
      AND NOT EXISTS (
        SELECT 1 FROM appointment_automation_jobs j
        WHERE j.tenant_id = a.tenant_id
          AND j.appointment_id = a.id
          AND j.status IN ('PENDING','PROCESSING','FAILED')
      )
    ORDER BY a.starts_at ASC
    LIMIT 300
  `).all(now.toISOString(), horizon) as Array<{ id: string; tenantId: string }>
  for (const row of rows) scheduleAppointmentAutomationJobs(row.tenantId, row.id)
}

function claimNextAutomationJob() {
  const now = new Date()
  const stale = new Date(now.getTime() - 10 * 60_000).toISOString()
  return db.transaction(() => {
    db.prepare(`UPDATE appointment_automation_jobs SET status = 'FAILED', claimed_at = NULL, scheduled_at = ?, last_error = 'Lease expirou antes de concluir', updated_at = ? WHERE status = 'PROCESSING' AND claimed_at < ? AND attempts < 5`).run(now.toISOString(), now.toISOString(), stale)
    const row = db.prepare(`
      SELECT id, tenant_id as tenantId, appointment_id as appointmentId, kind, attempts
      FROM appointment_automation_jobs
      WHERE status IN ('PENDING','FAILED') AND scheduled_at <= ? AND attempts < 5
      ORDER BY scheduled_at ASC
      LIMIT 1
    `).get(now.toISOString()) as { id: string; tenantId: string; appointmentId: string; kind: AppointmentAutomationKind; attempts: number } | undefined
    if (!row) return undefined
    const changed = db.prepare(`UPDATE appointment_automation_jobs SET status = 'PROCESSING', attempts = attempts + 1, claimed_at = ?, updated_at = ? WHERE id = ? AND status IN ('PENDING','FAILED')`).run(now.toISOString(), now.toISOString(), row.id)
    return changed.changes === 1 ? { ...row, attempts: row.attempts + 1 } : undefined
  }).immediate()
}

function finishAutomationJob(id: string, status: 'DONE' | 'CANCELLED' = 'DONE') {
  db.prepare(`UPDATE appointment_automation_jobs SET status = ?, claimed_at = NULL, last_error = NULL, updated_at = ? WHERE id = ?`).run(status, new Date().toISOString(), id)
}

function failAutomationJob(job: { id: string; attempts: number; kind: AppointmentAutomationKind; tenantId: string; appointmentId: string }, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400)
  const terminal = job.attempts >= 5
  const retryAt = new Date(Date.now() + Math.min(60, 2 ** Math.max(0, job.attempts - 1) * 5) * 60_000).toISOString()
  db.prepare(`UPDATE appointment_automation_jobs SET status = 'FAILED', scheduled_at = ?, claimed_at = NULL, last_error = ?, updated_at = ? WHERE id = ?`).run(retryAt, message, new Date().toISOString(), job.id)
  if (terminal && job.kind === 'CONFIRMATION_REQUEST') {
    db.prepare(`UPDATE appointments SET confirmation_status = 'DELIVERY_FAILED' WHERE id = ? AND tenant_id = ? AND confirmation_status = 'NOT_REQUESTED'`).run(job.appointmentId, job.tenantId)
    confirmationEvent({ tenantId: job.tenantId, appointmentId: job.appointmentId, eventType: 'DELIVERY_FAILED', details: { reason: message } })
  }
}

async function processAutomationJob(job: { id: string; tenantId: string; appointmentId: string; kind: AppointmentAutomationKind; attempts: number }) {
  const appointment = confirmationAppointmentById(job.tenantId, job.appointmentId)
  if (!appointment || appointment.status === 'CANCELLED' || new Date(appointment.startsAt).getTime() <= Date.now()) {
    finishAutomationJob(job.id, 'CANCELLED')
    return
  }
  if (job.kind === 'CONFIRMATION_REQUEST') {
    if (!['NOT_REQUESTED','DELIVERY_FAILED'].includes(appointment.confirmationStatus)) return finishAutomationJob(job.id, 'CANCELLED')
    const result = await sendAppointmentConfirmation(appointment, 'REQUEST_SENT')
    if (!result.ok) throw new Error(result.code)
    return finishAutomationJob(job.id)
  }
  if (job.kind === 'CONFIRMATION_RETRY') {
    if (appointment.confirmationStatus !== 'AWAITING_CONFIRMATION') return finishAutomationJob(job.id, 'CANCELLED')
    const result = await sendAppointmentConfirmation(appointment, 'RESENT')
    if (!result.ok) throw new Error(result.code)
    return finishAutomationJob(job.id)
  }
  if (job.kind === 'NO_RESPONSE_CUTOFF') {
    const changed = db.prepare(`UPDATE appointments SET confirmation_status = 'NO_RESPONSE' WHERE id = ? AND tenant_id = ? AND confirmation_status = 'AWAITING_CONFIRMATION'`).run(appointment.id, appointment.tenantId)
    if (changed.changes) confirmationEvent({ tenantId: appointment.tenantId, appointmentId: appointment.id, eventType: 'NO_RESPONSE' })
    return finishAutomationJob(job.id)
  }
  if (job.kind === 'APPOINTMENT_REMINDER') {
    if (!['CONFIRMED','MANUALLY_CONFIRMED'].includes(appointment.confirmationStatus)) return finishAutomationJob(job.id, 'CANCELLED')
    const result = await sendAppointmentReminder(appointment)
    if (!result.ok) throw new Error(result.code)
    return finishAutomationJob(job.id)
  }
}

let appointmentAutomationWorkerRunning = false
async function processAppointmentAutomationQueue() {
  if (appointmentAutomationWorkerRunning) return
  appointmentAutomationWorkerRunning = true
  try {
    ensureUpcomingAppointmentAutomationJobs()
    for (let i = 0; i < 30; i += 1) {
      const job = claimNextAutomationJob()
      if (!job) break
      try {
        await processAutomationJob(job)
      } catch (error) {
        failAutomationJob(job, error)
      }
    }
  } finally {
    appointmentAutomationWorkerRunning = false
  }
}

function extractEvolutionInbound(payload: unknown) {
  const asRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const firstRecord = (value: unknown): Record<string, unknown> => {
    if (Array.isArray(value)) return asRecord(value.find((item) => item && typeof item === 'object'))
    return asRecord(value)
  }

  const root = asRecord(payload)
  const data = firstRecord(root.data)
  // Some Evolution builds/event adapters place the message fields directly at the root.
  const envelope = Object.keys(data).length ? data : root
  const key = firstRecord(envelope.key)
  const message = firstRecord(envelope.message)
  const extended = firstRecord(message.extendedTextMessage)
  const buttons = firstRecord(message.buttonsResponseMessage)
  const template = firstRecord(message.templateButtonReplyMessage)
  const list = firstRecord(message.listResponseMessage)
  const single = firstRecord(list.singleSelectReply)
  const image = firstRecord(message.imageMessage)
  const document = firstRecord(message.documentMessage)
  const audio = firstRecord(message.audioMessage)
  const contextCandidates = [extended.contextInfo, image.contextInfo, document.contextInfo, audio.contextInfo, message.contextInfo]
    .map(firstRecord)
  const quotedProviderMessageId = contextCandidates
    .map((context) => context.stanzaId ?? context.stanzaID)
    .find((value) => typeof value === 'string' && value.trim())

  const candidates = [
    message.conversation,
    extended.text,
    image.caption,
    document.caption,
    buttons.selectedDisplayText,
    buttons.selectedButtonId,
    template.selectedDisplayText,
    template.selectedId,
    single.selectedRowId,
    list.title,
  ]
  const text = candidates.find((value) => typeof value === 'string' && value.trim())

  const remoteJid = typeof key.remoteJid === 'string' ? key.remoteJid : typeof envelope.remoteJid === 'string' ? envelope.remoteJid : ''
  const remoteJidAlt = typeof key.remoteJidAlt === 'string'
    ? key.remoteJidAlt
    : typeof envelope.remoteJidAlt === 'string'
      ? envelope.remoteJidAlt
      : ''
  // Newer Baileys/Evolution builds may expose a @lid JID as remoteJid and the actual phone JID
  // as remoteJidAlt. Prefer the phone JID so the same person does not become a fake numeric contact.
  const preferredJid = remoteJid.endsWith('@lid') && remoteJidAlt ? remoteJidAlt : (remoteJid || remoteJidAlt)
  const phoneRaw = preferredJid.split('@')[0] || ''
  const phone = normalizeBrazilPhone(phoneRaw) ?? phoneRaw.replace(/\D/g, '')
  const messageType: WhatsappMessageType = Object.keys(image).length ? 'IMAGE' : Object.keys(audio).length ? 'AUDIO' : Object.keys(document).length ? 'DOCUMENT' : text ? 'TEXT' : 'UNKNOWN'
  const rawTimestamp = envelope.messageTimestamp ?? root.messageTimestamp
  const numericTimestamp = typeof rawTimestamp === 'number' ? rawTimestamp : typeof rawTimestamp === 'string' ? Number(rawTimestamp) : NaN
  const sentAt = Number.isFinite(numericTimestamp)
    ? new Date(numericTimestamp < 10_000_000_000 ? numericTimestamp * 1000 : numericTimestamp).toISOString()
    : new Date().toISOString()

  const eventRaw = root.event ?? root.type ?? envelope.event
  const instanceRaw = root.instance ?? root.instanceName ?? envelope.instance ?? envelope.instanceName
  return {
    event: String(eventRaw ?? '').replace(/[.-]/g, '_').toUpperCase(),
    instanceName: String(instanceRaw ?? ''),
    providerMessageId: typeof key.id === 'string' ? key.id : typeof envelope.id === 'string' ? envelope.id : null,
    providerRemoteJid: preferredJid || null,
    quotedProviderMessageId: typeof quotedProviderMessageId === 'string' ? quotedProviderMessageId.trim() : null,
    fromMe: Boolean(key.fromMe ?? envelope.fromMe),
    phone,
    text: typeof text === 'string' ? text.trim() : '',
    pushName: typeof envelope.pushName === 'string' ? envelope.pushName.trim() : typeof root.pushName === 'string' ? root.pushName.trim() : '',
    messageType,
    sentAt,
    isGroup: remoteJid.endsWith('@g.us') || remoteJidAlt.endsWith('@g.us'),
  }
}


async function handleEvolutionConfirmationWebhook(payload: unknown, expectedTenantId: string) {
  const inbound = extractEvolutionInbound(payload)
  if (inbound.event !== 'MESSAGES_UPSERT' || inbound.fromMe || !inbound.instanceName || !inbound.phone || !inbound.text) return { handled: false }
  if (inbound.providerMessageId) {
    const duplicate = db.prepare(`SELECT id FROM appointment_confirmation_events WHERE provider_message_id = ? LIMIT 1`).get(inbound.providerMessageId)
    if (duplicate) return { handled: true, duplicate: true }
  }
  const parsed = confirmationReplyIntent(inbound.text)
  if (!parsed.intent) return { handled: false }
  const instance = db.prepare(`SELECT tenant_id as tenantId FROM whatsapp_instances WHERE instance_name = ? AND tenant_id = ? LIMIT 1`).get(inbound.instanceName, expectedTenantId) as { tenantId: string } | undefined
  if (!instance) return { handled: false }

  const explicitlyRepliedAppointment = inbound.quotedProviderMessageId
    ? db.prepare(`
        SELECT appointment_id as appointmentId
        FROM appointment_confirmation_events
        WHERE tenant_id = ? AND provider_message_id = ? AND event_type IN ('REQUEST_SENT','RESENT')
        ORDER BY created_at DESC LIMIT 1
      `).get(instance.tenantId, inbound.quotedProviderMessageId) as { appointmentId: string } | undefined
    : undefined

  const rows = db.prepare(`
    SELECT a.id, a.confirmation_code as confirmationCode, a.starts_at as startsAt,
           a.confirmation_sent_at as confirmationSentAt, a.confirmation_reminder_sent_at as confirmationReminderSentAt,
           a.confirmation_status as confirmationStatus, c.name as clientName, c.phone as clientPhone
    FROM appointments a
    JOIN clients c ON c.user_id = a.client_user_id AND c.tenant_id = a.tenant_id
    WHERE a.tenant_id = ?
      AND c.phone_normalized = ?
      AND a.status != 'CANCELLED'
      AND a.starts_at > ?
      AND a.starts_at < ?
      AND COALESCE(a.confirmation_reminder_sent_at, a.confirmation_sent_at) >= ?
      AND a.confirmation_status IN ('AWAITING_CONFIRMATION','NO_RESPONSE','DELIVERY_FAILED')
    ORDER BY a.starts_at ASC
    LIMIT 8
  `).all(
    instance.tenantId,
    inbound.phone,
    new Date().toISOString(),
    new Date(Date.now() + 72 * 60 * 60_000).toISOString(),
    new Date(Date.now() - 72 * 60 * 60_000).toISOString(),
  ) as Array<{ id: string; confirmationCode: string | null; startsAt: string; confirmationSentAt: string | null; confirmationReminderSentAt: string | null; confirmationStatus: AppointmentConfirmationStatus; clientName: string | null; clientPhone: string | null }>

  const candidates = explicitlyRepliedAppointment
    ? rows.filter((row) => row.id === explicitlyRepliedAppointment.appointmentId)
    : parsed.code
      ? rows.filter((row) => row.confirmationCode === parsed.code)
      : rows
  if (!candidates.length) return { handled: false }
  if (candidates.length > 1) {
    const details = candidates.map((row, index) => {
      const local = formatAppointmentLocal(row.startsAt, confirmationAppointmentById(instance.tenantId, row.id)?.timeZone || 'America/Sao_Paulo')
      return `${index + 1}. ${local.dateText} às ${local.timeText}`
    }).join('\n')
    confirmationEvent({ tenantId: instance.tenantId, appointmentId: candidates[0].id, eventType: 'AMBIGUOUS_REPLY', providerMessageId: inbound.providerMessageId, details: { candidateCount: candidates.length, text: inbound.text } })
    if (candidates[0].clientPhone) await sendWhatsappTextForTenant(instance.tenantId, candidates[0].clientPhone, `Encontrei mais de um horário aguardando confirmação:\n${details}\n\nResponda diretamente à mensagem do horário correto para confirmar ou cancelar.`, { purpose: 'SYSTEM' })
    return { handled: true, ambiguous: true, candidateCount: candidates.length }
  }

  const appointment = candidates[0]
  const now = new Date().toISOString()
  if (parsed.intent === 'CONFIRM') {
    db.prepare(`
      UPDATE appointments
      SET confirmation_status = 'CONFIRMED', confirmation_responded_at = ?, confirmation_last_inbound_at = ?, confirmation_last_inbound_text = ?
      WHERE id = ? AND tenant_id = ? AND confirmation_status IN ('AWAITING_CONFIRMATION','NO_RESPONSE','DELIVERY_FAILED')
    `).run(now, now, inbound.text.slice(0, 500), appointment.id, instance.tenantId)
    cancelAppointmentJobs(instance.tenantId, appointment.id, ['CONFIRMATION_REQUEST','CONFIRMATION_RETRY','NO_RESPONSE_CUTOFF'])
    confirmationEvent({ tenantId: instance.tenantId, appointmentId: appointment.id, eventType: 'CLIENT_CONFIRMED', providerMessageId: inbound.providerMessageId, details: { text: inbound.text } })
    if (appointment.clientPhone) await sendWhatsappTextForTenant(instance.tenantId, appointment.clientPhone, 'Presença confirmada 💕 Seu horário segue reservado. Até lá!')
    return { handled: true, appointmentId: appointment.id, confirmationStatus: 'CONFIRMED' }
  }

  const settings = requireWhatsappSettings(instance.tenantId) ?? defaultWhatsappSettings
  db.prepare(`
    UPDATE appointments
    SET confirmation_status = 'DECLINED', confirmation_responded_at = ?, confirmation_last_inbound_at = ?, confirmation_last_inbound_text = ?,
        status = CASE WHEN ? = 1 THEN 'CANCELLED' ELSE status END
    WHERE id = ? AND tenant_id = ? AND confirmation_status IN ('AWAITING_CONFIRMATION','NO_RESPONSE','DELIVERY_FAILED')
  `).run(now, now, inbound.text.slice(0, 500), settings.autoCancelDeclined ? 1 : 0, appointment.id, instance.tenantId)
  cancelAppointmentJobs(instance.tenantId, appointment.id)
  confirmationEvent({ tenantId: instance.tenantId, appointmentId: appointment.id, eventType: settings.autoCancelDeclined ? 'CLIENT_DECLINED_AUTO_CANCELLED' : 'CLIENT_DECLINED', providerMessageId: inbound.providerMessageId, details: { text: inbound.text } })
  if (appointment.clientPhone) {
    await sendWhatsappTextForTenant(instance.tenantId, appointment.clientPhone, settings.autoCancelDeclined ? 'Tudo certo. Seu horário foi cancelado e ficou disponível novamente.' : 'Recebemos sua resposta. O espaço foi avisado e vai cuidar do seu horário.')
  }
  return { handled: true, appointmentId: appointment.id, confirmationStatus: 'DECLINED' }
}


const extractQrCode = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') {
    const v = value.trim()
    if (!v) return null
    if (v.startsWith('data:image/')) return v
    if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 100) return `data:image/png;base64,${v}`
    return null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractQrCode(item)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const candidates = ['qrCode', 'qrcode', 'qr', 'base64', 'code']
    for (const k of candidates) {
      const found = extractQrCode(o[k])
      if (found) return found
    }
    for (const k of Object.keys(o)) {
      const found = extractQrCode(o[k])
      if (found) return found
    }
  }
  return null
}

app.get('/api/admin/whatsapp/status', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const row = requireWhatsappConfig(tenantId)
    if (!row?.baseUrl || !row.apiKey || !row.instanceName) {
      res.json({ state: 'NOT_CONFIGURED' })
      return
    }

    const url = `${await resolveExternalHttpsBaseUrl(row.baseUrl)}/instance/connectionState/${encodeURIComponent(row.instanceName)}`
    const resp = await fetch(url, { headers: { apikey: row.apiKey }, redirect: 'error', signal: AbortSignal.timeout(10_000) })
    const raw = await resp.json().catch(() => null)

    const rawObj = typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : null
    const instanceObj =
      rawObj && typeof rawObj.instance === 'object' && rawObj.instance
        ? (rawObj.instance as Record<string, unknown>)
        : null
    const instanceState = instanceObj?.state
    const rootState = rawObj?.state
    const state =
      (typeof instanceState === 'string' && instanceState) ||
      (typeof rootState === 'string' && rootState) ||
      (resp.ok ? 'unknown' : 'error')

    // Keep inbound delivery prepared whenever the admin opens/checks a connected instance.
    // This makes the inbox independent from whether a confirmation automation has already run.
    const normalizedState = normalizeEvolutionConnectionState(state)
    if (normalizedState && row.instanceName) updateEvolutionConnectionFromWebhook(tenantId, row.instanceName, normalizedState)
    if (normalizedState === 'CONNECTED') await configureEvolutionWebhookForTenant(tenantId).catch(() => false)

    res.json({ state })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/whatsapp/qrcode', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const row = ensurePlatformWhatsappConfig(tenantId)
    if (!row?.baseUrl || !row.apiKey || !row.instanceName) {
      res.json({ qrCode: null, state: 'NOT_CONFIGURED' })
      return
    }

    const headers = { apikey: row.apiKey, 'Content-Type': 'application/json' }
    const connectUrl = `${await resolveExternalHttpsBaseUrl(row.baseUrl)}/instance/connect/${encodeURIComponent(row.instanceName)}`
    let resp = await fetch(connectUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(10_000) })
    let raw = await resp.json().catch(() => null)
    let qrCode = extractQrCode(raw)

    if (!resp.ok || !qrCode) {
      const createUrl = `${await resolveExternalHttpsBaseUrl(row.baseUrl)}/instance/create`
      const createResp = await fetch(createUrl, {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({ instanceName: row.instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
      })
      const createRaw = await createResp.json().catch(() => null)
      qrCode = extractQrCode(createRaw)
      if (!createResp.ok && !resp.ok) return next(badRequest('Não foi possível preparar a conexão do WhatsApp.', 'WHATSAPP_PROVISION_FAILED'))
      if (!qrCode) {
        resp = await fetch(connectUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(10_000) })
        raw = await resp.json().catch(() => null)
        qrCode = extractQrCode(raw)
      }
    }
    // Configure inbound delivery as soon as the instance exists; it remains valid after the QR scan completes.
    await configureEvolutionWebhookForTenant(tenantId).catch(() => false)
    res.json({ qrCode, state: qrCode ? 'QR_SCAN' : 'CONNECTING' })
  } catch (err) {
    next(err)
  }
})


app.get('/api/admin/whatsapp/diagnostics', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const [providerWebhookConfigured, messageTimes, audience, health] = await Promise.all([
      evolutionWebhookConfiguredForTenant(tenantId),
      Promise.resolve(db.prepare(`
        SELECT
          MAX(CASE WHEN direction = 'INBOUND' THEN sent_at END) as lastInboundAt,
          MAX(CASE WHEN direction = 'OUTBOUND' THEN sent_at END) as lastOutboundAt
        FROM whatsapp_messages
        WHERE tenant_id = ?
      `).get(tenantId) as { lastInboundAt: string | null; lastOutboundAt: string | null } | undefined),
      Promise.resolve(db.prepare(`
        SELECT COUNT(*) as totalClients,
               SUM(CASE WHEN marketing_whatsapp_opt_in = 1 THEN 1 ELSE 0 END) as optedInClients
        FROM clients
        WHERE tenant_id = ?
      `).get(tenantId) as { totalClients: number; optedInClients: number | null } | undefined),
      Promise.resolve(db.prepare(`
        SELECT connection_state as connectionState, last_health_check_at as lastHealthCheckAt,
               last_connected_at as lastConnectedAt, last_connection_error as lastConnectionError,
               reconnect_attempts as reconnectAttempts, reconnect_after as reconnectAfter,
               webhook_last_at as webhookLastAt
        FROM whatsapp_instances WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1
      `).get(tenantId) as { connectionState: string | null; lastHealthCheckAt: string | null; lastConnectedAt: string | null; lastConnectionError: string | null; reconnectAttempts: number; reconnectAfter: string | null; webhookLastAt: string | null } | undefined),
    ])

    res.json({
      providerWebhookConfigured,
      lastInboundAt: messageTimes?.lastInboundAt ?? null,
      lastOutboundAt: messageTimes?.lastOutboundAt ?? null,
      totalClients: Number(audience?.totalClients ?? 0),
      optedInClients: Number(audience?.optedInClients ?? 0),
      connectionState: health?.connectionState ?? null,
      lastHealthCheckAt: health?.lastHealthCheckAt ?? null,
      lastConnectedAt: health?.lastConnectedAt ?? null,
      lastConnectionError: health?.lastConnectionError ?? null,
      reconnectAttempts: Number(health?.reconnectAttempts ?? 0),
      reconnectAfter: health?.reconnectAfter ?? null,
      webhookLastAt: health?.webhookLastAt ?? null,
    })
  } catch (err) {
    next(err)
  }
})

type MarketingCampaignRow = {
  id: string
  tenantId: string
  name: string
  messageText: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'
  totalRecipients: number
  sentCount: number
  failedCount: number
  skippedCount: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  lastError: string | null
}

function marketingCampaignPayload(row: MarketingCampaignRow) {
  return {
    id: row.id,
    name: row.name,
    messageText: row.messageText,
    status: row.status,
    totalRecipients: Number(row.totalRecipients || 0),
    sentCount: Number(row.sentCount || 0),
    failedCount: Number(row.failedCount || 0),
    skippedCount: Number(row.skippedCount || 0),
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    lastError: row.lastError,
  }
}

app.get('/api/admin/whatsapp/campaigns', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const campaigns = db.prepare(`
      SELECT id, tenant_id as tenantId, name, message_text as messageText, status,
             total_recipients as totalRecipients, sent_count as sentCount,
             failed_count as failedCount, skipped_count as skippedCount,
             created_at as createdAt, started_at as startedAt, completed_at as completedAt,
             cancelled_at as cancelledAt, last_error as lastError
      FROM whatsapp_marketing_campaigns
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(tenantId) as MarketingCampaignRow[]
    res.json({
      enabled: env.WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED,
      maxRecipients: env.WHATSAPP_CAMPAIGN_MAX_RECIPIENTS,
      sendIntervalSeconds: env.WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS,
      campaigns: campaigns.map(marketingCampaignPayload),
    })
  } catch (err) { next(err) }
})

app.post('/api/admin/whatsapp/campaigns', requireRole('ADMIN'), (req, res, next) => {
  try {
    if (!env.WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED) {
      return next(forbidden('Campanhas promocionais estão desativadas nesta instalação. Ative explicitamente a função somente após validar sua configuração do WhatsApp.', 'WHATSAPP_CAMPAIGNS_DISABLED'))
    }
    const tenantId = req.sessionUser?.tenantId
    const userId = req.sessionUser?.id
    if (!tenantId || !userId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const body = z.object({
      name: z.string().trim().min(2).max(80),
      message: z.string().trim().min(10).max(1400),
    }).strict().parse(req.body)
    const settings = requireWhatsappSettings(tenantId) ?? defaultWhatsappSettings
    if (!settings.promoEnabled) return next(badRequest('Ative o modelo promocional antes de criar uma campanha.', 'WHATSAPP_PROMO_MODEL_DISABLED'))
    const active = db.prepare(`SELECT id FROM whatsapp_marketing_campaigns WHERE tenant_id = ? AND status IN ('QUEUED','RUNNING') LIMIT 1`).get(tenantId) as { id: string } | undefined
    if (active) return next(badRequest('Já existe uma campanha em andamento. Aguarde ou cancele a campanha atual.', 'WHATSAPP_CAMPAIGN_ALREADY_ACTIVE'))
    const audience = db.prepare(`
      SELECT c.user_id as userId, c.name, c.phone_normalized as phone
      FROM clients c
      WHERE c.tenant_id = ?
        AND c.marketing_whatsapp_opt_in = 1
        AND c.phone_normalized IS NOT NULL
        AND trim(c.phone_normalized) <> ''
      ORDER BY c.created_at ASC
      LIMIT ?
    `).all(tenantId, env.WHATSAPP_CAMPAIGN_MAX_RECIPIENTS + 1) as Array<{ userId: string; name: string; phone: string }>
    if (!audience.length) return next(badRequest('Nenhuma cliente possui consentimento promocional ativo.', 'WHATSAPP_CAMPAIGN_EMPTY_AUDIENCE'))
    if (audience.length > env.WHATSAPP_CAMPAIGN_MAX_RECIPIENTS) {
      return next(badRequest(`A audiência atual ultrapassa o limite operacional de ${env.WHATSAPP_CAMPAIGN_MAX_RECIPIENTS} destinatários por campanha.`, 'WHATSAPP_CAMPAIGN_AUDIENCE_LIMIT'))
    }
    const campaignId = randomUUID()
    const now = new Date().toISOString()
    const messageText = campaignMessageWithOptOut(body.message)
    db.transaction(() => {
      db.prepare(`
        INSERT INTO whatsapp_marketing_campaigns
          (id, tenant_id, created_by_user_id, name, message_text, status, total_recipients, sent_count, failed_count, skipped_count, created_at)
        VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, 0, 0, 0, ?)
      `).run(campaignId, tenantId, userId, body.name, messageText, audience.length, now)
      const insertRecipient = db.prepare(`
        INSERT INTO whatsapp_marketing_recipients
          (id, campaign_id, tenant_id, client_user_id, phone_normalized, client_name, status, attempts, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)
      `)
      for (const recipient of audience) insertRecipient.run(randomUUID(), campaignId, tenantId, recipient.userId, recipient.phone, recipient.name, now)
    })()
    res.json({ ok: true, campaign: { id: campaignId, name: body.name, status: 'QUEUED', totalRecipients: audience.length, sentCount: 0, failedCount: 0, skippedCount: 0, createdAt: now } })
  } catch (err) { next(err) }
})

app.post('/api/admin/whatsapp/campaigns/:campaignId/cancel', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const campaignId = z.string().uuid().parse(req.params.campaignId)
    const now = new Date().toISOString()
    const changed = db.transaction(() => {
      const result = db.prepare(`
        UPDATE whatsapp_marketing_campaigns
        SET status = 'CANCELLED', cancelled_at = ?, completed_at = COALESCE(completed_at, ?)
        WHERE id = ? AND tenant_id = ? AND status IN ('QUEUED','RUNNING')
      `).run(now, now, campaignId, tenantId)
      if (!result.changes) return false
      const skipped = db.prepare(`
        UPDATE whatsapp_marketing_recipients
        SET status = 'SKIPPED', last_error = 'Campanha cancelada'
        WHERE campaign_id = ? AND tenant_id = ? AND status = 'PENDING'
      `).run(campaignId, tenantId).changes
      db.prepare(`UPDATE whatsapp_marketing_campaigns SET skipped_count = skipped_count + ? WHERE id = ? AND tenant_id = ?`).run(skipped, campaignId, tenantId)
      return true
    })()
    if (!changed) return next(notFound('Campanha ativa não encontrada.', 'WHATSAPP_CAMPAIGN_NOT_FOUND'))
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Legacy endpoint intentionally remains blocked so old clients cannot bypass the queued, consent-aware campaign path.
app.post('/api/admin/whatsapp/broadcast', requireRole('ADMIN'), (_req, _res, next) => {
  next(forbidden('Use o fluxo de campanhas com fila e audiência consentida.', 'WHATSAPP_BROADCAST_REPLACED'))
})

app.post('/api/admin/whatsapp/send', requireRole('ADMIN'), whatsappSendLimiter, async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z.object({
      contactName: z.string().trim().min(2).max(120).optional(),
      toPhone: z.string().min(6).max(40),
      text: z.string().min(1).max(2000),
      recordInInbox: z.boolean().optional().default(true),
    }).parse(req.body)

    // Manual conversations must also prepare inbound delivery; previously the webhook was only
    // configured by the appointment-confirmation automation path.
    await configureEvolutionWebhookForTenant(tenantId).catch(() => false)
    const delivered = await sendWhatsappTextForTenant(tenantId, body.toPhone, body.text, { source: 'MANUAL', persist: body.recordInInbox, displayName: body.contactName })
    if (!delivered) return next(badRequest('Falha ao enviar mensagem', 'WHATSAPP_SEND_FAILED'))
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/whatsapp/conversations', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const search = String(req.query.search ?? '').trim().slice(0, 100)
    const like = `%${search.replace(/[%_]/g, '')}%`
    const now = new Date().toISOString()
    const rows = db.prepare(`
      SELECT wc.id,
             wc.phone_normalized as phone,
             COALESCE(NULLIF(c.name, ''), NULLIF(wc.display_name, ''), wc.phone_normalized) as displayName,
             wc.unread_count as unreadCount,
             wc.last_message_preview as lastMessage,
             wc.last_message_direction as lastDirection,
             wc.last_message_at as lastMessageAt,
             c.id as clientId,
             c.user_id as clientUserId,
             COALESCE(c.marketing_whatsapp_opt_in, 0) as marketingOptIn,
             a.id as upcomingAppointmentId,
             a.starts_at as upcomingStartsAt,
             a.confirmation_status as upcomingConfirmationStatus,
             s.name as upcomingServiceName,
             s.price_cents as upcomingPriceCents,
             (
               SELECT COUNT(*) FROM appointments hist
               WHERE hist.tenant_id = wc.tenant_id
                 AND hist.client_user_id = c.user_id
                 AND hist.status != 'CANCELLED'
                 AND hist.starts_at < ?
             ) as appointmentsCount
      FROM whatsapp_conversations wc
      LEFT JOIN clients c ON c.user_id = wc.client_user_id AND c.tenant_id = wc.tenant_id
      LEFT JOIN appointments a ON a.id = (
        SELECT upcoming.id FROM appointments upcoming
        WHERE upcoming.tenant_id = wc.tenant_id
          AND upcoming.client_user_id = c.user_id
          AND upcoming.status != 'CANCELLED'
          AND upcoming.starts_at > ?
        ORDER BY upcoming.starts_at ASC
        LIMIT 1
      )
      LEFT JOIN services s ON s.id = a.service_id
      WHERE wc.tenant_id = ?
        AND (? = '' OR COALESCE(c.name, wc.display_name, '') LIKE ? OR wc.phone_normalized LIKE ?)
      ORDER BY COALESCE(wc.last_message_at, wc.updated_at) DESC
      LIMIT 120
    `).all(now, now, tenantId, search, like, like) as Array<Record<string, unknown>>
    res.json({
      conversations: rows.map((row) => ({
        id: String(row.id),
        phone: String(row.phone),
        displayName: String(row.displayName),
        unreadCount: Number(row.unreadCount ?? 0),
        lastMessage: row.lastMessage ? String(row.lastMessage) : '',
        lastDirection: row.lastDirection ? String(row.lastDirection) : null,
        lastMessageAt: row.lastMessageAt ? String(row.lastMessageAt) : null,
        client: row.clientId ? {
          id: String(row.clientId),
          userId: String(row.clientUserId),
          name: String(row.displayName),
          marketingOptIn: Boolean(row.marketingOptIn),
          appointmentsCount: Number(row.appointmentsCount ?? 0),
        } : null,
        upcomingAppointment: row.upcomingAppointmentId ? {
          id: String(row.upcomingAppointmentId),
          startsAt: String(row.upcomingStartsAt),
          serviceName: String(row.upcomingServiceName ?? 'Serviço'),
          priceCents: Number(row.upcomingPriceCents ?? 0),
          confirmationStatus: String(row.upcomingConfirmationStatus ?? 'NOT_REQUESTED'),
        } : null,
      })),
    })
  } catch (err) { next(err) }
})

app.get('/api/admin/whatsapp/conversations/:id/messages', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const conversationId = z.string().uuid().parse(req.params.id)
    const conversation = db.prepare(`SELECT id FROM whatsapp_conversations WHERE id = ? AND tenant_id = ? LIMIT 1`).get(conversationId, tenantId)
    if (!conversation) return next(notFound('Conversa não encontrada', 'WHATSAPP_CONVERSATION_NOT_FOUND'))
    const rows = db.prepare(`
      SELECT id, direction, message_type as messageType, body_text as text, source, sent_at as sentAt,
             delivery_status as deliveryStatus, status_updated_at as statusUpdatedAt,
             media_mime_type as mediaMimeType, media_file_name as mediaFileName, media_size_bytes as mediaSizeBytes, media_status as mediaStatus
      FROM whatsapp_messages
      WHERE tenant_id = ? AND conversation_id = ?
      ORDER BY sent_at DESC, created_at DESC
      LIMIT 120
    `).all(tenantId, conversationId) as Array<{ id: string; direction: string; messageType: string; text: string; source: string; sentAt: string }>
    res.json({ messages: rows.reverse() })
  } catch (err) { next(err) }
})

app.get('/api/admin/whatsapp/messages/:id/media', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const messageId = z.string().uuid().parse(req.params.id)
    const row = db.prepare(`
      SELECT media_status as mediaStatus, media_mime_type as mimeType, media_file_name as fileName,
             media_storage_path as storagePath, media_size_bytes as sizeBytes
      FROM whatsapp_messages
      WHERE id = ? AND tenant_id = ? AND direction = 'INBOUND'
      LIMIT 1
    `).get(messageId, tenantId) as { mediaStatus: string; mimeType: string | null; fileName: string | null; storagePath: string | null; sizeBytes: number | null } | undefined
    if (!row || row.mediaStatus !== 'READY' || !row.storagePath) return next(notFound('Mídia não disponível', 'WHATSAPP_MEDIA_NOT_FOUND'))
    const absolutePath = resolvePrivateWhatsappMediaPath(env.WHATSAPP_MEDIA_DIR, row.storagePath)
    const content = await readFile(absolutePath)
    if (row.sizeBytes && content.length !== row.sizeBytes) return next(notFound('Mídia indisponível', 'WHATSAPP_MEDIA_CORRUPT'))
    res.setHeader('Content-Type', row.mimeType || 'application/octet-stream')
    res.setHeader('Content-Length', String(content.length))
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (row.fileName) {
      const safeName = row.fileName.replace(/[\r\n"\\]/g, '_').slice(0, 160)
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`)
    }
    res.send(content)
  } catch (err) { next(err) }
})

app.post('/api/admin/whatsapp/conversations/:id/read', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const conversationId = z.string().uuid().parse(req.params.id)
    const changed = db.prepare(`UPDATE whatsapp_conversations SET unread_count = 0, updated_at = ? WHERE id = ? AND tenant_id = ?`).run(new Date().toISOString(), conversationId, tenantId)
    if (!changed.changes) return next(notFound('Conversa não encontrada', 'WHATSAPP_CONVERSATION_NOT_FOUND'))
    res.json({ ok: true })
  } catch (err) { next(err) }
})

app.post('/api/admin/whatsapp/conversations/:id/messages', requireRole('ADMIN'), whatsappSendLimiter, async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const conversationId = z.string().uuid().parse(req.params.id)
    const body = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body)
    const conversation = db.prepare(`SELECT phone_normalized as phone FROM whatsapp_conversations WHERE id = ? AND tenant_id = ? LIMIT 1`).get(conversationId, tenantId) as { phone: string } | undefined
    if (!conversation) return next(notFound('Conversa não encontrada', 'WHATSAPP_CONVERSATION_NOT_FOUND'))
    const delivered = await sendWhatsappTextForTenant(tenantId, conversation.phone, body.text, { source: 'MANUAL' })
    if (!delivered) return next(badRequest('Falha ao enviar mensagem', 'WHATSAPP_SEND_FAILED'))
    const row = db.prepare(`
      SELECT id, direction, message_type as messageType, body_text as text, source, sent_at as sentAt,
             delivery_status as deliveryStatus, status_updated_at as statusUpdatedAt,
             media_mime_type as mediaMimeType, media_file_name as mediaFileName, media_size_bytes as mediaSizeBytes, media_status as mediaStatus
      FROM whatsapp_messages
      WHERE tenant_id = ? AND conversation_id = ?
      ORDER BY sent_at DESC, created_at DESC
      LIMIT 1
    `).get(tenantId, conversationId)
    res.json({ ok: true, message: row ?? null })
  } catch (err) { next(err) }
})


const publicBookingLimiter = createRateLimiter({ windowMs: 60_000, max: 12, keyPrefix: 'public:booking:create' })
const publicBookingPhoneLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 8, keyPrefix: 'public:booking:phone', keyFn: (req) => typeof req.body?.phone === 'string' ? (normalizeBrazilPhone(req.body.phone) ?? req.body.phone.replace(/\D/g, '')) : '' })
const clientAccessRequestLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 6, keyPrefix: 'client:access:request', persistent: true })
const clientAccessPhoneLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 4, keyPrefix: 'client:access:phone', persistent: true, keyFn: (req) => typeof req.body?.phone === 'string' ? (normalizeBrazilPhone(req.body.phone) ?? req.body.phone.replace(/\D/g, '')) : '' })
const clientAccessVerifyLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 12, keyPrefix: 'client:access:verify', persistent: true })

const clientOtpHash = (tenantId: string, userId: string, code: string) =>
  secretHmac(`${tenantId}:${userId}:${code}`, 'client-login-otp')

const MARKETING_WHATSAPP_CONSENT_VERSION = 'whatsapp-promos-v1'
const MARKETING_WHATSAPP_CONSENT_TEXT = 'Quero receber novidades e ofertas no WhatsApp.'

type MarketingConsentAction = 'GRANTED' | 'WITHDRAWN'

function setClientWhatsappMarketingConsent(input: { tenantId: string; userId: string; granted: boolean; source: string }) {
  const current = db.prepare(`
    SELECT marketing_whatsapp_opt_in as optedIn
    FROM clients
    WHERE tenant_id = ? AND user_id = ?
    LIMIT 1
  `).get(input.tenantId, input.userId) as { optedIn: number } | undefined
  if (!current) throw notFound('Cliente não encontrado', 'CLIENT_NOT_FOUND')

  const alreadyGranted = Boolean(current.optedIn)
  if (alreadyGranted === input.granted) return { changed: false, optedIn: alreadyGranted }

  const now = new Date().toISOString()
  const action: MarketingConsentAction = input.granted ? 'GRANTED' : 'WITHDRAWN'
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE clients
      SET marketing_whatsapp_opt_in = ?,
          marketing_whatsapp_opt_in_at = CASE WHEN ? = 1 THEN ? ELSE marketing_whatsapp_opt_in_at END,
          marketing_whatsapp_opt_out_at = CASE WHEN ? = 0 THEN ? ELSE NULL END,
          marketing_consent_version = ?,
          marketing_consent_source = ?
      WHERE tenant_id = ? AND user_id = ?
    `).run(
      input.granted ? 1 : 0,
      input.granted ? 1 : 0,
      now,
      input.granted ? 1 : 0,
      now,
      MARKETING_WHATSAPP_CONSENT_VERSION,
      input.source,
      input.tenantId,
      input.userId,
    )
    db.prepare(`
      INSERT INTO client_marketing_consent_events (
        id, tenant_id, client_user_id, channel, action, policy_version, consent_text, source, created_at
      ) VALUES (?, ?, ?, 'WHATSAPP', ?, ?, ?, ?, ?)
    `).run(randomUUID(), input.tenantId, input.userId, action, MARKETING_WHATSAPP_CONSENT_VERSION, MARKETING_WHATSAPP_CONSENT_TEXT, input.source, now)
  })
  tx.immediate()
  return { changed: true, optedIn: input.granted }
}

async function upsertBookingClient(tenantId: string, nameRaw: string, phoneRaw: string) {
  const name = nameRaw.trim().replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 120) throw badRequest('Nome inválido', 'INVALID_CLIENT_NAME')
  const phone = normalizePhone(phoneRaw)
  const existing = db.prepare(`
    SELECT u.id as userId, u.session_version as sessionVersion, c.id as clientId
    FROM clients c
    JOIN users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
    WHERE c.tenant_id = ? AND c.phone_normalized = ?
    LIMIT 1
  `).get(tenantId, phone) as { userId: string; sessionVersion: number; clientId: string } | undefined

  if (existing) {
    // Public booking may reuse an existing phone, but must not overwrite verified client identity.
    return { userId: existing.userId, sessionVersion: existing.sessionVersion, phone }
  }

  const userId = randomUUID()
  const clientId = randomUUID()
  const now = new Date().toISOString()
  const placeholderEmail = `${phone}.${tenantId.replace(/-/g, '')}@client.local`
  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))
  const createClient = db.transaction(() => {
    // Recheck under an IMMEDIATE transaction so simultaneous public bookings for
    // the same phone cannot manufacture parallel CLIENT identities.
    const concurrent = db.prepare(`
      SELECT u.id as userId, u.session_version as sessionVersion
      FROM clients c
      JOIN users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
      WHERE c.tenant_id = ? AND c.phone_normalized = ?
      LIMIT 1
    `).get(tenantId, phone) as { userId: string; sessionVersion: number } | undefined
    if (concurrent) return { userId: concurrent.userId, sessionVersion: concurrent.sessionVersion, phone }
    db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'CLIENT', ?)`).run(userId, tenantId, placeholderEmail, passwordHash, now)
    db.prepare(`INSERT INTO clients (id, tenant_id, user_id, name, phone, phone_normalized, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(clientId, tenantId, userId, name, phoneRaw.trim(), phone, now)
    return { userId, sessionVersion: 0, phone }
  })
  return createClient.immediate()
}

function createAppointmentForUser(input: { tenantId: string; userId: string; serviceId: string; startsAt: string }) {
  const { tenantId, userId } = input
  const service = db.prepare(`SELECT id, duration_minutes as durationMinutes FROM services WHERE id = ? AND tenant_id = ? AND active = 1`).get(input.serviceId, tenantId) as { id: string; durationMinutes: number } | undefined
  if (!service) throw notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND')

  const settings = db.prepare(`SELECT timezone FROM tenant_settings WHERE tenant_id = ?`).get(tenantId) as { timezone: string } | undefined
  const bookingRules = db.prepare(`SELECT min_notice_minutes as minNoticeMinutes, max_future_days as maxFutureDays, slot_step_minutes as slotStepMinutes FROM booking_rules WHERE tenant_id = ?`).get(tenantId) as { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number } | undefined
  const businessHours = db.prepare(`SELECT weekday, start_minute as startMinute, end_minute as endMinute FROM business_hours WHERE tenant_id = ? ORDER BY weekday ASC, start_minute ASC`).all(tenantId) as Array<{ weekday: number; startMinute: number; endMinute: number }>

  const startsAt = new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime())) throw badRequest('Data inválida', 'INVALID_DATE')
  if (!Number.isFinite(service.durationMinutes) || service.durationMinutes <= 0) throw badRequest('Duração do serviço inválida', 'INVALID_SERVICE_DURATION')
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)
  const rules = bookingRules ?? { minNoticeMinutes: 60, maxFutureDays: 60, slotStepMinutes: 15 }
  const minStart = new Date(Date.now() + rules.minNoticeMinutes * 60_000)
  if (startsAt < minStart) throw badRequest('Horário com pouca antecedência', 'MIN_NOTICE')
  const maxStart = new Date(); maxStart.setDate(maxStart.getDate() + rules.maxFutureDays)
  if (startsAt > maxStart) throw badRequest('Horário muito distante', 'MAX_FUTURE')

  const timeZone = settings?.timezone ?? 'America/Sao_Paulo'
  const startParts = getZonedDateTimeParts(startsAt, timeZone)
  const endParts = getZonedDateTimeParts(endsAt, timeZone)
  if (!startParts || !endParts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
  if (startParts.weekday !== endParts.weekday || endParts.minutesOfDay < startParts.minutesOfDay) throw badRequest('Agendamento não pode atravessar o dia', 'CROSS_DAY')
  if (!businessHours.length) throw badRequest('Horários de atendimento não configurados', 'BUSINESS_HOURS_EMPTY')
  const stepMinutes = Math.max(5, rules.slotStepMinutes)
  const fits = businessHours.filter((r) => r.weekday === startParts.weekday).some((r) => {
    const aligned = (startParts.minutesOfDay - r.startMinute) % stepMinutes === 0
    return aligned && startParts.minutesOfDay >= r.startMinute && startParts.minutesOfDay < r.endMinute && endParts.minutesOfDay <= r.endMinute
  })
  if (!fits) throw badRequest('Horário fora do atendimento', 'OUTSIDE_BUSINESS_HOURS')
  const timeOffOverlap = db.prepare(`SELECT id FROM time_off WHERE tenant_id = ? AND NOT (ends_at <= ? OR starts_at >= ?) LIMIT 1`).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
  if (timeOffOverlap) throw badRequest('Horário indisponível', 'SLOT_UNAVAILABLE')

  const id = randomUUID()
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    const overlap = db.prepare(`SELECT id FROM appointments WHERE tenant_id = ? AND status IN ('CONFIRMED','PENDING') AND NOT (ends_at <= ? OR starts_at >= ?) LIMIT 1`).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
    if (overlap) throw badRequest('Horário indisponível', 'SLOT_UNAVAILABLE')
    db.prepare(`INSERT INTO appointments (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, confirmation_status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'NOT_REQUESTED', ?)`).run(id, tenantId, input.serviceId, userId, startsAt.toISOString(), endsAt.toISOString(), now)
  })
  tx.immediate()
  scheduleAppointmentAutomationJobs(tenantId, id)
  return { id, serviceId: input.serviceId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), status: 'PENDING', confirmationStatus: 'NOT_REQUESTED' }
}

async function createPublicAppointment(req: Request, res: Response, next: NextFunction, explicitSlug?: string) {
  try {
    const body = z.object({
      serviceId: z.string().uuid(),
      startsAt: z.string().datetime(),
      name: z.string().min(2).max(120),
      phone: z.string().min(8).max(40),
      marketingConsent: z.boolean().optional().default(false),
    }).strict().parse(req.body)
    const slug = (explicitSlug ?? req.resolvedTenant?.slug ?? '').trim().toLowerCase()
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
    if (req.resolvedTenant && req.resolvedTenant.slug !== slug) return next(forbidden('Use o endereço do espaço escolhido.', 'TENANT_HOST_MISMATCH'))
    const tenant = db.prepare(`SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'`).get(slug) as { id: string } | undefined
    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
    const client = await upsertBookingClient(tenant.id, body.name, body.phone)
    const appointment = createAppointmentForUser({ tenantId: tenant.id, userId: client.userId, serviceId: body.serviceId, startsAt: body.startsAt })
    // Consent is committed only after the booking succeeds. Leaving the optional box unchecked never revokes an earlier grant.
    if (body.marketingConsent) setClientWhatsappMarketingConsent({ tenantId: tenant.id, userId: client.userId, granted: true, source: 'PUBLIC_BOOKING' })
    res.json({ appointment })
  } catch (err) { next(err) }
}

app.post('/api/public/appointments', publicBookingLimiter, publicBookingPhoneLimiter, (req, res, next) => void createPublicAppointment(req, res, next))
app.post('/api/public/tenant/:slug/appointments', publicBookingLimiter, publicBookingPhoneLimiter, (req, res, next) => void createPublicAppointment(req, res, next, String(req.params.slug ?? '')))


async function sendWhatsappTextForTenant(
  tenantId: string,
  phone: string,
  text: string,
  options: { source?: WhatsappMessageSource; persist?: boolean; displayName?: string | null; purpose?: 'MARKETING' | 'APPOINTMENT_AUTOMATION' | 'MANUAL' | 'SYSTEM'; onProviderMessageId?: (id: string | null) => void } = {},
) {
  const row = requireWhatsappConfig(tenantId)
  if (!row?.baseUrl || !row.apiKey || !row.instanceName) return false
  const normalizedPhone = whatsappPhone(phone)
  if (!normalizedPhone) return false
  if (options.purpose === 'MARKETING') {
    const consent = db.prepare(`SELECT marketing_whatsapp_opt_in as optedIn FROM clients WHERE tenant_id = ? AND phone_normalized = ? LIMIT 1`).get(tenantId, normalizedPhone) as { optedIn: number } | undefined
    if (!consent?.optedIn) return false
  }
  const url = `${await resolveExternalHttpsBaseUrl(row.baseUrl)}/message/sendText/${encodeURIComponent(row.instanceName)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: row.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ number: normalizedPhone, text, textMessage: text }),
  }).catch(() => null)
  if (!response?.ok) return false
  const raw = await response.json().catch(() => null)
  const providerMessageId = extractWhatsappProviderMessageId(raw)
  options.onProviderMessageId?.(providerMessageId)
  if (options.persist !== false) {
    recordWhatsappMessage({
      tenantId,
      phone: normalizedPhone,
      direction: 'OUTBOUND',
      type: 'TEXT',
      text,
      source: options.source ?? 'AUTOMATION',
      providerMessageId,
      sentAt: new Date().toISOString(),
      displayName: options.displayName ?? null,
    })
  }
  return true
}

let whatsappMarketingWorkerRunning = false
async function processWhatsappMarketingCampaignQueue() {
  if (!env.WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED || whatsappMarketingWorkerRunning) return
  whatsappMarketingWorkerRunning = true
  try {
    const now = new Date().toISOString()
    const staleClaimCutoff = new Date(Date.now() - 5 * 60_000).toISOString()
    // Recover only stale claims. This avoids a second process re-queuing a recipient
    // that another worker is actively sending right now.
    db.prepare(`UPDATE whatsapp_marketing_recipients SET status = 'PENDING', claimed_at = NULL WHERE status = 'SENDING' AND (claimed_at IS NULL OR claimed_at < ?) AND campaign_id IN (SELECT id FROM whatsapp_marketing_campaigns WHERE status IN ('QUEUED','RUNNING'))`).run(staleClaimCutoff)
    const campaign = db.prepare(`
      SELECT id, tenant_id as tenantId, name, message_text as messageText, status,
             total_recipients as totalRecipients, sent_count as sentCount,
             failed_count as failedCount, skipped_count as skippedCount,
             created_at as createdAt, started_at as startedAt, completed_at as completedAt,
             cancelled_at as cancelledAt, last_error as lastError
      FROM whatsapp_marketing_campaigns
      WHERE status IN ('QUEUED','RUNNING')
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as MarketingCampaignRow | undefined
    if (!campaign) return
    if (campaign.status === 'QUEUED') {
      db.prepare(`UPDATE whatsapp_marketing_campaigns SET status = 'RUNNING', started_at = COALESCE(started_at, ?) WHERE id = ? AND status = 'QUEUED'`).run(now, campaign.id)
    }
    const recipient = db.prepare(`
      SELECT r.id, r.client_user_id as clientUserId, r.phone_normalized as phone, r.client_name as clientName, r.attempts,
             t.name as tenantName
      FROM whatsapp_marketing_recipients r
      JOIN tenants t ON t.id = r.tenant_id
      WHERE r.campaign_id = ? AND r.tenant_id = ? AND r.status = 'PENDING'
        AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= ?)
      ORDER BY r.created_at ASC
      LIMIT 1
    `).get(campaign.id, campaign.tenantId, now) as { id: string; clientUserId: string; phone: string; clientName: string; attempts: number; tenantName: string } | undefined

    if (!recipient) {
      const pending = db.prepare(`SELECT COUNT(*) as n FROM whatsapp_marketing_recipients WHERE campaign_id = ? AND status IN ('PENDING','SENDING')`).get(campaign.id) as { n: number }
      if (!Number(pending.n || 0)) {
        db.prepare(`UPDATE whatsapp_marketing_campaigns SET status = 'COMPLETED', completed_at = ? WHERE id = ? AND status IN ('QUEUED','RUNNING')`).run(now, campaign.id)
      }
      return
    }

    const claimed = db.prepare(`UPDATE whatsapp_marketing_recipients SET status = 'SENDING', attempts = attempts + 1, claimed_at = ? WHERE id = ? AND status = 'PENDING'`).run(now, recipient.id)
    if (!claimed.changes) return

    const currentConsent = db.prepare(`
      SELECT marketing_whatsapp_opt_in as optedIn, phone_normalized as phone
      FROM clients
      WHERE tenant_id = ? AND user_id = ? LIMIT 1
    `).get(campaign.tenantId, recipient.clientUserId) as { optedIn: number; phone: string | null } | undefined
    if (!currentConsent?.optedIn || !currentConsent.phone || currentConsent.phone !== recipient.phone) {
      db.transaction(() => {
        db.prepare(`UPDATE whatsapp_marketing_recipients SET status = 'SKIPPED', last_error = 'Consentimento ausente ou contato alterado', next_attempt_at = NULL, claimed_at = NULL WHERE id = ?`).run(recipient.id)
        db.prepare(`UPDATE whatsapp_marketing_campaigns SET skipped_count = skipped_count + 1 WHERE id = ?`).run(campaign.id)
      })()
      return
    }

    let providerMessageId: string | null = null
    const text = renderMarketingCampaignMessage(campaign.messageText, { clientName: recipient.clientName, tenantName: recipient.tenantName })
    const delivered = await sendWhatsappTextForTenant(campaign.tenantId, recipient.phone, text, {
      source: 'AUTOMATION',
      purpose: 'MARKETING',
      displayName: recipient.clientName,
      onProviderMessageId: (id) => { providerMessageId = id },
    })
    const finishedAt = new Date().toISOString()
    if (delivered) {
      db.transaction(() => {
        db.prepare(`UPDATE whatsapp_marketing_recipients SET status = 'SENT', provider_message_id = ?, sent_at = ?, last_error = NULL, next_attempt_at = NULL, claimed_at = NULL WHERE id = ?`).run(providerMessageId, finishedAt, recipient.id)
        db.prepare(`UPDATE whatsapp_marketing_campaigns SET sent_count = sent_count + 1, last_error = NULL WHERE id = ?`).run(campaign.id)
      })()
      return
    }

    const attempts = Number(recipient.attempts || 0) + 1
    const retry = attempts < 3
    const retryAt = retry ? new Date(Date.now() + attempts * 60_000).toISOString() : null
    db.transaction(() => {
      db.prepare(`UPDATE whatsapp_marketing_recipients SET status = ?, last_error = ?, next_attempt_at = ?, claimed_at = NULL WHERE id = ?`)
        .run(retry ? 'PENDING' : 'FAILED', 'Falha de entrega pelo provedor', retryAt, recipient.id)
      if (!retry) db.prepare(`UPDATE whatsapp_marketing_campaigns SET failed_count = failed_count + 1, last_error = ? WHERE id = ?`).run('Uma ou mais mensagens falharam após 3 tentativas.', campaign.id)
    })()
  } catch (error) {
    console.error('[WhatsAppCampaignWorker]', error)
  } finally {
    whatsappMarketingWorkerRunning = false
  }
}

app.post('/api/public/client-access/request', clientAccessRequestLimiter, clientAccessPhoneLimiter, async (req, res, next) => {
  try {
    const body = z.object({ tenantSlug: z.string().min(1).max(80), phone: z.string().min(8).max(40) }).parse(req.body)
    const slug = body.tenantSlug.trim().toLowerCase()
    const tenant = db.prepare(`SELECT id, name FROM tenants WHERE slug = ? AND status = 'ACTIVE'`).get(slug) as { id: string; name: string } | undefined
    if (!tenant) return next(notFound('Espaço não encontrado', 'TENANT_NOT_FOUND'))
    const phone = normalizePhone(body.phone)
    const whatsapp = requireWhatsappConfig(tenant.id)
    if (!whatsapp?.baseUrl || !whatsapp.apiKey || !whatsapp.instanceName) {
      return next(badRequest('O WhatsApp deste espaço ainda não está disponível para confirmar seu acesso.', 'CLIENT_ACCESS_DELIVERY_UNAVAILABLE'))
    }
    const client = db.prepare(`
      SELECT u.id as userId
      FROM clients c JOIN users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
      WHERE c.tenant_id = ? AND c.phone_normalized = ? LIMIT 1
    `).get(tenant.id, phone) as { userId: string } | undefined

    // Generic response prevents phone-number enumeration.
    if (!client) {
      res.json({ sent: true })
      return
    }

    db.prepare(`UPDATE client_login_codes SET consumed_at = ? WHERE tenant_id = ? AND user_id = ? AND consumed_at IS NULL`).run(new Date().toISOString(), tenant.id, client.userId)
    const code = String(randomInt(100000, 1000000))
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 5 * 60_000)
    db.prepare(`INSERT INTO client_login_codes (id, tenant_id, user_id, code_hash, expires_at, attempts, consumed_at, created_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`).run(
      randomUUID(), tenant.id, client.userId, clientOtpHash(tenant.id, client.userId, code), expiresAt.toISOString(), now.toISOString(),
    )
    const delivered = await sendWhatsappTextForTenant(tenant.id, phone, `${code} é seu código de acesso ao ${tenant.name}. Ele expira em 5 minutos. Não compartilhe este código.`, { source: 'SYSTEM', persist: false })
    if (!delivered) console.warn(`[ClientAccess] falha de entrega para tenant ${tenant.id}`)
    // Keep the response generic to avoid revealing whether a phone is registered.
    res.json({ sent: true })
  } catch (err) { next(err) }
})

app.post('/api/public/client-access/verify', clientAccessVerifyLimiter, (req, res, next) => {
  try {
    const body = z.object({ tenantSlug: z.string().min(1).max(80), phone: z.string().min(8).max(40), code: z.string().regex(/^\d{6}$/) }).parse(req.body)
    const slug = body.tenantSlug.trim().toLowerCase()
    const tenant = db.prepare(`SELECT id, slug FROM tenants WHERE slug = ? AND status = 'ACTIVE'`).get(slug) as { id: string; slug: string } | undefined
    if (!tenant) return next(notFound('Espaço não encontrado', 'TENANT_NOT_FOUND'))
    const phone = normalizePhone(body.phone)
    const client = db.prepare(`
      SELECT u.id as userId, u.session_version as sessionVersion, c.name
      FROM clients c JOIN users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
      WHERE c.tenant_id = ? AND c.phone_normalized = ? LIMIT 1
    `).get(tenant.id, phone) as { userId: string; sessionVersion: number; name: string } | undefined
    if (!client) return next(unauthorized('Código inválido ou expirado', 'INVALID_CLIENT_CODE'))

    const row = db.prepare(`
      SELECT id, code_hash as codeHash, expires_at as expiresAt, attempts
      FROM client_login_codes
      WHERE tenant_id = ? AND user_id = ? AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(tenant.id, client.userId) as { id: string; codeHash: string; expiresAt: string; attempts: number } | undefined
    if (!row || new Date(row.expiresAt).getTime() < Date.now() || row.attempts >= 5) return next(unauthorized('Código inválido ou expirado', 'INVALID_CLIENT_CODE'))
    db.prepare(`UPDATE client_login_codes SET attempts = attempts + 1 WHERE id = ?`).run(row.id)
    const expected = Buffer.from(row.codeHash, 'hex')
    const provided = Buffer.from(clientOtpHash(tenant.id, client.userId, body.code), 'hex')
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return next(unauthorized('Código inválido ou expirado', 'INVALID_CLIENT_CODE'))

    const now = new Date().toISOString()
    db.prepare(`UPDATE client_login_codes SET consumed_at = ? WHERE id = ?`).run(now, row.id)
    createAndSetSession(req, res, client.userId, true)
    const userRow = db.prepare(`SELECT email FROM users WHERE id = ?`).get(client.userId) as { email: string }
    res.json({ user: { id: client.userId, email: userRow.email, role: 'CLIENT', tenantId: tenant.id, tenantSlug: tenant.slug, name: client.name } })
  } catch (err) { next(err) }
})

app.get('/api/client/marketing-preferences', requireRole('CLIENT'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const userId = req.sessionUser?.id
    if (!tenantId || !userId) return next(badRequest('Sessão de cliente inválida', 'INVALID_CLIENT_SESSION'))
    const row = db.prepare(`
      SELECT marketing_whatsapp_opt_in as whatsappPromotions,
             marketing_whatsapp_opt_in_at as optedInAt,
             marketing_whatsapp_opt_out_at as optedOutAt
      FROM clients
      WHERE tenant_id = ? AND user_id = ?
      LIMIT 1
    `).get(tenantId, userId) as { whatsappPromotions: number; optedInAt: string | null; optedOutAt: string | null } | undefined
    if (!row) return next(notFound('Cliente não encontrado', 'CLIENT_NOT_FOUND'))
    res.json({ preferences: { whatsappPromotions: Boolean(row.whatsappPromotions), optedInAt: row.optedInAt, optedOutAt: row.optedOutAt } })
  } catch (err) { next(err) }
})

app.put('/api/client/marketing-preferences', requireRole('CLIENT'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    const userId = req.sessionUser?.id
    if (!tenantId || !userId) return next(badRequest('Sessão de cliente inválida', 'INVALID_CLIENT_SESSION'))
    const body = z.object({ whatsappPromotions: z.boolean() }).strict().parse(req.body)
    const result = setClientWhatsappMarketingConsent({ tenantId, userId, granted: body.whatsappPromotions, source: 'CLIENT_PORTAL' })
    res.json({ preferences: { whatsappPromotions: result.optedIn } })
  } catch (err) { next(err) }
})

app.get('/api/client/appointments', requireRole('CLIENT'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())

    const tenantId = sessionUser.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const appointments = db
      .prepare(
        `
          SELECT a.id,
                 a.starts_at as startsAt,
                 a.ends_at as endsAt,
                 a.status,
                 a.confirmation_status as confirmationStatus,
                 a.confirmation_sent_at as confirmationSentAt,
                 a.confirmation_responded_at as confirmationRespondedAt,
                 s.name as serviceName,
                 s.price_cents as priceCents
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.client_user_id = ?
          ORDER BY a.starts_at DESC
          LIMIT 100
        `,
      )
      .all(tenantId, sessionUser.id)

    res.json({ appointments })
  } catch (err) {
    next(err)
  }
})

app.post('/api/client/appointments', requireRole('CLIENT'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())
    const tenantId = sessionUser.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z.object({
      serviceId: z.string().uuid(),
      startsAt: z.string().datetime(),
    }).parse(req.body)

    const appointment = createAppointmentForUser({
      tenantId,
      userId: sessionUser.id,
      serviceId: body.serviceId,
      startsAt: body.startsAt,
    })

    res.json({ appointment })
  } catch (err) {
    next(err)
  }
})

app.all('/api/*path', (_req, _res, next) => next(notFound()))

if (env.NODE_ENV === 'production') {
  const clientDir = path.resolve('dist/client')
  const clientIndexPath = path.join(clientDir, 'index.html')
  const clientIndexTemplate = readFileSync(clientIndexPath, 'utf8')

  app.use(express.static(clientDir, { index: false }))
  app.get(/^(?!\/api).*$/, (req, res) => {
    const html = renderClientIndexHtml({
      template: clientIndexTemplate,
      requestHost: req.hostname,
      requestPath: req.path,
      platformHostname: configuredPlatformHostname,
      canonicalBaseUrl: env.APP_BASE_URL,
    })

    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Vary', 'Host')
    res.type('html').send(html)
  })
}

app.use(handleError)

const serverHost = env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'
const server = app.listen(env.PORT, serverHost, () => {
  console.log(`server listening on ${serverHost}:${env.PORT}`)
})

const domainVerificationTimer = setInterval(
  () => void verifyPendingDomains(),
  env.DOMAIN_VERIFY_INTERVAL_MINUTES * 60_000,
)
domainVerificationTimer.unref()
setTimeout(() => void verifyPendingDomains(), 10_000).unref()

const appointmentAutomationTimer = setInterval(
  () => void processAppointmentAutomationQueue().catch((error) => console.error('[Appointments] falha no worker de confirmações', error)),
  60_000,
)
appointmentAutomationTimer.unref()
const startupAppointmentAutomationTimer = setTimeout(
  () => void processAppointmentAutomationQueue().catch((error) => console.error('[Appointments] falha no bootstrap do worker de confirmações', error)),
  12_000,
)
startupAppointmentAutomationTimer.unref()

const whatsappHealthTimer = setInterval(
  () => void processWhatsappConnectionHealth().catch((error) => console.error('[WhatsApp] falha no health worker', error)),
  2 * 60_000,
)
whatsappHealthTimer.unref()
const startupWhatsappHealthTimer = setTimeout(
  () => void processWhatsappConnectionHealth().catch((error) => console.error('[WhatsApp] falha no bootstrap de health', error)),
  18_000,
)
startupWhatsappHealthTimer.unref()

const whatsappMediaTimer = setInterval(
  () => void processWhatsappMediaQueue().catch((error) => console.error('[WhatsApp] falha no worker de mídia', error)),
  30_000,
)
whatsappMediaTimer.unref()
const startupWhatsappMediaTimer = setTimeout(
  () => void processWhatsappMediaQueue().catch((error) => console.error('[WhatsApp] falha no bootstrap de mídia', error)),
  20_000,
)
startupWhatsappMediaTimer.unref()

const whatsappMarketingCampaignTimer = setInterval(
  () => void processWhatsappMarketingCampaignQueue().catch((error) => console.error('[WhatsApp] falha no worker de campanhas', error)),
  env.WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS * 1000,
)
whatsappMarketingCampaignTimer.unref()
const startupWhatsappMarketingCampaignTimer = setTimeout(
  () => void processWhatsappMarketingCampaignQueue().catch((error) => console.error('[WhatsApp] falha no bootstrap de campanhas', error)),
  22_000,
)
startupWhatsappMarketingCampaignTimer.unref()

const pruneTransientSecurityState = () => {
  const now = Date.now()
  const oneDayAgo = new Date(now - 24 * 60 * 60_000).toISOString()
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60_000).toISOString()
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60_000).toISOString()
  db.transaction(() => {
    db.prepare(`DELETE FROM security_rate_limits WHERE updated_at < ?`).run(thirtyDaysAgo)
    db.prepare(`DELETE FROM auth_challenges WHERE expires_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)`).run(oneDayAgo, oneDayAgo)
    db.prepare(`DELETE FROM auth_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).run(ninetyDaysAgo, ninetyDaysAgo)
    db.prepare(`DELETE FROM trusted_devices WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).run(ninetyDaysAgo, ninetyDaysAgo)
  })()
}
const securityStatePruneTimer = setInterval(pruneTransientSecurityState, 6 * 60 * 60_000)
securityStatePruneTimer.unref()
const startupSecurityStatePruneTimer = setTimeout(pruneTransientSecurityState, 25_000)
startupSecurityStatePruneTimer.unref()

let shuttingDown = false
const shutdown = (signal: string) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[Shutdown] ${signal}`)
  clearInterval(domainVerificationTimer)
  clearInterval(appointmentAutomationTimer)
  clearTimeout(startupAppointmentAutomationTimer)
  clearInterval(whatsappHealthTimer)
  clearTimeout(startupWhatsappHealthTimer)
  clearInterval(whatsappMediaTimer)
  clearTimeout(startupWhatsappMediaTimer)
  clearInterval(whatsappMarketingCampaignTimer)
  clearTimeout(startupWhatsappMarketingCampaignTimer)
  clearInterval(securityStatePruneTimer)
  clearTimeout(startupSecurityStatePruneTimer)
  server.closeIdleConnections()
  server.close(() => {
    closeDb()
    process.exit(0)
  })
  setTimeout(() => {
    console.error('[Shutdown] encerramento forçado após timeout')
    server.closeAllConnections()
    closeDb()
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
