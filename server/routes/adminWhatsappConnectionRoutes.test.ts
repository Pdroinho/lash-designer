import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import type { WhatsappConfig } from './adminWhatsappSettingsRoutes.js'
import { createAdminWhatsappConnectionRouter } from './adminWhatsappConnectionRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const qrCode = `data:image/png;base64,${'A'.repeat(160)}`

test('conexão WhatsApp preserva estado, QR, diagnóstico e isolamento por tenant', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE whatsapp_instances (
      id TEXT PRIMARY KEY, tenant_id TEXT, provider TEXT, base_url TEXT, api_key TEXT,
      instance_name TEXT, status TEXT, connection_state TEXT, last_health_check_at TEXT,
      last_connected_at TEXT, last_connection_error TEXT, reconnect_attempts INTEGER,
      reconnect_after TEXT, webhook_last_at TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE whatsapp_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT, direction TEXT, sent_at TEXT
    );
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, marketing_whatsapp_opt_in INTEGER
    );
    INSERT INTO whatsapp_instances VALUES (
      'foreign-instance', '${tenantTwo}', 'EVOLUTION', 'https://foreign.example', 'foreign-key',
      'foreign-name', 'CONNECTED', 'CONNECTED', '2030-01-20T10:00:00.000Z',
      '2030-01-20T10:00:00.000Z', NULL, 0, NULL, '2030-01-20T10:00:00.000Z',
      '2030-01-01T00:00:00.000Z', '2030-01-20T10:00:00.000Z'
    );
    INSERT INTO whatsapp_messages VALUES
      ('foreign-message', '${tenantTwo}', 'INBOUND', '2099-01-01T00:00:00.000Z');
    INSERT INTO clients VALUES
      ('foreign-client', '${tenantTwo}', 1);
  `)

  const readConfig = (tenantId: string): WhatsappConfig | undefined => {
    const row = db.prepare(`
      SELECT id, provider, base_url as baseUrl, api_key as apiKey,
             instance_name as instanceName, status, updated_at as updatedAt
      FROM whatsapp_instances WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1
    `).get(tenantId) as Omit<WhatsappConfig, 'storedBaseUrl' | 'storedApiKeyCiphertext' | 'usesGlobalBaseUrl' | 'usesGlobalApiKey'> | undefined
    if (!row) return undefined
    return {
      ...row,
      storedBaseUrl: row.baseUrl,
      storedApiKeyCiphertext: row.apiKey,
      usesGlobalBaseUrl: false,
      usesGlobalApiKey: false,
    }
  }

  let scenario: 'status' | 'qr-direct' | 'qr-provision' | 'qr-failure' = 'status'
  const providerRequests: Array<{ url: string; method: string; apiKey: string | null; body: string | null }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    providerRequests.push({
      url,
      method: init?.method ?? 'GET',
      apiKey: headers.get('apikey'),
      body: typeof init?.body === 'string' ? init.body : null,
    })
    if (scenario === 'status') {
      return new Response(JSON.stringify({ instance: { state: 'open' } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    if (scenario === 'qr-direct') {
      return new Response(JSON.stringify({ qrcode: { base64: qrCode } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    if (scenario === 'qr-provision') {
      const body = url.endsWith('/instance/create') ? { qrCode } : { message: 'instance missing' }
      return new Response(JSON.stringify(body), {
        status: url.endsWith('/instance/create') ? 200 : 404,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ message: 'provider unavailable' }), {
      status: 502, headers: { 'content-type': 'application/json' },
    })
  }

  const webhookConfiguredFor: string[] = []
  const stateUpdates: Array<{ tenantId: string; instanceName: string; state: string }> = []
  const app = express()
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = {
        id: 'admin-1', role: 'ADMIN', tenantId: tenantOne,
        sessionId: 'session-admin', persistent: false, trustedDeviceId: null,
      }
    }
    next()
  })
  app.use('/api/admin', createAdminWhatsappConnectionRouter({
    db,
    requireWhatsappConfig: readConfig,
    ensurePlatformWhatsappConfig: readConfig,
    resolveExternalHttpsBaseUrl: async raw => raw.replace(/\/$/, ''),
    configureEvolutionWebhookForTenant: async tenantId => {
      webhookConfiguredFor.push(tenantId)
      return true
    },
    evolutionWebhookConfiguredForTenant: async tenantId => tenantId === tenantOne,
    updateEvolutionConnectionFromWebhook: (tenantId, instanceName, state) => {
      stateUpdates.push({ tenantId, instanceName, state })
      db.prepare(`UPDATE whatsapp_instances SET connection_state = ? WHERE tenant_id = ? AND instance_name = ?`)
        .run(state, tenantId, instanceName)
    },
    fetchImpl,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'x-test-admin': 'true' }

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp/status`)).status, 401)
    assert.deepEqual(await fetch(`${baseUrl}/api/admin/whatsapp/status`, { headers }).then(response => response.json()), {
      state: 'NOT_CONFIGURED',
    })
    assert.deepEqual(await fetch(`${baseUrl}/api/admin/whatsapp/qrcode`, { headers }).then(response => response.json()), {
      qrCode: null,
      state: 'NOT_CONFIGURED',
    })

    db.exec(`
      INSERT INTO whatsapp_instances VALUES (
        'tenant-instance', '${tenantOne}', 'EVOLUTION', 'https://evolution.example/', 'tenant-key',
        'studio one', 'CONFIGURED', NULL, '2030-02-01T10:00:00.000Z',
        '2030-02-01T09:00:00.000Z', 'temporary failure', 3, '2030-02-01T11:00:00.000Z',
        '2030-02-01T08:00:00.000Z', '2030-01-01T00:00:00.000Z', '2030-02-01T10:00:00.000Z'
      );
      INSERT INTO whatsapp_messages VALUES
        ('inbound-old', '${tenantOne}', 'INBOUND', '2030-02-01T08:00:00.000Z'),
        ('inbound-new', '${tenantOne}', 'INBOUND', '2030-02-02T08:00:00.000Z'),
        ('outbound', '${tenantOne}', 'OUTBOUND', '2030-02-03T08:00:00.000Z');
      INSERT INTO clients VALUES
        ('client-1', '${tenantOne}', 1),
        ('client-2', '${tenantOne}', 0),
        ('client-3', '${tenantOne}', 1);
    `)

    scenario = 'status'
    const statusResponse = await fetch(`${baseUrl}/api/admin/whatsapp/status`, { headers })
    assert.equal(statusResponse.status, 200)
    assert.deepEqual(await statusResponse.json(), { state: 'open' })
    assert.deepEqual(stateUpdates, [{ tenantId: tenantOne, instanceName: 'studio one', state: 'CONNECTED' }])
    assert.deepEqual(webhookConfiguredFor, [tenantOne])
    assert.deepEqual(providerRequests.at(-1), {
      url: 'https://evolution.example/instance/connectionState/studio%20one',
      method: 'GET', apiKey: 'tenant-key', body: null,
    })

    scenario = 'qr-direct'
    const directQr = await fetch(`${baseUrl}/api/admin/whatsapp/qrcode`, { headers }).then(response => response.json()) as {
      qrCode: string; state: string
    }
    assert.deepEqual(directQr, { qrCode, state: 'QR_SCAN' })
    assert.deepEqual(webhookConfiguredFor, [tenantOne, tenantOne])

    scenario = 'qr-provision'
    const provisionedQr = await fetch(`${baseUrl}/api/admin/whatsapp/qrcode`, { headers }).then(response => response.json()) as {
      qrCode: string; state: string
    }
    assert.deepEqual(provisionedQr, { qrCode, state: 'QR_SCAN' })
    const createRequest = [...providerRequests].reverse().find(request => request.url.endsWith('/instance/create'))
    assert.ok(createRequest)
    assert.equal(createRequest.method, 'POST')
    assert.deepEqual(JSON.parse(createRequest.body ?? '{}'), {
      instanceName: 'studio one', integration: 'WHATSAPP-BAILEYS', qrcode: true,
    })

    scenario = 'qr-failure'
    const failedQr = await fetch(`${baseUrl}/api/admin/whatsapp/qrcode`, { headers })
    assert.equal(failedQr.status, 400)
    assert.equal((await failedQr.json() as { code: string }).code, 'WHATSAPP_PROVISION_FAILED')

    const diagnosticsResponse = await fetch(`${baseUrl}/api/admin/whatsapp/diagnostics`, { headers })
    assert.equal(diagnosticsResponse.status, 200)
    assert.deepEqual(await diagnosticsResponse.json(), {
      providerWebhookConfigured: true,
      lastInboundAt: '2030-02-02T08:00:00.000Z',
      lastOutboundAt: '2030-02-03T08:00:00.000Z',
      totalClients: 3,
      optedInClients: 2,
      connectionState: 'CONNECTED',
      lastHealthCheckAt: '2030-02-01T10:00:00.000Z',
      lastConnectedAt: '2030-02-01T09:00:00.000Z',
      lastConnectionError: 'temporary failure',
      reconnectAttempts: 3,
      reconnectAfter: '2030-02-01T11:00:00.000Z',
      webhookLastAt: '2030-02-01T08:00:00.000Z',
    })
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
