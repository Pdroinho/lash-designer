import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { handleError } from '../http.js'
import { createDevReferralRouter } from './devReferralRoutes.js'

function createFixtureDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE referral_links (
      id TEXT PRIMARY KEY, owner_tenant_id TEXT, created_by_user_id TEXT, label TEXT, token TEXT,
      invitee_discount_percent INTEGER, referrer_reward_percent INTEGER, max_redemptions INTEGER,
      redemptions_count INTEGER DEFAULT 0, expires_at TEXT, active INTEGER DEFAULT 1, created_at TEXT
    );
    CREATE TABLE referral_redemptions (
      id TEXT PRIMARY KEY, link_id TEXT, invited_tenant_id TEXT, status TEXT, gross_amount_cents INTEGER,
      discount_amount_cents INTEGER, created_at TEXT, paid_at TEXT
    );
    CREATE TABLE referral_credits (id TEXT PRIMARY KEY, status TEXT);
  `)
  return db
}

test('indicações DEV preservam política de desconto, métricas e ativação', async () => {
  const db = createFixtureDb()
  const passThrough: RequestHandler = (_req, _res, next) => next()
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-dev'] === 'true') {
      req.sessionUser = { id: 'dev-1', role: 'DEV', tenantId: null, sessionId: 'session-dev', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/dev', createDevReferralRouter({
    db,
    requireDevHost: passThrough,
    referralMutationLimiter: passThrough,
    referralToken: () => 'token-dev-deterministico-123456',
    publicReferralUrl: token => `https://app.exemplo.com/?ref=${token}`,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const devHeaders = { 'content-type': 'application/json', 'x-test-dev': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/dev/referrals`)
    assert.equal(unauthorized.status, 401)

    const missingConfirmation = await fetch(`${baseUrl}/api/dev/referrals/links`, {
      method: 'POST', headers: devHeaders,
      body: JSON.stringify({ label: 'Cortesia', inviteeDiscountPercent: 100, referrerRewardPercent: 10, maxRedemptions: 50 }),
    })
    assert.equal(missingConfirmation.status, 400)
    assert.equal((await missingConfirmation.json() as { code: string }).code, 'HIGH_DISCOUNT_CONFIRMATION_REQUIRED')

    const createdResponse = await fetch(`${baseUrl}/api/dev/referrals/links`, {
      method: 'POST', headers: devHeaders,
      body: JSON.stringify({ label: 'Cortesia', inviteeDiscountPercent: 100, referrerRewardPercent: 10, maxRedemptions: 50, confirmation: 'GERAR 100%' }),
    })
    assert.equal(createdResponse.status, 200)
    const created = await createdResponse.json() as { link: { id: string; url: string; maxRedemptions: number; expiresAt: string; active: boolean } }
    assert.equal(created.link.url, 'https://app.exemplo.com/?ref=token-dev-deterministico-123456')
    assert.equal(created.link.maxRedemptions, 1)
    assert.equal(created.link.active, true)
    const expiryMs = Date.parse(created.link.expiresAt) - Date.now()
    assert.ok(expiryMs > 0 && expiryMs <= 7 * 86400000)

    const overview = await fetch(`${baseUrl}/api/dev/referrals`, { headers: devHeaders }).then(response => response.json()) as {
      metrics: { activeLinks: number }; links: Array<{ id: string; active: boolean; url: string }>
    }
    assert.equal(overview.metrics.activeLinks, 1)
    assert.equal(overview.links[0]?.active, true)
    assert.equal(overview.links[0]?.url, created.link.url)

    const disabled = await fetch(`${baseUrl}/api/dev/referrals/links/${created.link.id}`, {
      method: 'PATCH', headers: devHeaders, body: JSON.stringify({ active: false }),
    })
    assert.deepEqual(await disabled.json(), { ok: true, active: false })
    assert.equal((db.prepare('SELECT active FROM referral_links WHERE id = ?').get(created.link.id) as { active: number }).active, 0)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
