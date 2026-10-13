import { AppmaxRequestError } from './appmax.js'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import express, { type RequestHandler } from 'express'
import cookieParser from 'cookie-parser'

test('checkout failure, ADMIN MFA, restricted billing, reversal and a new verified payment recover access', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'lash-recovery-'))
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_PATH = path.join(directory, 'test.db')
  const { getDb, closeDb } = await import('./db.js')
  const { migrate } = await import('./migrate.js')
  const { sessionMiddleware, requireRole, requireActiveSubscription } = await import('./auth.js')
  const { createSession } = await import('./session.js')
  const { createAuthSessionRuntime } = await import('./authSessionRuntime.js')
  const { createAppmaxBillingService } = await import('./appmaxBillingService.js')
  const { createAuthRouter } = await import('./routes/authRoutes.js')
  const { createAdminAppmaxRouter } = await import('./routes/appmaxRoutes.js')
  const { createPublicOnboardingRouter } = await import('./routes/publicOnboardingRoutes.js')
  const { createPublicRouter } = await import('./routes/publicRoutes.js')
  const { createTenantRouting } = await import('./middleware/tenantRouting.js')
  const { createDevCoreRouter } = await import('./routes/devCoreRoutes.js')
  const { createProfessionalConsentService } = await import('./professionalConsentService.js')
  const { hashPassword } = await import('./security.js')
  const { handleError } = await import('./http.js')
  const { TERMS_VERSION, PRIVACY_VERSION, currentLegalBundleHash } = await import('./legal.js')
  migrate()
  const db = getDb()
  const consent = createProfessionalConsentService({ db })
  let failLink = true
  let nextLink = 100
  let state: 'PAID' | 'REVERSED' | 'UNKNOWN' = 'UNKNOWN'
  const billing = createAppmaxBillingService(db, {
    createPaymentLink: async () => {
      if (failLink) throw new AppmaxRequestError(422)
      return { linkId: ++nextLink, checkoutUrl: `https://checkout.appmax.com.br/pl/${nextLink}` }
    },
    verifyPaymentLinkOrder: async () => state === 'PAID',
    inspectPaymentLinkOrder: async () => state,
  })
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  const routing = createTenantRouting({ db, nodeEnv: 'test', devHost: 'dev.example.com', platformHostname: 'example.com' })
  app.use(routing.resolveTenantFromSubdomain)
  app.use(sessionMiddleware)
  const pass: RequestHandler = (_req, _res, next) => next()
  let otp = ''
  app.use('/api/auth', createAuthRouter({
    db, nodeEnv: 'test', isDevHost: routing.isDevHost,
    authLoginLimiter: pass, authLoginUserLimiter: pass, authWhatsappOtpSendLimiter: pass, authPasswordLimiter: pass,
    authSessionRuntime: createAuthSessionRuntime(db, 'test'),
    sendPlatformWhatsappText: async (_phone, text) => { otp = text.match(/\b\d{6}\b/)![0]; return true },
    normalizeUserE164Phone: value => value, maskE164Phone: value => value,
    recordLegalAcceptance: consent.recordLegalAcceptance, recordPlatformMarketingChoice: consent.recordPlatformMarketingChoice,
  }))
  app.use('/api/public', createPublicRouter({ db }))
  app.use('/api/public', createPublicOnboardingRouter({
    db, publicCheckoutLimiter: pass, publicCheckoutEmailLimiter: pass, billingPlanByCycle: new Map(),
    assertTenantSlugIsAvailable: routing.assertTenantSlugIsAvailable,
    subscriptionCheckoutQuote: () => { throw new Error('legacy checkout must not run') },
    normalizeUserE164Phone: value => value,
    recordLegalAcceptance: consent.recordLegalAcceptance, recordPlatformMarketingChoice: consent.recordPlatformMarketingChoice,
    createInfinitePayLink: async () => { throw new Error('legacy checkout must not run') },
    appmaxBilling: billing, appmaxEnabled: true,
  }))
  app.use('/api/admin', createAdminAppmaxRouter(db, billing, true, false))
  app.get('/api/admin/private', requireRole('ADMIN'), requireActiveSubscription, (_req, res) => res.json({ ok: true }))
  app.use('/api/dev', createDevCoreRouter({ db, requireDevHost: routing.requireDevHost,
    devBootstrapLimiter: pass, assertTenantSlugIsAvailable: routing.assertTenantSlugIsAvailable,
    normalizeUserE164Phone: value => value }))
  app.use(handleError)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const cookieJar = new Map<string, string>()
  async function request(uri: string, method = 'GET', body?: unknown, host = 'studio.example.com', cookie?: string) {
    const response = await new Promise<Response>((resolve, reject) => {
      const serialized = body === undefined ? undefined : JSON.stringify(body)
      const outgoing = httpRequest(base + uri, { method, headers: {
        host, 'content-type': 'application/json',
        ...(serialized ? { 'content-length': Buffer.byteLength(serialized) } : {}),
        cookie: cookie ?? [...cookieJar].map(([k,v]) => `${k}=${v}`).join('; '),
      } }, incoming => {
        const chunks: Buffer[] = []
        incoming.on('data', chunk => chunks.push(Buffer.from(chunk)))
        incoming.on('error', reject)
        incoming.on('end', () => {
          const headers = new Headers()
          for (const [name, values] of Object.entries(incoming.headers)) {
            for (const value of Array.isArray(values) ? values : values ? [values] : []) headers.append(name, value)
          }
          resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode!, headers }))
        })
      })
      outgoing.on('error', reject)
      outgoing.end(serialized)
    })
    if (cookie === undefined) for (const header of response.headers.getSetCookie()) {
      const [key, ...value] = header.split(';')[0].split('=')
      cookieJar.set(key, value.join('='))
    }
    return response
  }
  const subscription = () => db.prepare('SELECT status, external_id FROM subscriptions').get() as { status: string; external_id: string }
  const tenant = () => db.prepare('SELECT id, status, suspension_reason FROM tenants WHERE slug = ?').get('studio') as { id: string; status: string; suspension_reason: string | null }
  try {
    const signup = await request('/api/public/onboarding/team-checkout', 'POST', {
      ownerName: 'Ana', studioName: 'Studio QA', slug: 'studio', email: 'admin@example.com', phone: '+5571999999999', password: 'senha-segura', planCode: 'TEAM_3',
      legal: { accepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, bundleHash: currentLegalBundleHash() },
    }, 'example.com')
    assert.equal(signup.status, 503)
    assert.equal((await signup.json()).code, 'TEAM_CHECKOUT_RECOVERABLE')
    assert.equal(tenant().status, 'ONBOARDING')
    assert.equal((await request('/api/public/tenant')).status, 200)
    assert.equal((await request('/api/public/tenant', 'GET', undefined, 'foreign.example.com')).status, 404)
    assert.equal((await request('/api/public/services')).status, 404)
    const login = await request('/api/auth/login', 'POST', { email: 'admin@example.com', password: 'senha-segura' })
    assert.equal(login.status, 202)
    assert.match(otp, /^\d{6}$/)
    assert.equal((await request('/api/auth/whatsapp-otp/verify', 'POST', { code: otp })).status, 200)
    const me = await (await request('/api/auth/me')).json()
    assert.equal(me.user.billingRecovery, true)
    assert.equal(me.user.subscriptionStatus, 'PAYMENT_REQUIRED')
    assert.equal((await request('/api/admin/private')).status, 401)
    const staffId = randomUUID()
    db.prepare("INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at) VALUES (?, ?, 'staff@example.com', ?, '+5571999999998', 'STAFF', ?)").run(staffId, tenant().id, await hashPassword('senha-staff'), new Date().toISOString())
    assert.equal((await request('/api/auth/login', 'POST', { email: 'staff@example.com', password: 'senha-staff' })).status, 401)
    const staffSession = createSession(db, { userId: staffId })
    const staffMe = await request('/api/auth/me', 'GET', undefined, 'studio.example.com', `session=${staffSession.token}`)
    assert.equal((await staffMe.json()).user, null)
    assert.equal((await request('/api/admin/subscription/team-plans')).status, 200)
    assert.equal((await request('/api/admin/subscription/team-plans', 'GET', undefined, 'foreign.example.com')).status, 401)
    // Even development test_mode cannot unlock a recovery-only tenant.
    db.prepare("INSERT OR REPLACE INTO platform_settings (key,value,updated_at) VALUES ('test_mode', 'true', ?)").run(new Date().toISOString())
    assert.equal((await request('/api/admin/private')).status, 401)
    failLink = false
    const checkoutResponse = await request('/api/admin/subscription/team-checkout', 'POST', { planCode: 'TEAM_3' })
    assert.equal(checkoutResponse.status, 200)
    const first = await checkoutResponse.json() as { intentId: string }
    assert.equal(await billing.confirmOrder({ tenantId: tenant().id, intentId: first.intentId, orderId: 1 }), false)
    assert.equal(tenant().status, 'ONBOARDING')
    state = 'PAID'
    assert.equal(await billing.confirmOrder({ tenantId: tenant().id, intentId: first.intentId, orderId: 1 }), true)
    assert.equal(tenant().status, 'ACTIVE')
    assert.equal((await request('/api/admin/private')).status, 200)
    const activeMe = await (await request('/api/auth/me')).json()
    assert.equal(activeMe.user.billingRecovery, undefined)
    state = 'REVERSED'
    await billing.reconcileOrder({ tenantId: tenant().id, intentId: first.intentId, orderId: 1 })
    assert.equal(tenant().suspension_reason, 'APPMAX')
    assert.equal(subscription().status, 'CANCELLED')
    assert.equal((await request('/api/public/services')).status, 404)
    assert.equal((await request('/api/admin/private')).status, 401)
    const second = await (await request('/api/admin/subscription/team-checkout', 'POST', { planCode: 'TEAM_3' })).json() as { intentId: string }
    state = 'PAID'
    assert.equal(await billing.confirmOrder({ tenantId: tenant().id, intentId: second.intentId, orderId: 2 }), true)
    assert.equal(tenant().status, 'ACTIVE')
    assert.equal(tenant().suspension_reason, null)
    assert.equal(subscription().external_id, 'appmax:2')
    assert.equal((await request('/api/admin/private')).status, 200)
    assert.equal(await billing.confirmOrder({ tenantId: tenant().id, intentId: first.intentId, orderId: 1 }), false)
    assert.equal(tenant().status, 'ACTIVE')
    // ADMIN can suspend independently after a provider reversal; payment must respect it.
    state = 'REVERSED'
    await billing.reconcileOrder({ tenantId: tenant().id, intentId: second.intentId, orderId: 2 })
    const third = await billing.startCheckout(tenant().id, 'TEAM_3')
    const devId = randomUUID()
    db.prepare("INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES (?, NULL, 'dev@example.com', ?, 'DEV', ?)").run(devId, await hashPassword('senha-dev'), new Date().toISOString())
    const devSession = createSession(db, { userId: devId })
    assert.equal((await request(`/api/dev/tenants/${tenant().id}`, 'PATCH', { status: 'SUSPENDED' }, 'dev.example.com', `session=${devSession.token}`)).status, 200)
    assert.equal(tenant().suspension_reason, 'MANUAL')
    state = 'PAID'
    await billing.confirmOrder({ tenantId: tenant().id, intentId: third.intentId, orderId: 3 })
    assert.equal(tenant().status, 'SUSPENDED')
    assert.equal((await request('/api/public/tenant')).status, 404)
    assert.equal((await request('/api/auth/me')).status, 200)
    assert.equal((await (await request('/api/auth/me')).json()).user, null)
    assert.equal((await request('/api/admin/subscription/team-plans')).status, 401)
    await assert.rejects(() => billing.startCheckout(tenant().id, 'TEAM_3'), /revisão/)
    db.prepare("UPDATE tenants SET status = 'DISABLED' WHERE id = ?").run(tenant().id)
    assert.equal((await request('/api/public/tenant')).status, 404)
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    closeDb()
    rmSync(directory, { recursive: true, force: true })
  }
})
