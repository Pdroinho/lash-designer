import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createCustomerAppointmentService } from './customerAppointmentService.js'
import { HttpError } from './http.js'

const fixedNow = new Date('2030-07-01T12:00:00.000Z')
const tenantOne = 'tenant-one'
const tenantTwo = 'tenant-two'

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE services (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, duration_minutes INTEGER NOT NULL, active INTEGER NOT NULL
    );
    CREATE TABLE tenant_settings (tenant_id TEXT PRIMARY KEY, timezone TEXT NOT NULL);
    CREATE TABLE booking_rules (
      tenant_id TEXT PRIMARY KEY, min_notice_minutes INTEGER NOT NULL,
      max_future_days INTEGER NOT NULL, slot_step_minutes INTEGER NOT NULL
    );
    CREATE TABLE business_hours (
      tenant_id TEXT NOT NULL, weekday INTEGER NOT NULL, start_minute INTEGER NOT NULL, end_minute INTEGER NOT NULL
    );
    CREATE TABLE time_off (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL
    );
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, service_id TEXT NOT NULL,
      client_user_id TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      status TEXT NOT NULL, confirmation_status TEXT NOT NULL, created_at TEXT NOT NULL
    );

    INSERT INTO services VALUES
      ('service-one', '${tenantOne}', 60, 1),
      ('service-inactive', '${tenantOne}', 60, 0),
      ('service-invalid', '${tenantOne}', 0, 1),
      ('service-two', '${tenantTwo}', 60, 1);
    INSERT INTO tenant_settings VALUES ('${tenantOne}', 'UTC'), ('${tenantTwo}', 'UTC');
    INSERT INTO booking_rules VALUES ('${tenantOne}', 60, 60, 15), ('${tenantTwo}', 60, 60, 15);
    INSERT INTO business_hours VALUES
      ('${tenantOne}', 2, 540, 1020),
      ('${tenantTwo}', 2, 540, 1020);
  `)
  return db
}

function createService(db: Database.Database) {
  const scheduled: Array<{ tenantId: string; appointmentId: string }> = []
  let id = 0
  const service = createCustomerAppointmentService({
    db,
    now: () => new Date(fixedNow),
    randomId: () => `appointment-${++id}`,
    scheduleAppointmentAutomationJobs: (tenantId, appointmentId) => {
      scheduled.push({ tenantId, appointmentId })
    },
  })
  return { ...service, scheduled }
}

function expectCode(action: () => unknown, code: string) {
  assert.throws(action, error => error instanceof HttpError && error.code === code)
}

const validInput = {
  tenantId: tenantOne,
  userId: 'client-one',
  serviceId: 'service-one',
  startsAt: '2030-07-02T14:00:00.000Z',
}

test('cria agendamento pendente, persiste duração e agenda automações na mesma transação', () => {
  const db = createTestDb()
  const { createAppointmentForUser, scheduled } = createService(db)

  const appointment = createAppointmentForUser(validInput)

  assert.deepEqual(appointment, {
    id: 'appointment-1',
    serviceId: 'service-one',
    startsAt: '2030-07-02T14:00:00.000Z',
    endsAt: '2030-07-02T15:00:00.000Z',
    status: 'PENDING',
    confirmationStatus: 'NOT_REQUESTED',
  })
  assert.deepEqual(db.prepare(`SELECT * FROM appointments`).get(), {
    id: 'appointment-1',
    tenant_id: tenantOne,
    service_id: 'service-one',
    client_user_id: 'client-one',
    starts_at: '2030-07-02T14:00:00.000Z',
    ends_at: '2030-07-02T15:00:00.000Z',
    status: 'PENDING',
    confirmation_status: 'NOT_REQUESTED',
    created_at: fixedNow.toISOString(),
  })
  assert.deepEqual(scheduled, [{ tenantId: tenantOne, appointmentId: 'appointment-1' }])
  db.close()
})

test('exige serviço ativo do mesmo tenant e duração válida', () => {
  const db = createTestDb()
  const { createAppointmentForUser, scheduled } = createService(db)

  expectCode(() => createAppointmentForUser({ ...validInput, serviceId: 'missing' }), 'SERVICE_NOT_FOUND')
  expectCode(() => createAppointmentForUser({ ...validInput, serviceId: 'service-inactive' }), 'SERVICE_NOT_FOUND')
  expectCode(() => createAppointmentForUser({ ...validInput, serviceId: 'service-two' }), 'SERVICE_NOT_FOUND')
  expectCode(() => createAppointmentForUser({ ...validInput, serviceId: 'service-invalid' }), 'INVALID_SERVICE_DURATION')
  assert.equal(scheduled.length, 0)
  const count = db.prepare(`SELECT COUNT(*) AS total FROM appointments`).get() as { total: number }
  assert.equal(count.total, 0)
  db.close()
})

test('valida formato, antecedência mínima e horizonte máximo com relógio determinístico', () => {
  const db = createTestDb()
  const { createAppointmentForUser, scheduled } = createService(db)

  expectCode(() => createAppointmentForUser({ ...validInput, startsAt: 'sem-data' }), 'INVALID_DATE')
  expectCode(() => createAppointmentForUser({ ...validInput, startsAt: '2030-07-01T12:59:59.999Z' }), 'MIN_NOTICE')
  expectCode(() => createAppointmentForUser({ ...validInput, startsAt: '2030-08-31T12:00:00.001Z' }), 'MAX_FUTURE')
  assert.equal(scheduled.length, 0)
  db.close()
})

test('aplica timezone, expediente, alinhamento do slot e bloqueio de virada de dia', () => {
  const db = createTestDb()
  const { createAppointmentForUser, scheduled } = createService(db)

  db.prepare(`UPDATE tenant_settings SET timezone = 'Invalid/Timezone' WHERE tenant_id = ?`).run(tenantOne)
  expectCode(() => createAppointmentForUser(validInput), 'INVALID_TIMEZONE')
  db.prepare(`UPDATE tenant_settings SET timezone = 'UTC' WHERE tenant_id = ?`).run(tenantOne)

  expectCode(() => createAppointmentForUser({ ...validInput, startsAt: '2030-07-02T08:00:00.000Z' }), 'OUTSIDE_BUSINESS_HOURS')
  expectCode(() => createAppointmentForUser({ ...validInput, startsAt: '2030-07-02T14:07:00.000Z' }), 'OUTSIDE_BUSINESS_HOURS')

  db.prepare(`UPDATE services SET duration_minutes = 90 WHERE id = 'service-one'`).run()
  db.prepare(`UPDATE business_hours SET start_minute = 0, end_minute = 1440 WHERE tenant_id = ?`).run(tenantOne)
  expectCode(() => createAppointmentForUser({ ...validInput, startsAt: '2030-07-02T23:00:00.000Z' }), 'CROSS_DAY')

  db.prepare(`DELETE FROM business_hours WHERE tenant_id = ?`).run(tenantOne)
  db.prepare(`UPDATE services SET duration_minutes = 60 WHERE id = 'service-one'`).run()
  expectCode(() => createAppointmentForUser(validInput), 'BUSINESS_HOURS_EMPTY')
  assert.equal(scheduled.length, 0)
  db.close()
})

test('bloqueia folga e sobreposição ativa sem considerar cancelamentos ou outro tenant', () => {
  const db = createTestDb()
  const { createAppointmentForUser, scheduled } = createService(db)

  db.prepare(`INSERT INTO time_off VALUES ('off-one', ?, ?, ?)`).run(
    tenantOne,
    '2030-07-02T14:30:00.000Z',
    '2030-07-02T15:30:00.000Z',
  )
  db.prepare(`INSERT INTO time_off VALUES ('off-two', ?, ?, ?)`).run(
    tenantTwo,
    '2030-07-02T14:00:00.000Z',
    '2030-07-02T15:00:00.000Z',
  )
  expectCode(() => createAppointmentForUser(validInput), 'SLOT_UNAVAILABLE')
  db.prepare(`DELETE FROM time_off WHERE tenant_id = ?`).run(tenantOne)

  const insertExisting = db.prepare(`
    INSERT INTO appointments VALUES (?, ?, ?, ?, ?, ?, ?, 'NOT_REQUESTED', ?)
  `)
  insertExisting.run('cancelled', tenantOne, 'service-one', 'client-x', '2030-07-02T14:00:00.000Z', '2030-07-02T15:00:00.000Z', 'CANCELLED', fixedNow.toISOString())
  insertExisting.run('foreign', tenantTwo, 'service-two', 'client-y', '2030-07-02T14:00:00.000Z', '2030-07-02T15:00:00.000Z', 'PENDING', fixedNow.toISOString())
  const created = createAppointmentForUser(validInput)
  assert.equal(created.id, 'appointment-1')

  expectCode(() => createAppointmentForUser({ ...validInput, userId: 'client-next' }), 'SLOT_UNAVAILABLE')
  assert.deepEqual(scheduled, [{ tenantId: tenantOne, appointmentId: 'appointment-1' }])
  db.close()
})

test('usa regras padrão quando o tenant ainda não possui booking_rules', () => {
  const db = createTestDb()
  db.prepare(`DELETE FROM booking_rules WHERE tenant_id = ?`).run(tenantOne)
  const { createAppointmentForUser } = createService(db)

  const appointment = createAppointmentForUser(validInput)
  assert.equal(appointment.id, 'appointment-1')
  db.close()
})

test('falha na sincronização ou agendamento de automações não deixa agendamento parcial',()=>{
 const db=createTestDb()
 db.exec('CREATE TABLE test_side_effects (kind TEXT)')
 try {
  for(const failure of ['sync','jobs']) {
   const runtime=createCustomerAppointmentService({db,now:()=>fixedNow,syncClientConversation:()=>{db.prepare('INSERT INTO test_side_effects VALUES (?)').run('contact');if(failure==='sync')throw Error('sync fail')},scheduleAppointmentAutomationJobs:()=>{db.prepare('INSERT INTO test_side_effects VALUES (?)').run('jobs');if(failure==='jobs')throw Error('jobs fail')}})
   assert.throws(()=>runtime.createAppointmentForUser({tenantId:tenantOne,userId:'client-one',serviceId:'service-one',startsAt:'2030-07-02T13:00:00.000Z'}))
   assert.equal((db.prepare('SELECT COUNT(*) AS n FROM appointments').get() as {n:number}).n,0)
   assert.equal((db.prepare('SELECT COUNT(*) AS n FROM test_side_effects').get() as {n:number}).n,0)
  }
 }finally{db.close()}
})
