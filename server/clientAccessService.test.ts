import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createClientAccessService } from './clientAccessService.js'
import { HttpError } from './http.js'

const fixedNow = new Date('2030-01-01T12:00:00.000Z')
const tenantOne = 'tenant-one'
const tenantTwo = 'tenant-two'

const hashCode = (tenantId: string, userId: string, code: string) =>
  createHash('sha256').update(`${tenantId}:${userId}:${code}`).digest('hex')

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT UNIQUE, name TEXT, status TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT);
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT, phone_normalized TEXT
    );
    CREATE TABLE client_login_codes (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, code_hash TEXT,
      expires_at TEXT, attempts INTEGER, consumed_at TEXT, created_at TEXT
    );
    INSERT INTO tenants VALUES
      ('${tenantOne}', 'studio-aurora', 'Studio Aurora', 'ACTIVE'),
      ('${tenantTwo}', 'studio-lua', 'Studio Lua', 'ACTIVE'),
      ('tenant-offline', 'sem-whatsapp', 'Sem WhatsApp', 'ACTIVE'),
      ('tenant-suspended', 'suspenso', 'Suspenso', 'SUSPENDED');
    INSERT INTO users VALUES
      ('user-one', '${tenantOne}', 'ana@example.com'),
      ('user-two', '${tenantTwo}', 'bia@example.com');
    INSERT INTO clients VALUES
      ('client-one', '${tenantOne}', 'user-one', 'Ana', '5579999990001'),
      ('client-two', '${tenantTwo}', 'user-two', 'Bia', '5579999990001');
    INSERT INTO client_login_codes VALUES
      ('old-code', '${tenantOne}', 'user-one', 'old-hash', '2030-01-01T13:00:00.000Z', 0, NULL, '2029-12-31T12:00:00.000Z');
  `)
  return db
}

function createService(db: Database.Database, deliveredResult = true) {
  const delivered: Array<{ tenantId: string; phone: string; text: string; options?: { source?: 'SYSTEM'; persist?: boolean } }> = []
  const warnings: string[] = []
  let id = 0
  const service = createClientAccessService({
    db,
    normalizePhone: raw => raw.replace(/\D/g, ''),
    requireWhatsappConfig: tenantId => tenantId === 'tenant-offline'
      ? undefined
      : { baseUrl: 'https://evolution.test', apiKey: 'secret', instanceName: `instance-${tenantId}` },
    hashCode,
    sendWhatsappText: async (tenantId, phone, text, options) => {
      delivered.push({ tenantId, phone, text, options })
      return deliveredResult
    },
    now: () => new Date(fixedNow),
    randomId: () => `code-${++id}`,
    randomCode: () => '123456',
    logger: { warn: message => warnings.push(String(message)) },
  })
  return { ...service, delivered, warnings }
}

function expectCode(action: () => unknown, code: string) {
  assert.throws(action, error => error instanceof HttpError && error.code === code)
}

test('emite OTP de cinco minutos, invalida o anterior e preserva isolamento por tenant', async () => {
  const db = createTestDb()
  const { requestClientAccess, delivered } = createService(db)

  assert.deepEqual(await requestClientAccess({ tenantSlug: ' STUDIO-AURORA ', phone: '+55 (79) 99999-0001' }), { sent: true })
  const rows = db.prepare(`
    SELECT id, tenant_id as tenantId, user_id as userId, code_hash as codeHash,
           expires_at as expiresAt, attempts, consumed_at as consumedAt, created_at as createdAt
    FROM client_login_codes ORDER BY created_at
  `).all() as Array<Record<string, unknown>>
  assert.equal(rows[0].consumedAt, fixedNow.toISOString())
  assert.deepEqual(rows[1], {
    id: 'code-1',
    tenantId: tenantOne,
    userId: 'user-one',
    codeHash: hashCode(tenantOne, 'user-one', '123456'),
    expiresAt: '2030-01-01T12:05:00.000Z',
    attempts: 0,
    consumedAt: null,
    createdAt: fixedNow.toISOString(),
  })
  assert.deepEqual(delivered, [{
    tenantId: tenantOne,
    phone: '5579999990001',
    text: '123456 é seu código de acesso ao Studio Aurora. Ele expira em 5 minutos. Não compartilhe este código.',
    options: { source: 'SYSTEM', persist: false },
  }])
  const foreignCount = db.prepare(`SELECT COUNT(*) AS total FROM client_login_codes WHERE tenant_id = ?`).get(tenantTwo) as { total: number }
  assert.equal(foreignCount.total, 0)
  db.close()
})

test('mantém resposta antienumeração e exige tenant ativo com WhatsApp configurado', async () => {
  const db = createTestDb()
  const { requestClientAccess, delivered } = createService(db)

  assert.deepEqual(await requestClientAccess({ tenantSlug: 'studio-aurora', phone: '5579999999999' }), { sent: true })
  assert.equal(delivered.length, 0)
  await assert.rejects(
    requestClientAccess({ tenantSlug: 'sem-whatsapp', phone: '5579999990001' }),
    error => error instanceof HttpError && error.code === 'CLIENT_ACCESS_DELIVERY_UNAVAILABLE',
  )
  await assert.rejects(
    requestClientAccess({ tenantSlug: 'suspenso', phone: '5579999990001' }),
    error => error instanceof HttpError && error.code === 'TENANT_NOT_FOUND',
  )
  db.close()
})

test('incrementa tentativa, compara hash, consome uma vez e cria sessão persistente pelo callback', async () => {
  const db = createTestDb()
  const { requestClientAccess, verifyClientAccess } = createService(db)
  await requestClientAccess({ tenantSlug: 'studio-aurora', phone: '5579999990001' })
  const verified: string[] = []

  expectCode(() => verifyClientAccess({
    tenantSlug: 'studio-aurora', phone: '5579999990001', code: '000000',
    onVerified: userId => verified.push(userId),
  }), 'INVALID_CLIENT_CODE')
  assert.equal((db.prepare(`SELECT attempts FROM client_login_codes WHERE id = 'code-1'`).get() as { attempts: number }).attempts, 1)

  const user = verifyClientAccess({
    tenantSlug: 'studio-aurora', phone: '5579999990001', code: '123456',
    onVerified: userId => verified.push(userId),
  })
  assert.deepEqual(user, {
    id: 'user-one', email: 'ana@example.com', role: 'CLIENT',
    tenantId: tenantOne, tenantSlug: 'studio-aurora', name: 'Ana',
  })
  assert.deepEqual(verified, ['user-one'])
  assert.deepEqual(db.prepare(`SELECT attempts, consumed_at as consumedAt FROM client_login_codes WHERE id = 'code-1'`).get(), {
    attempts: 2,
    consumedAt: fixedNow.toISOString(),
  })
  expectCode(() => verifyClientAccess({
    tenantSlug: 'studio-aurora', phone: '5579999990001', code: '123456',
    onVerified: userId => verified.push(userId),
  }), 'INVALID_CLIENT_CODE')
  assert.deepEqual(verified, ['user-one'])
  db.close()
})

test('rejeita código expirado, bloqueado, desconhecido ou de outro tenant sem gastar tentativa', () => {
  const db = createTestDb()
  db.prepare(`INSERT INTO client_login_codes VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`).run(
    'expired', tenantOne, 'user-one', hashCode(tenantOne, 'user-one', '123456'),
    '2030-01-01T11:59:59.999Z', 0, '2029-12-31T13:00:00.000Z',
  )
  const { verifyClientAccess } = createService(db)
  const onVerified = () => assert.fail('não deve abrir sessão')

  expectCode(() => verifyClientAccess({ tenantSlug: 'studio-aurora', phone: '5579999990001', code: '123456', onVerified }), 'INVALID_CLIENT_CODE')
  assert.equal((db.prepare(`SELECT attempts FROM client_login_codes WHERE id = 'expired'`).get() as { attempts: number }).attempts, 0)
  db.prepare(`UPDATE client_login_codes SET expires_at = '2030-01-01T13:00:00.000Z', attempts = 5 WHERE id = 'expired'`).run()
  expectCode(() => verifyClientAccess({ tenantSlug: 'studio-aurora', phone: '5579999990001', code: '123456', onVerified }), 'INVALID_CLIENT_CODE')
  assert.equal((db.prepare(`SELECT attempts FROM client_login_codes WHERE id = 'expired'`).get() as { attempts: number }).attempts, 5)
  expectCode(() => verifyClientAccess({ tenantSlug: 'studio-lua', phone: '5579999990001', code: '123456', onVerified }), 'INVALID_CLIENT_CODE')
  expectCode(() => verifyClientAccess({ tenantSlug: 'studio-aurora', phone: '5579999999999', code: '123456', onVerified }), 'INVALID_CLIENT_CODE')
  db.close()
})

test('falha de entrega não enumera a cliente e gera aviso sem expor telefone ou código', async () => {
  const db = createTestDb()
  const { requestClientAccess, warnings } = createService(db, false)

  assert.deepEqual(await requestClientAccess({ tenantSlug: 'studio-aurora', phone: '5579999990001' }), { sent: true })
  assert.deepEqual(warnings, [`[ClientAccess] falha de entrega para tenant ${tenantOne}`])
  assert.ok(!warnings[0].includes('5579999990001'))
  assert.ok(!warnings[0].includes('123456'))
  db.close()
})
