import { extendAppmaxReferralFixture } from '../testing/appmaxReferralFixture.js'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { handleError } from '../http.js'
import { currentLegalBundleHash, PRIVACY_VERSION, TERMS_VERSION } from '../legal.js'
import { buildBillingPlans } from '../plans.js'
import { discountQuote } from '../referrals.js'
import { createPublicOnboardingRouter } from './publicOnboardingRoutes.js'
import { createAppmaxBillingService } from '../appmaxBillingService.js'

function createFixtureDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT UNIQUE, name TEXT, primary_color TEXT, logo_url TEXT, status TEXT, created_at TEXT, suspension_reason TEXT);
    CREATE TABLE tenant_settings (tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE, secondary_color TEXT, timezone TEXT, currency TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE tenant_onboarding (tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE, status TEXT, current_step INTEGER, answers_json TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE booking_rules (tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE, min_notice_minutes INTEGER, max_future_days INTEGER, slot_step_minutes INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE business_hours (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, weekday INTEGER, start_minute INTEGER, end_minute INTEGER, created_at TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, email TEXT, password_hash TEXT, phone TEXT, role TEXT, created_at TEXT);
    CREATE TABLE referral_links (id TEXT PRIMARY KEY, owner_tenant_id TEXT, token TEXT UNIQUE, invitee_discount_percent INTEGER, referrer_reward_percent INTEGER, max_redemptions INTEGER, redemptions_count INTEGER, expires_at TEXT, active INTEGER);
    CREATE TABLE referral_redemptions (id TEXT PRIMARY KEY, link_id TEXT, invited_tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, order_nsu TEXT, status TEXT, gross_amount_cents INTEGER, discount_amount_cents INTEGER, referrer_reward_percent INTEGER, created_at TEXT, paid_at TEXT);
    CREATE TABLE infinitepay_orders (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, order_nsu TEXT, amount_cents INTEGER, gross_amount_cents INTEGER, discount_amount_cents INTEGER, billing_cycle TEXT, period_months INTEGER, status TEXT, capture_method TEXT, checkout_url TEXT, created_at TEXT, paid_at TEXT, referral_redemption_id TEXT);
    CREATE TABLE subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, external_id TEXT, status TEXT, current_period_end TEXT, billing_cycle TEXT, plan_code TEXT, created_at TEXT, updated_at TEXT);
    INSERT INTO referral_links VALUES ('link-free', NULL, 'token-cortesia-100-por-cento', 100, 10, 1, 0, '2099-12-31T23:59:59.000Z', 1);
  `)
  return db
}

test('checkout público preserva ativação por cortesia e rollback quando o provedor falha', async () => {
  const db = createFixtureDb()
  const passThrough: RequestHandler = (_req, _res, next) => next()
  const plans = buildBillingPlans({ MONTHLY: 5_990, QUARTERLY: 16_990, SEMIANNUAL: 32_990, ANNUAL: 59_880 })
  const billingPlanByCycle = new Map(plans.map(plan => [plan.cycle, plan]))
  let legalRecords = 0
  let marketingRecords = 0
  const app = express()
  app.use(express.json())
  app.use('/api/public', createPublicOnboardingRouter({
    db,
    publicCheckoutLimiter: passThrough,
    publicCheckoutEmailLimiter: passThrough,
    billingPlanByCycle,
    assertTenantSlugIsAvailable: () => undefined,
    subscriptionCheckoutQuote: (plan, discountPercent, firstPurchase) => {
      const regular = discountQuote(plan.amountCents, discountPercent)
      if (firstPurchase && plan.cycle === 'MONTHLY' && 3_990 < regular.amountCents) {
        return { grossAmountCents: plan.amountCents, discountPercent: 33, discountAmountCents: 2_000, amountCents: 3_990, promoApplied: true }
      }
      return { ...regular, promoApplied: false }
    },
    normalizeUserE164Phone: () => '+5571999999999',
    recordLegalAcceptance: () => { legalRecords += 1 },
    recordPlatformMarketingChoice: () => { marketingRecords += 1 },
    createInfinitePayLink: async () => { throw new Error('provedor indisponível') },
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const legal = { accepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, bundleHash: currentLegalBundleHash() }
  const checkoutBody = {
    ownerName: 'Ana Silva', studioName: 'Studio Ana', email: 'ana@example.com', phone: '(71) 99999-9999',
    password: 'senha-segura', cycle: 'ANNUAL', legal, platformMarketingWhatsapp: false,
  }

  try {
    const staleLegal = await fetch(`${baseUrl}/api/public/onboarding/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...checkoutBody, slug: 'studio-stale', legal: { ...legal, bundleHash: '0'.repeat(64) } }),
    })
    assert.equal(staleLegal.status, 400)
    assert.equal((await staleLegal.json() as { code: string }).code, 'LEGAL_VERSION_STALE')

    const activated = await fetch(`${baseUrl}/api/public/onboarding/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...checkoutBody, slug: 'studio-cortesia', referralToken: 'token-cortesia-100-por-cento' }),
    })
    assert.equal(activated.status, 200)
    const activatedBody = await activated.json() as { activated: boolean; workspaceSlug: string; orderNsu: string; discount: { amountCents: number } }
    assert.equal(activatedBody.activated, true)
    assert.equal(activatedBody.workspaceSlug, 'studio-cortesia')
    assert.equal(activatedBody.discount.amountCents, 0)
    const tenant = db.prepare("SELECT id, status FROM tenants WHERE slug = 'studio-cortesia'").get() as { id: string; status: string }
    assert.equal(tenant.status, 'ACTIVE')
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM business_hours WHERE tenant_id = ?').get(tenant.id) as { total: number }).total, 6)
    assert.equal((db.prepare('SELECT status FROM subscriptions WHERE tenant_id = ?').get(tenant.id) as { status: string }).status, 'ACTIVE')
    assert.equal((db.prepare('SELECT status FROM infinitepay_orders WHERE tenant_id = ?').get(tenant.id) as { status: string }).status, 'PAID')
    assert.equal((db.prepare("SELECT redemptions_count AS total FROM referral_links WHERE id = 'link-free'").get() as { total: number }).total, 1)
    assert.equal((db.prepare("SELECT status FROM referral_redemptions WHERE link_id = 'link-free'").get() as { status: string }).status, 'PAID')
    assert.equal(legalRecords, 1)
    assert.equal(marketingRecords, 1)

    const failed = await fetch(`${baseUrl}/api/public/onboarding/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...checkoutBody, slug: 'studio-falha', email: 'falha@example.com' }),
    })
    assert.equal(failed.status, 500)
    assert.equal(db.prepare("SELECT 1 FROM tenants WHERE slug = 'studio-falha'").get(), undefined)
    assert.equal(db.prepare("SELECT 1 FROM users WHERE email = 'falha@example.com'").get(), undefined)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})

