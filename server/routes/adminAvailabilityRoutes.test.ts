import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminAvailabilityRouter } from './adminAvailabilityRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const hourOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const hourTwo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const otherHour = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const timeOffOne = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const otherTimeOff = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

test('disponibilidade ADMIN preserva intervalos, conflitos e isolamento por tenant', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE business_hours (
      id TEXT PRIMARY KEY, tenant_id TEXT, weekday INTEGER,
      start_minute INTEGER, end_minute INTEGER, created_at TEXT
    );
    CREATE TABLE time_off (
      id TEXT PRIMARY KEY, tenant_id TEXT, starts_at TEXT,
      ends_at TEXT, reason TEXT, created_at TEXT
    );
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, starts_at TEXT,
      ends_at TEXT, status TEXT
    );

    INSERT INTO business_hours VALUES ('${hourOne}', '${tenantOne}', 1, 540, 720, '2026-01-01T00:00:00.000Z');
    INSERT INTO business_hours VALUES ('${hourTwo}', '${tenantOne}', 1, 780, 900, '2026-01-01T00:00:00.000Z');
    INSERT INTO business_hours VALUES ('${otherHour}', '${tenantTwo}', 1, 600, 660, '2026-01-01T00:00:00.000Z');
    INSERT INTO time_off VALUES ('${timeOffOne}', '${tenantOne}', '2030-01-10T13:00:00.000Z', '2030-01-10T14:00:00.000Z', 'Almoço', '2026-01-01T00:00:00.000Z');
    INSERT INTO time_off VALUES ('${otherTimeOff}', '${tenantTwo}', '2030-01-10T13:00:00.000Z', '2030-01-10T14:00:00.000Z', 'Outro tenant', '2026-01-01T00:00:00.000Z');
    INSERT INTO appointments VALUES ('appointment-1', '${tenantOne}', '2030-01-10T10:00:00.000Z', '2030-01-10T11:00:00.000Z', 'CONFIRMED');
    INSERT INTO appointments VALUES ('appointment-2', '${tenantOne}', '2030-01-10T18:00:00.000Z', '2030-01-10T19:00:00.000Z', 'CANCELLED');
  `)

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: tenantOne, sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/admin', createAdminAvailabilityRouter({ db }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/business-hours`)).status, 401)

    const listedHours = await fetch(`${baseUrl}/api/admin/business-hours`, { headers }).then(response => response.json()) as { businessHours: Array<{ id: string }> }
    assert.deepEqual(listedHours.businessHours.map(hour => hour.id), [hourOne, hourTwo])

    const invalidRange = await fetch(`${baseUrl}/api/admin/business-hours`, {
      method: 'POST', headers, body: JSON.stringify({ weekday: 2, startMinute: 600, endMinute: 600 }),
    })
    assert.equal(invalidRange.status, 400)
    assert.equal((await invalidRange.json() as { code: string }).code, 'INVALID_RANGE')

    const hourOverlap = await fetch(`${baseUrl}/api/admin/business-hours`, {
      method: 'POST', headers, body: JSON.stringify({ weekday: 1, startMinute: 700, endMinute: 800 }),
    })
    assert.equal(hourOverlap.status, 400)
    assert.equal((await hourOverlap.json() as { code: string }).code, 'OVERLAPPING_RANGE')

    const createdHourResponse = await fetch(`${baseUrl}/api/admin/business-hours`, {
      method: 'POST', headers, body: JSON.stringify({ weekday: 1, startMinute: 720, endMinute: 780 }),
    })
    assert.equal(createdHourResponse.status, 200)
    const createdHour = await createdHourResponse.json() as { businessHour: { id: string; weekday: number; startMinute: number; endMinute: number } }
    assert.deepEqual({ ...createdHour.businessHour, id: 'dynamic' }, { id: 'dynamic', weekday: 1, startMinute: 720, endMinute: 780 })

    const emptyHourPatch = await fetch(`${baseUrl}/api/admin/business-hours/${createdHour.businessHour.id}`, {
      method: 'PATCH', headers, body: '{}',
    })
    assert.equal(emptyHourPatch.status, 400)
    assert.equal((await emptyHourPatch.json() as { code: string }).code, 'NO_UPDATES')

    const crossTenantHourPatch = await fetch(`${baseUrl}/api/admin/business-hours/${otherHour}`, {
      method: 'PATCH', headers, body: JSON.stringify({ startMinute: 480 }),
    })
    assert.equal(crossTenantHourPatch.status, 404)
    const crossTenantHourDelete = await fetch(`${baseUrl}/api/admin/business-hours/${otherHour}`, { method: 'DELETE', headers })
    assert.equal(crossTenantHourDelete.status, 404)
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM business_hours WHERE id = ?').get(otherHour) as { total: number }).total, 1)

    const updatedHour = await fetch(`${baseUrl}/api/admin/business-hours/${createdHour.businessHour.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ weekday: 2, startMinute: 600, endMinute: 720 }),
    }).then(response => response.json()) as { businessHour: { weekday: number; startMinute: number; endMinute: number } }
    assert.deepEqual(updatedHour.businessHour, { id: createdHour.businessHour.id, weekday: 2, startMinute: 600, endMinute: 720 })
    assert.deepEqual(await fetch(`${baseUrl}/api/admin/business-hours/${createdHour.businessHour.id}`, { method: 'DELETE', headers }).then(response => response.json()), { ok: true })

    const listedTimeOff = await fetch(`${baseUrl}/api/admin/time-off?start=2030-01-10T12:30:00.000Z&end=2030-01-10T14:30:00.000Z&limit=10`, { headers })
      .then(response => response.json()) as { timeOff: Array<{ id: string }> }
    assert.deepEqual(listedTimeOff.timeOff.map(block => block.id), [timeOffOne])

    const appointmentConflict = await fetch(`${baseUrl}/api/admin/time-off`, {
      method: 'POST', headers,
      body: JSON.stringify({ startsAt: '2030-01-10T10:30:00.000Z', endsAt: '2030-01-10T11:30:00.000Z' }),
    })
    assert.equal(appointmentConflict.status, 400)
    assert.equal((await appointmentConflict.json() as { code: string }).code, 'TIME_OFF_CONFLICT_APPOINTMENT')

    const timeOffOverlap = await fetch(`${baseUrl}/api/admin/time-off`, {
      method: 'POST', headers,
      body: JSON.stringify({ startsAt: '2030-01-10T13:30:00.000Z', endsAt: '2030-01-10T14:30:00.000Z' }),
    })
    assert.equal(timeOffOverlap.status, 400)
    assert.equal((await timeOffOverlap.json() as { code: string }).code, 'OVERLAPPING_TIME_OFF')

    const createdTimeOffResponse = await fetch(`${baseUrl}/api/admin/time-off`, {
      method: 'POST', headers,
      body: JSON.stringify({ startsAt: '2030-01-10T15:00:00.000Z', endsAt: '2030-01-10T16:00:00.000Z', reason: '  Intervalo  ' }),
    })
    assert.equal(createdTimeOffResponse.status, 200)
    const createdTimeOff = await createdTimeOffResponse.json() as { timeOff: { id: string; startsAt: string; endsAt: string; reason: string | null; createdAt: string } }
    assert.equal(createdTimeOff.timeOff.reason, 'Intervalo')

    const emptyTimeOffPatch = await fetch(`${baseUrl}/api/admin/time-off/${createdTimeOff.timeOff.id}`, {
      method: 'PATCH', headers, body: '{}',
    })
    assert.equal(emptyTimeOffPatch.status, 400)
    assert.equal((await emptyTimeOffPatch.json() as { code: string }).code, 'NO_UPDATES')

    const conflictPatch = await fetch(`${baseUrl}/api/admin/time-off/${createdTimeOff.timeOff.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ startsAt: '2030-01-10T10:15:00.000Z', endsAt: '2030-01-10T10:45:00.000Z' }),
    })
    assert.equal(conflictPatch.status, 400)
    assert.equal((await conflictPatch.json() as { code: string }).code, 'TIME_OFF_CONFLICT_APPOINTMENT')

    const crossTenantTimeOffPatch = await fetch(`${baseUrl}/api/admin/time-off/${otherTimeOff}`, {
      method: 'PATCH', headers, body: JSON.stringify({ reason: 'Tentativa externa' }),
    })
    assert.equal(crossTenantTimeOffPatch.status, 404)
    const crossTenantTimeOffDelete = await fetch(`${baseUrl}/api/admin/time-off/${otherTimeOff}`, { method: 'DELETE', headers })
    assert.equal(crossTenantTimeOffDelete.status, 404)

    const updatedTimeOff = await fetch(`${baseUrl}/api/admin/time-off/${createdTimeOff.timeOff.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ startsAt: '2030-01-10T16:00:00.000Z', endsAt: '2030-01-10T17:00:00.000Z', reason: null }),
    }).then(response => response.json()) as { timeOff: { startsAt: string; endsAt: string; reason: string | null } }
    assert.equal(updatedTimeOff.timeOff.startsAt, '2030-01-10T16:00:00.000Z')
    assert.equal(updatedTimeOff.timeOff.endsAt, '2030-01-10T17:00:00.000Z')
    assert.equal(updatedTimeOff.timeOff.reason, null)
    assert.deepEqual(await fetch(`${baseUrl}/api/admin/time-off/${createdTimeOff.timeOff.id}`, { method: 'DELETE', headers }).then(response => response.json()), { ok: true })
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
