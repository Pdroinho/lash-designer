import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createDomainVerificationRuntime } from './domainVerificationRuntime.js'

const fixedNow = new Date('2030-06-01T12:00:00.000Z')

test('runtime de domínios preserva fila, estados, limite, concorrência e timers', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenant_domains (
      id TEXT PRIMARY KEY, tenant_id TEXT, domain TEXT, status TEXT,
      verification_token TEXT, created_at TEXT, last_checked_at TEXT,
      verified_at TEXT, verification_error TEXT, is_primary INTEGER
    );
    INSERT INTO tenant_domains VALUES
      ('pending-due', 'tenant-one', 'pending.example.com', 'PENDING', NULL, '2030-01-01T00:00:00.000Z', NULL, NULL, NULL, 0),
      ('error-due', 'tenant-one', 'error.example.com', 'ERROR', 'token-error', '2030-01-02T00:00:00.000Z', '2030-05-01T00:00:00.000Z', NULL, 'erro anterior', 0),
      ('transient-due', 'tenant-one', 'transient.example.com', 'PENDING', 'token-transient', '2030-01-03T00:00:00.000Z', '2030-05-01T00:00:00.000Z', NULL, NULL, 0),
      ('active-due', 'tenant-one', 'active.example.com', 'ACTIVE', 'token-active', '2030-01-04T00:00:00.000Z', '2030-05-20T00:00:00.000Z', '2030-02-01T00:00:00.000Z', NULL, 1),
      ('active-overflow', 'tenant-one', 'overflow.example.com', 'ACTIVE', 'token-overflow', '2030-01-05T00:00:00.000Z', '2030-05-20T00:00:00.000Z', '2030-02-02T00:00:00.000Z', NULL, 0),
      ('pending-recent', 'tenant-one', 'recent.example.com', 'PENDING', 'token-recent', '2030-01-06T00:00:00.000Z', '2030-06-01T11:55:00.000Z', NULL, NULL, 0),
      ('active-recent', 'tenant-one', 'active-recent.example.com', 'ACTIVE', 'token-active-recent', '2030-01-07T00:00:00.000Z', '2030-06-01T11:00:00.000Z', '2030-02-03T00:00:00.000Z', NULL, 0);
  `)

  type FakeTimer = { kind: 'interval' | 'timeout'; callback: () => void; delayMs: number; unref: () => void }
  const intervals: FakeTimer[] = []
  const timeouts: FakeTimer[] = []
  const cleared: FakeTimer[] = []
  let unrefCount = 0
  let releaseFirst!: () => void
  let markFirstStarted!: () => void
  const firstStarted = new Promise<void>(resolve => { markFirstStarted = resolve })
  const firstRelease = new Promise<void>(resolve => { releaseFirst = resolve })
  const calls: Array<{ domain: string; token: string }> = []

  const runtime = createDomainVerificationRuntime({
    db,
    config: { appBaseUrl: 'https://platform.example', expectedIpv4: [], expectedIpv6: [] },
    verifyIntervalMinutes: 10,
    activeReverifyHours: 24,
    batchLimit: 4,
    now: () => new Date(fixedNow),
    randomToken: () => 'token-generated',
    verifyDomain: async (domain, token) => {
      calls.push({ domain, token })
      if (domain === 'pending.example.com') {
        markFirstStarted()
        await firstRelease
        return {
          verified: true, ownershipVerified: true, routingVerified: true,
          checkedAt: fixedNow.toISOString(), error: null,
          details: { txtRecords: [], cnameRecords: [], ipv4Records: [], ipv6Records: [] },
        }
      }
      if (domain === 'transient.example.com') throw new Error('x'.repeat(600))
      return {
        verified: false, ownershipVerified: false, routingVerified: false,
        checkedAt: fixedNow.toISOString(), error: `Falha em ${domain}`,
        details: { txtRecords: [], cnameRecords: [], ipv4Records: [], ipv6Records: [] },
      }
    },
    scheduler: {
      setInterval: (callback, delayMs) => {
        const timer: FakeTimer = { kind: 'interval', callback, delayMs, unref: () => { unrefCount += 1 } }
        intervals.push(timer)
        return timer
      },
      setTimeout: (callback, delayMs) => {
        const timer: FakeTimer = { kind: 'timeout', callback, delayMs, unref: () => { unrefCount += 1 } }
        timeouts.push(timer)
        return timer
      },
      clearInterval: timer => { cleared.push(timer as FakeTimer) },
      clearTimeout: timer => { cleared.push(timer as FakeTimer) },
    },
  })

  const firstRun = runtime.verifyPendingDomains()
  await firstStarted
  await runtime.verifyPendingDomains()
  assert.deepEqual(calls, [{ domain: 'pending.example.com', token: 'token-generated' }])
  releaseFirst()
  await firstRun

  assert.deepEqual(calls.map(call => call.domain), [
    'pending.example.com', 'error.example.com', 'transient.example.com', 'active.example.com',
  ])
  assert.deepEqual(runtime.getDomainRow('pending-due', 'tenant-one'), {
    id: 'pending-due', tenantId: 'tenant-one', domain: 'pending.example.com', status: 'ACTIVE',
    verificationToken: 'token-generated', createdAt: '2030-01-01T00:00:00.000Z',
    lastCheckedAt: fixedNow.toISOString(), verifiedAt: fixedNow.toISOString(),
    verificationError: null, isPrimary: 0,
  })
  assert.equal(runtime.getDomainRow('pending-due', 'tenant-other'), undefined)

  const errorRow = runtime.getDomainRow('error-due')
  assert.equal(errorRow?.status, 'PENDING')
  assert.equal(errorRow?.verificationError, 'Falha em error.example.com')
  const transientRow = runtime.getDomainRow('transient-due')
  assert.equal(transientRow?.status, 'PENDING')
  assert.equal(transientRow?.lastCheckedAt, fixedNow.toISOString())
  assert.equal(transientRow?.verificationError?.length, 500)
  const activeRow = runtime.getDomainRow('active-due')
  assert.equal(activeRow?.status, 'ERROR')
  assert.equal(activeRow?.verifiedAt, '2030-02-01T00:00:00.000Z')
  assert.equal(runtime.getDomainRow('active-overflow')?.lastCheckedAt, '2030-05-20T00:00:00.000Z')
  assert.equal(runtime.getDomainRow('pending-recent')?.lastCheckedAt, '2030-06-01T11:55:00.000Z')
  assert.equal(runtime.getDomainRow('active-recent')?.lastCheckedAt, '2030-06-01T11:00:00.000Z')

  runtime.start()
  runtime.start()
  assert.equal(intervals.length, 1)
  assert.equal(intervals[0].delayMs, 10 * 60_000)
  assert.equal(timeouts.length, 1)
  assert.equal(timeouts[0].delayMs, 10_000)
  assert.equal(unrefCount, 2)
  runtime.stop()
  runtime.stop()
  assert.deepEqual(cleared.map(timer => timer.kind), ['interval', 'timeout'])

  db.close()
})
