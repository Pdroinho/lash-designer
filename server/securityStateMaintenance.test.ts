import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createSecurityStateMaintenance } from './securityStateMaintenance.js'

const currentTime = new Date('2030-08-20T12:00:00.000Z').getTime()

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE security_rate_limits (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL);
    CREATE TABLE auth_challenges (id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, consumed_at TEXT);
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, revoked_at TEXT);
    CREATE TABLE trusted_devices (id TEXT PRIMARY KEY, expires_at TEXT NOT NULL, revoked_at TEXT);
  `)
  return db
}

test('limpeza remove somente estado transitório vencido em cada janela', () => {
  const db = createTestDb()
  db.exec(`
    INSERT INTO security_rate_limits VALUES ('old', '2030-07-01T00:00:00.000Z'), ('recent', '2030-08-10T00:00:00.000Z');
    INSERT INTO auth_challenges VALUES ('expired', '2030-08-18T00:00:00.000Z', NULL), ('consumed', '2030-09-01T00:00:00.000Z', '2030-08-18T00:00:00.000Z'), ('active', '2030-09-01T00:00:00.000Z', NULL);
    INSERT INTO auth_sessions VALUES ('expired', '2030-05-01T00:00:00.000Z', NULL), ('revoked', '2031-01-01T00:00:00.000Z', '2030-05-01T00:00:00.000Z'), ('active', '2031-01-01T00:00:00.000Z', NULL);
    INSERT INTO trusted_devices VALUES ('expired', '2030-05-01T00:00:00.000Z', NULL), ('revoked', '2031-01-01T00:00:00.000Z', '2030-05-01T00:00:00.000Z'), ('active', '2031-01-01T00:00:00.000Z', NULL);
  `)
  const maintenance = createSecurityStateMaintenance({ db, now: () => currentTime })

  maintenance.pruneTransientSecurityState()

  assert.deepEqual(db.prepare(`SELECT id FROM security_rate_limits ORDER BY id`).all(), [{ id: 'recent' }])
  assert.deepEqual(db.prepare(`SELECT id FROM auth_challenges ORDER BY id`).all(), [{ id: 'active' }])
  assert.deepEqual(db.prepare(`SELECT id FROM auth_sessions ORDER BY id`).all(), [{ id: 'active' }])
  assert.deepEqual(db.prepare(`SELECT id FROM trusted_devices ORDER BY id`).all(), [{ id: 'active' }])
  db.close()
})

test('agendador mantém intervalos, unref, idempotência e cancelamento integral', () => {
  const db = createTestDb()
  const scheduled: Array<{ kind: string; ms: number; unref: number }> = []
  const cleared: string[] = []
  const createTimer = (kind: string, ms: number) => {
    const record = { kind, ms, unref: 0 }
    scheduled.push(record)
    return { unref: () => { record.unref += 1 } } as unknown as NodeJS.Timeout
  }
  const maintenance = createSecurityStateMaintenance({
    db,
    setIntervalFn: ((_callback: () => void, ms: number) => createTimer('interval', ms)) as typeof setInterval,
    setTimeoutFn: ((_callback: () => void, ms: number) => createTimer('timeout', ms)) as typeof setTimeout,
    clearIntervalFn: (() => { cleared.push('interval') }) as typeof clearInterval,
    clearTimeoutFn: (() => { cleared.push('timeout') }) as typeof clearTimeout,
  })

  assert.equal(maintenance.start(), true)
  assert.equal(maintenance.start(), false)
  assert.deepEqual(scheduled, [
    { kind: 'interval', ms: 6 * 60 * 60_000, unref: 1 },
    { kind: 'timeout', ms: 25_000, unref: 1 },
  ])
  maintenance.stop()
  assert.deepEqual(cleared, ['interval', 'timeout'])
  assert.equal(maintenance.start(), true)
  db.close()
})
