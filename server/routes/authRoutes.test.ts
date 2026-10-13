import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { createAuthSessionRuntime } from '../authSessionRuntime.js'
import { handleError } from '../http.js'
import { createAuthRouter } from './authRoutes.js'

function createFixtureDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, password_hash TEXT, phone TEXT, role TEXT,
      platform_marketing_whatsapp_opt_in INTEGER DEFAULT 0
    );
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, status TEXT);
    CREATE TABLE subscriptions (tenant_id TEXT, status TEXT, current_period_end TEXT, updated_at TEXT);
    CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT, persistent INTEGER, trusted_device_id TEXT,
      ip_address TEXT, user_agent TEXT, created_at TEXT, last_seen_at TEXT, expires_at TEXT, revoked_at TEXT
    );

    INSERT INTO tenants VALUES ('tenant-1', 'studio', 'ACTIVE');
    INSERT INTO users (id, tenant_id, email, password_hash, phone, role) VALUES ('admin-1', 'tenant-1', 'admin@example.com', 'hash', '+5571999999999', 'ADMIN');
    INSERT INTO subscriptions VALUES ('tenant-1', 'ACTIVE', '2099-12-31T23:59:59.000Z', '2026-09-01T00:00:00.000Z');
    INSERT INTO platform_settings VALUES ('test_mode', 'false');
  `)
  return db
}

test('router de autenticação preserva sessão, proteção e erros públicos', async () => {
  const db = createFixtureDb()
  const passThrough: RequestHandler = (_req, _res, next) => next()
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-auth'] === 'admin') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: 'tenant-1', sessionId: 'session-1', persistent: false, trustedDeviceId: null }
      req.resolvedTenant = { id: 'tenant-1', slug: 'studio' }
    }
    next()
  })
  app.use('/api/auth', createAuthRouter({
    db,
    nodeEnv: 'test',
    isDevHost: () => false,
    authLoginLimiter: passThrough,
    authLoginUserLimiter: passThrough,
    authWhatsappOtpSendLimiter: passThrough,
    authPasswordLimiter: passThrough,
    authSessionRuntime: createAuthSessionRuntime(db, 'test'),
    sendPlatformWhatsappText: async () => true,
    normalizeUserE164Phone: value => value,
    maskE164Phone: value => value,
    recordLegalAcceptance: () => {},
    recordPlatformMarketingChoice: input => ({ whatsappPromotions: input.granted, changed: true }),
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    const anonymous = await fetch(`${baseUrl}/api/auth/me`).then(response => response.json())
    assert.deepEqual(anonymous, { user: null, allowDevBootstrap: false, bootstrapRequiresSecret: false })

    const authenticated = await fetch(`${baseUrl}/api/auth/me`, { headers: { 'x-test-auth': 'admin' } }).then(response => response.json()) as { user: Record<string, unknown> }
    assert.equal(authenticated.user.id, 'admin-1')
    assert.equal(authenticated.user.tenantSlug, 'studio')
    assert.equal(authenticated.user.subscriptionStatus, 'ACTIVE')

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: '12345678' }),
    })
    assert.equal(login.status, 401)
    assert.deepEqual(await login.json(), { message: 'Use o subdomínio do seu espaço para entrar.', code: 'TENANT_REQUIRED' })

    const protectedLegal = await fetch(`${baseUrl}/api/auth/legal-preferences`)
    assert.equal(protectedLegal.status, 401)
    assert.deepEqual(await protectedLegal.json(), { message: 'Não autorizado' })

    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' })
    assert.equal(logout.status, 200)
    assert.deepEqual(await logout.json(), { ok: true })
    assert.match(logout.headers.get('set-cookie') ?? '', /^session=;/)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
