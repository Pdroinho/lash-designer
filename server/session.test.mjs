import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createSession, resolveSession, revokeSession, revokeSessionsForUser } from './session.ts'

function dbFixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE tenants (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, role TEXT NOT NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id));
    CREATE TABLE trusted_devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, trusted_device_id TEXT, token_hash TEXT NOT NULL UNIQUE, persistent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, ip_address TEXT, user_agent TEXT, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (trusted_device_id) REFERENCES trusted_devices(id) ON DELETE SET NULL);
    INSERT INTO tenants (id, status) VALUES ('tenant-1', 'ACTIVE');
    INSERT INTO users (id, tenant_id, role) VALUES ('user-1', 'tenant-1', 'ADMIN');
  `)
  return db
}

test('opaque session stores only a token hash and resolves current user state', () => {
  const db = dbFixture()
  const created = createSession(db, { userId: 'user-1', persistent: false, ipAddress: '127.0.0.1', userAgent: 'test' })
  const stored = db.prepare('SELECT token_hash as tokenHash FROM auth_sessions WHERE id = ?').get(created.id)
  assert.notEqual(stored.tokenHash, created.token)
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/)
  const resolved = resolveSession(db, created.token)
  assert.equal(resolved?.userId, 'user-1')
  assert.equal(resolved?.role, 'ADMIN')
  assert.equal(resolved?.tenantStatus, 'ACTIVE')
})

test('revoked session cannot be resolved', () => {
  const db = dbFixture()
  const created = createSession(db, { userId: 'user-1' })
  revokeSession(db, created.id)
  assert.equal(resolveSession(db, created.token), null)
})

test('logout-all style revocation invalidates every user session', () => {
  const db = dbFixture()
  const first = createSession(db, { userId: 'user-1' })
  const second = createSession(db, { userId: 'user-1', persistent: true })
  revokeSessionsForUser(db, 'user-1')
  assert.equal(resolveSession(db, first.token), null)
  assert.equal(resolveSession(db, second.token), null)
})

test('idle-expired session is revoked server-side', () => {
  const db = dbFixture()
  const created = createSession(db, { userId: 'user-1' })
  db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', created.id)
  assert.equal(resolveSession(db, created.token), null)
  assert.ok(db.prepare('SELECT revoked_at as revokedAt FROM auth_sessions WHERE id = ?').get(created.id).revokedAt)
})
