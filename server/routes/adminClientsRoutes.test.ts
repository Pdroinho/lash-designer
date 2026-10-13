import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminClientsRouter } from './adminClientsRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'

test('clientes ADMIN preservam gasto, última visita, consentimento, ordem e isolamento', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT);
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT,
      phone TEXT, marketing_whatsapp_opt_in INTEGER
    );
    CREATE TABLE services (id TEXT PRIMARY KEY, tenant_id TEXT, price_cents INTEGER);
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, service_id TEXT, client_user_id TEXT,
      starts_at TEXT, status TEXT, confirmation_status TEXT
    );

    INSERT INTO users VALUES
      ('user-ana', '${tenantOne}', 'ana@example.com'),
      ('user-bia', '${tenantOne}', 'bia@example.com'),
      ('user-carla', '${tenantOne}', 'carla@example.com'),
      ('user-other', '${tenantTwo}', 'externa@example.com');
    INSERT INTO clients VALUES
      ('client-ana', '${tenantOne}', 'user-ana', 'Ana', '5579999990001', 1),
      ('client-bia', '${tenantOne}', 'user-bia', 'Bia', NULL, 0),
      ('client-carla', '${tenantOne}', 'user-carla', 'Carla', '5579999990003', 1),
      ('client-other', '${tenantTwo}', 'user-other', 'Cliente externa', '5579999990004', 1);
    INSERT INTO services VALUES
      ('service-100', '${tenantOne}', 10000),
      ('service-200', '${tenantOne}', 20000),
      ('service-300', '${tenantOne}', 30000),
      ('service-400', '${tenantOne}', 40000),
      ('service-other', '${tenantTwo}', 999999);
    INSERT INTO appointments VALUES
      ('appt-ana-confirmed', '${tenantOne}', 'service-100', 'user-ana', '2030-01-10T10:00:00.000Z', 'CONFIRMED', 'NOT_REQUESTED'),
      ('appt-ana-presence', '${tenantOne}', 'service-200', 'user-ana', '2030-01-11T10:00:00.000Z', 'PENDING', 'MANUALLY_CONFIRMED'),
      ('appt-ana-pending', '${tenantOne}', 'service-300', 'user-ana', '2030-01-12T10:00:00.000Z', 'PENDING', 'NO_RESPONSE'),
      ('appt-ana-cancelled', '${tenantOne}', 'service-400', 'user-ana', '2030-01-13T10:00:00.000Z', 'CANCELLED', 'CONFIRMED'),
      ('appt-carla', '${tenantOne}', 'service-100', 'user-carla', '2030-01-15T10:00:00.000Z', 'CONFIRMED', 'CONFIRMED'),
      ('appt-other', '${tenantTwo}', 'service-other', 'user-other', '2030-01-20T10:00:00.000Z', 'CONFIRMED', 'CONFIRMED');
  `)

  const app = express()
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: tenantOne, sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/admin', createAdminClientsRouter({ db }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/clients`)).status, 401)

    const response = await fetch(`${baseUrl}/api/admin/clients`, { headers: { 'x-test-admin': 'true' } })
    assert.equal(response.status, 200)
    const payload = await response.json() as { clients: Array<Record<string, unknown>> }
    assert.deepEqual(payload.clients, [
      {
        id: 'client-carla', name: 'Carla', phone: '5579999990003', marketingWhatsappOptIn: 1,
        email: 'carla@example.com', totalSpentCents: 10000, lastVisitAt: '2030-01-15T10:00:00.000Z',
      },
      {
        id: 'client-ana', name: 'Ana', phone: '5579999990001', marketingWhatsappOptIn: 1,
        email: 'ana@example.com', totalSpentCents: 30000, lastVisitAt: '2030-01-11T10:00:00.000Z',
      },
      {
        id: 'client-bia', name: 'Bia', phone: null, marketingWhatsappOptIn: 0,
        email: 'bia@example.com', totalSpentCents: 0, lastVisitAt: null,
      },
    ])
    assert.ok(payload.clients.every(client => client.name !== 'Cliente externa'))
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
