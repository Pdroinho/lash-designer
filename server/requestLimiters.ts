import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { createRateLimiter, type RateLimiterOptions } from './middleware/rateLimit.js'
import { normalizeBrazilPhone } from './phone.js'

type LimiterFactory = (options: RateLimiterOptions) => ReturnType<typeof createRateLimiter>

type RequestLimitersOptions = {
  db: Database.Database
  preauthCookieName: string
  createLimiter?: LimiterFactory
}

export function createRequestLimiters({ db, preauthCookieName, createLimiter }: RequestLimitersOptions) {
  const limiter = createLimiter ?? (options => createRateLimiter(db, options))
  const phoneSubject = (raw: unknown) => typeof raw === 'string'
    ? (normalizeBrazilPhone(raw) ?? raw.replace(/\D/g, ''))
    : ''

  return {
    apiLimiter: limiter({ windowMs: 60_000, max: 600, keyPrefix: 'api' }),
    webhooksLimiter: limiter({ windowMs: 60_000, max: 120, keyPrefix: 'webhooks' }),
    infinitePayWebhookLimiter: limiter({ windowMs: 60_000, max: 60, keyPrefix: 'webhooks:infinitepay' }),
    authLoginLimiter: limiter({ windowMs: 60_000, max: 12, keyPrefix: 'auth:login', persistent: true }),
    authWhatsappOtpSendLimiter: limiter({
      windowMs: 15 * 60_000,
      max: 4,
      keyPrefix: 'auth:whatsapp-otp:send',
      persistent: true,
      keyFn: req => {
        const token = req.cookies?.[preauthCookieName]
        return typeof token === 'string' ? createHash('sha256').update(token).digest('hex') : ''
      },
    }),
    publicCheckoutLimiter: limiter({ windowMs: 15 * 60_000, max: 8, keyPrefix: 'public:checkout' }),
    publicCheckoutEmailLimiter: limiter({
      windowMs: 60 * 60_000,
      max: 4,
      keyPrefix: 'public:checkout:email',
      keyFn: req => typeof req.body?.email === 'string' ? req.body.email : '',
    }),
    authPasswordLimiter: limiter({ windowMs: 15 * 60_000, max: 8, keyPrefix: 'auth:password', persistent: true }),
    authLoginUserLimiter: limiter({
      windowMs: 15 * 60_000,
      max: 20,
      keyPrefix: 'auth:login:user',
      persistent: true,
      keyFn: req => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
        return email && email.includes('@') ? email : ''
      },
    }),
    devBootstrapLimiter: limiter({ windowMs: 60_000, max: 4, keyPrefix: 'dev:bootstrap', persistent: true }),
    referralMutationLimiter: limiter({ windowMs: 60_000, max: 12, keyPrefix: 'referrals:mutation' }),
    onboardingAssistantLimiter: limiter({ windowMs: 60_000, max: 4, keyPrefix: 'onboarding:assistant' }),
    lumaAssistantLimiter: limiter({ windowMs: 60_000, max: 10, keyPrefix: 'admin:luma', keyFn: req => req.sessionUser?.id ?? '' }),
    devBackupExportLimiter: limiter({ windowMs: 60_000, max: 6, keyPrefix: 'dev:backup:export' }),
    domainVerifyLimiter: limiter({ windowMs: 60_000, max: 20, keyPrefix: 'admin:domain:verify' }),
    whatsappSendLimiter: limiter({ windowMs: 60_000, max: 20, keyPrefix: 'admin:whatsapp:send', keyFn: req => req.sessionUser?.id ?? '' }),
    publicBookingLimiter: limiter({ windowMs: 60_000, max: 12, keyPrefix: 'public:booking:create' }),
    publicBookingPhoneLimiter: limiter({ windowMs: 60 * 60_000, max: 8, keyPrefix: 'public:booking:phone', keyFn: req => phoneSubject(req.body?.phone) }),
    clientAccessRequestLimiter: limiter({ windowMs: 10 * 60_000, max: 6, keyPrefix: 'client:access:request', persistent: true }),
    clientAccessPhoneLimiter: limiter({ windowMs: 15 * 60_000, max: 4, keyPrefix: 'client:access:phone', persistent: true, keyFn: req => phoneSubject(req.body?.phone) }),
    clientAccessVerifyLimiter: limiter({ windowMs: 10 * 60_000, max: 12, keyPrefix: 'client:access:verify', persistent: true }),
  }
}
