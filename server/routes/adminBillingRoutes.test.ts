import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { buildBillingPlans } from '../plans.js'
import { discountQuote } from '../referrals.js'
import { createAdminBillingRouter } from './adminBillingRoutes.js'

test('billing ADMIN preserva simulação, visão geral, pedido e reserva do checkout', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY, tenant_id TEXT, external_id TEXT, status TEXT,
      current_period_end TEXT, billing_cycle TEXT, plan_code TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE payment_events (id TEXT PRIMARY KEY, event_type TEXT, payload_json TEXT, received_at TEXT);
    CREATE TABLE infinitepay_orders (
      id TEXT PRIMARY KEY, tenant_id TEXT, order_nsu TEXT, amount_cents INTEGER,
      gross_amount_cents INTEGER, discount_amount_cents INTEGER,
      referrer_discount_percent INTEGER, billing_cycle TEXT, period_months INTEGER,
      status TEXT, checkout_url TEXT, receipt_url TEXT, created_at TEXT, paid_at TEXT
    );
    CREATE TABLE referral_credits (
      id TEXT PRIMARY KEY, owner_tenant_id TEXT, discount_percent INTEGER, status TEXT,
      applied_order_nsu TEXT, reserved_at TEXT, created_at TEXT
    );
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT);
    INSERT INTO users VALUES ('admin-1', 'ana@example.com');
    INSERT INTO referral_credits VALUES ('credit-1', 'tenant-1', 10, 'AVAILABLE', NULL, NULL, '2026-01-01T00:00:00.000Z');
    INSERT INTO infinitepay_orders VALUES ('paid-1', 'tenant-1', 'order-paid', 59880, 59880, 0, 0, 'ANNUAL', 12, 'PAID', NULL, 'https://pay.example/receipt', '2026-01-02T00:00:00.000Z', '2026-01-02T00:05:00.000Z');
  `)
  const billingPlans = buildBillingPlans({ MONTHLY: 5_990, QUARTERLY: 16_990, SEMIANNUAL: 32_990, ANNUAL: 59_880 })
  const billingPlanByCycle = new Map(billingPlans.map(plan => [plan.cycle, plan]))
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: 'tenant-1', sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/admin', createAdminBillingRouter({
    db,
    billingPlans,
    billingPlanByCycle,
    firstMonthPromoCents: 3_990,
    hasPaidSubscriptionPurchase: tenantId => Boolean(db.prepare("SELECT 1 FROM infinitepay_orders WHERE tenant_id = ? AND status = 'PAID'").get(tenantId)),
    subscriptionCheckoutQuote: (plan, discountPercent, firstPurchase) => {
      const quote = discountQuote(plan.amountCents, discountPercent)
      if (firstPurchase && plan.cycle === 'MONTHLY') {
        return { grossAmountCents: plan.amountCents, discountPercent: 33, discountAmountCents: 2_000, amountCents: 3_990, promoApplied: true }
      }
      return { ...quote, promoApplied: false }
    },
    createInfinitePayLink: async input => `https://checkout.example/${input.orderNsu}`,
  }))
  app.use('/api/disabled', createAdminBillingRouter({db,billingPlans,billingPlanByCycle,firstMonthPromoCents:3990,legacyCheckoutEnabled:false,hasPaidSubscriptionPurchase:()=>true,subscriptionCheckoutQuote:plan=>({...discountQuote(plan.amountCents,0),promoApplied:false}),createInfinitePayLink:async()=>{throw new Error('Legacy provider must not be called')}}))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const adminHeaders = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/admin/billing/overview`)
    assert.equal(unauthorized.status, 401)

    const disabled = await fetch(`${baseUrl}/api/disabled/subscription/checkout-url`,{method:'POST',headers:adminHeaders,body:JSON.stringify({cycle:'ANNUAL'})})
    assert.equal(disabled.status,400)
    assert.equal((await disabled.json() as {code:string}).code,'LEGACY_CHECKOUT_DISABLED')
    assert.equal((db.prepare('SELECT COUNT(*) as total FROM infinitepay_orders').get() as {total:number}).total,1)

    const simulated = await fetch(`${baseUrl}/api/admin/subscription/test-pay`, { method: 'POST', headers: adminHeaders })
    assert.deepEqual(await simulated.json(), { ok: true, status: 'ACTIVE' })
    assert.equal((db.prepare("SELECT status FROM subscriptions WHERE tenant_id = 'tenant-1'").get() as { status: string }).status, 'ACTIVE')
    assert.equal((db.prepare('SELECT COUNT(*) as total FROM payment_events').get() as { total: number }).total, 1)

    const overview = await fetch(`${baseUrl}/api/admin/billing/overview`, { headers: adminHeaders }).then(response => response.json()) as {
      subscription: { status: string }; orders: Array<{ orderNsu: string }>; plans: unknown[]; referralDiscountPercent: number; firstMonthPromoEligible: boolean; firstMonthPromoCents: number
    }
    assert.equal(overview.subscription.status, 'ACTIVE')
    assert.equal(overview.orders[0]?.orderNsu, 'order-paid')
    assert.equal(overview.plans.length, 4)
    assert.equal(overview.referralDiscountPercent, 10)
    assert.equal(overview.firstMonthPromoEligible, false)
    assert.equal(overview.firstMonthPromoCents, 3_990)

    const orderStatus = await fetch(`${baseUrl}/api/admin/subscription/order-status?orderNsu=order-paid`, { headers: adminHeaders })
    assert.deepEqual(await orderStatus.json(), { order: { status: 'PAID', paidAt: '2026-01-02T00:05:00.000Z' } })

    const checkout = await fetch(`${baseUrl}/api/admin/subscription/checkout-url`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ cycle: 'ANNUAL' }),
    })
    assert.equal(checkout.status, 200)
    const checkoutBody = await checkout.json() as { url: string; orderNsu: string; discount: { percent: number; amountCents: number }; promoApplied: boolean }
    assert.equal(checkoutBody.url, `https://checkout.example/${checkoutBody.orderNsu}`)
    assert.deepEqual(checkoutBody.discount, { percent: 10, amountCents: 5_988 })
    assert.equal(checkoutBody.promoApplied, false)
    const createdOrder = db.prepare('SELECT status, checkout_url as checkoutUrl FROM infinitepay_orders WHERE order_nsu = ?').get(checkoutBody.orderNsu) as { status: string; checkoutUrl: string }
    assert.deepEqual(createdOrder, { status: 'PENDING', checkoutUrl: checkoutBody.url })
    const reserved = db.prepare("SELECT status, applied_order_nsu as appliedOrderNsu FROM referral_credits WHERE id = 'credit-1'").get() as { status: string; appliedOrderNsu: string }
    assert.deepEqual(reserved, { status: 'RESERVED', appliedOrderNsu: checkoutBody.orderNsu })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
