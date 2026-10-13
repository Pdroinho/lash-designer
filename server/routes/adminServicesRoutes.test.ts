import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminServicesRouter } from './adminServicesRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const ownService = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherService = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const inactiveService = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

test('serviços ADMIN preservam capas, preço, duração, ativação e isolamento por tenant', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE services (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      cover_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    INSERT INTO services VALUES ('${ownService}', '${tenantOne}', 'Clássico', 90, 15000, 'data:image/webp;base64,Y2FwYQ==', 1, '2026-01-01T00:00:00.000Z');
    INSERT INTO services VALUES ('${otherService}', '${tenantTwo}', 'Outro tenant', 120, 19000, NULL, 1, '2026-01-02T00:00:00.000Z');
    INSERT INTO services VALUES ('${inactiveService}', '${tenantOne}', 'Inativo', 60, 9000, NULL, 0, '2026-01-03T00:00:00.000Z');
  `)

  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: tenantOne, sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/admin', createAdminServicesRouter({ db }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const adminHeaders = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/admin/services`)
    assert.equal(unauthorized.status, 401)

    const initial = await fetch(`${baseUrl}/api/admin/services`, { headers: adminHeaders }).then(response => response.json()) as {
      services: Array<{ id: string; name: string; durationMinutes: number; priceCents: number; coverUrl: string | null }>
    }
    assert.deepEqual(initial.services, [{
      id: ownService,
      name: 'Clássico',
      durationMinutes: 90,
      priceCents: 15000,
      coverUrl: 'data:image/webp;base64,Y2FwYQ==',
    }])

    const createdResponse = await fetch(`${baseUrl}/api/admin/services`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Volume brasileiro', durationMinutes: 150, priceCents: 21000, coverUrl: 'data:image/png;base64,bm92YQ==' }),
    })
    assert.equal(createdResponse.status, 200)
    const created = await createdResponse.json() as { service: { id: string; name: string; durationMinutes: number; priceCents: number; coverUrl: string } }
    assert.equal(created.service.name, 'Volume brasileiro')
    assert.equal(created.service.durationMinutes, 150)
    assert.equal(created.service.priceCents, 21000)
    assert.equal(created.service.coverUrl, 'data:image/png;base64,bm92YQ==')
    assert.equal((db.prepare('SELECT tenant_id AS tenantId, active FROM services WHERE id = ?').get(created.service.id) as { tenantId: string; active: number }).tenantId, tenantOne)

    const updatedResponse = await fetch(`${baseUrl}/api/admin/services/${created.service.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Volume premium', durationMinutes: 180, priceCents: 25000, coverUrl: null }),
    })
    assert.equal(updatedResponse.status, 200)
    assert.deepEqual(await updatedResponse.json(), { service: {
      id: created.service.id,
      name: 'Volume premium',
      durationMinutes: 180,
      priceCents: 25000,
      coverUrl: null,
    } })

    const noUpdates = await fetch(`${baseUrl}/api/admin/services/${created.service.id}`, {
      method: 'PATCH', headers: adminHeaders, body: '{}',
    })
    assert.equal(noUpdates.status, 400)
    assert.equal((await noUpdates.json() as { code: string }).code, 'NO_UPDATES')

    const crossTenantPatch = await fetch(`${baseUrl}/api/admin/services/${otherService}`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ priceCents: 1 }),
    })
    assert.equal(crossTenantPatch.status, 404)
    assert.equal((db.prepare('SELECT price_cents AS priceCents FROM services WHERE id = ?').get(otherService) as { priceCents: number }).priceCents, 19000)

    const crossTenantDelete = await fetch(`${baseUrl}/api/admin/services/${otherService}`, { method: 'DELETE', headers: adminHeaders })
    assert.equal(crossTenantDelete.status, 404)

    const removed = await fetch(`${baseUrl}/api/admin/services/${created.service.id}`, { method: 'DELETE', headers: adminHeaders })
    assert.deepEqual(await removed.json(), { ok: true })
    assert.equal((db.prepare('SELECT active FROM services WHERE id = ?').get(created.service.id) as { active: number }).active, 0)

    const afterRemoval = await fetch(`${baseUrl}/api/admin/services`, { headers: adminHeaders }).then(response => response.json()) as { services: Array<{ id: string }> }
    assert.deepEqual(afterRemoval.services.map(service => service.id), [ownService])
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
