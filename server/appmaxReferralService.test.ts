import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { createAppmaxBillingService } from './appmaxBillingService.js'
import { AppmaxRequestError } from './appmax.js'

const directory = mkdtempSync(path.join(tmpdir(), 'lash-appmax-referrals-'))
process.env.NODE_ENV = 'test'
process.env.DATABASE_PATH = path.join(directory, 'schema.db')
const { migrate } = await import('./migrate.js'),
  { getDb, closeDb } = await import('./db.js')
migrate()
getDb().pragma('wal_checkpoint(TRUNCATE)')
getDb().pragma('journal_mode=DELETE')
const schema = getDb().serialize()
closeDb()
rmSync(directory, { recursive: true, force: true })
function fixture() {
  const db = new Database(schema)
  db.pragma('foreign_keys=ON')
  const now = new Date().toISOString()
  let counter = 0,
    nextLink = 100,
    fail: 'reject' | 'unknown' | null = null
  const amounts = new Map<number, number>(),
    states = new Map<number, 'PAID' | 'REVERSED' | 'UNKNOWN'>()
  const owner = randomUUID()
  function studio(id = randomUUID(), status = 'ONBOARDING') {
    const n = ++counter,
      userId = randomUUID()
    db.prepare(
      "INSERT INTO tenants (id,slug,name,status,created_at,primary_color) VALUES (?,?,?,?,?,'#972d57')",
    ).run(id, 'studio-' + n, 'Estúdio ' + n, status, now)
    db.prepare(
      "INSERT INTO users (id,tenant_id,email,phone,password_hash,role,created_at) VALUES (?,?,?,?,?,'ADMIN',?)",
    ).run(
      userId,
      id,
      `studio${n}@example.com`,
      `+557199999${String(n).padStart(4, '0')}`,
      'not-used',
      now,
    )
    return id
  }
  studio(owner, 'ACTIVE')
  const user = (
    db.prepare('SELECT id FROM users WHERE tenant_id=?').get(owner) as {
      id: string
    }
  ).id
  const linkId = randomUUID(),
    token = 'indication-' + randomUUID()
  db.prepare(
    'INSERT INTO referral_links (id,owner_tenant_id,created_by_user_id,label,token,invitee_discount_percent,referrer_reward_percent,max_redemptions,created_at) VALUES (?,?,?,?,?,15,10,100,?)',
  ).run(linkId, owner, user, 'Indicação do Estúdio', token, now)
  const billing = createAppmaxBillingService(db, {
    createPaymentLink: async ({ amountCents }) => {
      if (fail === 'reject') throw new AppmaxRequestError(422)
      const id = ++nextLink
      amounts.set(id, amountCents)
      states.set(id, 'UNKNOWN')
      if (fail === 'unknown') throw new Error('connection lost after create')
      return { linkId: id, checkoutUrl: `https://pay.example.com/pl/${id}` }
    },
    verifyPaymentLinkOrder: async ({ linkId, orderId, expectedAmountCents }) =>
      states.get(linkId) === 'PAID' &&
      orderId === linkId + 1000 &&
      amounts.get(linkId) === expectedAmountCents,
    inspectPaymentLinkOrder: async ({
      linkId,
      orderId,
      expectedAmountCents,
    }) =>
      orderId !== linkId + 1000 || amounts.get(linkId) !== expectedAmountCents
        ? 'UNKNOWN'
        : (states.get(linkId) ?? 'UNKNOWN'),
  })
  function row(intentId: string) {
    return db
      .prepare(
        'SELECT payment_link_id as linkId,amount_cents as amount,status FROM appmax_checkout_intents WHERE id=?',
      )
      .get(intentId) as { linkId: number; amount: number; status: string }
  }
  async function pay(tenantId: string, intentId: string) {
    const item = row(intentId)
    states.set(item.linkId, 'PAID')
    assert.equal(
      await billing.confirmOrder({
        tenantId,
        intentId,
        orderId: item.linkId + 1000,
      }),
      true,
    )
  }
  async function refund(tenantId: string, intentId: string) {
    const item = row(intentId)
    states.set(item.linkId, 'REVERSED')
    assert.equal(
      await billing.reconcileOrder({
        tenantId,
        intentId,
        orderId: item.linkId + 1000,
      }),
      true,
    )
  }
  function expire(tenantId: string) {
    db.prepare(
      "UPDATE subscriptions SET status='EXPIRED',current_period_end='2020-01-01' WHERE tenant_id=?",
    ).run(tenantId)
  }
  return {
    db,
    billing,
    owner,
    linkId,
    token,
    studio,
    row,
    pay,
    refund,
    expire,
    amounts,
    fail: (value: typeof fail) => {
      fail = value
    },
  }
}

