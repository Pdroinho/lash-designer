import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import {
  createClientMarketingConsentService,
  MARKETING_WHATSAPP_CONSENT_TEXT,
  MARKETING_WHATSAPP_CONSENT_VERSION,
} from './clientMarketingConsentService.js'
import { HttpError } from './http.js'

const fixedNow = new Date('2030-06-01T12:00:00.000Z')
const tenantOne = 'tenant-one'
const tenantTwo = 'tenant-two'

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE clients (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      marketing_whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
      marketing_whatsapp_opt_in_at TEXT,
      marketing_whatsapp_opt_out_at TEXT,
      marketing_consent_version TEXT,
      marketing_consent_source TEXT,
      PRIMARY KEY (tenant_id, user_id)
    );
    CREATE TABLE client_marketing_consent_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('GRANTED', 'WITHDRAWN', 'DECLINED')),
      policy_version TEXT NOT NULL,
      consent_text TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO clients VALUES
      ('${tenantOne}', 'user-one', 0, NULL, NULL, NULL, NULL),
      ('${tenantTwo}', 'user-two', 1, '2030-05-01T12:00:00.000Z', NULL, 'old-version', 'OLD_SOURCE');
  `)
  return db
}

function createService(db: Database.Database, randomId = () => 'event-one') {
  return createClientMarketingConsentService({
    db,
    now: () => new Date(fixedNow),
    randomId,
  })
}

test('concede opt-in com versão, texto e evento auditável no tenant correto', () => {
  const db = createTestDb()
  const { setClientWhatsappMarketingConsent } = createService(db)

  assert.deepEqual(setClientWhatsappMarketingConsent({
    tenantId: tenantOne,
    userId: 'user-one',
    granted: true,
    source: 'PUBLIC_BOOKING',
  }), { changed: true, optedIn: true })
  assert.deepEqual(db.prepare(`SELECT * FROM clients WHERE tenant_id = ? AND user_id = ?`).get(tenantOne, 'user-one'), {
    tenant_id: tenantOne,
    user_id: 'user-one',
    marketing_whatsapp_opt_in: 1,
    marketing_whatsapp_opt_in_at: fixedNow.toISOString(),
    marketing_whatsapp_opt_out_at: null,
    marketing_consent_version: MARKETING_WHATSAPP_CONSENT_VERSION,
    marketing_consent_source: 'PUBLIC_BOOKING',
  })
  assert.deepEqual(db.prepare(`SELECT * FROM client_marketing_consent_events`).get(), {
    id: 'event-one',
    tenant_id: tenantOne,
    client_user_id: 'user-one',
    channel: 'WHATSAPP',
    action: 'GRANTED',
    policy_version: MARKETING_WHATSAPP_CONSENT_VERSION,
    consent_text: MARKETING_WHATSAPP_CONSENT_TEXT,
    source: 'PUBLIC_BOOKING',
    created_at: fixedNow.toISOString(),
  })
  const foreign = db.prepare(`SELECT marketing_whatsapp_opt_in as optedIn FROM clients WHERE tenant_id = ?`).get(tenantTwo) as { optedIn: number }
  assert.equal(foreign.optedIn, 1)
  db.close()
})

test('mudança idempotente não regrava metadados nem cria evento duplicado', () => {
  const db = createTestDb()
  const { setClientWhatsappMarketingConsent } = createService(db)

  assert.deepEqual(setClientWhatsappMarketingConsent({
    tenantId: tenantOne,
    userId: 'user-one',
    granted: false,
    source: 'CLIENT_PORTAL',
  }), { changed: false, optedIn: false })
  assert.deepEqual(db.prepare(`
    SELECT marketing_consent_version as version, marketing_consent_source as source
    FROM clients WHERE tenant_id = ? AND user_id = ?
  `).get(tenantOne, 'user-one'), { version: null, source: null })
  assert.equal((db.prepare(`SELECT COUNT(*) as total FROM client_marketing_consent_events`).get() as { total: number }).total, 0)
  db.close()
})

test('retirada preserva data do opt-in, registra opt-out e limpa futura autorização', () => {
  const db = createTestDb()
  const { setClientWhatsappMarketingConsent } = createService(db)

  assert.deepEqual(setClientWhatsappMarketingConsent({
    tenantId: tenantTwo,
    userId: 'user-two',
    granted: false,
    source: 'WHATSAPP_KEYWORD',
  }), { changed: true, optedIn: false })
  assert.deepEqual(db.prepare(`
    SELECT marketing_whatsapp_opt_in as optedIn,
           marketing_whatsapp_opt_in_at as optedInAt,
           marketing_whatsapp_opt_out_at as optedOutAt,
           marketing_consent_version as version,
           marketing_consent_source as source
    FROM clients WHERE tenant_id = ? AND user_id = ?
  `).get(tenantTwo, 'user-two'), {
    optedIn: 0,
    optedInAt: '2030-05-01T12:00:00.000Z',
    optedOutAt: fixedNow.toISOString(),
    version: MARKETING_WHATSAPP_CONSENT_VERSION,
    source: 'WHATSAPP_KEYWORD',
  })
  assert.equal((db.prepare(`SELECT action FROM client_marketing_consent_events`).get() as { action: string }).action, 'WITHDRAWN')
  db.close()
})

test('falha ao registrar evidência reverte o estado e cliente fora do tenant não é alterada', () => {
  const db = createTestDb()
  db.prepare(`
    INSERT INTO client_marketing_consent_events
      (id, tenant_id, client_user_id, channel, action, policy_version, consent_text, source, created_at)
    VALUES ('duplicate', ?, 'user-one', 'WHATSAPP', 'GRANTED', 'old', 'old', 'OLD_SOURCE', '2029-01-01T00:00:00.000Z')
  `).run(tenantOne)
  const { setClientWhatsappMarketingConsent } = createService(db, () => 'duplicate')

  assert.throws(() => setClientWhatsappMarketingConsent({
    tenantId: tenantOne,
    userId: 'user-one',
    granted: true,
    source: 'CLIENT_PORTAL',
  }))
  const current = db.prepare(`
    SELECT marketing_whatsapp_opt_in as optedIn, marketing_consent_version as version
    FROM clients WHERE tenant_id = ? AND user_id = ?
  `).get(tenantOne, 'user-one') as { optedIn: number; version: string | null }
  assert.deepEqual(current, { optedIn: 0, version: null })
  assert.throws(
    () => setClientWhatsappMarketingConsent({ tenantId: tenantOne, userId: 'user-two', granted: false, source: 'CLIENT_PORTAL' }),
    error => error instanceof HttpError && error.code === 'CLIENT_NOT_FOUND',
  )
  db.close()
})
