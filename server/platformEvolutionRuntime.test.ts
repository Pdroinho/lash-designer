import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createPlatformEvolutionRuntime } from './platformEvolutionRuntime.js'

const fixedNow = new Date('2030-09-01T12:00:00.000Z')
const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT, encrypted INTEGER DEFAULT 0, updated_at TEXT);
    CREATE TABLE whatsapp_instances (
      id TEXT PRIMARY KEY, tenant_id TEXT, api_key TEXT, updated_at TEXT
    );
  `)
  return db
}

function createRuntime(db: Database.Database, overrides: Partial<Parameters<typeof createPlatformEvolutionRuntime>[0]> = {}) {
  return createPlatformEvolutionRuntime({
    db,
    environmentBaseUrl: 'https://env.example',
    environmentApiKey: 'env-secret',
    environmentInstanceName: 'env-instance',
    resolveExternalHttpsBaseUrl: async raw => raw.replace(/\/$/, ''),
    now: () => new Date(fixedNow),
    encryptSecretFn: (value, purpose) => `encrypted:${purpose}:${value}`,
    decryptSecretFn: (value, purpose) => {
      const prefix = `encrypted:${purpose}:`
      if (!value.startsWith(prefix)) throw new Error('wrong secret context')
      return value.slice(prefix.length)
    },
    isEncryptedSecretFn: value => value.startsWith('encrypted:'),
    ...overrides,
  })
}

test('migração cifra segredos legados com contexto separado e permanece idempotente', () => {
  const db = createTestDb()
  db.exec(`
    INSERT INTO platform_settings VALUES ('evolution_api_key', 'platform-plain', 0, '2020-01-01T00:00:00.000Z');
    INSERT INTO whatsapp_instances VALUES
      ('instance-one', '${tenantOne}', 'tenant-one-plain', '2020-01-01T00:00:00.000Z'),
      ('instance-two', '${tenantTwo}', 'tenant-two-plain', '2020-01-01T00:00:00.000Z');
  `)
  const runtime = createRuntime(db)
  runtime.migrateEvolutionSecretsAtRest()
  runtime.migrateEvolutionSecretsAtRest()

  const platform = db.prepare(`SELECT value, encrypted, updated_at as updatedAt FROM platform_settings`).get()
  assert.deepEqual(platform, {
    value: 'encrypted:evolution:platform:api-key:platform-plain',
    encrypted: 1,
    updatedAt: fixedNow.toISOString(),
  })
  const tenants = db.prepare(`SELECT tenant_id as tenantId, api_key as apiKey, updated_at as updatedAt FROM whatsapp_instances ORDER BY tenant_id`).all()
  assert.deepEqual(tenants, [
    { tenantId: tenantOne, apiKey: `encrypted:evolution:tenant:${tenantOne}:api-key:tenant-one-plain`, updatedAt: fixedNow.toISOString() },
    { tenantId: tenantTwo, apiKey: `encrypted:evolution:tenant:${tenantTwo}:api-key:tenant-two-plain`, updatedAt: fixedNow.toISOString() },
  ])
  db.close()
})

test('startup falha diante de ciphertext no contexto errado sem substituir o segredo', () => {
  const db = createTestDb()
  const ciphertext = `encrypted:evolution:tenant:${tenantTwo}:api-key:foreign-secret`
  db.prepare(`INSERT INTO whatsapp_instances VALUES ('instance-one', ?, ?, '2020-01-01T00:00:00.000Z')`).run(tenantOne, ciphertext)
  const runtime = createRuntime(db)
  assert.throws(() => runtime.migrateEvolutionSecretsAtRest(), /wrong secret context/)
  const stored = db.prepare(`SELECT api_key as apiKey, updated_at as updatedAt FROM whatsapp_instances`).get()
  assert.deepEqual(stored, { apiKey: ciphertext, updatedAt: '2020-01-01T00:00:00.000Z' })
  db.close()
})

test('configuração persistida prevalece e fallback de ambiente continua disponível', () => {
  const db = createTestDb()
  const runtime = createRuntime(db)
  assert.deepEqual(runtime.platformEvolutionConfig(), {
    baseUrl: 'https://env.example', apiKey: 'env-secret', instanceName: 'env-instance',
  })
  db.exec(`
    INSERT INTO platform_settings VALUES
      ('evolution_api_url', 'https://stored.example', 0, '${fixedNow.toISOString()}'),
      ('evolution_api_key', 'encrypted:evolution:platform:api-key:stored-secret', 1, '${fixedNow.toISOString()}'),
      ('evolution_instance_name', 'stored-instance', 0, '${fixedNow.toISOString()}');
  `)
  assert.deepEqual(runtime.platformEvolutionConfig(), {
    baseUrl: 'https://stored.example', apiKey: 'stored-secret', instanceName: 'stored-instance',
  })
  assert.equal(runtime.encryptPlatformApiKey('new-platform'), 'encrypted:evolution:platform:api-key:new-platform')
  assert.equal(runtime.encryptTenantApiKey('new-tenant', tenantOne), `encrypted:evolution:tenant:${tenantOne}:api-key:new-tenant`)
  db.close()
})

test('telefone de MFA é normalizado e mascarado sem expor o número completo', () => {
  const db = createTestDb()
  const runtime = createRuntime(db)
  assert.equal(runtime.normalizeUserE164Phone('(11) 99999-9999'), '+5511999999999')
  assert.equal(runtime.maskE164Phone('+55 11 99999-9999'), '+55 11 *****-9999')
  assert.equal(runtime.maskE164Phone('123'), 'WhatsApp cadastrado')
  assert.throws(() => runtime.normalizeUserE164Phone('123'), (error: unknown) => {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'INVALID_PHONE')
  })
  db.close()
})

test('envio global resolve URL segura, bloqueia redirect e preserva payload do OTP', async () => {
  const db = createTestDb()
  const resolved: string[] = []
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const runtime = createRuntime(db, {
    resolveExternalHttpsBaseUrl: async raw => { resolved.push(raw); return raw.replace(/\/$/, '') },
    fetchFn: (async (input, init) => {
      requests.push({ url: String(input), init })
      return new Response('{}', { status: 200 })
    }) as typeof fetch,
  })
  assert.equal(await runtime.sendPlatformWhatsappText('5511999999999', 'Seu código é 123456'), true)
  assert.equal(await runtime.sendPlatformWhatsappText('123', 'não enviar'), false)
  assert.deepEqual(resolved, ['https://env.example'])
  assert.equal(requests[0].url, 'https://env.example/message/sendText/env-instance')
  assert.equal(requests[0].init?.redirect, 'error')
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    number: '5511999999999', text: 'Seu código é 123456', textMessage: 'Seu código é 123456',
  })
  db.close()
})