test('first purchase quote, authenticated amount, reward and replay are atomic', async () => {
  const f = fixture()
  try {
    assert.equal(f.billing.publicQuote('TEAM_3', f.token).amountCents, 6366)
    const invited = f.studio(),
      checkout = await f.billing.startCheckout(invited, 'TEAM_3', f.token)
    assert.equal(f.row(checkout.intentId).amount, 6366)
    assert.deepEqual(await f.billing.startCheckout(invited, 'TEAM_3'), checkout)
    assert.equal(
      (
        f.db.prepare('SELECT COUNT(*) n FROM referral_credits').get() as {
          n: number
        }
      ).n,
      0,
    )
    await f.pay(invited, checkout.intentId)
    await f.pay(invited, checkout.intentId)
    const credits = f.db
      .prepare('SELECT discount_percent percent,status FROM referral_credits')
      .all()
    assert.deepEqual(credits, [{ percent: 10, status: 'AVAILABLE' }])
    assert.equal(
      (
        f.db
          .prepare('SELECT redemptions_count n FROM referral_links')
          .get() as { n: number }
      ).n,
      1,
    )
    assert.equal(f.billing.quoteForTenant(f.owner, 'TEAM_6').amountCents, 8991)
  } finally {
    f.db.close()
  }
})

test('self indication, identity reuse, expiry, exhaustion and gateway minimum are rejected', async () => {
  const f = fixture()
  try {
    assert.throws(
      () => f.billing.validateReferral(f.token, { tenantId: f.owner }),
      /Autoindicação/,
    )
    const identity = f.db
      .prepare('SELECT email,phone FROM users WHERE tenant_id=?')
      .get(f.owner) as { email: string; phone: string }
    assert.throws(
      () =>
        f.billing.validateReferral(f.token, {
          email: identity.email.toUpperCase(),
        }),
      /Autoindicação/,
    )
    assert.throws(
      () => f.billing.validateReferral(f.token, { phone: identity.phone }),
      /Autoindicação/,
    )
    f.db.prepare('UPDATE referral_links SET invitee_discount_percent=100').run()
    assert.throws(() => f.billing.publicQuote('TEAM_3', f.token), /mínimo/)
    f.db
      .prepare(
        "UPDATE referral_links SET invitee_discount_percent=15,expires_at='2020-01-01'",
      )
      .run()
    assert.throws(() => f.billing.publicQuote('TEAM_3', f.token), /expirado/)
    f.db
      .prepare(
        'UPDATE referral_links SET expires_at=NULL,redemptions_count=max_redemptions',
      )
      .run()
    assert.throws(() => f.billing.publicQuote('TEAM_3', f.token), /esgotado/)
    assert.equal(f.amounts.size, 0)
  } finally {
    f.db.close()
  }
})

test('concurrent last redemption cannot exceed link quota or issue two charges', async () => {
  const f = fixture()
  try {
    f.db.prepare('UPDATE referral_links SET max_redemptions=1').run()
    const results = await Promise.allSettled([
      f.billing.startCheckout(f.studio(), 'TEAM_3', f.token),
      f.billing.startCheckout(f.studio(), 'TEAM_3', f.token),
    ])
    assert.equal(
      results.filter((item) => item.status === 'fulfilled').length,
      1,
    )
    assert.equal(f.amounts.size, 1)
    assert.equal(
      (
        f.db.prepare('SELECT COUNT(*) n FROM referral_redemptions').get() as {
          n: number
        }
      ).n,
      1,
    )
    assert.equal(
      (
        f.db
          .prepare('SELECT redemptions_count n FROM referral_links')
          .get() as { n: number }
      ).n,
      1,
    )
  } finally {
    f.db.close()
  }
})

