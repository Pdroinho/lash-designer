import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminDashboardRouter } from './adminDashboardRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const fixedNow = new Date('2030-01-10T12:00:00.000Z')

test('dashboard ADMIN preserva métricas, períodos, confirmações e isolamento por tenant', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenant_settings (tenant_id TEXT PRIMARY KEY, timezone TEXT);
    CREATE TABLE services (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, price_cents INTEGER);
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT);
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT,
      phone TEXT, created_at TEXT
    );
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, service_id TEXT, client_user_id TEXT,
      starts_at TEXT, ends_at TEXT, status TEXT, confirmation_status TEXT,
      confirmation_sent_at TEXT, confirmation_responded_at TEXT, created_at TEXT
    );
    CREATE TABLE cash_transactions (
      id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, amount_cents INTEGER,
      note TEXT, created_at TEXT
    );
    CREATE TABLE tenant_domains (
      id TEXT PRIMARY KEY, tenant_id TEXT, domain TEXT, status TEXT,
      is_primary INTEGER, verified_at TEXT, created_at TEXT
    );

    INSERT INTO tenant_settings VALUES ('${tenantOne}', 'UTC'), ('${tenantTwo}', 'UTC');
    INSERT INTO services VALUES
      ('service-1', '${tenantOne}', 'Volume brasileiro', 10000),
      ('service-2', '${tenantOne}', 'Manutenção', 5000),
      ('service-other', '${tenantTwo}', 'Outro serviço', 99000);
    INSERT INTO users VALUES
      ('user-1', '${tenantOne}', 'ana@example.com'),
      ('user-old', '${tenantOne}', 'antiga@example.com'),
      ('user-other', '${tenantTwo}', 'externa@example.com');
    INSERT INTO clients VALUES
      ('client-1', '${tenantOne}', 'user-1', 'Ana', '5579999990001', '2030-01-01T00:00:00.000Z'),
      ('client-old', '${tenantOne}', 'user-old', 'Cliente antiga', '5579999990002', '2029-11-01T00:00:00.000Z'),
      ('client-other', '${tenantTwo}', 'user-other', 'Cliente externa', '5579999990003', '2030-01-05T00:00:00.000Z');
    INSERT INTO appointments VALUES
      ('appt-confirmed', '${tenantOne}', 'service-1', 'user-1', '2030-01-10T14:00:00.000Z', '2030-01-10T15:00:00.000Z', 'CONFIRMED', 'CONFIRMED', '2030-01-09T12:00:00.000Z', '2030-01-09T13:00:00.000Z', '2030-01-10T11:00:00.000Z'),
      ('appt-pending', '${tenantOne}', 'service-2', 'user-1', '2030-01-10T15:00:00.000Z', '2030-01-10T16:00:00.000Z', 'PENDING', 'NO_RESPONSE', '2030-01-09T12:00:00.000Z', NULL, '2030-01-10T10:00:00.000Z'),
      ('appt-cancelled', '${tenantOne}', 'service-1', 'user-1', '2030-01-10T16:00:00.000Z', '2030-01-10T17:00:00.000Z', 'CANCELLED', 'DECLINED', '2030-01-09T12:00:00.000Z', NULL, '2030-01-10T09:00:00.000Z'),
      ('appt-attention', '${tenantOne}', 'service-1', 'user-1', '2030-01-11T13:00:00.000Z', '2030-01-11T14:00:00.000Z', 'CONFIRMED', 'DELIVERY_FAILED', '2030-01-09T12:00:00.000Z', NULL, '2030-01-09T11:00:00.000Z'),
      ('appt-later', '${tenantOne}', 'service-2', 'user-1', '2030-01-19T13:00:00.000Z', '2030-01-19T14:00:00.000Z', 'CONFIRMED', 'NO_RESPONSE', '2030-01-09T12:00:00.000Z', NULL, '2030-01-08T11:00:00.000Z'),
      ('appt-other', '${tenantTwo}', 'service-other', 'user-other', '2030-01-10T14:00:00.000Z', '2030-01-10T15:00:00.000Z', 'PENDING', 'DECLINED', '2030-01-09T12:00:00.000Z', NULL, '2030-01-10T11:30:00.000Z');
    INSERT INTO cash_transactions VALUES
      ('expense-1', '${tenantOne}', 'EXPENSE', 2300, 'Material', '2030-01-10T11:30:00.000Z'),
      ('income-1', '${tenantOne}', 'INCOME', 5000, 'Entrada manual', '2030-01-10T11:45:00.000Z'),
      ('expense-other', '${tenantTwo}', 'EXPENSE', 999999, 'Não pode aparecer', '2030-01-10T11:59:00.000Z');
    INSERT INTO tenant_domains VALUES
      ('domain-1', '${tenantOne}', 'agenda.exemplo.com', 'ACTIVE', 1, '2030-01-01T00:00:00.000Z', '2029-12-01T00:00:00.000Z'),
      ('domain-other', '${tenantTwo}', 'externo.exemplo.com', 'ACTIVE', 1, '2030-01-01T00:00:00.000Z', '2029-12-01T00:00:00.000Z');
  `)

  const app = express()
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: tenantOne, sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/admin', createAdminDashboardRouter({ db, now: () => new Date(fixedNow) }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'x-test-admin': 'true' }

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/dashboard`)).status, 401)

    const response = await fetch(`${baseUrl}/api/admin/dashboard`, { headers })
    assert.equal(response.status, 200)
    const dashboard = await response.json() as {
      timeZone: string
      publicBaseUrl: string | null
      today: { appointmentsCount: number; expectedRevenueCents: number }
      newClients30d: number
      pendingAppointments: number
      confirmationSummary: Record<string, number>
      confirmationAttention: Array<{ id: string }>
      upcoming: Array<{ id: string; clientName: string | null; serviceName: string }>
      recentActivity: Array<{ kind: string; clientName: string | null; note: string | null }>
    }

    assert.equal(dashboard.timeZone, 'UTC')
    assert.equal(dashboard.publicBaseUrl, 'https://agenda.exemplo.com')
    assert.deepEqual(dashboard.today, { appointmentsCount: 2, expectedRevenueCents: 15000 })
    assert.equal(dashboard.newClients30d, 1)
    assert.equal(dashboard.pendingAppointments, 1)
    assert.deepEqual(dashboard.confirmationSummary, {
      confirmed: 1,
      awaiting: 0,
      noResponse: 1,
      deliveryFailed: 0,
      declined: 0,
      notRequested: 0,
    })
    assert.deepEqual(dashboard.confirmationAttention.map(item => item.id), ['appt-pending', 'appt-attention'])
    assert.deepEqual(dashboard.upcoming.map(item => item.id), ['appt-confirmed', 'appt-pending', 'appt-attention', 'appt-later'])
    assert.ok(dashboard.upcoming.every(item => item.clientName !== 'Cliente externa' && item.serviceName !== 'Outro serviço'))
    assert.ok(dashboard.recentActivity.some(item => item.kind === 'EXPENSE_CREATED' && item.note === 'Material'))
    assert.ok(dashboard.recentActivity.every(item => item.clientName !== 'Cliente externa' && item.note !== 'Não pode aparecer'))

    db.prepare(`UPDATE tenant_settings SET timezone = 'Invalid/Zone' WHERE tenant_id = ?`).run(tenantOne)
    const invalidTimezone = await fetch(`${baseUrl}/api/admin/dashboard`, { headers })
    assert.equal(invalidTimezone.status, 400)
    assert.equal((await invalidTimezone.json() as { code: string }).code, 'INVALID_TIMEZONE')
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
