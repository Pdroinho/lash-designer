import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminReferralRouter, createPublicReferralRouter } from './referralRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const linkOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const activeToken = 'active-referral-token-1234567890'
const expiredToken = 'expired-referral-token-12345678'
const exhaustedToken = 'exhausted-referral-token-123456'
const fixedNow = new Date('2030-04-10T12:00:00.000Z')

test('indicações públicas e ADMIN preservam validade, métricas, limitador e isolamento', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE referral_links (
      id TEXT PRIMARY KEY, owner_tenant_id TEXT, created_by_user_id TEXT, label TEXT, token TEXT UNIQUE,
      invitee_discount_percent INTEGER, referrer_reward_percent INTEGER, max_redemptions INTEGER,
      redemptions_count INTEGER DEFAULT 0, expires_at TEXT, active INTEGER DEFAULT 1, created_at TEXT
    );
    CREATE TABLE referral_redemptions (
      id TEXT PRIMARY KEY, link_id TEXT, invited_tenant_id TEXT, status TEXT,
      gross_amount_cents INTEGER, discount_amount_cents INTEGER, created_at TEXT, paid_at TEXT
    );
    CREATE TABLE referral_credits (
      id TEXT PRIMARY KEY, owner_tenant_id TEXT, discount_percent INTEGER, status TEXT, created_at TEXT
    );

    INSERT INTO tenants VALUES
      ('${tenantOne}', 'Studio Aurora'),
      ('${tenantTwo}', 'Espaço Externo');
    INSERT INTO referral_links VALUES
      ('${linkOne}', '${tenantOne}', 'admin-1', 'Indicação Aurora', '${activeToken}', 15, 10, 100000, 2, NULL, 1, '2030-01-01T00:00:00.000Z'),
      ('expired-link', NULL, 'dev-1', 'Expirada', '${expiredToken}', 20, 0, 5, 0, '2030-04-01T00:00:00.000Z', 1, '2030-01-01T00:00:00.000Z'),
      ('exhausted-link', NULL, 'dev-1', 'Esgotada', '${exhaustedToken}', 100, 0, 1, 1, '2030-04-20T00:00:00.000Z', 1, '2030-01-01T00:00:00.000Z');
    INSERT INTO referral_redemptions VALUES
      ('redemption-paid', '${linkOne}', '${tenantTwo}', 'PAID', 10000, 1500, '2030-02-01T00:00:00.000Z', '2030-02-01T00:10:00.000Z'),
      ('redemption-pending', '${linkOne}', '${tenantTwo}', 'PENDING', 20000, 3000, '2030-03-01T00:00:00.000Z', NULL),
      ('redemption-foreign', 'expired-link', '${tenantOne}', 'PAID', 50000, 10000, '2030-03-01T00:00:00.000Z', '2030-03-01T00:10:00.000Z');
    INSERT INTO referral_credits VALUES
      ('credit-1', '${tenantOne}', 10, 'AVAILABLE', '2030-03-02T00:00:00.000Z'),
      ('credit-2', '${tenantOne}', 10, 'APPLIED', '2030-03-01T00:00:00.000Z'),
      ('credit-foreign', '${tenantTwo}', 30, 'AVAILABLE', '2099-01-01T00:00:00.000Z');
  `)

  let limiterCalls = 0
  let generatedTokens = 0
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const selectedTenant = req.headers['x-test-tenant']
    if (selectedTenant === 'one' || selectedTenant === 'two') {
      req.sessionUser = {
        id: selectedTenant === 'one' ? 'admin-1' : 'admin-2',
        role: 'ADMIN',
        tenantId: selectedTenant === 'one' ? tenantOne : tenantTwo,
        sessionId: `session-${selectedTenant}`,
        persistent: false,
        trustedDeviceId: null,
      }
    }
    next()
  })
  app.use('/api/public', createPublicReferralRouter({ db, now: () => fixedNow }))
  app.use('/api/admin', createAdminReferralRouter({
    db,
    referralMutationLimiter: (_req, _res, next) => {
      limiterCalls += 1
      next()
    },
    referralToken: () => {
      generatedTokens += 1
      return `generated-referral-token-${String(generatedTokens).padStart(4, '0')}`
    },
    publicReferralUrl: token => `https://app.exemplo.com/?ref=${encodeURIComponent(token)}`,
    now: () => fixedNow,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const tenantOneHeaders = { 'content-type': 'application/json', 'x-test-tenant': 'one' }
  const tenantTwoHeaders = { 'content-type': 'application/json', 'x-test-tenant': 'two' }

  try {
    const publicReferral = await fetch(`${baseUrl}/api/public/referrals/${activeToken}`).then(response => response.json())
    assert.deepEqual(publicReferral, {
      referral: { label: 'Indicação Aurora', inviteeDiscountPercent: 15, expiresAt: null },
    })

    for (const token of [expiredToken, exhaustedToken, 'missing-referral-token-123456789']) {
      const response = await fetch(`${baseUrl}/api/public/referrals/${token}`)
      assert.equal(response.status, 404)
      assert.equal((await response.json() as { code: string }).code, 'REFERRAL_NOT_FOUND')
    }

    assert.equal((await fetch(`${baseUrl}/api/admin/referrals/overview`)).status, 401)
    const overview = await fetch(`${baseUrl}/api/admin/referrals/overview`, { headers: tenantOneHeaders })
      .then(response => response.json()) as Record<string, unknown>
    assert.deepEqual(overview, {
      teamDiscountsAvailable: false,
      link: {
        id: linkOne,
        token: activeToken,
        inviteeDiscountPercent: 15,
        referrerRewardPercent: 10,
        redemptionsCount: 2,
        maxRedemptions: 100000,
        active: true,
        createdAt: '2030-01-01T00:00:00.000Z',
        url: `https://app.exemplo.com/?ref=${activeToken}`,
      },
      metrics: { total: 2, paid: 1, customerSavingsCents: 1500 },
      credits: [
        { discountPercent: 10, status: 'AVAILABLE', createdAt: '2030-03-02T00:00:00.000Z' },
        { discountPercent: 10, status: 'APPLIED', createdAt: '2030-03-01T00:00:00.000Z' },
      ],
      rules: { inviteeDiscountPercent: 15, referrerRewardPercent: 10, renewalCapPercent: 30 },
    })

    const foreignOverview = await fetch(`${baseUrl}/api/admin/referrals/overview`, { headers: tenantTwoHeaders })
      .then(response => response.json())
    assert.deepEqual(foreignOverview, {
      teamDiscountsAvailable: false,
      link: null,
      metrics: { total: 0, paid: 0, customerSavingsCents: 0 },
      credits: [{ discountPercent: 30, status: 'AVAILABLE', createdAt: '2099-01-01T00:00:00.000Z' }],
      rules: { inviteeDiscountPercent: 15, referrerRewardPercent: 10, renewalCapPercent: 30 },
    })

    const unauthorizedCreate = await fetch(`${baseUrl}/api/admin/referrals/link`, { method: 'POST' })
    assert.equal(unauthorizedCreate.status, 401)
    assert.equal(limiterCalls, 1)

    const reused = await fetch(`${baseUrl}/api/admin/referrals/link`, { method: 'POST', headers: tenantOneHeaders })
      .then(response => response.json())
    assert.deepEqual(reused, {
      id: linkOne,
      url: `https://app.exemplo.com/?ref=${activeToken}`,
      reused: true,
    })
    assert.equal(generatedTokens, 0)

    const created = await fetch(`${baseUrl}/api/admin/referrals/link`, { method: 'POST', headers: tenantTwoHeaders })
      .then(response => response.json()) as { id: string; url: string; reused: boolean }
    assert.equal(created.reused, false)
    assert.equal(created.url, 'https://app.exemplo.com/?ref=generated-referral-token-0001')
    const stored = db.prepare(`
      SELECT owner_tenant_id as tenantId, created_by_user_id as userId, label, token,
             invitee_discount_percent as inviteeDiscountPercent,
             referrer_reward_percent as referrerRewardPercent,
             max_redemptions as maxRedemptions, redemptions_count as redemptionsCount,
             active, created_at as createdAt
      FROM referral_links WHERE id = ?
    `).get(created.id)
    assert.deepEqual(stored, {
      tenantId: tenantTwo,
      userId: 'admin-2',
      label: 'Indicação de Espaço Externo',
      token: 'generated-referral-token-0001',
      inviteeDiscountPercent: 15,
      referrerRewardPercent: 10,
      maxRedemptions: 100000,
      redemptionsCount: 0,
      active: 1,
      createdAt: fixedNow.toISOString(),
    })

    const reusedCreated = await fetch(`${baseUrl}/api/admin/referrals/link`, { method: 'POST', headers: tenantTwoHeaders })
      .then(response => response.json())
    assert.deepEqual(reusedCreated, { id: created.id, url: created.url, reused: true })
    assert.equal(generatedTokens, 1)
    assert.equal(limiterCalls, 4)
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
