import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createWhatsappWorkerRuntime } from './whatsappWorkerRuntime.js'

const fixedNow = new Date('2030-07-01T12:00:00.000Z')
const tenantConnected = '11111111-1111-4111-8111-111111111111'
const tenantDisconnected = '22222222-2222-4222-8222-222222222222'
const mediaReadyId = '33333333-3333-4333-8333-333333333333'
const mediaNoConfigId = '44444444-4444-4444-8444-444444444444'

function workerConfig(tenantId: string) {
  if (tenantId === tenantConnected) return { baseUrl: 'https://evolution.example', apiKey: 'key', instanceName: 'connected' }
  if (tenantId === tenantDisconnected) return { baseUrl: 'https://evolution.example', apiKey: 'key', instanceName: 'disconnected' }
  return undefined
}

test('runtime WhatsApp preserva health, reconexão e trava contra sobreposição', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE whatsapp_instances (
      tenant_id TEXT, instance_name TEXT, reconnect_attempts INTEGER, reconnect_after TEXT,
      reconnect_claimed_at TEXT, last_health_check_at TEXT, created_at TEXT,
      connection_state TEXT, last_connected_at TEXT, last_connection_error TEXT, updated_at TEXT
    );
    INSERT INTO whatsapp_instances VALUES
      ('${tenantConnected}', 'connected', 4, '2030-06-01T00:00:00.000Z', NULL, NULL, '2030-01-01T00:00:00.000Z', 'UNKNOWN', NULL, 'antigo', NULL),
      ('${tenantDisconnected}', 'disconnected', 1, '2030-06-01T00:00:00.000Z', NULL, NULL, '2030-01-02T00:00:00.000Z', 'UNKNOWN', NULL, NULL, NULL);
  `)
  let releaseFirst!: () => void
  let markFirstStarted!: () => void
  const firstStarted = new Promise<void>(resolve => { markFirstStarted = resolve })
  const firstRelease = new Promise<void>(resolve => { releaseFirst = resolve })
  const urls: string[] = []
  let firstRequest = true
  const runtime = createWhatsappWorkerRuntime({
    db,
    mediaDir: os.tmpdir(),
    campaignsEnabled: false,
    campaignSendIntervalSeconds: 15,
    requireWhatsappConfig: workerConfig,
    resolveExternalHttpsBaseUrl: async value => value,
    sendWhatsappTextForTenant: async () => false,
    now: () => new Date(fixedNow),
    fetchFn: async input => {
      const url = String(input)
      urls.push(url)
      if (firstRequest) {
        firstRequest = false
        markFirstStarted()
        await firstRelease
      }
      if (url.includes('/instance/connect/')) return new Response('{}', { status: 200 })
      const state = url.endsWith('/connected') ? 'open' : 'close'
      return new Response(JSON.stringify({ instance: { state } }), { status: 200 })
    },
  })

  const firstRun = runtime.processConnectionHealth()
  await firstStarted
  await runtime.processConnectionHealth()
  assert.equal(urls.length, 1)
  releaseFirst()
  await firstRun

  const connected = db.prepare(`SELECT * FROM whatsapp_instances WHERE tenant_id = ?`).get(tenantConnected) as Record<string, unknown>
  assert.equal(connected.connection_state, 'CONNECTED')
  assert.equal(connected.reconnect_attempts, 0)
  assert.equal(connected.last_connected_at, fixedNow.toISOString())
  assert.equal(connected.last_connection_error, null)

  const disconnected = db.prepare(`SELECT * FROM whatsapp_instances WHERE tenant_id = ?`).get(tenantDisconnected) as Record<string, unknown>
  assert.equal(disconnected.connection_state, 'CONNECTING')
  assert.equal(disconnected.reconnect_attempts, 2)
  assert.equal(disconnected.reconnect_claimed_at, null)
  assert.equal(disconnected.last_connection_error, null)
  assert.ok(urls.some(url => url.endsWith('/instance/connect/disconnected')))
  db.close()
})

test('runtime WhatsApp baixa mídia privada e aplica retentativa quando falta configuração', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE whatsapp_messages (
      id TEXT, tenant_id TEXT, provider_message_id TEXT, media_remote_jid TEXT,
      media_attempts INTEGER, direction TEXT, media_status TEXT, media_next_attempt_at TEXT,
      sent_at TEXT, media_last_error TEXT, status_updated_at TEXT, media_mime_type TEXT,
      media_file_name TEXT, media_size_bytes INTEGER, media_storage_path TEXT
    );
    INSERT INTO whatsapp_messages VALUES
      ('${mediaReadyId}', '${tenantConnected}', 'provider-ready', '5511999999999@s.whatsapp.net', 0, 'INBOUND', 'PENDING', NULL, '2030-01-01T00:00:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL),
      ('${mediaNoConfigId}', '55555555-5555-4555-8555-555555555555', 'provider-missing', '5511888888888@s.whatsapp.net', 0, 'INBOUND', 'PENDING', NULL, '2030-01-02T00:00:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL);
  `)
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'lash-whatsapp-media-'))
  try {
    const runtime = createWhatsappWorkerRuntime({
      db,
      mediaDir,
      campaignsEnabled: false,
      campaignSendIntervalSeconds: 15,
      requireWhatsappConfig: workerConfig,
      resolveExternalHttpsBaseUrl: async value => value,
      sendWhatsappTextForTenant: async () => false,
      now: () => new Date(fixedNow),
      fetchFn: async () => new Response(JSON.stringify({
        base64: Buffer.from('media-ok').toString('base64'),
        mimetype: 'image/png',
        fileName: 'comprovante.png',
      }), { status: 200 }),
    })
    await runtime.processMediaQueue()

    const ready = db.prepare(`SELECT * FROM whatsapp_messages WHERE id = ?`).get(mediaReadyId) as Record<string, unknown>
    assert.equal(ready.media_status, 'READY')
    assert.equal(ready.media_mime_type, 'image/png')
    assert.equal(ready.media_file_name, 'comprovante.png')
    assert.equal(ready.media_size_bytes, 8)
    assert.equal(await readFile(path.join(mediaDir, String(ready.media_storage_path)), 'utf8'), 'media-ok')

    const missing = db.prepare(`SELECT * FROM whatsapp_messages WHERE id = ?`).get(mediaNoConfigId) as Record<string, unknown>
    assert.equal(missing.media_status, 'FAILED')
    assert.equal(missing.media_attempts, 1)
    assert.equal(missing.media_last_error, 'Integração Evolution indisponível')
    assert.equal(missing.media_next_attempt_at, '2030-07-01T12:30:00.000Z')
  } finally {
    db.close()
    await rm(mediaDir, { recursive: true, force: true })
  }
})