test('definitive rejection releases the coupon and retry preserves attribution', async () => {
  const f = fixture()
  try {
    const invited = f.studio()
    f.fail('reject')
    await assert.rejects(
      () => f.billing.startCheckout(invited, 'TEAM_3', f.token),
      /422/,
    )
    assert.equal(
      (
        f.db
          .prepare('SELECT redemptions_count n FROM referral_links')
          .get() as { n: number }
      ).n,
      0,
    )
    f.fail(null)
    const retry = await f.billing.startCheckout(invited, 'TEAM_3')
    assert.equal(f.row(retry.intentId).amount, 6366)
    await f.pay(invited, retry.intentId)
    assert.equal(
      (
        f.db.prepare('SELECT COUNT(*) n FROM referral_credits').get() as {
          n: number
        }
      ).n,
      1,
    )
  } finally {
    f.db.close()
  }
})

test('ambiguous external creation retains reservations and prevents blind retry', async () => {
  const f = fixture()
  try {
    const invited = f.studio()
    f.fail('unknown')
    await assert.rejects(
      () => f.billing.startCheckout(invited, 'TEAM_3', f.token),
      /connection lost/,
    )
    assert.equal(
      (
        f.db.prepare('SELECT status FROM appmax_checkout_intents').get() as {
          status: string
        }
      ).status,
      'CREATING',
    )
    f.fail(null)
    await assert.rejects(
      () => f.billing.startCheckout(invited, 'TEAM_3'),
      /conferência/,
    )
    assert.equal(f.amounts.size, 1)
    assert.equal(
      (
        f.db
          .prepare('SELECT redemptions_count n FROM referral_links')
          .get() as { n: number }
      ).n,
      1,
    )
  } finally {
    f.db.close()
  }
})

test('renewal reserves at most 30%, preserves excess and restores credits on refund', async () => {
  const f = fixture()
  try {
    for (let i = 0; i < 4; i++) {
      const invited = f.studio(),
        c = await f.billing.startCheckout(invited, 'TEAM_3', f.token)
      await f.pay(invited, c.intentId)
    }
    const normal = await f.billing.startCheckout(f.owner, 'TEAM_15')
    assert.equal(f.row(normal.intentId).amount, 10430)
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT COUNT(*) n FROM referral_credits WHERE status='RESERVED'",
          )
          .get() as { n: number }
      ).n,
      3,
    )
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT COUNT(*) n FROM referral_credits WHERE status='AVAILABLE'",
          )
          .get() as { n: number }
      ).n,
      1,
    )
    await f.pay(f.owner, normal.intentId)
    await f.refund(f.owner, normal.intentId)
    assert.equal(
      (
        f.db
          .prepare(
            "SELECT COUNT(*) n FROM referral_credits WHERE status='AVAILABLE'",
          )
          .get() as { n: number }
      ).n,
      4,
    )
  } finally {
    f.db.close()
  }
})

test('refunded indication revokes unused credit without affecting another studio', async () => {
  const f = fixture()
  try {
    const invited = f.studio(),
      c = await f.billing.startCheckout(invited, 'TEAM_3', f.token)
    await f.pay(invited, c.intentId)
    await f.refund(invited, c.intentId)
    assert.equal(
      (
        f.db.prepare('SELECT status FROM referral_credits').get() as {
          status: string
        }
      ).status,
      'REVOKED',
    )
    assert.equal(f.billing.quoteForTenant(f.owner, 'TEAM_3').amountCents, 7490)
    assert.equal(
      f.billing.quoteForTenant(f.studio(), 'TEAM_3').amountCents,
      7490,
    )
    assert.equal(
      await f.billing.confirmOrder({
        tenantId: invited,
        intentId: c.intentId,
        orderId: f.row(c.intentId).linkId + 1000,
      }),
      false,
    )
  } finally {
    f.db.close()
  }
})

