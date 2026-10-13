import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { handleError } from '../http.js'
import { createDevCoreRouter } from './devCoreRoutes.js'

function createFixtureDb() {
  const db = new Database(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT UNIQUE, name TEXT, primary_color TEXT, logo_url TEXT, status TEXT DEFAULT 'ACTIVE', created_at TEXT, suspension_reason TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, email TEXT, password_hash TEXT, phone TEXT, role TEXT, created_at TEXT);
    CREATE TABLE tenant_settings (tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE, secondary_color TEXT, timezone TEXT, currency TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE booking_rules (tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE, min_notice_minutes INTEGER, max_future_days INTEGER, slot_step_minutes INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE business_hours (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, weekday INTEGER, start_minute INTEGER, end_minute INTEGER, created_at TEXT);
    CREATE TABLE subscriptions (tenant_id TEXT, status TEXT, current_period_end TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT, revoked_at TEXT);
    CREATE TABLE tenant_domains (tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, status TEXT, is_primary INTEGER, last_checked_at TEXT, verification_error TEXT);
    CREATE TABLE tenant_deletion_audit (id TEXT PRIMARY KEY, tenant_id TEXT, tenant_slug TEXT, tenant_name TEXT, requested_by_user_id TEXT, confirmation_text TEXT, deleted_at TEXT);
    INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at) VALUES ('dev-1', NULL, 'dev@example.com', 'hash', '+5571999999999', 'DEV', '2026-09-01T00:00:00.000Z');
  `)
  return db
}

test('router DEV core preserva proteção, configurações e ciclo de tenants', async () => {
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
  app.use('/api/dev', createDevCoreRouter({
    db,
    requireDevHost: passThrough,
    devBootstrapLimiter: passThrough,
    assertTenantSlugIsAvailable: () => {},
    normalizeUserE164Phone: () => '+5571988887777',
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const devHeaders = { 'content-type': 'application/json', 'x-test-dev': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/dev/settings`)
    assert.equal(unauthorized.status, 401)

    const saveSettings = await fetch(`${baseUrl}/api/dev/settings`, { method: 'POST', headers: devHeaders, body: JSON.stringify({ dev_primary_color: '#ABCDEF' }) })
    assert.equal(saveSettings.status, 200)
    const settings = await fetch(`${baseUrl}/api/dev/settings`, { headers: devHeaders }).then(response => response.json())
    assert.deepEqual(settings, { settings: { dev_primary_color: '#abcdef' } })

    const createdResponse = await fetch(`${baseUrl}/api/dev/tenants`, {
      method: 'POST',
      headers: devHeaders,
      body: JSON.stringify({
        name: 'Studio Teste', slug: 'studio-teste', primaryColor: '#61CE70',
        adminEmail: 'admin@example.com', adminPhone: '(71) 98888-7777', adminPassword: '12345678',
      }),
    })
    assert.equal(createdResponse.status, 200)
    const created = await createdResponse.json() as { tenant: { id: string; slug: string }; adminUser: { tenantId: string } }
    assert.equal(created.tenant.slug, 'studio-teste')
    assert.equal(created.adminUser.tenantId, created.tenant.id)
    assert.equal((db.prepare('SELECT COUNT(*) as count FROM business_hours WHERE tenant_id = ?').get(created.tenant.id) as { count: number }).count, 6)

    const tenants = await fetch(`${baseUrl}/api/dev/tenants`, { headers: devHeaders }).then(response => response.json()) as { tenants: Array<{ id: string; adminEmail: string }> }
    assert.equal(tenants.tenants.length, 1)
    assert.equal(tenants.tenants[0]?.adminEmail, 'admin@example.com')

    const disabled = await fetch(`${baseUrl}/api/dev/tenants/${created.tenant.id}`, { method: 'DELETE', headers: devHeaders })
    assert.deepEqual(await disabled.json(), { ok: true, mode: 'disabled' })

    const removed = await fetch(`${baseUrl}/api/dev/tenants/${created.tenant.id}/permanent-delete`, {
      method: 'POST', headers: devHeaders,
      body: JSON.stringify({ confirmation: 'EXCLUIR studio-teste', acknowledgeBackup: true }),
    })
    assert.equal(removed.status, 200)
    assert.equal((await removed.json() as { mode: string }).mode, 'permanent')
    assert.equal((db.prepare('SELECT COUNT(*) as count FROM tenants').get() as { count: number }).count, 0)
    assert.equal((db.prepare('SELECT COUNT(*) as count FROM tenant_deletion_audit').get() as { count: number }).count, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