test('runtime WhatsApp revalida consentimento e conclui campanha entregue', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT, name TEXT);
    CREATE TABLE clients (tenant_id TEXT, user_id TEXT, marketing_whatsapp_opt_in INTEGER, phone_normalized TEXT);
    CREATE TABLE whatsapp_marketing_campaigns (
      id TEXT, tenant_id TEXT, name TEXT, message_text TEXT, status TEXT,
      total_recipients INTEGER, sent_count INTEGER, failed_count INTEGER, skipped_count INTEGER,
      created_at TEXT, started_at TEXT, completed_at TEXT, cancelled_at TEXT, last_error TEXT
    );
    CREATE TABLE whatsapp_marketing_recipients (
      id TEXT, campaign_id TEXT, tenant_id TEXT, client_user_id TEXT, phone_normalized TEXT,
      client_name TEXT, attempts INTEGER, status TEXT, next_attempt_at TEXT, created_at TEXT,
      claimed_at TEXT, provider_message_id TEXT, sent_at TEXT, last_error TEXT
    );
    INSERT INTO tenants VALUES ('${tenantConnected}', 'Studio Aurora');
    INSERT INTO clients VALUES ('${tenantConnected}', 'user-ok', 1, '5511999999999');
    INSERT INTO whatsapp_marketing_campaigns VALUES
      ('campaign-ok', '${tenantConnected}', 'Julho', 'Oi {{nome}}, novidade no {{espaco}}.', 'QUEUED', 1, 0, 0, 0, '2030-07-01T11:00:00.000Z', NULL, NULL, NULL, NULL);
    INSERT INTO whatsapp_marketing_recipients VALUES
      ('recipient-ok', 'campaign-ok', '${tenantConnected}', 'user-ok', '5511999999999', 'Ana', 0, 'PENDING', NULL, '2030-01-01T00:00:00.000Z', NULL, NULL, NULL, NULL);
  `)
  db.exec(`ALTER TABLE tenants ADD COLUMN status TEXT DEFAULT 'ACTIVE';
    ALTER TABLE whatsapp_marketing_campaigns ADD COLUMN image_data_url TEXT;
    ALTER TABLE whatsapp_marketing_recipients ADD COLUMN dispatch_started_at TEXT;
    CREATE TABLE subscriptions(tenant_id TEXT,status TEXT,current_period_end TEXT);
    INSERT INTO subscriptions VALUES ('${tenantConnected}','ACTIVE',NULL);
    CREATE TABLE whatsapp_settings(tenant_id TEXT,promo_enabled INTEGER);
    INSERT INTO whatsapp_settings VALUES ('${tenantConnected}',1);
    CREATE TABLE whatsapp_campaign_delivery_guard(tenant_id TEXT PRIMARY KEY,next_allowed_at TEXT);
  `)
  const sent: Array<{ tenantId: string; phone: string; text: string; purpose?: string }> = []
  const runtime = createWhatsappWorkerRuntime({
    db,
    mediaDir: os.tmpdir(),
    campaignsEnabled: true,
    campaignSendIntervalSeconds: 15,
    requireWhatsappConfig: workerConfig,
    resolveExternalHttpsBaseUrl: async value => value,
    sendWhatsappTextForTenant: async (tenantId, phone, text, options) => {
      sent.push({ tenantId, phone, text, purpose: options?.purpose })
      options?.onProviderMessageId?.('provider-sent')
      return true
    },
    fetchFn: async () => new Response(JSON.stringify({instance:{state:'open'}})),
    now: () => new Date(fixedNow),
  })

  await runtime.processMarketingCampaignQueue()
  assert.deepEqual(sent, [{
    tenantId: tenantConnected,
    phone: '5511999999999',
    text: 'Oi Ana, novidade no Studio Aurora.',
    purpose: 'MARKETING',
  }])
  const recipient = db.prepare(`SELECT * FROM whatsapp_marketing_recipients WHERE id = 'recipient-ok'`).get() as Record<string, unknown>
  assert.equal(recipient.status, 'SENT')
  assert.equal(recipient.attempts, 1)
  assert.equal(recipient.provider_message_id, 'provider-sent')
  await runtime.processMarketingCampaignQueue()
  const campaign = db.prepare(`SELECT * FROM whatsapp_marketing_campaigns WHERE id = 'campaign-ok'`).get() as Record<string, unknown>
  assert.equal(campaign.status, 'COMPLETED')
  assert.equal(campaign.sent_count, 1)
  assert.equal(campaign.completed_at, fixedNow.toISOString())
  db.close()
})

test('runtime WhatsApp centraliza e encerra os seis timers de forma idempotente', () => {
  const db = new Database(':memory:')
  type FakeTimer = { kind: 'interval' | 'timeout'; delayMs: number; callback: () => void; unref: () => void }
  const timers: FakeTimer[] = []
  const cleared: FakeTimer[] = []
  let unrefCount = 0
  const runtime = createWhatsappWorkerRuntime({
    db,
    mediaDir: os.tmpdir(),
    campaignsEnabled: false,
    campaignSendIntervalSeconds: 17,
    requireWhatsappConfig: () => undefined,
    resolveExternalHttpsBaseUrl: async value => value,
    sendWhatsappTextForTenant: async () => false,
    scheduler: {
      setInterval: (callback, delayMs) => {
        const timer: FakeTimer = { kind: 'interval', delayMs, callback, unref: () => { unrefCount += 1 } }
        timers.push(timer)
        return timer
      },
      setTimeout: (callback, delayMs) => {
        const timer: FakeTimer = { kind: 'timeout', delayMs, callback, unref: () => { unrefCount += 1 } }
        timers.push(timer)
        return timer
      },
      clearInterval: timer => { cleared.push(timer as FakeTimer) },
      clearTimeout: timer => { cleared.push(timer as FakeTimer) },
    },
  })

  runtime.start()
  runtime.start()
  assert.deepEqual(timers.map(timer => [timer.kind, timer.delayMs]), [
    ['interval', 120_000], ['timeout', 18_000],
    ['interval', 30_000], ['timeout', 20_000],
    ['interval', 60_000], ['timeout', 22_000],
  ])
  assert.equal(unrefCount, 6)
  runtime.stop()
  runtime.stop()
  assert.equal(cleared.length, 6)
  db.close()
})
