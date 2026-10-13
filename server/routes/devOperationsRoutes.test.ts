import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { handleError } from '../http.js'
import { createDevOperationsRouter } from './devOperationsRoutes.js'

function createFixtureDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE subscriptions (status TEXT, current_period_end TEXT);
    CREATE TABLE infinitepay_orders (status TEXT);
    CREATE TABLE assistant_usage (request_day TEXT, input_tokens INTEGER, output_tokens INTEGER);
    CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE payment_events (id TEXT PRIMARY KEY, event_type TEXT, payload_json TEXT, received_at TEXT);

    INSERT INTO tenants VALUES ('tenant-1', 'ACTIVE'), ('tenant-2', 'DISABLED');
    INSERT INTO subscriptions VALUES ('ACTIVE', '2099-12-31T23:59:59.000Z');
    INSERT INTO infinitepay_orders VALUES ('PENDING');
    INSERT INTO assistant_usage VALUES (date('now'), 120, 30);
    INSERT INTO payment_events VALUES ('event-1', 'payment_approved', '{"total":15990,"customer":{"firstname":"Ana","lastname":"Silva"}}', '2026-09-15T12:00:00.000Z');
  `)
  return db
}

test('operações DEV preservam métricas, modo de teste, notificações e backup', async () => {
  const db = createFixtureDb()
  const passThrough: RequestHandler = (_req, _res, next) => next()
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-dev'] === 'true') {
      req.sessionUser = { id: 'dev-1', role: 'DEV', tenantId: null, sessionId: 'session-dev', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/dev', createDevOperationsRouter({ db, requireDevHost: passThrough, devBackupExportLimiter: passThrough }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const devHeaders = { 'content-type': 'application/json', 'x-test-dev': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/dev/platform-overview`)
    assert.equal(unauthorized.status, 401)

    const overview = await fetch(`${baseUrl}/api/dev/platform-overview`, { headers: devHeaders }).then(response => response.json()) as {
      totals: { total: number; active: number; disabled: number }; activeSubscriptions: number; pendingOrders: number; ai30d: { requests: number; tokens: number }
    }
    assert.deepEqual(overview, { totals: { total: 2, active: 1, disabled: 1 }, activeSubscriptions: 1, pendingOrders: 1, ai30d: { requests: 1, tokens: 150 } })

    const testMode = await fetch(`${baseUrl}/api/dev/test-mode`, { method: 'POST', headers: devHeaders, body: JSON.stringify({ enabled: true }) })
    assert.deepEqual(await testMode.json(), { ok: true, enabled: true })
    assert.equal((db.prepare("SELECT value FROM platform_settings WHERE key = 'test_mode'").get() as { value: string }).value, 'true')

    const notifications = await fetch(`${baseUrl}/api/dev/notifications`, { headers: devHeaders }).then(response => response.json()) as { notifications: Array<{ title: string; desc: string }> }
    assert.deepEqual(notifications.notifications, [{ id: 'event-1', title: 'Pagamento Aprovado', desc: 'Ana Silva - R$ 159.90', time: '2026-09-15T12:00:00.000Z', type: 'payment_approved' }])

    const backup = await fetch(`${baseUrl}/api/dev/backup/export`, { headers: devHeaders })
    assert.equal(backup.status, 200)
    assert.match(backup.headers.get('content-disposition') ?? '', /lashdesigner-backup-\d{4}-\d{2}-\d{2}\.db/)
    const bytes = new Uint8Array(await backup.arrayBuffer())
    assert.equal(new TextDecoder().decode(bytes.slice(0, 16)), 'SQLite format 3\u0000')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
