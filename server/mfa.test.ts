import test from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import {
  createTrustedDevice,
  createWhatsappOtpChallenge,
  resolveAuthChallenge,
  resolveTrustedDevice,
  verifyAndConsumeWhatsappOtpChallenge,
} from './mfa.js'

function dbForMfa() {
  const db = new Database(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL,
      tenant_id TEXT
    );
    CREATE TABLE auth_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('WHATSAPP_OTP')),
      token_hash TEXT NOT NULL UNIQUE,
      code_hash TEXT NOT NULL,
      phone_snapshot TEXT NOT NULL,
      keep_signed INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE trusted_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      trusted_device_id TEXT,
      token_hash TEXT NOT NULL UNIQUE,
      persistent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      ip_address TEXT,
      user_agent TEXT
    );
  `)
  db.prepare(`INSERT INTO users (id, email, phone, role, tenant_id) VALUES (?, ?, ?, 'ADMIN', ?)`).run('admin-1', 'admin@example.com', '+5511999999999', 'tenant-1')
  return db
}

test('WhatsApp MFA challenge accepts the generated code once', () => {
  const db = dbForMfa()
  const challenge = createWhatsappOtpChallenge(db, { userId: 'admin-1', keepSigned: true, phone: '+5511999999999' })
  const resolved = resolveAuthChallenge(db, challenge.token)
  assert.equal(resolved?.userId, 'admin-1')
  assert.equal(resolved?.phone, '+5511999999999')
  assert.equal(verifyAndConsumeWhatsappOtpChallenge(db, challenge.id, 'admin-1', challenge.code), true)
  assert.equal(verifyAndConsumeWhatsappOtpChallenge(db, challenge.id, 'admin-1', challenge.code), false)
})

test('WhatsApp MFA challenge locks after five invalid attempts', () => {
  const db = dbForMfa()
  const challenge = createWhatsappOtpChallenge(db, { userId: 'admin-1', keepSigned: false, phone: '+5511999999999' })
  for (let i = 0; i < 5; i += 1) assert.equal(verifyAndConsumeWhatsappOtpChallenge(db, challenge.id, 'admin-1', '000000'), false)
  assert.equal(verifyAndConsumeWhatsappOtpChallenge(db, challenge.id, 'admin-1', challenge.code), false)
})

test('trusted device expiry is approximately 365 days', () => {
  const db = dbForMfa()
  const before = Date.now()
  const device = createTrustedDevice(db, 'admin-1', 'Mozilla/5.0 Chrome/120 Windows')
  const ttlDays = (Date.parse(device.expiresAt) - before) / 86_400_000
  assert.ok(ttlDays > 364.9 && ttlDays <= 365.01)
  assert.equal(resolveTrustedDevice(db, 'admin-1', device.token)?.id, device.id)
})
