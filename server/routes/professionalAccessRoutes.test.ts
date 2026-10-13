import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { requireRole } from '../auth.js'
import { handleError } from '../http.js'
import { currentLegalBundleHash, PRIVACY_VERSION, TERMS_VERSION } from '../legal.js'
import { createProfessionalAccessRouter } from './professionalAccessRoutes.js'
import { createSession, resolveSession } from '../session.js'
import { createAdminProfessionalsRouter } from './adminProfessionalsRoutes.js'

const t1 = '11111111-1111-4111-8111-111111111111', t2 = '22222222-2222-4222-8222-222222222222'
const p1 = '33333333-3333-4333-8333-333333333333', p2 = '44444444-4444-4444-8444-444444444444'
test('convite único e agenda isolada por profissional e estúdio', async () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT, status TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, password_hash TEXT, phone TEXT, role TEXT, created_at TEXT, staff_access_disabled_at TEXT, UNIQUE(tenant_id,email));
    CREATE TABLE professionals (id TEXT, tenant_id TEXT, name TEXT, user_id TEXT, active INTEGER, bookable INTEGER, updated_at TEXT, PRIMARY KEY(tenant_id,id));
    CREATE TABLE professional_invitations (id TEXT PRIMARY KEY, tenant_id TEXT, professional_id TEXT, token_hash TEXT UNIQUE, email TEXT, phone TEXT, expires_at TEXT, consumed_at TEXT, created_at TEXT);
    CREATE TABLE services (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT);
    CREATE TABLE clients (tenant_id TEXT, user_id TEXT, name TEXT);
    CREATE TABLE appointments (id TEXT PRIMARY KEY, tenant_id TEXT, professional_id TEXT, service_id TEXT, client_user_id TEXT, starts_at TEXT, ends_at TEXT, status TEXT);
    CREATE TABLE professional_services (tenant_id TEXT, professional_id TEXT, service_id TEXT);
    CREATE TABLE professional_hours (tenant_id TEXT, professional_id TEXT, weekday INTEGER, start_minute INTEGER, end_minute INTEGER);
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT, trusted_device_id TEXT, token_hash TEXT UNIQUE, persistent INTEGER, created_at TEXT, last_seen_at TEXT, expires_at TEXT, revoked_at TEXT, ip_address TEXT, user_agent TEXT);
    INSERT INTO tenants VALUES ('${t1}', 'Studio Um', 'ACTIVE'), ('${t2}', 'Studio Dois', 'ACTIVE');
    INSERT INTO professionals VALUES ('${p1}', '${t1}', 'Ana', NULL, 1, 1, '2026-01-01'), ('${p2}', '${t2}', 'Bia', NULL, 1, 1, '2026-01-01');
    INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at) VALUES ('admin', '${t1}', 'admin@example.com', 'hash', '+5511999999999', 'ADMIN', '2026-01-01');
    INSERT INTO services VALUES ('s1', '${t1}', 'Alongamento'), ('s2', '${t2}', 'Lifting');
    INSERT INTO clients VALUES ('${t1}', 'c1', 'Cliente Um'), ('${t2}', 'c2', 'Cliente Dois');
    INSERT INTO appointments VALUES ('a1', '${t1}', '${p1}', 's1', 'c1', '2030-01-02T10:00:00.000Z', '2030-01-02T11:00:00.000Z', 'CONFIRMED');
    INSERT INTO appointments VALUES ('a2', '${t2}', '${p2}', 's2', 'c2', '2030-01-02T10:00:00.000Z', '2030-01-02T11:00:00.000Z', 'CONFIRMED');
  `)
  let acceptanceCount = 0
  const pass: RequestHandler = (_req, _res, next) => next()
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const tenantId = req.headers['x-tenant'] === 'two' ? t2 : t1
    req.resolvedTenant = { id: tenantId, slug: 'studio' }
    if (req.headers['x-user'] === 'admin') req.sessionUser = { id: 'admin', role: 'ADMIN', tenantId: t1, sessionId: 'admin-session', persistent: false, trustedDeviceId: null }
    if (req.headers['x-user'] === 'staff') {
      const staff = db.prepare("SELECT id FROM users WHERE tenant_id = ? AND role = 'STAFF'").get(t1) as { id: string } | undefined
      if (staff && db.prepare('SELECT 1 FROM professionals WHERE tenant_id = ? AND user_id = ? AND active = 1').get(t1, staff.id)) {
        req.sessionUser = { id: staff.id, role: 'STAFF', tenantId: t1, sessionId: 'staff-session', persistent: false, trustedDeviceId: null }
      }
    }
    next()
  })
  app.use('/api', createProfessionalAccessRouter({ db, publicLimiter: pass, subscriptionGate: pass,
    normalizeUserE164Phone: () => '+5571999999999', recordLegalAcceptance: () => { acceptanceCount++ } }))
  app.use('/api/admin', createAdminProfessionalsRouter(db))
  app.get('/api/admin/private', requireRole('ADMIN'), (_req, res) => res.json({ ok: true }))
  app.use(handleError)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}/api`
  const legal = { accepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, bundleHash: currentLegalBundleHash() }
  const post = (path: string, body: unknown, headers: Record<string,string> = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const schedule = '/staff/appointments?start=2030-01-02T00%3A00%3A00.000Z&end=2030-01-03T00%3A00%3A00.000Z'
  try {
    assert.equal((await post(`/admin/professionals/${p1}/invitation`, { email: 'ana@example.com', phone: '(71) 99999-9999' })).status, 401)
    const issued = await post(`/admin/professionals/${p1}/invitation`, { email: 'ana@example.com', phone: '(71) 99999-9999' }, { 'x-user': 'admin' })
    assert.equal(issued.status, 201)
    const token = ((await issued.json()) as { path: string }).path.split('/').at(-1)!
    assert.equal(db.prepare('SELECT 1 FROM professional_invitations WHERE token_hash = ?').get(token), undefined)
    assert.equal((await fetch(base + `/public/professional-invitations/${token}`, { headers: { 'x-tenant': 'two' } })).status, 404)
    assert.equal((await fetch(base + `/public/professional-invitations/${token}`)).status, 200)
    assert.equal((await post(`/public/professional-invitations/${token}/accept`, { password: 'senha-segura', legal: { ...legal, bundleHash: '0'.repeat(64) } })).status, 400)
    assert.equal((await post(`/public/professional-invitations/${token}/accept`, { password: 'senha-segura', legal }, { 'x-tenant': 'two' })).status, 404)
    assert.equal((await post(`/public/professional-invitations/${token}/accept`, { password: 'senha-segura', legal })).status, 200)
    assert.equal(acceptanceCount, 1)
    assert.equal((await post(`/public/professional-invitations/${token}/accept`, { password: 'senha-segura', legal })).status, 404)
    const staff = db.prepare("SELECT id, role, phone FROM users WHERE email = 'ana@example.com'").get() as { id: string; role: string; phone: string }
    assert.deepEqual([staff.role,staff.phone],['STAFF','+5571999999999'])
    const issuedSession = createSession(db, { userId: staff.id })
    assert.equal(resolveSession(db, issuedSession.token)?.role, 'STAFF')
    assert.equal((db.prepare('SELECT user_id as id FROM professionals WHERE tenant_id = ? AND id = ?').get(t1,p1) as { id: string }).id, staff.id)
    assert.equal((await fetch(base + '/admin/private', { headers: { 'x-user': 'staff' } })).status, 403)
    const own = await fetch(base + schedule, { headers: { 'x-user': 'staff' } })
    assert.equal(own.status, 200)
    assert.deepEqual((await own.json() as { appointments: Array<{ id: string }> }).appointments.map(row => row.id), ['a1'])
    const disable = await fetch(base + `/admin/professionals/${p1}/access`, { method: 'PATCH', headers: { 'x-user': 'admin', 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) })
    assert.equal(disable.status, 200)
    assert.equal(resolveSession(db, issuedSession.token), null)
    assert.equal((await fetch(base + schedule, { headers: { 'x-user': 'staff' } })).status, 404)
    assert.equal((await fetch(base + `/admin/professionals/${p1}/access`, { method: 'PATCH', headers: { 'x-user': 'admin', 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) })).status, 200)
    db.prepare('UPDATE professionals SET active = 0 WHERE tenant_id = ? AND id = ?').run(t1,p1)
    assert.equal((await fetch(base + schedule, { headers: { 'x-user': 'staff' } })).status, 401)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close() }
})
