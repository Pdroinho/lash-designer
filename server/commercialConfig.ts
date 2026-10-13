import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import { buildBillingPlans, type BillingPlan } from './plans.js'
import { discountQuote } from './referrals.js'

export const OFFICIAL_BILLING_PRICES = {
  MONTHLY: 5_990,
  QUARTERLY: 16_990,
  SEMIANNUAL: 32_990,
  ANNUAL: 59_880,
} as const

export const FIRST_MONTH_PROMO_CENTS = 3_990

type CommercialConfigOptions = {
  db: Database.Database
  appBaseUrl?: string
  frontendOrigin?: string
  randomBytesFn?: (size: number) => Buffer
}

export function createCommercialConfig({
  db,
  appBaseUrl,
  frontendOrigin,
  randomBytesFn = randomBytes,
}: CommercialConfigOptions) {
  // Official prices are product policy. Environment values must not silently
  // restore a stale catalog after a deploy.
  const billingPlans = buildBillingPlans(OFFICIAL_BILLING_PRICES)
  const billingPlanByCycle = new Map(billingPlans.map(plan => [plan.cycle, plan]))

  const subscriptionCheckoutQuote = (plan: BillingPlan, discountPercent: number, firstPurchase: boolean) => {
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

  const referralToken = () => randomBytesFn(24).toString('base64url')

  const publicReferralUrl = (token: string) => {
    const base = appBaseUrl || frontendOrigin
    if (!base) return `/?ref=${encodeURIComponent(token)}`
    const url = new URL(base)
    url.pathname = '/'
    url.search = `?ref=${encodeURIComponent(token)}`
    url.hash = ''
    return url.toString()
  }

  return {
    billingPlans,
    billingPlanByCycle,
    firstMonthPromoCents: FIRST_MONTH_PROMO_CENTS,
    subscriptionCheckoutQuote,
    hasPaidSubscriptionPurchase,
    referralToken,
    publicReferralUrl,
  }
}
