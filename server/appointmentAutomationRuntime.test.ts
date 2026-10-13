import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createAppointmentAutomationRuntime } from './appointmentAutomationRuntime.js'

const fixedNow = new Date('2030-07-01T12:00:00.000Z')
const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'

const defaultSettings = {
  confirmationsEnabled: true,
  confirmationOffsetHours: 24,
  confirmationRetryHours: 8,
  noResponseCutoffHours: 4,
  confirmationMessage: 'Oi {{nome}}, confirme {{servico}} em {{data}} às {{hora}} no {{espaco}}. {{codigo}}',
  remindersEnabled: true,
  reminderOffsetHours: 2,
  reminderMessage: 'Lembrete para {{nome}}: {{servico}} às {{hora}}.',
}

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE services (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE tenant_settings (tenant_id TEXT PRIMARY KEY, timezone TEXT);
    CREATE TABLE clients (
      user_id TEXT, tenant_id TEXT, name TEXT, phone TEXT, phone_normalized TEXT,
      PRIMARY KEY (user_id, tenant_id)
    );
    CREATE TABLE professionals (id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT);
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, service_id TEXT, client_user_id TEXT,
      starts_at TEXT, status TEXT, confirmation_status TEXT, confirmation_code TEXT,
      confirmation_sent_at TEXT, confirmation_reminder_sent_at TEXT,
      appointment_reminder_sent_at TEXT,professional_id TEXT
    );
    CREATE TABLE appointment_confirmation_events (
      id TEXT PRIMARY KEY, tenant_id TEXT, appointment_id TEXT, event_type TEXT,
      channel TEXT, provider_message_id TEXT, details_json TEXT, created_at TEXT
    );
    CREATE TABLE appointment_automation_jobs (
      id TEXT PRIMARY KEY, tenant_id TEXT, appointment_id TEXT, kind TEXT,
      idempotency_key TEXT UNIQUE, scheduled_at TEXT, status TEXT, attempts INTEGER,
      claimed_at TEXT, last_error TEXT, created_at TEXT, updated_at TEXT
    );
    INSERT INTO tenants VALUES
      ('${tenantOne}', 'Studio Aurora'),
      ('${tenantTwo}', 'Studio Lua');
    INSERT INTO services VALUES
      ('service-one', '${tenantOne}', 'Extensão clássica'),
      ('service-two', '${tenantTwo}', 'Volume brasileiro');
    INSERT INTO tenant_settings VALUES
      ('${tenantOne}', 'UTC'),
      ('${tenantTwo}', 'UTC');
    INSERT INTO clients VALUES
      ('client-one', '${tenantOne}', 'Ana', '+5511999999999', '5511999999999'),
      ('client-two', '${tenantTwo}', 'Bia', '+5511888888888', '5511888888888');
  `)
  return db
}

function insertAppointment(db: Database.Database, input: {
  id: string
  tenantId?: string
  startsAt: string
  status?: string
  confirmationStatus?: string
  confirmationCode?: string | null
  clientUserId?: string | null
}) {
  const tenantId = input.tenantId ?? tenantOne
  db.prepare(`
    INSERT INTO appointments
      (id, tenant_id, service_id, client_user_id, starts_at, status, confirmation_status, confirmation_code,
       confirmation_sent_at, confirmation_reminder_sent_at, appointment_reminder_sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
  `).run(
    input.id,
    tenantId,
    tenantId === tenantOne ? 'service-one' : 'service-two',
    input.clientUserId === undefined ? (tenantId === tenantOne ? 'client-one' : 'client-two') : input.clientUserId,
    input.startsAt,
    input.status ?? 'PENDING',
    input.confirmationStatus ?? 'NOT_REQUESTED',
    input.confirmationCode ?? null,
  )
}

function createRuntime(db: Database.Database, overrides: Partial<Parameters<typeof createAppointmentAutomationRuntime>[0]> = {}) {
  let id = 0
  return createAppointmentAutomationRuntime({
    db,
    getSettings: () => defaultSettings,
    configureWebhook: async () => true,
    sendWhatsappText: async () => true,
    now: () => new Date(fixedNow),
    randomId: () => `generated-${++id}`,
    ...overrides,
  })
}

test('runtime de automações agenda quatro jobs idempotentes e isola o tenant', () => {
  const db = createTestDb()
  insertAppointment(db, { id: 'appointment-one', startsAt: '2030-07-03T12:00:00.000Z' })
  insertAppointment(db, { id: 'appointment-two', tenantId: tenantTwo, startsAt: '2030-07-03T12:00:00.000Z' })
  const runtime = createRuntime(db)

  runtime.scheduleAppointmentAutomationJobsForTenant(tenantOne)
  runtime.scheduleAppointmentAutomationJobsForTenant(tenantOne)
  const jobs = db.prepare(`SELECT tenant_id as tenantId, kind, scheduled_at as scheduledAt, status FROM appointment_automation_jobs ORDER BY scheduled_at`).all() as Array<Record<string, unknown>>
  assert.deepEqual(jobs, [
    { tenantId: tenantOne, kind: 'CONFIRMATION_REQUEST', scheduledAt: '2030-07-02T12:00:00.000Z', status: 'PENDING' },
    { tenantId: tenantOne, kind: 'CONFIRMATION_RETRY', scheduledAt: '2030-07-02T20:00:00.000Z', status: 'PENDING' },
    { tenantId: tenantOne, kind: 'NO_RESPONSE_CUTOFF', scheduledAt: '2030-07-03T08:00:00.000Z', status: 'PENDING' },
    { tenantId: tenantOne, kind: 'APPOINTMENT_REMINDER', scheduledAt: '2030-07-03T10:00:00.000Z', status: 'PENDING' },
  ])

  db.prepare(`UPDATE appointments SET status = 'CANCELLED' WHERE id = 'appointment-one'`).run()
  runtime.scheduleAppointmentAutomationJobs(tenantOne, 'appointment-one')
  const cancelled = db.prepare(`SELECT COUNT(*) as n FROM appointment_automation_jobs WHERE status = 'CANCELLED'`).get() as { n: number }
  assert.equal(cancelled.n, 4)
  db.close()
})

test('runtime envia confirmação uma vez, remove código legado e bloqueia sobreposição', async () => {
  const db = createTestDb()
  insertAppointment(db, {
    id: 'appointment-confirm',
    startsAt: '2030-07-01T14:00:00.000Z',
    confirmationCode: 'LEGACY-123',
  })
  let releaseSend!: () => void
  let markSendStarted!: () => void
  const sendStarted = new Promise<void>(resolve => { markSendStarted = resolve })
  const sendRelease = new Promise<void>(resolve => { releaseSend = resolve })
  const messages: string[] = []
  const runtime = createRuntime(db, {
    getSettings: () => ({ ...defaultSettings, remindersEnabled: false }),
    sendWhatsappText: async (_tenantId, _phone, text, options) => {
      messages.push(text)
      options?.onProviderMessageId?.('provider-confirm')
      markSendStarted()
      await sendRelease
      return true
    },
  })
  runtime.scheduleAppointmentAutomationJobs(tenantOne, 'appointment-confirm')

  const firstRun = runtime.processQueue()
  await sendStarted
  await runtime.processQueue()
  assert.equal(messages.length, 1)
  releaseSend()
  await firstRun

  assert.ok(!messages[0].includes('LEGACY-123'))
  const appointment = db.prepare(`SELECT confirmation_status as status, confirmation_sent_at as sentAt FROM appointments WHERE id = 'appointment-confirm'`).get() as { status: string; sentAt: string }
  assert.deepEqual(appointment, { status: 'AWAITING_CONFIRMATION', sentAt: fixedNow.toISOString() })
  const job = db.prepare(`SELECT status, attempts FROM appointment_automation_jobs WHERE appointment_id = 'appointment-confirm'`).get() as { status: string; attempts: number }
  assert.deepEqual(job, { status: 'DONE', attempts: 1 })
  const event = db.prepare(`SELECT event_type as type, provider_message_id as providerId FROM appointment_confirmation_events WHERE appointment_id = 'appointment-confirm'`).get() as Record<string, unknown>
  assert.deepEqual(event, { type: 'REQUEST_SENT', providerId: 'provider-confirm' })
  db.close()
})

test('runtime recupera lease vencido, limita tentativas e registra falha terminal', async () => {
  const db = createTestDb()
  insertAppointment(db, { id: 'appointment-fail', startsAt: '2030-07-02T12:00:00.000Z' })
  db.prepare(`
    INSERT INTO appointment_automation_jobs
      (id, tenant_id, appointment_id, kind, idempotency_key, scheduled_at, status, attempts, claimed_at, last_error, created_at, updated_at)
    VALUES ('stale-job', ?, 'appointment-fail', 'CONFIRMATION_REQUEST', 'appointment-fail:CONFIRMATION_REQUEST',
            '2030-07-01T10:00:00.000Z', 'PROCESSING', 4, '2030-07-01T11:30:00.000Z', NULL,
            '2030-06-01T00:00:00.000Z', '2030-07-01T11:30:00.000Z')
  `).run(tenantOne)
  const runtime = createRuntime(db, { configureWebhook: async () => false })
  await runtime.processQueue()

  const job = db.prepare(`SELECT status, attempts, claimed_at as claimedAt, scheduled_at as scheduledAt, last_error as error FROM appointment_automation_jobs WHERE id = 'stale-job'`).get() as Record<string, unknown>
  assert.deepEqual(job, {
    status: 'FAILED', attempts: 5, claimedAt: null,
    scheduledAt: '2030-07-01T13:00:00.000Z', error: 'WHATSAPP_WEBHOOK_NOT_READY',
  })
  const failedAppointment = db.prepare(`SELECT confirmation_status as status FROM appointments WHERE id = 'appointment-fail'`).get() as { status: string }
  assert.equal(failedAppointment.status, 'DELIVERY_FAILED')
  const events = db.prepare(`SELECT event_type as type FROM appointment_confirmation_events WHERE appointment_id = 'appointment-fail' ORDER BY rowid`).all() as Array<{ type: string }>
  assert.deepEqual(events.map(event => event.type), ['WEBHOOK_CONFIG_FAILED', 'DELIVERY_FAILED'])
  db.close()
})

test('runtime processa cutoff e lembrete somente nos estados permitidos', async () => {
  const db = createTestDb()
  insertAppointment(db, { id: 'appointment-cutoff', startsAt: '2030-07-01T15:00:00.000Z', confirmationStatus: 'AWAITING_CONFIRMATION' })
  insertAppointment(db, { id: 'appointment-reminder', startsAt: '2030-07-01T15:00:00.000Z', confirmationStatus: 'CONFIRMED' })
  db.exec(`
    INSERT INTO appointment_automation_jobs VALUES
      ('cutoff-job', '${tenantOne}', 'appointment-cutoff', 'NO_RESPONSE_CUTOFF', 'appointment-cutoff:NO_RESPONSE_CUTOFF', '2030-07-01T11:00:00.000Z', 'PENDING', 0, NULL, NULL, '2030-06-01T00:00:00.000Z', '2030-06-01T00:00:00.000Z'),
      ('reminder-job', '${tenantOne}', 'appointment-reminder', 'APPOINTMENT_REMINDER', 'appointment-reminder:APPOINTMENT_REMINDER', '2030-07-01T11:01:00.000Z', 'PENDING', 0, NULL, NULL, '2030-06-01T00:00:00.000Z', '2030-06-01T00:00:00.000Z');
  `)
  const messages: string[] = []
  const runtime = createRuntime(db, {
    sendWhatsappText: async (_tenantId, _phone, text) => { messages.push(text); return true },
  })
  await runtime.processQueue()

  const cutoff = db.prepare(`SELECT confirmation_status as status FROM appointments WHERE id = 'appointment-cutoff'`).get() as { status: string }
  const reminder = db.prepare(`SELECT appointment_reminder_sent_at as sentAt FROM appointments WHERE id = 'appointment-reminder'`).get() as { sentAt: string }
  assert.equal(cutoff.status, 'NO_RESPONSE')
  assert.equal(reminder.sentAt, fixedNow.toISOString())
  assert.deepEqual(messages, ['Lembrete para Ana: Extensão clássica às 15:00.'])
  const statuses = db.prepare(`SELECT status FROM appointment_automation_jobs ORDER BY id`).all() as Array<{ status: string }>
  assert.deepEqual(statuses.map(row => row.status), ['DONE', 'DONE'])
  db.close()
})

test('runtime centraliza timers e shutdown de forma idempotente', () => {
  const db = createTestDb()
  type FakeTimer = { kind: 'interval' | 'timeout'; delayMs: number; unref: () => void }
  const timers: FakeTimer[] = []
  const cleared: FakeTimer[] = []
  let unrefCount = 0
  const runtime = createRuntime(db, {
    scheduler: {
      setInterval: (_callback, delayMs) => {
        const timer: FakeTimer = { kind: 'interval', delayMs, unref: () => { unrefCount += 1 } }
        timers.push(timer)
        return timer
      },
      setTimeout: (_callback, delayMs) => {
        const timer: FakeTimer = { kind: 'timeout', delayMs, unref: () => { unrefCount += 1 } }
        timers.push(timer)
        return timer
      },
      clearInterval: timer => { cleared.push(timer as FakeTimer) },
      clearTimeout: timer => { cleared.push(timer as FakeTimer) },
    },
  })

  runtime.start()
  runtime.start()
  assert.deepEqual(timers.map(timer => [timer.kind, timer.delayMs]), [['interval', 60_000], ['timeout', 12_000]])
  assert.equal(unrefCount, 2)
  runtime.stop()
  runtime.stop()
  assert.deepEqual(cleared.map(timer => timer.kind), ['interval', 'timeout'])
  db.close()
})

test('mensagens incluem profissional, preservam template personalizado e isolam outro estúdio', () => {
 const db=createTestDb(),runtime=createRuntime(db)
 try {
  insertAppointment(db,{id:'staff-appointment',startsAt:'2030-07-02T12:00:00.000Z'})
  db.prepare('INSERT INTO professionals VALUES (?,?,?)').run('person',tenantOne,'Camila')
  db.prepare('UPDATE appointments SET professional_id=? WHERE id=?').run('person','staff-appointment')
  const appointment=runtime.confirmationAppointmentById(tenantOne,'staff-appointment');assert.ok(appointment)
  assert.equal(appointment.professionalName,'Camila')
  assert.equal(runtime.renderAppointmentTemplate('Oi {{nome}}, com {{profissional}}',appointment),'Oi Ana, com Camila')
  assert.match(runtime.renderAppointmentTemplate('Meu texto personalizado',appointment),/^Meu texto personalizado\nProfissional: Camila\.$/)
  db.prepare('UPDATE professionals SET tenant_id=? WHERE id=?').run(tenantTwo,'person')
  const isolated=runtime.confirmationAppointmentById(tenantOne,'staff-appointment');assert.ok(isolated)
  assert.equal(isolated.professionalName,null)
  assert.equal(runtime.renderAppointmentTemplate('Com {{profissional}}',isolated),'Com equipe do estúdio')
 }finally{db.close()}
})
