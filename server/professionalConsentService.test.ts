import assert from 'node:assert/strict'
import test from 'node:test'
import type { Request } from 'express'
import Database from 'better-sqlite3'
import { HttpError } from './http.js'
import {
  LEGAL_BUNDLE_VERSION,
  PLATFORM_MARKETING_WHATSAPP_TEXT,
  PLATFORM_MARKETING_WHATSAPP_VERSION,
  PRIVACY_VERSION,
  TERMS_VERSION,
  currentLegalBundleHash,
  legalAcceptanceSnapshot,
} from './legal.js'
import { createProfessionalConsentService } from './professionalConsentService.js'

const fixedNow = new Date('2030-07-10T15:30:00.000Z')

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      platform_marketing_whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
      platform_marketing_whatsapp_opt_in_at TEXT,
      platform_marketing_whatsapp_opt_out_at TEXT
    );
    CREATE TABLE platform_marketing_consent_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT,
      channel TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('GRANTED', 'WITHDRAWN', 'DECLINED')),
      policy_version TEXT NOT NULL,
      consent_text TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE user_legal_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT,
      bundle_version TEXT NOT NULL,
      bundle_hash TEXT NOT NULL,
      terms_version TEXT NOT NULL,
      privacy_version TEXT NOT NULL,
      source TEXT NOT NULL,
      ip_hash TEXT,
      user_agent_hash TEXT,
      snapshot_json TEXT NOT NULL,
      accepted_at TEXT NOT NULL
    );
    INSERT INTO users VALUES
      ('user-one', 'tenant-one', 0, NULL, NULL),
      ('user-two', 'tenant-two', 1, '2030-06-01T10:00:00.000Z', NULL);
  `)
  return db
}

function createService(db: Database.Database, randomId = (() => {
  let sequence = 0
  return () => `evidence-${++sequence}`
})()) {
  return createProfessionalConsentService({
    db,
    now: () => new Date(fixedNow),
    randomId,
    evidenceFingerprint: () => ({ ipHash: 'ip-hash', userAgentHash: 'ua-hash' }),
  })
}

test('concede consentimento profissional com política, texto, origem e data auditáveis', () => {
  const db = createTestDb()
  const { recordPlatformMarketingChoice } = createService(db)

  assert.deepEqual(recordPlatformMarketingChoice({
    userId: 'user-one', tenantId: 'tenant-one', granted: true, source: 'PUBLIC_CHECKOUT',
  }), { whatsappPromotions: true, changed: true })
  assert.deepEqual(db.prepare(`SELECT platform_marketing_whatsapp_opt_in as optedIn, platform_marketing_whatsapp_opt_in_at as optedInAt, platform_marketing_whatsapp_opt_out_at as optedOutAt FROM users WHERE id = 'user-one'`).get(), {
    optedIn: 1, optedInAt: fixedNow.toISOString(), optedOutAt: null,
  })
  assert.deepEqual(db.prepare(`SELECT user_id as userId, tenant_id as tenantId, channel, action, policy_version as policyVersion, consent_text as consentText, source, created_at as createdAt FROM platform_marketing_consent_events`).get(), {
    userId: 'user-one', tenantId: 'tenant-one', channel: 'WHATSAPP', action: 'GRANTED',
    policyVersion: PLATFORM_MARKETING_WHATSAPP_VERSION, consentText: PLATFORM_MARKETING_WHATSAPP_TEXT,
    source: 'PUBLIC_CHECKOUT', createdAt: fixedNow.toISOString(),
  })
  db.close()
})

test('diferencia retirada de recusa e preserva a data histórica do opt-in', () => {
  const db = createTestDb()
  const { recordPlatformMarketingChoice } = createService(db)

  assert.deepEqual(recordPlatformMarketingChoice({ userId: 'user-two', tenantId: 'tenant-two', granted: false, source: 'ACCOUNT_SETTINGS' }), {
    whatsappPromotions: false, changed: true,
  })
  assert.deepEqual(recordPlatformMarketingChoice({ userId: 'user-one', tenantId: 'tenant-one', granted: false, source: 'PUBLIC_CHECKOUT' }), {
    whatsappPromotions: false, changed: false,
  })
  assert.deepEqual(db.prepare(`SELECT platform_marketing_whatsapp_opt_in_at as optedInAt, platform_marketing_whatsapp_opt_out_at as optedOutAt FROM users WHERE id = 'user-two'`).get(), {
    optedInAt: '2030-06-01T10:00:00.000Z', optedOutAt: fixedNow.toISOString(),
  })
  assert.deepEqual(db.prepare(`SELECT action FROM platform_marketing_consent_events ORDER BY rowid`).all(), [
    { action: 'WITHDRAWN' }, { action: 'DECLINED' },
  ])
  db.close()
})

test('registra aceitação legal com versões, snapshot e fingerprints exatos', () => {
  const db = createTestDb()
  const { recordLegalAcceptance } = createService(db)

  recordLegalAcceptance({ userId: 'user-one', tenantId: 'tenant-one', source: 'ACCOUNT_REACCEPTANCE', req: {} as Request })
  assert.deepEqual(db.prepare(`SELECT user_id as userId, tenant_id as tenantId, bundle_version as bundleVersion, bundle_hash as bundleHash, terms_version as termsVersion, privacy_version as privacyVersion, source, ip_hash as ipHash, user_agent_hash as userAgentHash, snapshot_json as snapshotJson, accepted_at as acceptedAt FROM user_legal_acceptances`).get(), {
    userId: 'user-one', tenantId: 'tenant-one', bundleVersion: LEGAL_BUNDLE_VERSION,
    bundleHash: currentLegalBundleHash(), termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
    source: 'ACCOUNT_REACCEPTANCE', ipHash: 'ip-hash', userAgentHash: 'ua-hash',
    snapshotJson: legalAcceptanceSnapshot(), acceptedAt: fixedNow.toISOString(),
  })
  db.close()
})

test('usuário inexistente falha e erro na evidência reverte a mudança de estado', () => {
  const db = createTestDb()
  db.prepare(`INSERT INTO platform_marketing_consent_events VALUES ('duplicate', 'user-one', 'tenant-one', 'WHATSAPP', 'DECLINED', 'old', 'old', 'OLD', '2029-01-01T00:00:00.000Z')`).run()
  const { recordPlatformMarketingChoice } = createService(db, () => 'duplicate')

  assert.throws(
    () => recordPlatformMarketingChoice({ userId: 'missing', tenantId: 'tenant-one', granted: true, source: 'ACCOUNT_SETTINGS' }),
    error => error instanceof HttpError && error.code === 'USER_NOT_FOUND',
  )
  assert.throws(() => recordPlatformMarketingChoice({ userId: 'user-one', tenantId: 'tenant-one', granted: true, source: 'ACCOUNT_SETTINGS' }))
  assert.equal((db.prepare(`SELECT platform_marketing_whatsapp_opt_in as optedIn FROM users WHERE id = 'user-one'`).get() as { optedIn: number }).optedIn, 0)
  db.close()
})
