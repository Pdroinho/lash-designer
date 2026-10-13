import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router, type Request, type RequestHandler } from 'express'
import { z } from 'zod'
import { env } from '../env.js'
import { badRequest } from '../http.js'
import { currentLegalBundleHash, PRIVACY_VERSION, TERMS_VERSION } from '../legal.js'
import { nextBillingPeriodEnd, type BillingCycle, type BillingPlan } from '../plans.js'
import { hashPassword } from '../security.js'
import type { createAppmaxBillingService } from '../appmaxBillingService.js'

type CheckoutQuote = {
  grossAmountCents: number
  discountPercent: number
  discountAmountCents: number
  amountCents: number
  promoApplied: boolean
}

type CreateInfinitePayLink = (input: {
  orderNsu: string
  amountCents: number
  customerName: string
  customerEmail: string
  planLabel: string
  months: number
  redirectUrl: string
  itemDescription?: string
}) => Promise<string>

type PublicOnboardingRouterOptions = {
  db: Database.Database
  publicCheckoutLimiter: RequestHandler
  publicCheckoutEmailLimiter: RequestHandler
  billingPlanByCycle: Map<BillingCycle, BillingPlan>
  assertTenantSlugIsAvailable: (slug: string) => void
  subscriptionCheckoutQuote: (plan: BillingPlan, discountPercent: number, firstPurchase: boolean) => CheckoutQuote
  normalizeUserE164Phone: (raw: string) => string
  recordLegalAcceptance: (input: { userId: string; tenantId: string | null; source: string; req: Request }) => unknown
  recordPlatformMarketingChoice: (input: { userId: string; tenantId: string | null; granted: boolean; source: string }) => unknown
  createInfinitePayLink: CreateInfinitePayLink
  appmaxBilling?: ReturnType<typeof createAppmaxBillingService> | null
  appmaxEnabled?: boolean
}

