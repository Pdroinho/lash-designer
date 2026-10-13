import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { createInfinitePayWebhookRouter } from './infinitePayWebhookRoutes.js'

function createFixtureDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE assistant_credit_orders (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, order_nsu TEXT UNIQUE,
      amount_cents INTEGER, credits INTEGER, status TEXT, transaction_nsu TEXT,
      invoice_slug TEXT, receipt_url TEXT, capture_method TEXT, paid_at TEXT
    );
    CREATE TABLE assistant_message_credit_ledger (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, delta_messages INTEGER,
      source TEXT, note TEXT, reference_order_nsu TEXT UNIQUE, created_at TEXT
    );
    CREATE TABLE infinitepay_orders (
      id TEXT PRIMARY KEY, tenant_id TEXT, order_nsu TEXT UNIQUE, amount_cents INTEGER,
      status TEXT, billing_cycle TEXT, period_months INTEGER, referral_redemption_id TEXT,
      transaction_nsu TEXT, invoice_slug TEXT, receipt_url TEXT, capture_method TEXT, paid_at TEXT
    );
    CREATE TABLE subscriptions (
      id TEXT PRIMARY KEY, tenant_id TEXT UNIQUE, external_id TEXT, status TEXT,
      current_period_end TEXT, billing_cycle TEXT, plan_code TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE referral_links (id TEXT PRIMARY KEY, owner_tenant_id TEXT);
    CREATE TABLE referral_redemptions (id TEXT PRIMARY KEY, link_id TEXT, referrer_reward_percent INTEGER, status TEXT, paid_at TEXT);
    CREATE TABLE referral_credits (
      id TEXT PRIMARY KEY, owner_tenant_id TEXT, redemption_id TEXT UNIQUE, discount_percent INTEGER,
      status TEXT, applied_order_nsu TEXT, applied_at TEXT, reserved_at TEXT, created_at TEXT
    );

    INSERT INTO tenants VALUES ('tenant-buyer', 'ONBOARDING'), ('tenant-owner', 'ACTIVE');
    INSERT INTO assistant_credit_orders (id, tenant_id, user_id, order_nsu, amount_cents, credits, status)
      VALUES ('credit-order-1', 'tenant-buyer', 'user-1', 'order-luma', 1990, 50, 'PENDING');
    INSERT INTO referral_links VALUES ('link-1', 'tenant-owner');
    INSERT INTO referral_redemptions VALUES ('redemption-1', 'link-1', 40, 'PENDING', NULL);
    INSERT INTO infinitepay_orders (id, tenant_id, order_nsu, amount_cents, status, billing_cycle, period_months, referral_redemption_id)
      VALUES ('subscription-order-1', 'tenant-buyer', 'order-subscription', 59880, 'PENDING', 'ANNUAL', 12, 'redemption-1');
    INSERT INTO referral_credits (id, owner_tenant_id, discount_percent, status, applied_order_nsu, reserved_at, created_at)
      VALUES ('reserved-1', 'tenant-buyer', 10, 'RESERVED', 'order-subscription', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  `)
  return db
}

test('webhook InfinitePay confirma Luma e assinatura uma única vez', async () => {
  const db = createFixtureDb()
  const passThrough: RequestHandler = (_req, _res, next) => next()
  const events: Array<{ orderNsu?: string | null; outcome: string; errorCode?: string | null }> = []
  const verifiedOrders: string[] = []
  const app = express()
  app.use(express.json())
  app.use('/api/webhooks', createInfinitePayWebhookRouter({
    db,
    infinitePayWebhookLimiter: passThrough,
    infinitePayConfigured: true,
    logInfinitePayWebhookEvent: event => { events.push(event) },
    verifyInfinitePayPayment: async input => {
      verifiedOrders.push(input.orderNsu)
      return { capture_method: 'pix' }
    },
  }))

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const sendWebhook = (orderNsu: string, amount: number, transactionNsu: string) => fetch(`${baseUrl}/api/webhooks/infinitepay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ order_nsu: orderNsu, transaction_nsu: transactionNsu, amount, invoice_slug: `invoice-${orderNsu}`, receipt_url: 'http://inseguro.example/recibo' }),
  })

  try {
    const invalid = await fetch(`${baseUrl}/api/webhooks/infinitepay`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    assert.equal(invalid.status, 400)
    assert.equal(events.at(-1)?.errorCode, 'INVALID_PAYLOAD')

    const credited = await sendWebhook('order-luma', 1990, 'transaction-luma')
    assert.deepEqual(await credited.json(), { success: true, message: null, credited: 50 })
    const creditOrder = db.prepare("SELECT status, receipt_url AS receiptUrl FROM assistant_credit_orders WHERE id = 'credit-order-1'").get() as { status: string; receiptUrl: string }
    assert.deepEqual(creditOrder, { status: 'PAID', receiptUrl: '' })
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM assistant_message_credit_ledger').get() as { total: number }).total, 1)

    const creditReplay = await sendWebhook('order-luma', 1990, 'transaction-luma')
    assert.deepEqual(await creditReplay.json(), { success: true, message: null })
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM assistant_message_credit_ledger').get() as { total: number }).total, 1)

    const activated = await sendWebhook('order-subscription', 59880, 'transaction-subscription')
    assert.deepEqual(await activated.json(), { success: true, message: null })
    assert.equal((db.prepare("SELECT status FROM infinitepay_orders WHERE id = 'subscription-order-1'").get() as { status: string }).status, 'PAID')
    assert.equal((db.prepare("SELECT status FROM tenants WHERE id = 'tenant-buyer'").get() as { status: string }).status, 'ACTIVE')
    const subscription = db.prepare("SELECT status, external_id AS externalId, billing_cycle AS billingCycle FROM subscriptions WHERE tenant_id = 'tenant-buyer'").get()
    assert.deepEqual(subscription, { status: 'ACTIVE', externalId: 'transaction-subscription', billingCycle: 'ANNUAL' })
    assert.equal((db.prepare("SELECT status FROM referral_credits WHERE id = 'reserved-1'").get() as { status: string }).status, 'APPLIED')
    assert.equal((db.prepare("SELECT status FROM referral_redemptions WHERE id = 'redemption-1'").get() as { status: string }).status, 'PAID')
    const reward = db.prepare("SELECT discount_percent AS discountPercent, status FROM referral_credits WHERE owner_tenant_id = 'tenant-owner'").get()
    assert.deepEqual(reward, { discountPercent: 30, status: 'AVAILABLE' })

    const subscriptionReplay = await sendWebhook('order-subscription', 59880, 'transaction-subscription')
    assert.deepEqual(await subscriptionReplay.json(), { success: true, message: null })
    assert.equal((db.prepare("SELECT COUNT(*) AS total FROM referral_credits WHERE owner_tenant_id = 'tenant-owner'").get() as { total: number }).total, 1)
    assert.deepEqual(verifiedOrders, ['order-luma', 'order-subscription'])
    assert.deepEqual(events.filter(event => event.orderNsu === 'order-luma').map(event => event.outcome), ['APPLIED', 'REPLAY_IGNORED'])
    assert.deepEqual(events.filter(event => event.orderNsu === 'order-subscription').map(event => event.outcome), ['APPLIED', 'REPLAY_IGNORED'])
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