test('used reward becomes debt; future credits compensate it and refund restores recovery', async () => {
  const f = fixture()
  try {
    const invited = f.studio(),
      source = await f.billing.startCheckout(invited, 'TEAM_3', f.token)
    await f.pay(invited, source.intentId)
    const renewal = await f.billing.startCheckout(f.owner, 'TEAM_3')
    await f.pay(f.owner, renewal.intentId)
    f.expire(f.owner)
    await f.refund(invited, source.intentId)
    for (let i = 0; i < 2; i++) {
      const tenant = f.studio(),
        c = await f.billing.startCheckout(tenant, 'TEAM_3', f.token)
      await f.pay(tenant, c.intentId)
    }
    assert.equal(
      f.billing.quoteForTenant(f.owner, 'TEAM_3').discountPercent,
      10,
    )
    const next = await f.billing.startCheckout(f.owner, 'TEAM_3')
    await f.pay(f.owner, next.intentId)
    assert.equal(
      (
        f.db
          .prepare('SELECT recovered_percent n FROM appmax_referral_debts')
          .get() as { n: number }
      ).n,
      10,
    )
    await f.refund(f.owner, next.intentId)
    assert.equal(
      (
        f.db
          .prepare('SELECT recovered_percent n FROM appmax_referral_debts')
          .get() as { n: number }
      ).n,
      0,
    )
    assert.equal(
      f.billing.quoteForTenant(f.owner, 'TEAM_3').discountPercent,
      10,
    )
  } finally {
    f.db.close()
  }
})

test('source reversal during pending renewal honors the issued price and records debt once', async () => {
  const f = fixture()
  try {
    const invited = f.studio(),
      source = await f.billing.startCheckout(invited, 'TEAM_3', f.token)
    await f.pay(invited, source.intentId)
    const pending = await f.billing.startCheckout(f.owner, 'TEAM_3')
    assert.equal(f.row(pending.intentId).amount, 6741)
    await f.refund(invited, source.intentId)
    await f.pay(f.owner, pending.intentId)
    await f.pay(f.owner, pending.intentId)
    assert.equal(
      (
        f.db.prepare('SELECT COUNT(*) n FROM appmax_referral_debts').get() as {
          n: number
        }
      ).n,
      1,
    )
    assert.deepEqual(f.db.pragma('foreign_key_check'), [])
  } finally {
    f.db.close()
  }
})

