import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { ensurePlatformSettingsV51, ensureProfessionalWhatsappMfaSchema } from './auth51Migration.ts'

function baseDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE user_mfa (user_id TEXT PRIMARY KEY, totp_secret_encrypted TEXT NOT NULL);
    CREATE TABLE mfa_recovery_codes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL);
    CREATE TABLE auth_challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL);
  `)
  return db
}

const columns = (db, table) => new Set(db.prepare(`PRAGMA table_info('${table}')`).all().map((row) => row.name))

test('migration 36 adds phone and replaces legacy TOTP challenge schema', () => {
  const db = baseDb()
  db.exec(`
    INSERT INTO users (id, email) VALUES ('u1', 'admin@example.com');
    INSERT INTO user_mfa (user_id, totp_secret_encrypted) VALUES ('u1', 'legacy');
    INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES ('r1', 'u1', 'legacy');
    INSERT INTO auth_challenges (id, user_id, kind) VALUES ('c1', 'u1', 'MFA_LOGIN');
  `)

  ensureProfessionalWhatsappMfaSchema(db)

  assert.ok(columns(db, 'users').has('phone'))
  assert.ok(columns(db, 'auth_challenges').has('code_hash'))
  assert.ok(columns(db, 'auth_challenges').has('phone_snapshot'))
  assert.equal(columns(db, 'auth_challenges').has('secret_encrypted'), false)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM user_mfa').get().count, 0)
  assert.equal(db.prepare('SELECT COUNT(*) count FROM mfa_recovery_codes').get().count, 0)
  assert.throws(() => db.exec(`INSERT INTO auth_challenges (id, user_id, kind, token_hash, code_hash, phone_snapshot, sent_at, created_at, expires_at) VALUES ('bad','u1','MFA_LOGIN','t','c','+5511999999999','x','x','x')`))
})

test('migration 37 evolves existing platform_settings without replacing it', () => {
  const db = baseDb()
  db.prepare(`INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)`).run('dev_primary_color', '#111111', '2026-08-12T00:00:00Z')

  ensurePlatformSettingsV51(db)

  assert.ok(columns(db, 'platform_settings').has('encrypted'))
  assert.equal(db.prepare(`SELECT value FROM platform_settings WHERE key='dev_primary_color'`).get().value, '#111111')
  assert.equal(db.prepare(`SELECT value FROM platform_settings WHERE key='evolution_instance_name'`).get().value, 'lashdesigner-global')
})

test('v5.1 schema helpers are safe when migration runner invokes them once on already-upgraded columns', () => {
  const db = baseDb()
  ensureProfessionalWhatsappMfaSchema(db)
  ensurePlatformSettingsV51(db)
  ensurePlatformSettingsV51(db)
  assert.equal(db.prepare(`SELECT COUNT(*) count FROM platform_settings WHERE key='evolution_instance_name'`).get().count, 1)
})
