import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { badRequest, handleError } from '../http.js'
import { createClientAccessService } from '../clientAccessService.js'
import { createClientPortalRouter, createPublicClientAccessRouter } from './clientPortalRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const tenantUnavailable = '33333333-3333-4333-8333-333333333333'
const serviceOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

test('portal da cliente preserva OTP, sessão, preferências, agenda e isolamento', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT UNIQUE, name TEXT, status TEXT);
    CREATE TABLE users (
      id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, role TEXT,
      session_version INTEGER DEFAULT 0
    );
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT,
      phone_normalized TEXT, marketing_whatsapp_opt_in INTEGER DEFAULT 0,
      marketing_whatsapp_opt_in_at TEXT, marketing_whatsapp_opt_out_at TEXT
    );
    CREATE TABLE client_login_codes (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, code_hash TEXT,
      expires_at TEXT, attempts INTEGER DEFAULT 0, consumed_at TEXT, created_at TEXT
    );
    CREATE TABLE services (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, price_cents INTEGER);
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, service_id TEXT, client_user_id TEXT,
      starts_at TEXT, ends_at TEXT, status TEXT, confirmation_status TEXT,
      confirmation_sent_at TEXT, confirmation_responded_at TEXT
    );

    INSERT INTO tenants VALUES
      ('${tenantOne}', 'studio-aurora', 'Studio Aurora', 'ACTIVE'),
      ('${tenantTwo}', 'studio-externo', 'Studio Externo', 'ACTIVE'),
      ('${tenantUnavailable}', 'sem-whatsapp', 'Sem WhatsApp', 'ACTIVE'),
      ('44444444-4444-4444-8444-444444444444', 'studio-inativo', 'Studio Inativo', 'SUSPENDED');
    INSERT INTO users VALUES
      ('user-one', '${tenantOne}', 'one@client.local', 'CLIENT', 3),
      ('user-two', '${tenantTwo}', 'two@client.local', 'CLIENT', 1),
      ('user-admin', '${tenantOne}', 'admin@example.com', 'ADMIN', 0);
    INSERT INTO clients VALUES
      ('client-one', '${tenantOne}', 'user-one', 'Ana Aurora', '5579999990001', 1, '2030-01-01T00:00:00.000Z', NULL),
      ('client-two', '${tenantTwo}', 'user-two', 'Bia Externa', '5579999990002', 0, NULL, '2030-02-01T00:00:00.000Z');
    INSERT INTO services VALUES
      ('${serviceOne}', '${tenantOne}', 'Volume brasileiro', 15000),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '${tenantTwo}', 'Serviço externo', 99999);
    INSERT INTO appointments VALUES
      ('appointment-old', '${tenantOne}', '${serviceOne}', 'user-one', '2030-04-10T12:00:00.000Z', '2030-04-10T13:00:00.000Z', 'CONFIRMED', 'CONFIRMED', '2030-04-09T12:00:00.000Z', '2030-04-09T12:05:00.000Z'),
      ('appointment-new', '${tenantOne}', '${serviceOne}', 'user-one', '2030-04-20T12:00:00.000Z', '2030-04-20T13:00:00.000Z', 'PENDING', 'NOT_REQUESTED', NULL, NULL),
      ('appointment-other', '${tenantTwo}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'user-two', '2030-04-30T12:00:00.000Z', '2030-04-30T13:00:00.000Z', 'PENDING', 'NOT_REQUESTED', NULL, NULL);
    INSERT INTO client_login_codes VALUES
      ('old-code', '${tenantOne}', 'user-one', 'old-hash', '2099-01-01T00:00:00.000Z', 0, NULL, '2029-01-01T00:00:00.000Z');
  `)

  db.exec(`CREATE TABLE tenant_settings (tenant_id TEXT PRIMARY KEY,timezone TEXT); INSERT INTO tenant_settings VALUES ('${tenantOne}','America/Manaus'),('${tenantTwo}','America/Recife'); CREATE TABLE professionals (id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT); ALTER TABLE appointments ADD COLUMN professional_id TEXT; INSERT INTO professionals VALUES ('11111111-2222-4333-8444-555555555555','${tenantOne}','Beatriz'); UPDATE appointments SET professional_id='11111111-2222-4333-8444-555555555555' WHERE tenant_id='${tenantOne}';`)

  const requestLimiterOrder: string[] = []
  const delivered: Array<{ tenantId: string; phone: string; text: string; options?: { source?: 'SYSTEM'; persist?: boolean } }> = []
  const sessions: Array<{ userId: string; persistent: boolean }> = []
  const consentChanges: Array<{ tenantId: string; userId: string; granted: boolean; source: string }> = []
  const createdAppointments: Array<{ tenantId: string; userId: string; serviceId: string; startsAt: string }> = []
  const hashCode = (tenantId: string, userId: string, code: string) => createHash('sha256').update(`${tenantId}:${userId}:${code}`).digest('hex')
  const clientAccessService = createClientAccessService({
    db,
    normalizePhone: raw => {
      const phone = raw.replace(/\D/g, '')
      if (phone.length !== 13 || !phone.startsWith('55')) throw badRequest('Telefone inválido', 'INVALID_PHONE')
      return phone
    },
    requireWhatsappConfig: tenantId => tenantId === tenantUnavailable ? undefined : { baseUrl: 'https://evolution.test', apiKey: 'secret', instanceName: `instance-${tenantId}` },
    hashCode,
    sendWhatsappText: async (tenantId, phone, text, options) => {
      delivered.push({ tenantId, phone, text, options })
      return true
    },
  })

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const identity = req.headers['x-test-identity']
    if (identity === 'one') req.sessionUser = { id: 'user-one', role: 'CLIENT', tenantId: tenantOne, sessionId: 'session-one', persistent: true, trustedDeviceId: null }
    if (identity === 'two') req.sessionUser = { id: 'user-two', role: 'CLIENT', tenantId: tenantTwo, sessionId: 'session-two', persistent: true, trustedDeviceId: null }
    if (identity === 'admin') req.sessionUser = { id: 'user-admin', role: 'ADMIN', tenantId: tenantOne, sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
    if (identity === 'no-tenant') req.sessionUser = { id: 'user-one', role: 'CLIENT', tenantId: null, sessionId: 'session-invalid', persistent: false, trustedDeviceId: null }
    next()
  })
  app.use('/api/public', createPublicClientAccessRouter({
    clientAccessRequestLimiter: (_req, _res, next) => { requestLimiterOrder.push('request'); next() },
    clientAccessPhoneLimiter: (_req, _res, next) => { requestLimiterOrder.push('phone'); next() },
    clientAccessVerifyLimiter: (_req, _res, next) => { requestLimiterOrder.push('verify'); next() },
    requestClientAccess: clientAccessService.requestClientAccess,
    verifyClientAccess: clientAccessService.verifyClientAccess,
    createAndSetSession: (_req, _res, userId, persistent) => {
      sessions.push({ userId, persistent })
    },
  }))
  app.use('/api/client', createClientPortalRouter({
    db,
    setClientWhatsappMarketingConsent: input => {
      consentChanges.push(input)
      db.prepare(`
        UPDATE clients
        SET marketing_whatsapp_opt_in = ?,
            marketing_whatsapp_opt_in_at = CASE WHEN ? = 1 THEN '2030-05-01T00:00:00.000Z' ELSE marketing_whatsapp_opt_in_at END,
            marketing_whatsapp_opt_out_at = CASE WHEN ? = 0 THEN '2030-05-01T00:00:00.000Z' ELSE marketing_whatsapp_opt_out_at END
        WHERE tenant_id = ? AND user_id = ?
      `).run(input.granted ? 1 : 0, input.granted ? 1 : 0, input.granted ? 1 : 0, input.tenantId, input.userId)
      return { optedIn: input.granted }
    },
    createAppointmentForUser: input => {
      createdAppointments.push(input)
      return {
        id: 'appointment-created', serviceId: input.serviceId,
        startsAt: input.startsAt, endsAt: '2030-05-10T13:00:00.000Z',
        status: 'PENDING', confirmationStatus: 'NOT_REQUESTED',
      }
    },
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const jsonHeaders = { 'content-type': 'application/json' }

  try {
    const missingTenant = await fetch(`${baseUrl}/api/public/client-access/request`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'inexistente', phone: '+55 (79) 99999-0001' }),
    })
    assert.equal(missingTenant.status, 404)
    assert.equal((await missingTenant.json() as { code: string }).code, 'TENANT_NOT_FOUND')

    const unavailable = await fetch(`${baseUrl}/api/public/client-access/request`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'sem-whatsapp', phone: '+55 (79) 99999-0001' }),
    })
    assert.equal(unavailable.status, 400)
    assert.equal((await unavailable.json() as { code: string }).code, 'CLIENT_ACCESS_DELIVERY_UNAVAILABLE')

    const unknownPhone = await fetch(`${baseUrl}/api/public/client-access/request`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'STUDIO-AURORA', phone: '+55 (79) 99999-0099' }),
    })
    assert.deepEqual(await unknownPhone.json(), { sent: true })
    assert.equal(delivered.length, 0)

    const requested = await fetch(`${baseUrl}/api/public/client-access/request`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'studio-aurora', phone: '+55 (79) 99999-0001' }),
    })
    assert.deepEqual(await requested.json(), { sent: true })
    assert.equal((db.prepare(`SELECT consumed_at as consumedAt FROM client_login_codes WHERE id = 'old-code'`).get() as { consumedAt: string | null }).consumedAt !== null, true)
    assert.equal(delivered.length, 1)
    assert.deepEqual({ ...delivered[0], text: delivered[0].text.replace(/^\d{6}/, '<code>') }, {
      tenantId: tenantOne,
      phone: '5579999990001',
      text: '<code> é seu código de acesso ao Studio Aurora. Ele expira em 5 minutos. Não compartilhe este código.',
      options: { source: 'SYSTEM', persist: false },
    })
    const code = delivered[0].text.match(/^\d{6}/)?.[0]
    assert.ok(code)

    const invalid = await fetch(`${baseUrl}/api/public/client-access/verify`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'studio-aurora', phone: '+55 (79) 99999-0001', code: code === '000000' ? '111111' : '000000' }),
    })
    assert.equal(invalid.status, 401)
    assert.equal((await invalid.json() as { code: string }).code, 'INVALID_CLIENT_CODE')
    const activeCode = db.prepare(`SELECT id, attempts FROM client_login_codes WHERE consumed_at IS NULL AND user_id = 'user-one'`).get() as { id: string; attempts: number }
    assert.equal(activeCode.attempts, 1)

    const verified = await fetch(`${baseUrl}/api/public/client-access/verify`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'studio-aurora', phone: '+55 (79) 99999-0001', code }),
    })
    assert.equal(verified.status, 200)
    assert.deepEqual(await verified.json(), { user: { id: 'user-one', email: 'one@client.local', role: 'CLIENT', tenantId: tenantOne, tenantSlug: 'studio-aurora', name: 'Ana Aurora' } })
    assert.deepEqual(sessions, [{ userId: 'user-one', persistent: true }])
    assert.ok((db.prepare(`SELECT consumed_at as consumedAt FROM client_login_codes WHERE id = ?`).get(activeCode.id) as { consumedAt: string | null }).consumedAt)

    const reused = await fetch(`${baseUrl}/api/public/client-access/verify`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'studio-aurora', phone: '+55 (79) 99999-0001', code }),
    })
    assert.equal(reused.status, 401)
    assert.equal(sessions.length, 1)

    db.prepare(`INSERT INTO client_login_codes VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`)
      .run('expired-code', tenantTwo, 'user-two', hashCode(tenantTwo, 'user-two', '123456'), '2000-01-01T00:00:00.000Z', 0, '2031-01-01T00:00:00.000Z')
    const expired = await fetch(`${baseUrl}/api/public/client-access/verify`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'studio-externo', phone: '+55 (79) 99999-0002', code: '123456' }),
    })
    assert.equal(expired.status, 401)
    assert.equal((db.prepare(`SELECT attempts FROM client_login_codes WHERE id = 'expired-code'`).get() as { attempts: number }).attempts, 0)

    db.prepare(`UPDATE client_login_codes SET consumed_at = '2031-01-01T00:00:00.000Z' WHERE id = 'expired-code'`).run()
    db.prepare(`INSERT INTO client_login_codes VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`)
      .run('locked-code', tenantTwo, 'user-two', hashCode(tenantTwo, 'user-two', '654321'), '2099-01-01T00:00:00.000Z', 5, '2032-01-01T00:00:00.000Z')
    const locked = await fetch(`${baseUrl}/api/public/client-access/verify`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ tenantSlug: 'studio-externo', phone: '+55 (79) 99999-0002', code: '654321' }),
    })
    assert.equal(locked.status, 401)
    assert.equal((db.prepare(`SELECT attempts FROM client_login_codes WHERE id = 'locked-code'`).get() as { attempts: number }).attempts, 5)

    assert.deepEqual(requestLimiterOrder, ['request', 'phone', 'request', 'phone', 'request', 'phone', 'request', 'phone', 'verify', 'verify', 'verify', 'verify', 'verify'])

    assert.equal((await fetch(`${baseUrl}/api/client/appointments`)).status, 401)
    assert.equal((await fetch(`${baseUrl}/api/client/appointments`, { headers: { 'x-test-identity': 'admin' } })).status, 403)
    const invalidSession = await fetch(`${baseUrl}/api/client/appointments`, { headers: { 'x-test-identity': 'no-tenant' } })
    assert.equal(invalidSession.status, 400)
    assert.equal((await invalidSession.json() as { code: string }).code, 'INVALID_TENANT')

    const preferences = await fetch(`${baseUrl}/api/client/marketing-preferences`, { headers: { 'x-test-identity': 'one' } })
    assert.deepEqual(await preferences.json(), { preferences: { whatsappPromotions: true, optedInAt: '2030-01-01T00:00:00.000Z', optedOutAt: null } })
    const changed = await fetch(`${baseUrl}/api/client/marketing-preferences`, {
      method: 'PUT', headers: { ...jsonHeaders, 'x-test-identity': 'one' }, body: JSON.stringify({ whatsappPromotions: false }),
    })
    assert.deepEqual(await changed.json(), { preferences: { whatsappPromotions: false } })
    assert.deepEqual(consentChanges, [{ tenantId: tenantOne, userId: 'user-one', granted: false, source: 'CLIENT_PORTAL' }])
    const strictPreferences = await fetch(`${baseUrl}/api/client/marketing-preferences`, {
      method: 'PUT', headers: { ...jsonHeaders, 'x-test-identity': 'one' }, body: JSON.stringify({ whatsappPromotions: true, extra: true }),
    })
    assert.equal(strictPreferences.status, 400)
    assert.equal(consentChanges.length, 1)

    const appointments = await fetch(`${baseUrl}/api/client/appointments`, { headers: { 'x-test-identity': 'one' } })
    const result = await appointments.json() as {timezone:string;appointments:Array<{id:string;professionalName:string}>}
    assert.deepEqual(result.appointments.map(item=>item.id), ['appointment-new','appointment-old'])
    assert.equal(result.appointments[0].professionalName,'Beatriz')
    assert.equal(result.timezone,'America/Manaus')
    const foreignAppointments = await fetch(`${baseUrl}/api/client/appointments`, { headers: { 'x-test-identity': 'two' } })
    assert.deepEqual((await foreignAppointments.json() as { appointments: Array<{ id: string }> }).appointments.map(item => item.id), ['appointment-other'])

    const created = await fetch(`${baseUrl}/api/client/appointments`, {
      method: 'POST', headers: { ...jsonHeaders, 'x-test-identity': 'one' },
      body: JSON.stringify({ serviceId: serviceOne, startsAt: '2030-05-10T12:00:00.000Z' }),
    })
    assert.equal(created.status, 200)
    assert.equal((await created.json() as { appointment: { id: string } }).appointment.id, 'appointment-created')
    assert.deepEqual(createdAppointments, [{ tenantId: tenantOne, userId: 'user-one', serviceId: serviceOne, startsAt: '2030-05-10T12:00:00.000Z' }])
    const selected = await fetch(`${baseUrl}/api/client/appointments`,{method:'POST',headers:{...jsonHeaders,'x-test-identity':'one'},body:JSON.stringify({serviceId:serviceOne,startsAt:'2030-05-11T12:00:00.000Z',professionalId:'11111111-2222-4333-8444-555555555555'})})
    assert.equal(selected.status,200)
    assert.equal((createdAppointments[1] as {professionalId?:string}).professionalId,'11111111-2222-4333-8444-555555555555')
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
