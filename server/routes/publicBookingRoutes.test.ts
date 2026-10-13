import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { badRequest, handleError } from '../http.js'
import { createPublicBookingRouter } from './publicBookingRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const serviceGood = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const serviceConflict = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const fixedNow = new Date('2030-04-10T12:00:00.000Z')

test('booking público preserva host, slug, cliente, conflitos, consentimento e isolamento', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT UNIQUE, name TEXT, status TEXT);
    CREATE TABLE users (
      id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, password_hash TEXT,
      role TEXT, session_version INTEGER DEFAULT 0, created_at TEXT
    );
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT, phone TEXT,
      phone_normalized TEXT, marketing_whatsapp_opt_in INTEGER DEFAULT 0, created_at TEXT
    );
    INSERT INTO tenants VALUES
      ('${tenantOne}', 'studio-aurora', 'Studio Aurora', 'ACTIVE'),
      ('${tenantTwo}', 'studio-externo', 'Studio Externo', 'ACTIVE'),
      ('33333333-3333-4333-8333-333333333333', 'studio-inativo', 'Studio Inativo', 'SUSPENDED');
    INSERT INTO users VALUES
      ('user-existing', '${tenantOne}', 'existing@client.local', 'hash-existing', 'CLIENT', 7, '2030-01-01T00:00:00.000Z'),
      ('user-foreign', '${tenantTwo}', 'foreign@client.local', 'hash-foreign', 'CLIENT', 0, '2030-01-01T00:00:00.000Z');
    INSERT INTO clients VALUES
      ('client-existing', '${tenantOne}', 'user-existing', 'Nome verificado', '(79) 99999-0001', '5579999990001', 1, '2030-01-01T00:00:00.000Z'),
      ('client-foreign', '${tenantTwo}', 'user-foreign', 'Cliente externa', '(79) 99999-0002', '5579999990002', 1, '2030-01-01T00:00:00.000Z');
  `)

  const middlewareOrder: string[] = []
  const hashInputs: string[] = []
  const appointments: Array<{ tenantId: string; userId: string; serviceId: string; startsAt: string }> = []
  const consents: Array<{ tenantId: string; userId: string; granted: boolean; source: string }> = []
  let appointmentCounter = 0

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const resolved = req.headers['x-resolved-tenant']
    if (resolved === 'one') req.resolvedTenant = { id: tenantOne, slug: 'studio-aurora' }
    if (resolved === 'two') req.resolvedTenant = { id: tenantTwo, slug: 'studio-externo' }
    next()
  })
  app.use('/api/public', createPublicBookingRouter({
    db,
    publicBookingLimiter: (_req, _res, next) => {
      middlewareOrder.push('origin')
      next()
    },
    publicBookingPhoneLimiter: (_req, _res, next) => {
      middlewareOrder.push('phone')
      next()
    },
    normalizePhone: raw => {
      const digits = raw.replace(/\D/g, '')
      if (digits.length !== 13 || !digits.startsWith('55')) throw badRequest('Telefone inválido', 'INVALID_PHONE')
      return digits
    },
    hashPassword: async password => {
      hashInputs.push(password)
      return `hashed-${hashInputs.length}`
    },
    createAppointmentForUser: input => {
      appointments.push(input)
      if (input.serviceId === serviceConflict) throw badRequest('Horário indisponível', 'SLOT_UNAVAILABLE')
      appointmentCounter += 1
      const startsAt = new Date(input.startsAt)
      return {
        id: `appointment-${appointmentCounter}`,
        serviceId: input.serviceId,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
        status: 'PENDING',
        confirmationStatus: 'NOT_REQUESTED',
      }
    },
    setClientWhatsappMarketingConsent: input => {
      consents.push(input)
      db.prepare(`UPDATE clients SET marketing_whatsapp_opt_in = 1 WHERE tenant_id = ? AND user_id = ?`)
        .run(input.tenantId, input.userId)
    },
    now: () => fixedNow,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'content-type': 'application/json' }
  const body = {
    serviceId: serviceGood,
    startsAt: '2030-04-20T12:00:00.000Z',
    name: 'Nome digitado diferente',
    phone: '+55 (79) 99999-0001',
  }

  try {
    const missingTenant = await fetch(`${baseUrl}/api/public/appointments`, {
      method: 'POST', headers, body: JSON.stringify(body),
    })
    assert.equal(missingTenant.status, 404)
    assert.equal((await missingTenant.json() as { code: string }).code, 'TENANT_NOT_FOUND')
    assert.deepEqual(middlewareOrder, ['origin', 'phone'])

    const existingBooking = await fetch(`${baseUrl}/api/public/appointments`, {
      method: 'POST', headers: { ...headers, 'x-resolved-tenant': 'one' },
      body: JSON.stringify(body),
    })
    assert.equal(existingBooking.status, 200)
    assert.equal((await existingBooking.json() as { appointment: { id: string } }).appointment.id, 'appointment-1')
    assert.equal(hashInputs.length, 0)
    assert.deepEqual(appointments[0], {
      tenantId: tenantOne,
      userId: 'user-existing',
      serviceId: serviceGood,
      startsAt: '2030-04-20T12:00:00.000Z',
    })
    assert.equal((db.prepare(`SELECT name FROM clients WHERE id = 'client-existing'`).get() as { name: string }).name, 'Nome verificado')
    assert.equal(consents.length, 0)

    const mismatched = await fetch(`${baseUrl}/api/public/tenant/studio-externo/appointments`, {
      method: 'POST', headers: { ...headers, 'x-resolved-tenant': 'one' },
      body: JSON.stringify({ ...body, phone: '+55 (79) 99999-0099' }),
    })
    assert.equal(mismatched.status, 403)
    assert.equal((await mismatched.json() as { code: string }).code, 'TENANT_HOST_MISMATCH')

    const inactive = await fetch(`${baseUrl}/api/public/tenant/studio-inativo/appointments`, {
      method: 'POST', headers, body: JSON.stringify({ ...body, phone: '+55 (79) 99999-0099' }),
    })
    assert.equal(inactive.status, 404)

    const newPhone = '+55 (79) 99999-0099'
    const createdBooking = await fetch(`${baseUrl}/api/public/tenant/STUDIO-AURORA/appointments`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...body, name: '  Ana   Nova  ', phone: newPhone, marketingConsent: true }),
    })
    assert.equal(createdBooking.status, 200)
    assert.equal(hashInputs.length, 1)
    assert.ok(hashInputs[0].length >= 32)
    const createdClient = db.prepare(`
      SELECT c.tenant_id as tenantId, c.user_id as userId, c.name, c.phone,
             c.phone_normalized as phoneNormalized, c.marketing_whatsapp_opt_in as optedIn,
             c.created_at as createdAt, u.email, u.password_hash as passwordHash, u.role
      FROM clients c JOIN users u ON u.id = c.user_id
      WHERE c.tenant_id = ? AND c.phone_normalized = ?
    `).get(tenantOne, '5579999990099') as Record<string, unknown>
    assert.deepEqual(createdClient, {
      tenantId: tenantOne,
      userId: createdClient.userId,
      name: 'Ana Nova',
      phone: newPhone,
      phoneNormalized: '5579999990099',
      optedIn: 1,
      createdAt: fixedNow.toISOString(),
      email: `5579999990099.${tenantOne.replace(/-/g, '')}@client.local`,
      passwordHash: 'hashed-1',
      role: 'CLIENT',
    })
    assert.deepEqual(consents, [{
      tenantId: tenantOne,
      userId: String(createdClient.userId),
      granted: true,
      source: 'PUBLIC_BOOKING',
    }])

    const repeatBooking = await fetch(`${baseUrl}/api/public/tenant/studio-aurora/appointments`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...body, name: 'Não substituir', phone: newPhone }),
    })
    assert.equal(repeatBooking.status, 200)
    assert.equal(hashInputs.length, 1)
    assert.equal((db.prepare(`SELECT name FROM clients WHERE tenant_id = ? AND phone_normalized = ?`).get(tenantOne, '5579999990099') as { name: string }).name, 'Ana Nova')
    assert.equal(consents.length, 1)

    const conflictPhone = '+55 (79) 99999-0088'
    const conflict = await fetch(`${baseUrl}/api/public/tenant/studio-aurora/appointments`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...body, serviceId: serviceConflict, name: 'Cliente conflito', phone: conflictPhone, marketingConsent: true }),
    })
    assert.equal(conflict.status, 400)
    assert.equal((await conflict.json() as { code: string }).code, 'SLOT_UNAVAILABLE')
    const conflictClient = db.prepare(`SELECT marketing_whatsapp_opt_in as optedIn FROM clients WHERE tenant_id = ? AND phone_normalized = ?`).get(tenantOne, '5579999990088') as { optedIn: number }
    assert.equal(conflictClient.optedIn, 0)
    assert.equal(consents.length, 1)

    const strictBody = await fetch(`${baseUrl}/api/public/tenant/studio-aurora/appointments`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...body, extra: true }),
    })
    assert.equal(strictBody.status, 400)

    assert.deepEqual(db.prepare(`SELECT id, name, phone_normalized as phone FROM clients WHERE tenant_id = ?`).all(tenantTwo), [
      { id: 'client-foreign', name: 'Cliente externa', phone: '5579999990002' },
    ])
    assert.equal(middlewareOrder.length, 16)
    for (let index = 0; index < middlewareOrder.length; index += 2) {
      assert.deepEqual(middlewareOrder.slice(index, index + 2), ['origin', 'phone'])
    }
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
