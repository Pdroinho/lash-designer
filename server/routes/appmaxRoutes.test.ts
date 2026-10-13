import { extendAppmaxReferralFixture } from '../testing/appmaxReferralFixture.js'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { createAppmaxBillingService } from '../appmaxBillingService.js'
import { createAppmaxWebhookRuntime } from '../appmaxWebhookRuntime.js'
import { handleError } from '../http.js'
import { createAdminAppmaxRouter, createAppmaxWebhookRouter } from './appmaxRoutes.js'

const tenant = '11111111-1111-4111-8111-111111111111'

test('checkout ADMIN e webhook sem assinatura só ativam após confirmação no provedor', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT, status TEXT, suspension_reason TEXT);
    CREATE TABLE subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT UNIQUE, external_id TEXT, status TEXT, current_period_end TEXT, billing_cycle TEXT, plan_code TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE professionals (tenant_id TEXT, active INTEGER, bookable INTEGER);
    CREATE TABLE appmax_checkout_intents (id TEXT PRIMARY KEY, tenant_id TEXT, plan_code TEXT, amount_cents INTEGER,
      payment_link_id INTEGER UNIQUE, checkout_url TEXT, order_id INTEGER UNIQUE, status TEXT, created_at TEXT, paid_at TEXT, provider_checked_at TEXT);
    CREATE TABLE appmax_webhook_inbox (id TEXT PRIMARY KEY, event_name TEXT, order_id INTEGER, payment_link_id INTEGER,
      payload_hash TEXT, status TEXT, received_at TEXT, processed_at TEXT, error_code TEXT, UNIQUE(event_name, order_id));
    INSERT INTO tenants VALUES ('${tenant}', 'Estúdio QA', 'ONBOARDING', NULL);
    INSERT INTO professionals VALUES ('${tenant}', 1, 1);
  `)
  extendAppmaxReferralFixture(db)
  let providerConfirms = false
  let providerReversed = false
  const billing = createAppmaxBillingService(db, {
    createPaymentLink: async () => ({ linkId: 73, checkoutUrl: 'https://pay.appmax.com.br/pl/73' }),
    verifyPaymentLinkOrder: async ({ orderId }) => providerConfirms && orderId === 42,
    inspectPaymentLinkOrder: async ({ orderId }) => orderId !== 42 ? 'UNKNOWN' as const : providerReversed ? 'REVERSED' as const : providerConfirms ? 'PAID' as const : 'UNKNOWN' as const,
  })
  const runtime = createAppmaxWebhookRuntime(db, billing)
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-admin'] === 'one') req.sessionUser = { id: 'admin', role: 'ADMIN', tenantId: tenant, sessionId: 'test', persistent: false, trustedDeviceId: null }
    if (req.headers['x-admin'] === 'two') req.sessionUser = { id: 'admin2', role: 'ADMIN', tenantId: '22222222-2222-4222-8222-222222222222', sessionId: 'test2', persistent: false, trustedDeviceId: null }
    next()
  })
  app.use('/api/admin', createAdminAppmaxRouter(db, billing, true, false))
  app.use('/api/webhooks', createAppmaxWebhookRouter(runtime))
  app.use(handleError)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const adminHeaders = { 'content-type': 'application/json', 'x-admin': 'one' }
  try {
    assert.equal((await fetch(`${base}/api/admin/subscription/team-plans`)).status, 401)
    const catalog = await fetch(`${base}/api/admin/subscription/team-plans`, { headers: adminHeaders }).then(r => r.json()) as { checkoutAvailable: boolean; plans: Array<{ amountCents: number }> }
    assert.equal(catalog.checkoutAvailable, true)
    assert.deepEqual(catalog.plans.map(p => p.amountCents), [7490, 9990, 14900])
    const start = await fetch(`${base}/api/admin/subscription/team-checkout`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ planCode: 'TEAM_6' }) })
    assert.equal(start.status, 200)
    const { intentId } = await start.json() as { intentId: string }
    const foreign = await fetch(`${base}/api/admin/subscription/team-order/${intentId}`, { headers: { 'x-admin': 'two' } })
    assert.equal(foreign.status, 404)
    const forged = { event: 'order_approved', event_type: 'order', data: { order_id: 43, payment_link_id: 73, total: 9990 } }
    assert.equal((await fetch(`${base}/api/webhooks/appmax`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(forged) })).status, 200)
    await runtime.processPending()
    assert.equal((db.prepare('SELECT count(*) as n FROM subscriptions').get() as { n: number }).n, 0)
    const legitimate = { ...forged, data: { ...forged.data, order_id: 42 } }
    providerConfirms = true
    await fetch(`${base}/api/webhooks/appmax`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(legitimate) })
    await runtime.processPending()
    assert.equal((db.prepare('SELECT plan_code as code FROM subscriptions').get() as { code: string }).code, 'TEAM_6')
    const replay = await fetch(`${base}/api/webhooks/appmax`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(legitimate) })
    assert.equal(replay.status, 200)
    assert.equal((db.prepare("SELECT count(*) as n FROM appmax_webhook_inbox WHERE status = 'APPLIED'").get() as { n: number }).n, 1)
    const forgedRefund = { ...legitimate, event: 'order_refund' }
    await fetch(`${base}/api/webhooks/appmax`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(forgedRefund) })
    await runtime.processPending()
    assert.equal((db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'ACTIVE')
    providerReversed = true
    const chargeback = { ...legitimate, event: 'order_chargeback_in_treatment' }
    await fetch(`${base}/api/webhooks/appmax`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(chargeback) })
    await runtime.processPending()
    assert.equal((db.prepare('SELECT status FROM subscriptions').get() as { status: string }).status, 'CANCELLED')
    assert.equal((db.prepare('SELECT status FROM appmax_checkout_intents').get() as { status: string }).status, 'REFUNDED')
  } finally { runtime.stop(); server.close(); await once(server, 'close'); db.close() }
})
