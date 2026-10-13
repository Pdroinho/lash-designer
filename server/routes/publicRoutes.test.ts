import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createPublicRouter } from './publicRoutes.js'

function createFixtureDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, name TEXT, primary_color TEXT, logo_url TEXT, status TEXT);
    CREATE TABLE tenant_domains (tenant_id TEXT, domain TEXT, status TEXT, is_primary INTEGER, verified_at TEXT, created_at TEXT);
    CREATE TABLE services (id TEXT, tenant_id TEXT, name TEXT, duration_minutes INTEGER, price_cents INTEGER, cover_url TEXT, active INTEGER, created_at TEXT);
    CREATE TABLE tenant_settings (tenant_id TEXT, timezone TEXT, currency TEXT);
    CREATE TABLE booking_rules (tenant_id TEXT, min_notice_minutes INTEGER, max_future_days INTEGER, slot_step_minutes INTEGER);
    CREATE TABLE business_hours (tenant_id TEXT, weekday INTEGER, start_minute INTEGER, end_minute INTEGER);
    CREATE TABLE appointments (tenant_id TEXT, status TEXT, starts_at TEXT, ends_at TEXT);
    CREATE TABLE time_off (tenant_id TEXT, starts_at TEXT, ends_at TEXT);

    INSERT INTO tenants VALUES ('tenant-1', 'studio', 'Studio Teste', '#61CE70', '/logo.png', 'ACTIVE');
    INSERT INTO tenant_domains VALUES ('tenant-1', 'agenda.exemplo.com.br', 'ACTIVE', 1, '2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    INSERT INTO services VALUES ('service-1', 'tenant-1', 'Volume brasileiro', 90, 15990, '/service.jpg', 1, '2026-09-01T00:00:00.000Z');
    INSERT INTO tenant_settings VALUES ('tenant-1', 'America/Sao_Paulo', 'BRL');
    INSERT INTO booking_rules VALUES ('tenant-1', 120, 45, 30);
    INSERT INTO business_hours VALUES ('tenant-1', 2, 540, 1080);
    INSERT INTO appointments VALUES ('tenant-1', 'CONFIRMED', '2026-09-15T13:00:00.000Z', '2026-09-15T14:30:00.000Z');
    INSERT INTO time_off VALUES ('tenant-1', '2026-09-15T17:00:00.000Z', '2026-09-15T18:00:00.000Z');
  `)
  return db
}

test('router público preserva contratos por host e por slug', async () => {
  const db = createFixtureDb()
  const app = express()
  app.use((req, _res, next) => {
    if (req.headers['x-test-tenant'] === 'studio') req.resolvedTenant = { id: 'tenant-1', slug: 'studio' }
    next()
  })
  app.use('/api/public', createPublicRouter({ db }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const tenantHeaders = { 'x-test-tenant': 'studio' }

  try {
    const tenantBySlug = await fetch(`${baseUrl}/api/public/tenant/studio`).then(response => response.json())
    assert.deepEqual(tenantBySlug, { tenant: { id: 'tenant-1', slug: 'studio', name: 'Studio Teste', primaryColor: '#61CE70', logoUrl: '/logo.png', publicBaseUrl: 'https://agenda.exemplo.com.br' } })

    const tenantByHost = await fetch(`${baseUrl}/api/public/tenant`, { headers: tenantHeaders }).then(response => response.json())
    assert.deepEqual(tenantByHost, tenantBySlug)

    const servicesByHost = await fetch(`${baseUrl}/api/public/services`, { headers: tenantHeaders }).then(response => response.json())
    assert.deepEqual(servicesByHost, { services: [{ id: 'service-1', name: 'Volume brasileiro', durationMinutes: 90, priceCents: 15990 }] })

    const servicesBySlug = await fetch(`${baseUrl}/api/public/tenant/studio/services`).then(response => response.json())
    assert.deepEqual(servicesBySlug, { services: [{ id: 'service-1', name: 'Volume brasileiro', durationMinutes: 90, priceCents: 15990, coverUrl: '/service.jpg' }] })

    for (const path of ['/api/public/booking', '/api/public/tenant/studio/booking']) {
      const options = path === '/api/public/booking' ? { headers: tenantHeaders } : undefined
      const booking = await fetch(`${baseUrl}${path}`, options).then(response => response.json())
      assert.deepEqual(booking, { timezone: 'America/Sao_Paulo', currency: 'BRL', bookingRules: { minNoticeMinutes: 120, maxFutureDays: 45, slotStepMinutes: 30 }, businessHours: [{ weekday: 2, startMinute: 540, endMinute: 1080 }] })
    }

    for (const path of ['/api/public/availability?date=2026-09-15', '/api/public/tenant/studio/availability?date=2026-09-15']) {
      const options = path.startsWith('/api/public/availability') ? { headers: tenantHeaders } : undefined
      const availability = await fetch(`${baseUrl}${path}`, options).then(response => response.json()) as { blocks: Array<{ kind: string }> }
      assert.deepEqual(availability.blocks.map(block => block.kind), ['appointment', 'time_off'])
    }

    const missing = await fetch(`${baseUrl}/api/public/tenant/inexistente`)
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { message: 'Tenant não encontrado', code: 'TENANT_NOT_FOUND' })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
