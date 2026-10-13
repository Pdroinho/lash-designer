import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { nextAnnualPeriodEnd } from '../billing.js'
import { env } from '../env.js'
import { badRequest, forbidden, notFound } from '../http.js'
import type { BillingCycle, BillingPlan } from '../plans.js'
import { renewalRewardPercent } from '../referrals.js'

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

type AdminBillingRouterOptions = {
  db: Database.Database
  billingPlans: BillingPlan[]
  billingPlanByCycle: Map<BillingCycle, BillingPlan>
  firstMonthPromoCents: number
  hasPaidSubscriptionPurchase: (tenantId: string) => boolean
  subscriptionCheckoutQuote: (plan: BillingPlan, discountPercent: number, firstPurchase: boolean) => CheckoutQuote
  createInfinitePayLink: CreateInfinitePayLink
  legacyCheckoutEnabled?: boolean
}

export function createAdminBillingRouter(options: AdminBillingRouterOptions) {
  const {
    legacyCheckoutEnabled = true,
    db,
    billingPlans,
    billingPlanByCycle,
    firstMonthPromoCents,
    hasPaidSubscriptionPurchase,
    subscriptionCheckoutQuote,
    createInfinitePayLink,
  } = options
  const router = Router()

  router.post('/subscription/test-pay', requireRole('ADMIN'), (req, res, next) => {
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

      const eventId = randomUUID()
      const payload = JSON.stringify({
        event: 'payment_approved',
        total: 9700,
        customer: {
          firstname: 'Test',
          lastname: 'User',
          email: 'test@example.com',
        },
      })
      db.prepare(`INSERT INTO payment_events (id, event_type, payload_json, received_at) VALUES (?, ?, ?, ?)`).run(eventId, 'payment_approved', payload, now)

      res.json({ ok: true, status: 'ACTIVE' })
    } catch (err) {
      next(err)
    }
  })

  router.get('/billing/overview', requireRole('ADMIN'), (req, res, next) => {
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
      res.json({
        subscription: subscription ?? null,
        orders,
        plans: billingPlans,
        referralDiscountPercent: renewalRewardPercent(availableCredits.map((credit) => credit.discountPercent)),
        firstMonthPromoEligible: !hasPaidSubscriptionPurchase(tenantId),
        firstMonthPromoCents,
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/subscription/order-status', requireRole('ADMIN'), (req, res, next) => {
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
    } catch (err) {
      next(err)
    }
  })

  router.post('/subscription/checkout-url', requireRole('ADMIN'), async (req, res, next) => {
    try {
      if (legacyCheckoutEnabled === false) throw badRequest('Use o checkout por equipe com Appmax.', 'LEGACY_CHECKOUT_DISABLED')
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
    } catch (err) {
      next(err)
    }
  })

  return router
}