export function createPublicOnboardingRouter(options: PublicOnboardingRouterOptions) {
  const {
    db,
    publicCheckoutLimiter,
    publicCheckoutEmailLimiter,
    billingPlanByCycle,
    assertTenantSlugIsAvailable,
    subscriptionCheckoutQuote,
    normalizeUserE164Phone,
    recordLegalAcceptance,
    recordPlatformMarketingChoice,
    createInfinitePayLink,
    appmaxBilling,
    appmaxEnabled = false,
  } = options
  const router = Router()

  router.get('/onboarding/team-quote', publicCheckoutLimiter, (req,res,next) => {
    try {
      if (!appmaxEnabled || !appmaxBilling) throw badRequest('Contratação por equipe indisponível.', 'TEAM_CHECKOUT_DISABLED')
      const { planCode, referralToken } = z.object({planCode:z.enum(['TEAM_3','TEAM_6','TEAM_15']),referralToken:z.string().trim().min(20).max(80).optional()}).strict().parse(req.query)
      res.json({quote:appmaxBilling.publicQuote(planCode,referralToken)})
    } catch(error){next(error)}
  })

  router.post('/onboarding/team-checkout', publicCheckoutLimiter, publicCheckoutEmailLimiter, async (req, res, next) => {
    try {
      if (!appmaxEnabled || !appmaxBilling) throw badRequest('Contratação por equipe indisponível.', 'TEAM_CHECKOUT_DISABLED')
      const body = z.object({
        ownerName: z.string().trim().min(2).max(100),
        studioName: z.string().trim().min(2).max(120),
        slug: z.string().trim().toLowerCase().min(2).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        email: z.string().email().transform(value => value.toLowerCase()),
        phone: z.string().min(8).max(40),
        password: z.string().min(8).max(128),
        planCode: z.enum(['TEAM_3', 'TEAM_6', 'TEAM_15']),
        legal: z.object({
          accepted: z.literal(true),
          termsVersion: z.string().max(80), privacyVersion: z.string().max(80),
          bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
        }).strict(),
        referralToken: z.string().trim().min(20).max(80).optional(),
        quoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
        platformMarketingWhatsapp: z.boolean().optional().default(false),
      }).strict().parse(req.body ?? {})
      if (body.legal.termsVersion !== TERMS_VERSION || body.legal.privacyVersion !== PRIVACY_VERSION || body.legal.bundleHash !== currentLegalBundleHash()) {
        throw badRequest('Os documentos legais foram atualizados. Revise os Termos e a Política de Privacidade antes de continuar.', 'LEGAL_VERSION_STALE')
      }
      assertTenantSlugIsAvailable(body.slug)
      if (db.prepare('SELECT 1 FROM tenants WHERE slug = ? LIMIT 1').get(body.slug)) throw badRequest('Esse endereço já está em uso.', 'TENANT_SLUG_TAKEN')
      if (db.prepare('SELECT 1 FROM users WHERE email = ? AND tenant_id IS NULL LIMIT 1').get(body.email)) throw badRequest('Use outro e-mail para criar o espaço.', 'EMAIL_ALREADY_USED')
      const tenantId = randomUUID()
      const userId = randomUUID()
      const now = new Date().toISOString()
      const passwordHash = await hashPassword(body.password)
      const phone = normalizeUserE164Phone(body.phone)
      if (body.referralToken) {appmaxBilling.validateReferral(body.referralToken,{email:body.email,phone});const quote=appmaxBilling.publicQuote(body.planCode,body.referralToken);if(body.quoteFingerprint !== quote.fingerprint)throw badRequest('Revise o valor da indicação antes de continuar.','REFERRAL_QUOTE_CHANGED')}
      db.transaction(() => {
        db.prepare("INSERT INTO tenants (id, slug, name, primary_color, logo_url, status, created_at) VALUES (?, ?, ?, '#972d57', NULL, 'ONBOARDING', ?)")
          .run(tenantId, body.slug, body.studioName, now)
        db.prepare("INSERT INTO tenant_settings (tenant_id, secondary_color, timezone, currency, created_at, updated_at) VALUES (?, '#2d2028', 'America/Sao_Paulo', 'BRL', ?, ?)")
          .run(tenantId, now, now)
        db.prepare("INSERT INTO tenant_onboarding (tenant_id, status, current_step, answers_json, created_at, updated_at) VALUES (?, 'PENDING', 0, '{}', ?, ?)")
          .run(tenantId, now, now)
        db.prepare('INSERT INTO booking_rules (tenant_id, min_notice_minutes, max_future_days, slot_step_minutes, created_at, updated_at) VALUES (?, 60, 60, 30, ?, ?)')
          .run(tenantId, now, now)
        const hours = db.prepare('INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        for (const weekday of [1, 2, 3, 4, 5]) hours.run(randomUUID(), tenantId, weekday, 540, 1080, now)
        hours.run(randomUUID(), tenantId, 6, 540, 840, now)
        db.prepare("INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at) VALUES (?, ?, ?, ?, ?, 'ADMIN', ?)")
          .run(userId, tenantId, body.email, passwordHash, phone, now)
        recordLegalAcceptance({ userId, tenantId, source: 'PUBLIC_CHECKOUT', req })
        recordPlatformMarketingChoice({ userId, tenantId, granted: body.platformMarketingWhatsapp, source: 'PUBLIC_CHECKOUT' })
      })()
      try {
        const checkout = await appmaxBilling.startCheckout(tenantId, body.planCode,body.referralToken,body.quoteFingerprint)
        return res.json({ activated: false, url: checkout.checkoutUrl, workspaceSlug: body.slug,
          intentId: checkout.intentId, amountCents: appmaxBilling.quoteForTenant(tenantId,body.planCode).amountCents })
      } catch {
        // Preserve the account: an external link may have been created before a database failure.
        return res.status(503).json({ code: 'TEAM_CHECKOUT_RECOVERABLE',
          message: 'Sua conta foi criada, mas o pagamento não abriu. Entre no seu estúdio e tente novamente em Assinatura.',
          workspaceSlug: body.slug })
      }
    } catch (err) { next(err) }
  })

  router.post('/onboarding/checkout', publicCheckoutLimiter, publicCheckoutEmailLimiter, async (req, res, next) => {
    try {
      if (appmaxEnabled) throw badRequest('Escolha uma faixa de equipe para continuar.', 'LEGACY_CHECKOUT_DISABLED')
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
          db.prepare(`DELETE FROM tenants WHERE id = ? AND status = 'ONBOARDING' AND NOT EXISTS (SELECT 1 FROM infinitepay_orders WHERE tenant_id = ? AND status = 'PAID')`)
            .run(tenantId, tenantId)
        })()
        throw error
      }
    } catch (err) {
      next(err)
    }
  })

  return router
}