test('HTTP signup validates quote and identity; real webhook runtime unlocks exactly one reward', async () => {
  const f = fixture(),
    { default: express } = await import('express'),
    { once } = await import('node:events')
  const { createPublicOnboardingRouter } =
      await import('./routes/publicOnboardingRoutes.js'),
    { createAdminAppmaxRouter } = await import('./routes/appmaxRoutes.js'),
    { createAppmaxWebhookRuntime } = await import('./appmaxWebhookRuntime.js'),
    { handleError } = await import('./http.js'),
    { currentLegalBundleHash, TERMS_VERSION, PRIVACY_VERSION } =
      await import('./legal.js')
  const app = express()
  app.use(express.json())
  const pass: import('express').RequestHandler = (_req, _res, next) => next()
  app.use(
    '/api/public',
    createPublicOnboardingRouter({
      db: f.db,
      publicCheckoutLimiter: pass,
      publicCheckoutEmailLimiter: pass,
      billingPlanByCycle: new Map(),
      assertTenantSlugIsAvailable: () => {},
      subscriptionCheckoutQuote: () => {
        throw Error('legacy must not run')
      },
      normalizeUserE164Phone: (phone) => phone,
      recordLegalAcceptance: () => {},
      recordPlatformMarketingChoice: () => {},
      createInfinitePayLink: async () => {
        throw Error('legacy must not run')
      },
      appmaxBilling: f.billing,
      appmaxEnabled: true,
    }),
  )
  app.use((req, _res, next) => {
    req.sessionUser = {
      id: 'owner',
      role: 'ADMIN',
      tenantId: f.owner,
      sessionId: 'fixture',
      persistent: false,
      trustedDeviceId: null,
    }
    next()
  })
  app.use('/api/admin', createAdminAppmaxRouter(f.db, f.billing, true, false))
  app.use(handleError)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    const quote = (await (
      await fetch(
        base +
          '/api/public/onboarding/team-quote?' +
          new URLSearchParams({ planCode: 'TEAM_3', referralToken: f.token }),
      )
    ).json()) as { quote: { amountCents: number; fingerprint: string } }
    assert.equal(quote.quote.amountCents, 6366)
    const body = {
      ownerName: 'Cliente de teste',
      studioName: 'Novo estúdio',
      slug: 'http-invited',
      email: 'http-invited@example.com',
      phone: '+5571999996666',
      password: 'Strong!Pass123',
      planCode: 'TEAM_3',
      referralToken: f.token,
      quoteFingerprint: quote.quote.fingerprint,
      legal: {
        accepted: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        bundleHash: currentLegalBundleHash(),
      },
    }
    const post = (value: typeof body) =>
      fetch(base + '/api/public/onboarding/team-checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      })
    const changed = await post({ ...body, quoteFingerprint: 'a'.repeat(64) })
    assert.equal(changed.status, 400)
    assert.equal(
      f.db.prepare("SELECT 1 FROM tenants WHERE slug='http-invited'").get(),
      undefined,
    )
    const self = await post({ ...body, email: 'studio1@example.com' })
    assert.equal(self.status, 400)
    const result = await post(body)
    assert.equal(result.status, 200)
    const checkout = (await result.json()) as {
      intentId: string
      amountCents: number
    }
    assert.equal(checkout.amountCents, 6366)
    const invited = (
      f.db
        .prepare("SELECT id FROM tenants WHERE slug='http-invited'")
        .get() as { id: string }
    ).id
    const runtime = createAppmaxWebhookRuntime(f.db, f.billing),
      entry = f.row(checkout.intentId)
    const event = {
      event: 'order_paid',
      event_type: 'order',
      data: { order_id: entry.linkId + 1000, payment_link_id: entry.linkId },
    }
    // An unsigned notification alone is insufficient: provider still says UNKNOWN.
    assert.equal(runtime.receive(event), true)
    await runtime.processPending()
    assert.equal(
      (
        f.db.prepare('SELECT COUNT(*) n FROM referral_credits').get() as {
          n: number
        }
      ).n,
      0,
    )
    await f.pay(invited, checkout.intentId)
    assert.equal(runtime.receive(event), false)
    await runtime.processPending()
    assert.equal(
      (
        f.db.prepare('SELECT COUNT(*) n FROM referral_credits').get() as {
          n: number
        }
      ).n,
      1,
    )
    const catalog = (await (
      await fetch(base + '/api/admin/subscription/team-plans')
    ).json()) as { quotes: Record<string, { amountCents: number }> }
    assert.equal(catalog.quotes.TEAM_3.amountCents, 6741)
    await f.refund(invited, checkout.intentId)
    assert.equal(f.billing.quoteForTenant(f.owner, 'TEAM_3').amountCents, 7490)
    assert.deepEqual(f.db.pragma('foreign_key_check'), [])
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    f.db.close()
  }
})

test('reservation rechecks quote inside the transaction and rolls back changed benefits', async () => {
  const f = fixture()
  try {
    const tenant = f.studio(),
      fingerprint = f.billing.publicQuote('TEAM_3', f.token).fingerprint
    f.db.prepare('UPDATE referral_links SET invitee_discount_percent=10').run()
    await assert.rejects(
      () => f.billing.startCheckout(tenant, 'TEAM_3', f.token, fingerprint),
      /benefício mudou/,
    )
    assert.equal(f.amounts.size, 0)
    assert.equal(
      (
        f.db
          .prepare('SELECT COUNT(*) n FROM appmax_referral_memberships')
          .get() as { n: number }
      ).n,
      0,
    )
  } finally {
    f.db.close()
  }
})

test('definitive renewal rejection restores reserved credits before another attempt', async()=>{
 const f=fixture();try{
  const invited=f.studio(),source=await f.billing.startCheckout(invited,'TEAM_3',f.token);await f.pay(invited,source.intentId)
  f.fail('reject');await assert.rejects(()=>f.billing.startCheckout(f.owner,'TEAM_3'),/422/)
  assert.equal((f.db.prepare('SELECT status FROM referral_credits').get() as {status:string}).status,'AVAILABLE')
  f.fail(null);const renewal=await f.billing.startCheckout(f.owner,'TEAM_3');assert.equal(f.row(renewal.intentId).amount,6741)
 }finally{f.db.close()}
})
