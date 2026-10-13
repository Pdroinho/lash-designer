import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import {
  createAdminWhatsappSettingsRouter,
  type WhatsappConfig,
  type WhatsappSettings,
} from './adminWhatsappSettingsRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const fixedNow = new Date('2030-03-10T12:00:00.000Z')

const defaults: WhatsappSettings = {
  confirmationsEnabled: true,
  confirmationOffsetHours: 24,
  confirmationRetryHours: 8,
  noResponseCutoffHours: 4,
  confirmationMessage: 'Confirme {{nome}}',
  autoCancelDeclined: false,
  remindersEnabled: true,
  reminderOffsetHours: 2,
  reminderMessage: 'Lembrete {{nome}}',
  promoEnabled: false,
  promoMessage: 'Novidade {{nome}}',
}

test('configurações de WhatsApp preservam segredo, janelas e isolamento por tenant', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE whatsapp_instances (
      id TEXT PRIMARY KEY, tenant_id TEXT, provider TEXT, base_url TEXT, api_key TEXT,
      instance_name TEXT, status TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE whatsapp_settings (
      tenant_id TEXT PRIMARY KEY, confirmations_enabled INTEGER,
      confirmation_offset_hours INTEGER, confirmation_retry_hours INTEGER,
      no_response_cutoff_hours INTEGER, confirmation_message TEXT,
      auto_cancel_declined INTEGER, reminders_enabled INTEGER,
      reminder_offset_hours INTEGER, reminder_message TEXT,
      promo_enabled INTEGER, promo_message TEXT, created_at TEXT, updated_at TEXT
    );
    INSERT INTO whatsapp_instances VALUES (
      'foreign-instance', '${tenantTwo}', 'EVOLUTION', 'https://foreign.example',
      'encrypted-foreign', 'foreign-name', 'CONNECTED',
      '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'
    );
    INSERT INTO whatsapp_settings VALUES (
      '${tenantTwo}', 0, 48, 10, 6, 'Foreign confirmation', 1,
      0, 4, 'Foreign reminder', 1, 'Foreign promo',
      '2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'
    );
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

  const readSettings = (tenantId: string): WhatsappSettings | null => {
    const row = db.prepare(`
      SELECT confirmations_enabled as confirmationsEnabled,
             confirmation_offset_hours as confirmationOffsetHours,
             confirmation_retry_hours as confirmationRetryHours,
             no_response_cutoff_hours as noResponseCutoffHours,
             confirmation_message as confirmationMessage,
             auto_cancel_declined as autoCancelDeclined,
             reminders_enabled as remindersEnabled,
             reminder_offset_hours as reminderOffsetHours,
             reminder_message as reminderMessage,
             promo_enabled as promoEnabled,
             promo_message as promoMessage,
             updated_at as updatedAt
      FROM whatsapp_settings WHERE tenant_id = ?
    `).get(tenantId) as {
      confirmationsEnabled: number
      confirmationOffsetHours: number
      confirmationRetryHours: number
      noResponseCutoffHours: number
      confirmationMessage: string
      autoCancelDeclined: number
      remindersEnabled: number
      reminderOffsetHours: number
      reminderMessage: string
      promoEnabled: number
      promoMessage: string
      updatedAt: string
    } | undefined
    if (!row) return null
    return {
      ...row,
      confirmationsEnabled: Boolean(row.confirmationsEnabled),
      autoCancelDeclined: Boolean(row.autoCancelDeclined),
      remindersEnabled: Boolean(row.remindersEnabled),
      promoEnabled: Boolean(row.promoEnabled),
    }
  }

  const scheduledTenants: string[] = []
  const routerOptions = {
    db,
    requireWhatsappConfig: readConfig,
    ensurePlatformWhatsappConfig: readConfig,
    requireWhatsappSettings: readSettings,
    defaultWhatsappSettings: defaults,
    resolveExternalHttpsBaseUrl: async (raw: string) => raw.replace(/\/$/, ''),
    encryptTenantApiKey: (apiKey: string, tenantId: string) => `encrypted:${tenantId}:${apiKey}`,
    scheduleAppointmentAutomationJobsForTenant: (tenantId: string) => { scheduledTenants.push(tenantId) },
    now: () => fixedNow,
  }

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = {
        id: 'admin-1', role: 'ADMIN', tenantId: tenantOne,
        sessionId: 'session-admin', persistent: false, trustedDeviceId: null,
      }
    }
    next()
  })
  app.use('/api/admin', createAdminWhatsappSettingsRouter({ ...routerOptions, production: false }))
  app.use('/api/managed', createAdminWhatsappSettingsRouter({ ...routerOptions, production: true }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp`)).status, 401)
    assert.deepEqual(await fetch(`${baseUrl}/api/admin/whatsapp`, { headers }).then(response => response.json()), { instance: null })

    const created = await fetch(`${baseUrl}/api/admin/whatsapp`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        provider: 'EVOLUTION', baseUrl: 'https://evolution.example/',
        apiKey: '1234567890abcdef', instanceName: 'studio-one',
      }),
    })
    assert.equal(created.status, 200)
    const stored = db.prepare(`SELECT tenant_id as tenantId, base_url as baseUrl, api_key as apiKey, instance_name as instanceName FROM whatsapp_instances WHERE tenant_id = ?`).get(tenantOne) as {
      tenantId: string; baseUrl: string; apiKey: string; instanceName: string
    }
    assert.deepEqual(stored, {
      tenantId: tenantOne,
      baseUrl: 'https://evolution.example',
      apiKey: `encrypted:${tenantOne}:1234567890abcdef`,
      instanceName: 'studio-one',
    })

    const publicConfig = await fetch(`${baseUrl}/api/admin/whatsapp`, { headers }).then(response => response.json()) as {
      instance: Record<string, unknown>
    }
    assert.equal(publicConfig.instance.hasApiKey, true)
    assert.equal(publicConfig.instance.instanceName, 'studio-one')
    assert.equal('apiKey' in publicConfig.instance, false)

    const updated = await fetch(`${baseUrl}/api/admin/whatsapp`, {
      method: 'PUT', headers, body: JSON.stringify({ instanceName: 'studio-renamed' }),
    })
    assert.equal(updated.status, 200)
    const retained = db.prepare(`SELECT base_url as baseUrl, api_key as apiKey, instance_name as instanceName FROM whatsapp_instances WHERE tenant_id = ?`).get(tenantOne) as {
      baseUrl: string; apiKey: string; instanceName: string
    }
    assert.deepEqual(retained, {
      baseUrl: 'https://evolution.example',
      apiKey: `encrypted:${tenantOne}:1234567890abcdef`,
      instanceName: 'studio-renamed',
    })
    assert.equal((db.prepare('SELECT instance_name as instanceName FROM whatsapp_instances WHERE tenant_id = ?').get(tenantTwo) as { instanceName: string }).instanceName, 'foreign-name')

    const managedSecret = await fetch(`${baseUrl}/api/managed/whatsapp`, {
      method: 'PUT', headers, body: JSON.stringify({ apiKey: 'fedcba0987654321' }),
    })
    assert.equal(managedSecret.status, 403)
    assert.equal((await managedSecret.json() as { code: string }).code, 'WHATSAPP_PLATFORM_MANAGED')

    const defaultResponse = await fetch(`${baseUrl}/api/admin/whatsapp/settings`, { headers })
    assert.equal(defaultResponse.status, 200)
    assert.deepEqual((await defaultResponse.json() as { settings: WhatsappSettings }).settings, defaults)

    const invalidWindow = await fetch(`${baseUrl}/api/admin/whatsapp/settings`, {
      method: 'PUT', headers,
      body: JSON.stringify({ confirmationOffsetHours: 12, noResponseCutoffHours: 12 }),
    })
    assert.equal(invalidWindow.status, 400)
    assert.equal((await invalidWindow.json() as { code: string }).code, 'INVALID_CONFIRMATION_WINDOW')

    const invalidRetry = await fetch(`${baseUrl}/api/admin/whatsapp/settings`, {
      method: 'PUT', headers,
      body: JSON.stringify({ confirmationOffsetHours: 12, noResponseCutoffHours: 4, confirmationRetryHours: 8 }),
    })
    assert.equal(invalidRetry.status, 400)
    assert.equal((await invalidRetry.json() as { code: string }).code, 'INVALID_CONFIRMATION_RETRY')

    const savedSettings = await fetch(`${baseUrl}/api/admin/whatsapp/settings`, {
      method: 'PUT', headers,
      body: JSON.stringify({
        confirmationsEnabled: false,
        confirmationOffsetHours: 48,
        confirmationRetryHours: 10,
        noResponseCutoffHours: 6,
        confirmationMessage: '  Confirme seu horário  ',
        remindersEnabled: false,
        reminderMessage: '  Seu lembrete  ',
        promoEnabled: true,
        promoMessage: '  Promoção da semana  ',
      }),
    })
    assert.equal(savedSettings.status, 200)
    assert.deepEqual(scheduledTenants, [tenantOne])
    const tenantSettings = readSettings(tenantOne)
    assert.ok(tenantSettings)
    assert.equal(tenantSettings.confirmationMessage, 'Confirme seu horário')
    assert.equal(tenantSettings.reminderMessage, 'Seu lembrete')
    assert.equal(tenantSettings.promoMessage, 'Promoção da semana')
    assert.equal(tenantSettings.updatedAt, fixedNow.toISOString())

    const partialUpdate = await fetch(`${baseUrl}/api/admin/whatsapp/settings`, {
      method: 'PUT', headers, body: JSON.stringify({ remindersEnabled: true }),
    })
    assert.equal(partialUpdate.status, 200)
    const partialSettings = readSettings(tenantOne)
    assert.equal(partialSettings?.remindersEnabled, true)
    assert.equal(partialSettings?.confirmationOffsetHours, 48)
    assert.deepEqual(scheduledTenants, [tenantOne, tenantOne])
    assert.equal(readSettings(tenantTwo)?.confirmationMessage, 'Foreign confirmation')
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