test('checkout público de equipe vincula estúdio, valor e ativação apenas ao pedido confirmado', async () => {
  const db = createFixtureDb()
  db.exec(`CREATE TABLE appmax_checkout_intents (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), plan_code TEXT NOT NULL, amount_cents INTEGER NOT NULL, payment_link_id INTEGER UNIQUE, checkout_url TEXT, status TEXT NOT NULL, order_id INTEGER UNIQUE, created_at TEXT NOT NULL, paid_at TEXT);`)
  const createdAmounts: number[] = []
  extendAppmaxReferralFixture(db)
  const appmaxBilling = createAppmaxBillingService(db, {
    createPaymentLink: async input => { if (input.name === 'Studio Falha') throw new Error('sandbox indisponível'); createdAmounts.push(input.amountCents); return { linkId: 913, checkoutUrl: 'https://sandbox.appmax.com.br/pagar/913' } },
    verifyPaymentLinkOrder: async input => input.linkId === 913 && input.orderId === 77 && input.expectedAmountCents === 9_990,
  })
  let acceptanceCount = 0
  const passThrough: RequestHandler = (_req, _res, next) => next()
  const app = express()
  app.use(express.json())
  app.use('/api/public', createPublicOnboardingRouter({
    db, publicCheckoutLimiter: passThrough, publicCheckoutEmailLimiter: passThrough,
    billingPlanByCycle: new Map(buildBillingPlans({ MONTHLY: 5990, QUARTERLY: 16990, SEMIANNUAL: 32990, ANNUAL: 59880 }).map(plan => [plan.cycle, plan])),
    assertTenantSlugIsAvailable: () => undefined, subscriptionCheckoutQuote: () => { throw new Error('legacy checkout unexpected') },
    normalizeUserE164Phone: () => '+5571999999999',
    recordLegalAcceptance: () => { acceptanceCount++ }, recordPlatformMarketingChoice: () => undefined,
    createInfinitePayLink: async () => { throw new Error('legacy provider unexpected') },
    appmaxBilling, appmaxEnabled: true,
  }))
  app.use(handleError)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}/api/public/onboarding/`
  const body = {
    ownerName: 'Ana Silva', studioName: 'Studio Equipe', slug: 'studio-equipe', email: 'equipe@example.com',
    phone: '(71) 99999-9999', password: 'senha-segura', planCode: 'TEAM_6',
    legal: { accepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, bundleHash: currentLegalBundleHash() },
    platformMarketingWhatsapp: false,
  }
  const post = (path: string, payload: object) => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  try {
    const referral = await post('team-checkout', { ...body, referralToken: 'token-cortesia-100-por-cento' })
    assert.equal(referral.status, 400)
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM tenants').get() as { count: number }).count, 0)
    const stale = await post('team-checkout', { ...body, legal: { ...body.legal, bundleHash: '0'.repeat(64) } })
    assert.equal(stale.status, 400)
    assert.equal((await stale.json() as { code: string }).code, 'LEGAL_VERSION_STALE')
    const legacy = await post('checkout', { ...body, cycle: 'MONTHLY' })
    assert.equal(legacy.status, 400)
    assert.equal((await legacy.json() as { code: string }).code, 'LEGACY_CHECKOUT_DISABLED')
    const pending = await post('team-checkout', body)
    assert.equal(pending.status, 200)
    const checkout = await pending.json() as { url: string; workspaceSlug: string; amountCents: number; intentId: string }
    assert.equal(checkout.url, 'https://sandbox.appmax.com.br/pagar/913')
    assert.equal(checkout.workspaceSlug, body.slug)
    assert.equal(checkout.amountCents, 9_990)
    assert.deepEqual(createdAmounts, [9_990])
    assert.equal(acceptanceCount, 1)
    const tenant = db.prepare('SELECT id, status FROM tenants WHERE slug = ?').get(body.slug) as { id: string; status: string }
    assert.equal(tenant.status, 'ONBOARDING')
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM business_hours WHERE tenant_id = ?').get(tenant.id) as { count: number }).count, 6)
    assert.equal(db.prepare('SELECT 1 FROM subscriptions WHERE tenant_id = ?').get(tenant.id), undefined)
    assert.equal(await appmaxBilling.confirmOrder({ tenantId: tenant.id, intentId: checkout.intentId, orderId: 88 }), false)
    assert.equal(await appmaxBilling.confirmOrder({ tenantId: tenant.id, intentId: checkout.intentId, orderId: 77 }), true)
    assert.equal((db.prepare('SELECT plan_code AS code FROM subscriptions WHERE tenant_id = ?').get(tenant.id) as { code: string }).code, 'TEAM_6')
    assert.equal((db.prepare('SELECT status FROM tenants WHERE id = ?').get(tenant.id) as { status: string }).status, 'ACTIVE')
    const failed = await post('team-checkout', { ...body, studioName: 'Studio Falha', slug: 'studio-falha', email: 'falha@example.com' })
    assert.equal(failed.status, 503)
    assert.equal((await failed.json() as { code: string }).code, 'TEAM_CHECKOUT_RECOVERABLE')
    const failedTenant = db.prepare("SELECT id, status FROM tenants WHERE slug = 'studio-falha'").get() as { id: string; status: string }
    assert.equal(failedTenant.status, 'ONBOARDING')
    assert.equal((db.prepare('SELECT status FROM appmax_checkout_intents WHERE tenant_id = ?').get(failedTenant.id) as { status: string }).status, 'CREATING')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
