import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { createEvolutionWebhookRouter, type EvolutionInbound } from './evolutionWebhookRoutes.js'

const tenantId = '11111111-1111-4111-8111-111111111111'

test('webhook Evolution preserva segredo, eventos, opt-out, entrega, conexão e ACK de erro', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE whatsapp_instances (
      tenant_id TEXT, instance_name TEXT, webhook_last_at TEXT, updated_at TEXT
    );
    CREATE TABLE whatsapp_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT, provider_message_id TEXT, direction TEXT,
      delivery_status TEXT, status_updated_at TEXT
    );
    CREATE TABLE evolution_webhook_events (
      id TEXT PRIMARY KEY, tenant_id TEXT, instance_name TEXT, event_type TEXT,
      provider_message_id TEXT, outcome TEXT, error_code TEXT, payload_hash TEXT, created_at TEXT
    );
    INSERT INTO whatsapp_instances VALUES ('${tenantId}', 'studio-ana', NULL, '2026-01-01T00:00:00.000Z');
    INSERT INTO whatsapp_messages VALUES ('message-out', '${tenantId}', 'provider-out', 'OUTBOUND', 'SENT', NULL);
  `)

  const recordedMessages: Array<Record<string, unknown>> = []
  const consentChanges: Array<Record<string, unknown>> = []
  const sentTexts: Array<{ tenantId: string; phone: string; text: string }> = []
  const connectionUpdates: Array<{ tenantId: string; instanceName: string; state: string }> = []
  const secretMiddleware: RequestHandler = (req, res, next) => {
    if (req.headers['x-webhook-secret'] !== 'segredo') return res.status(401).json({ code: 'WEBHOOK_SECRET_REQUIRED' })
    next()
  }
  const extractInbound = (payload: unknown): EvolutionInbound => {
    const value = payload as Record<string, unknown>
    const data = Array.isArray(value.data) ? (value.data[0] as Record<string, unknown> ?? {}) : (value.data as Record<string, unknown> ?? {})
    const key = (data.key as Record<string, unknown> | undefined) ?? {}
    const event = String(value.event ?? '').replace(/[.-]/g, '_').toUpperCase()
    return {
      event,
      instanceName: String(value.instance ?? ''),
      providerMessageId: typeof key.id === 'string' ? key.id : typeof value.providerMessageId === 'string' ? value.providerMessageId : null,
      providerRemoteJid: '5571999999999@s.whatsapp.net',
      quotedProviderMessageId: null,
      fromMe: Boolean(value.fromMe),
      phone: String(value.phone ?? '5571999999999'),
      text: String(value.text ?? ''),
      pushName: 'Ana',
      messageType: 'TEXT',
      sentAt: '2026-09-16T12:00:00.000Z',
      isGroup: Boolean(value.isGroup),
    }
  }

  const app = express()
  app.use(express.json())
  app.use('/api/webhooks', createEvolutionWebhookRouter({
    db,
    requireEvolutionWebhookSecret: secretMiddleware,
    extractEvolutionInbound: extractInbound,
    recordWhatsappMessage: input => {
      if (input.text === 'explodir') throw new Error('falha simulada ao persistir')
      recordedMessages.push(input)
      return { inserted: true, clientUserId: 'client-1' }
    },
    setClientWhatsappMarketingConsent: input => {
      consentChanges.push(input)
      return { changed: true }
    },
    sendWhatsappTextForTenant: async (inputTenantId, phone, text) => {
      sentTexts.push({ tenantId: inputTenantId, phone, text })
      return true
    },
    updateEvolutionConnectionFromWebhook: (inputTenantId, instanceName, state) => {
      connectionUpdates.push({ tenantId: inputTenantId, instanceName, state })
    },
    handleEvolutionConfirmationWebhook: async payload => {
      const value = payload as Record<string, unknown>
      return value.confirmation ? { handled: true, appointmentId: 'appointment-1' } : { handled: false }
    },
  }))

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const post = (body: Record<string, unknown>, id = tenantId, withSecret = true) => fetch(`${baseUrl}/api/webhooks/evolution/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(withSecret ? { 'x-webhook-secret': 'segredo' } : {}) },
    body: JSON.stringify(body),
  })

  try {
    const unauthorized = await post({ event: 'messages.upsert', instance: 'studio-ana' }, tenantId, false)
    assert.equal(unauthorized.status, 401)

    const unknown = await post({ event: 'messages.upsert', instance: 'desconhecida' })
    assert.deepEqual(await unknown.json(), { ok: true, handled: false })
    const ignored = db.prepare(`SELECT outcome, error_code AS errorCode FROM evolution_webhook_events ORDER BY created_at DESC LIMIT 1`).get()
    assert.deepEqual(ignored, { outcome: 'IGNORED', errorCode: 'UNKNOWN_INSTANCE' })

    const optedOut = await post({ event: 'messages.upsert', instance: 'studio-ana', text: 'sair', phone: '5571999999999', providerMessageId: 'provider-in' })
    assert.deepEqual(await optedOut.json(), { handled: true, ok: true })
    assert.equal(recordedMessages.length, 1)
    assert.deepEqual(consentChanges, [{ tenantId, userId: 'client-1', granted: false, source: 'WHATSAPP_KEYWORD' }])
    assert.equal(sentTexts.length, 1)
    assert.match(sentTexts[0]?.text ?? '', /não receberá mais novidades/)
    assert.ok((db.prepare(`SELECT webhook_last_at AS webhookLastAt FROM whatsapp_instances WHERE tenant_id = ?`).get(tenantId) as { webhookLastAt: string }).webhookLastAt)

    const delivery = await post({
      event: 'messages.update', instance: 'studio-ana',
      data: [{ key: { id: 'provider-out' }, update: { status: 'READ' } }],
    })
    assert.deepEqual(await delivery.json(), { handled: true, ok: true })
    assert.equal((db.prepare(`SELECT delivery_status AS status FROM whatsapp_messages WHERE id = 'message-out'`).get() as { status: string }).status, 'READ')

    const connection = await post({ event: 'connection.update', instance: 'studio-ana', data: { state: 'open' } })
    assert.deepEqual(await connection.json(), { handled: true, ok: true })
    assert.deepEqual(connectionUpdates, [{ tenantId, instanceName: 'studio-ana', state: 'CONNECTED' }])

    const confirmation = await post({ event: 'messages.upsert', instance: 'studio-ana', confirmation: true, text: '1' })
    assert.deepEqual(await confirmation.json(), { handled: true, appointmentId: 'appointment-1', ok: true })

    const group = await post({ event: 'messages.upsert', instance: 'studio-ana', text: 'ignorar', isGroup: true })
    assert.deepEqual(await group.json(), { handled: false, ok: true })
    assert.equal(recordedMessages.length, 2)

    const failed = await post({ event: 'messages.upsert', instance: 'studio-ana', text: 'explodir' })
    assert.deepEqual(await failed.json(), { ok: true, handled: false })
    const errorEvent = db.prepare(`SELECT outcome, error_code AS errorCode, payload_hash AS payloadHash FROM evolution_webhook_events ORDER BY rowid DESC LIMIT 1`).get() as { outcome: string; errorCode: string; payloadHash: string }
    assert.equal(errorEvent.outcome, 'ERROR')
    assert.equal(errorEvent.errorCode, 'Error')
    assert.match(errorEvent.payloadHash, /^[a-f0-9]{64}$/)

    const invalidTenant = await post({ event: 'messages.upsert', instance: 'studio-ana' }, 'tenant-invalido')
    assert.deepEqual(await invalidTenant.json(), { ok: true, handled: false })
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
