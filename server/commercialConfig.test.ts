import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createCommercialConfig, FIRST_MONTH_PROMO_CENTS, OFFICIAL_BILLING_PRICES } from './commercialConfig.js'

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE infinitepay_orders (tenant_id TEXT, status TEXT, billing_cycle TEXT);`)
  return db
}

test('catálogo oficial e promoção mensal permanecem calculados no servidor', () => {
  const db = createTestDb()
  const config = createCommercialConfig({ db })
  assert.deepEqual(Object.fromEntries(config.billingPlans.map(plan => [plan.cycle, plan.amountCents])), OFFICIAL_BILLING_PRICES)

  const monthly = config.billingPlanByCycle.get('MONTHLY')!
  assert.deepEqual(config.subscriptionCheckoutQuote(monthly, 0, true), {
    grossAmountCents: OFFICIAL_BILLING_PRICES.MONTHLY,
    discountPercent: 33,
    discountAmountCents: 2_000,
    amountCents: FIRST_MONTH_PROMO_CENTS,
    promoApplied: true,
  })
  assert.equal(config.subscriptionCheckoutQuote(monthly, 0, false).promoApplied, false)
  assert.equal(config.subscriptionCheckoutQuote(config.billingPlanByCycle.get('ANNUAL')!, 0, true).promoApplied, false)
  assert.equal(config.subscriptionCheckoutQuote(monthly, 50, true).amountCents, 2_995)
  db.close()
})

test('histórico de compra paga considera somente ciclos oficiais e isola tenant', () => {
  const db = createTestDb()
  db.exec(`
    INSERT INTO infinitepay_orders VALUES ('tenant-one', 'PENDING', 'MONTHLY');
    INSERT INTO infinitepay_orders VALUES ('tenant-one', 'PAID', 'LUMA_CREDITS');
    INSERT INTO infinitepay_orders VALUES ('tenant-two', 'PAID', 'ANNUAL');
  `)
  const config = createCommercialConfig({ db })
  assert.equal(config.hasPaidSubscriptionPurchase('tenant-one'), false)
  assert.equal(config.hasPaidSubscriptionPurchase('tenant-two'), true)
  db.close()
})

test('token de indicação é opaco e URL pública remove caminho e fragmento anteriores', () => {
  const db = createTestDb()
  const bytes = Buffer.from(Array.from({ length: 24 }, (_, index) => index))
  const config = createCommercialConfig({
    db,
    appBaseUrl: 'https://app.example.com/old/path?x=1#section',
    randomBytesFn: size => { assert.equal(size, 24); return bytes },
  })
  const token = config.referralToken()
  assert.match(token, /^[A-Za-z0-9_-]{32}$/)
  assert.equal(config.publicReferralUrl(token), `https://app.example.com/?ref=${token}`)

  const fallback = createCommercialConfig({ db }).publicReferralUrl('a+b/c')
  assert.equal(fallback, '/?ref=a%2Bb%2Fc')
  db.close()
})
