import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminAppointmentsRouter, type ConfirmationAppointment } from './adminAppointmentsRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const serviceOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const serviceTwo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const appointmentOne = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const appointmentTwo = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

test('agenda ADMIN preserva filtros, duração, conflitos, confirmação e isolamento por tenant', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE services (
      id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, duration_minutes INTEGER,
      price_cents INTEGER, active INTEGER DEFAULT 1
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, password_hash TEXT, role TEXT, created_at TEXT
    );
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT, phone TEXT,
      phone_normalized TEXT, created_at TEXT
    );
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, service_id TEXT, client_user_id TEXT,
      starts_at TEXT, ends_at TEXT, status TEXT, confirmation_status TEXT DEFAULT 'NOT_REQUESTED',
      confirmation_code TEXT, confirmation_sent_at TEXT, confirmation_reminder_sent_at TEXT,
      confirmation_responded_at TEXT, appointment_reminder_sent_at TEXT, created_at TEXT
    );
    CREATE TABLE time_off (id TEXT PRIMARY KEY, tenant_id TEXT, starts_at TEXT, ends_at TEXT);
    CREATE TABLE appointment_confirmation_events (
      id TEXT PRIMARY KEY, tenant_id TEXT, appointment_id TEXT, event_type TEXT,
      channel TEXT, details_json TEXT, created_at TEXT
    );

    INSERT INTO services VALUES ('${serviceOne}', '${tenantOne}', 'Volume brasileiro', 90, 21000, 1);
    INSERT INTO services VALUES ('${serviceTwo}', '${tenantTwo}', 'Serviço externo', 60, 10000, 1);
    INSERT INTO users VALUES ('user-1', '${tenantOne}', 'ana@example.com', 'hash', 'CLIENT', '2026-01-01T00:00:00.000Z');
    INSERT INTO users VALUES ('user-2', '${tenantTwo}', 'bia@example.com', 'hash', 'CLIENT', '2026-01-01T00:00:00.000Z');
    INSERT INTO clients VALUES ('client-1', '${tenantOne}', 'user-1', 'Ana', '(79) 99999-0001', '5579999990001', '2026-01-01T00:00:00.000Z');
    INSERT INTO clients VALUES ('client-2', '${tenantTwo}', 'user-2', 'Bia', '(79) 99999-0002', '5579999990002', '2026-01-01T00:00:00.000Z');
    INSERT INTO appointments (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, confirmation_status, created_at)
      VALUES ('${appointmentOne}', '${tenantOne}', '${serviceOne}', 'user-1', '2030-01-10T10:00:00.000Z', '2030-01-10T11:30:00.000Z', 'CONFIRMED', 'NOT_REQUESTED', '2026-01-01T00:00:00.000Z');
    INSERT INTO appointments (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, confirmation_status, created_at)
      VALUES ('${appointmentTwo}', '${tenantTwo}', '${serviceTwo}', 'user-2', '2030-01-10T10:00:00.000Z', '2030-01-10T11:00:00.000Z', 'CONFIRMED', 'NOT_REQUESTED', '2026-01-01T00:00:00.000Z');
    INSERT INTO time_off VALUES ('off-1', '${tenantOne}', '2030-01-10T15:00:00.000Z', '2030-01-10T16:00:00.000Z');
    INSERT INTO appointment_confirmation_events VALUES ('event-1', '${tenantOne}', '${appointmentOne}', 'REQUEST_SENT', 'WHATSAPP', NULL, '2026-01-02T00:00:00.000Z');
    INSERT INTO appointment_confirmation_events VALUES ('event-2', '${tenantTwo}', '${appointmentTwo}', 'REQUEST_SENT', 'WHATSAPP', NULL, '2026-01-02T00:00:00.000Z');
  `)

  const scheduled: Array<{ tenantId: string; appointmentId: string }> = []
  const cancelled: Array<{ tenantId: string; appointmentId: string; kinds?: string[] }> = []
  const confirmationEvents: Array<Record<string, unknown>> = []
  const sentConfirmations: Array<{ appointmentId: string; eventType: string }> = []
  let hashCalls = 0

  const confirmationAppointmentById = (tenantId: string, id: string): ConfirmationAppointment | undefined => db.prepare(`
    SELECT a.id, a.tenant_id as tenantId, a.starts_at as startsAt, a.status,
           a.confirmation_status as confirmationStatus, a.confirmation_code as confirmationCode,
           a.confirmation_sent_at as confirmationSentAt, c.name as clientName,
           c.phone as clientPhone, c.phone_normalized as clientPhoneNormalized,
           s.name as serviceName, 'Espaço' as tenantName, 'America/Sao_Paulo' as timeZone
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    LEFT JOIN clients c ON c.user_id = a.client_user_id AND c.tenant_id = a.tenant_id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(id, tenantId) as ConfirmationAppointment | undefined

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: tenantOne, sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/admin', createAdminAppointmentsRouter({
    db,
    normalizePhone: raw => raw.replace(/\D/g, '').replace(/^79/, '5579'),
    hashPassword: async () => { hashCalls += 1; return 'hashed-password' },
    scheduleAppointmentAutomationJobs: (tenantId, appointmentId) => scheduled.push({ tenantId, appointmentId }),
    cancelAppointmentJobs: (tenantId, appointmentId, kinds) => cancelled.push({ tenantId, appointmentId, kinds }),
    confirmationAppointmentById,
    sendAppointmentConfirmation: async (appointment, eventType) => {
      sentConfirmations.push({ appointmentId: appointment.id, eventType })
      return { ok: true }
    },
    confirmationEvent: input => confirmationEvents.push(input),
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const adminHeaders = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/admin/appointments`)
    assert.equal(unauthorized.status, 401)

    const listed = await fetch(`${baseUrl}/api/admin/appointments?start=2030-01-10T00:00:00.000Z&end=2030-01-11T00:00:00.000Z&limit=10`, { headers: adminHeaders })
      .then(response => response.json()) as { appointments: Array<{ id: string; serviceName: string }> }
    assert.deepEqual(listed.appointments, [{
      id: appointmentOne,
      serviceId: serviceOne,
      startsAt: '2030-01-10T10:00:00.000Z',
      endsAt: '2030-01-10T11:30:00.000Z',
      status: 'CONFIRMED',
      confirmationStatus: 'NOT_REQUESTED',
      confirmationSentAt: null,
      confirmationReminderSentAt: null,
      confirmationRespondedAt: null,
      appointmentReminderSentAt: null,
      clientEmail: 'ana@example.com',
      clientName: 'Ana',
      clientPhone: '(79) 99999-0001',
      serviceName: 'Volume brasileiro',
      priceCents: 21000,
    }])

    const createdResponse = await fetch(`${baseUrl}/api/admin/appointments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ clientName: 'Ana Atualizada', clientPhone: '(79) 99999-0001', serviceId: serviceOne, startsAt: '2030-01-10T12:00:00.000Z' }),
    })
    assert.equal(createdResponse.status, 200)
    const created = await createdResponse.json() as { appointment: { id: string; endsAt: string; status: string; clientName: string } }
    assert.equal(created.appointment.endsAt, '2030-01-10T13:30:00.000Z')
    assert.equal(created.appointment.status, 'CONFIRMED')
    assert.equal(created.appointment.clientName, 'Ana Atualizada')
    assert.deepEqual(scheduled[0], { tenantId: tenantOne, appointmentId: created.appointment.id })
    assert.equal(hashCalls, 0)

    const overlap = await fetch(`${baseUrl}/api/admin/appointments`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ clientName: 'Conflito', serviceId: serviceOne, startsAt: '2030-01-10T12:30:00.000Z' }),
    })
    assert.equal(overlap.status, 400)
    assert.equal((await overlap.json() as { code: string }).code, 'SLOT_UNAVAILABLE')

    const blocked = await fetch(`${baseUrl}/api/admin/appointments`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ clientName: 'Bloqueado', serviceId: serviceOne, startsAt: '2030-01-10T15:15:00.000Z' }),
    })
    assert.equal(blocked.status, 400)
    assert.equal((await blocked.json() as { code: string }).code, 'SLOT_UNAVAILABLE')

    const newClientResponse = await fetch(`${baseUrl}/api/admin/appointments`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ clientName: 'Carla', clientPhone: '(79) 98888-0000', serviceId: serviceOne, startsAt: '2030-01-10T17:00:00.000Z', status: 'PENDING' }),
    })
    assert.equal(newClientResponse.status, 200)
    const newClientAppointment = await newClientResponse.json() as { appointment: { id: string; status: string } }
    assert.equal(newClientAppointment.appointment.status, 'PENDING')
    assert.equal(hashCalls, 3)
    assert.equal((db.prepare(`SELECT COUNT(*) AS total FROM clients WHERE tenant_id = ? AND name = 'Carla'`).get(tenantOne) as { total: number }).total, 1)

    const crossTenantPatch = await fetch(`${baseUrl}/api/admin/appointments/${appointmentTwo}`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'CANCELLED' }),
    })
    assert.equal(crossTenantPatch.status, 404)
    assert.equal((db.prepare('SELECT status FROM appointments WHERE id = ?').get(appointmentTwo) as { status: string }).status, 'CONFIRMED')

    const cancelledResponse = await fetch(`${baseUrl}/api/admin/appointments/${newClientAppointment.appointment.id}`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'CANCELLED' }),
    })
    assert.equal(cancelledResponse.status, 200)
    assert.ok(cancelled.some(entry => entry.appointmentId === newClientAppointment.appointment.id && !entry.kinds))

    const resend = await fetch(`${baseUrl}/api/admin/appointments/${created.appointment.id}/confirmation/resend`, { method: 'POST', headers: adminHeaders })
    assert.deepEqual(await resend.json(), { confirmationStatus: 'AWAITING_CONFIRMATION' })
    assert.deepEqual(sentConfirmations, [{ appointmentId: created.appointment.id, eventType: 'REQUEST_SENT' }])

    const manuallyConfirmed = await fetch(`${baseUrl}/api/admin/appointments/${created.appointment.id}/confirmation/manual`, { method: 'POST', headers: adminHeaders })
    const manualBody = await manuallyConfirmed.json() as { confirmationStatus: string; confirmationRespondedAt: string }
    assert.equal(manualBody.confirmationStatus, 'MANUALLY_CONFIRMED')
    assert.ok(manualBody.confirmationRespondedAt)
    assert.equal((db.prepare('SELECT confirmation_status AS status FROM appointments WHERE id = ?').get(created.appointment.id) as { status: string }).status, 'MANUALLY_CONFIRMED')
    assert.deepEqual(confirmationEvents, [{ tenantId: tenantOne, appointmentId: created.appointment.id, eventType: 'MANUALLY_CONFIRMED', channel: 'OWNER' }])

    const events = await fetch(`${baseUrl}/api/admin/appointments/${appointmentOne}/confirmation/events`, { headers: adminHeaders }).then(response => response.json())
    assert.deepEqual(events, { events: [{ id: 'event-1', eventType: 'REQUEST_SENT', channel: 'WHATSAPP', detailsJson: null, createdAt: '2026-01-02T00:00:00.000Z' }] })

    const crossTenantEvents = await fetch(`${baseUrl}/api/admin/appointments/${appointmentTwo}/confirmation/events`, { headers: adminHeaders })
    assert.equal(crossTenantEvents.status, 404)
    const crossTenantDelete = await fetch(`${baseUrl}/api/admin/appointments/${appointmentTwo}`, { method: 'DELETE', headers: adminHeaders })
    assert.equal(crossTenantDelete.status, 404)

    const removed = await fetch(`${baseUrl}/api/admin/appointments/${created.appointment.id}`, { method: 'DELETE', headers: adminHeaders })
    assert.deepEqual(await removed.json(), { ok: true })
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM appointments WHERE id = ?').get(created.appointment.id) as { total: number }).total, 0)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
