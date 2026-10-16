import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import express from 'express'
import { handleError } from '../http.js'
import type { WhatsappSettings } from './adminWhatsappSettingsRoutes.js'
import { createAdminWhatsappCampaignRouter } from './adminWhatsappCampaignRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const foreignCampaign = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const fixedNow = new Date('2030-04-10T12:00:00.000Z')

const defaultSettings: WhatsappSettings = {
  confirmationsEnabled: true,
  confirmationOffsetHours: 24,
  confirmationRetryHours: 8,
  noResponseCutoffHours: 4,
  confirmationMessage: 'Confirme',
  autoCancelDeclined: false,
  remindersEnabled: true,
  reminderOffsetHours: 2,
  reminderMessage: 'Lembrete',
  promoEnabled: false,
  promoMessage: 'Promoção',
}

test('campanhas WhatsApp preservam consentimento, fila, cancelamento e isolamento', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT,
      phone_normalized TEXT, marketing_whatsapp_opt_in INTEGER, created_at TEXT
    );
    CREATE TABLE whatsapp_marketing_campaigns (
      id TEXT PRIMARY KEY, tenant_id TEXT, created_by_user_id TEXT, name TEXT,
      message_text TEXT, status TEXT, total_recipients INTEGER,
      sent_count INTEGER, failed_count INTEGER, skipped_count INTEGER,
      created_at TEXT, started_at TEXT, completed_at TEXT, cancelled_at TEXT, last_error TEXT
    );
    CREATE TABLE whatsapp_marketing_recipients (
      id TEXT PRIMARY KEY, campaign_id TEXT, tenant_id TEXT, client_user_id TEXT,
      phone_normalized TEXT, client_name TEXT, status TEXT, attempts INTEGER,
      created_at TEXT, last_error TEXT
    );
    INSERT INTO whatsapp_marketing_campaigns VALUES
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '${tenantOne}', 'admin-1', 'Finalizada',
       'Mensagem anterior', 'COMPLETED', 4, 3, 1, 0,
       '2030-03-01T10:00:00.000Z', '2030-03-01T10:01:00.000Z', '2030-03-01T10:05:00.000Z', NULL, 'Falha em uma entrega'),
      ('${foreignCampaign}', '${tenantTwo}', 'admin-2', 'Outra empresa',
       'Não deve aparecer', 'QUEUED', 1, 0, 0, 0,
       '2099-01-01T00:00:00.000Z', NULL, NULL, NULL, NULL);
  `)

  db.exec(`CREATE TABLE tenants(id TEXT,name TEXT);INSERT INTO tenants VALUES('${tenantOne}','Studio');`)
  db.exec('ALTER TABLE whatsapp_marketing_campaigns ADD COLUMN image_data_url TEXT; ALTER TABLE whatsapp_marketing_recipients ADD COLUMN dispatch_started_at TEXT;')
  let promoEnabled = false
  const requireWhatsappSettings = (_tenantId: string): WhatsappSettings => ({
    ...defaultSettings,
    promoEnabled,
  })

  const commonOptions = {
    db,
    maxRecipients: 2,
    sendIntervalSeconds: 15,
    requireWhatsappSettings,
    defaultWhatsappSettings: defaultSettings,
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
  app.use('/api/admin', createAdminWhatsappCampaignRouter({ ...commonOptions, campaignsEnabled: true }))
  app.use('/api/disabled', createAdminWhatsappCampaignRouter({ ...commonOptions, campaignsEnabled: false }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'content-type': 'application/json', 'x-test-admin': 'true' }
  const picture = await sharp({create:{width:16,height:12,channels:3,background:'#972d57'}}).png().toBuffer()
  const campaignBody = JSON.stringify({ name: 'Semana especial', message: 'Temos uma condição especial para você.', imageDataUrl: `data:image/png;base64,${picture.toString('base64')}` })

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp/campaigns`)).status, 401)

    const initialList = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns`, { headers }).then(response => response.json()) as {
      enabled: boolean
      maxRecipients: number
      sendIntervalSeconds: number
      campaigns: Array<Record<string, unknown>>
    }
    assert.equal(initialList.enabled, true)
    assert.equal(initialList.maxRecipients, 2)
    assert.equal(initialList.sendIntervalSeconds, 60)
    assert.deepEqual(initialList.campaigns, [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Finalizada',
      hasImage: false,
      messageText: 'Mensagem anterior',
      status: 'COMPLETED',
      totalRecipients: 4,
      sentCount: 3,
      failedCount: 1,
      skippedCount: 0,
      createdAt: '2030-03-01T10:00:00.000Z',
      startedAt: '2030-03-01T10:01:00.000Z',
      completedAt: '2030-03-01T10:05:00.000Z',
      cancelledAt: null,
      lastError: 'Falha em uma entrega',
    }])

    const disabled = await fetch(`${baseUrl}/api/disabled/whatsapp/campaigns`, {
      method: 'POST', headers, body: campaignBody,
    })
    assert.equal(disabled.status, 403)
    assert.equal((await disabled.json() as { code: string }).code, 'WHATSAPP_CAMPAIGNS_DISABLED')

    const promoDisabled = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns`, {
      method: 'POST', headers, body: campaignBody,
    })
    assert.equal(promoDisabled.status, 400)
    assert.equal((await promoDisabled.json() as { code: string }).code, 'WHATSAPP_PROMO_MODEL_DISABLED')

    promoEnabled = true
    const emptyAudience = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns`, {
      method: 'POST', headers, body: campaignBody,
    })
    assert.equal(emptyAudience.status, 400)
    assert.equal((await emptyAudience.json() as { code: string }).code, 'WHATSAPP_CAMPAIGN_EMPTY_AUDIENCE')

    db.exec(`
      INSERT INTO clients VALUES
        ('client-1', '${tenantOne}', 'user-1', 'Ana', '5579999990001', 1, '2030-01-01T00:00:00.000Z'),
        ('client-2', '${tenantOne}', 'user-2', 'Bia', '5579999990002', 1, '2030-01-02T00:00:00.000Z'),
        ('client-3', '${tenantOne}', 'user-3', 'Carla', '5579999990003', 1, '2030-01-03T00:00:00.000Z'),
        ('client-no-opt-in', '${tenantOne}', 'user-4', 'Dora', '5579999990004', 0, '2030-01-04T00:00:00.000Z'),
        ('client-no-phone', '${tenantOne}', 'user-5', 'Eva', NULL, 1, '2030-01-05T00:00:00.000Z'),
        ('client-foreign', '${tenantTwo}', 'user-6', 'Externa', '5579999999999', 1, '2030-01-01T00:00:00.000Z');
    `)

    const overLimit = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns`, {
      method: 'POST', headers, body: campaignBody,
    })
    // Large audiences are batched to the configured cap instead of blocking the studio.
    const createdResponse = overLimit
    assert.equal(createdResponse.status, 200)
    const created = (await createdResponse.json() as {
      ok: boolean
      campaign: { id: string; status: string; totalRecipients: number; createdAt: string }
    }).campaign
    assert.equal(created.status, 'QUEUED')
    assert.equal(created.totalRecipients, 2)
    assert.equal(created.createdAt, fixedNow.toISOString())

    const storedCampaign = db.prepare(`
      SELECT tenant_id as tenantId, created_by_user_id as createdByUserId, message_text as messageText
      FROM whatsapp_marketing_campaigns WHERE id = ?
    `).get(created.id) as { tenantId: string; createdByUserId: string; messageText: string }
    const image = db.prepare('SELECT image_data_url AS image FROM whatsapp_marketing_campaigns WHERE id=?').get(created.id) as {image:string}
    assert.ok(image.image.startsWith('data:image/jpeg;base64,'))
    const listing = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns`,{headers}).then(response=>response.json()) as {campaigns:Array<{id:string;hasImage:boolean;imageDataUrl?:string}>}
    assert.equal(listing.campaigns.find(row=>row.id===created.id)?.hasImage,true)
    assert.equal(listing.campaigns.find(row=>row.id===created.id)?.imageDataUrl,undefined)
    assert.equal(storedCampaign.tenantId, tenantOne)
    assert.equal(storedCampaign.createdByUserId, 'admin-1')
    assert.match(storedCampaign.messageText, /responda SAIR\.$/)

    const recipients = db.prepare(`
      SELECT tenant_id as tenantId, client_user_id as clientUserId, phone_normalized as phone,
             client_name as clientName, status
      FROM whatsapp_marketing_recipients WHERE campaign_id = ? ORDER BY created_at, client_name
    `).all(created.id) as Array<Record<string, unknown>>
    assert.deepEqual(recipients, [
      { tenantId: tenantOne, clientUserId: 'user-1', phone: '5579999990001', clientName: 'Ana', status: 'PENDING' },
      { tenantId: tenantOne, clientUserId: 'user-2', phone: '5579999990002', clientName: 'Bia', status: 'PENDING' },
    ])

    const duplicateActive = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns`, {
      method: 'POST', headers, body: campaignBody,
    })
    assert.equal(duplicateActive.status, 400)
    assert.equal((await duplicateActive.json() as { code: string }).code, 'WHATSAPP_CAMPAIGN_ALREADY_ACTIVE')

    const foreignCancel = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns/${foreignCampaign}/cancel`, {
      method: 'POST', headers,
    })
    assert.equal(foreignCancel.status, 404)

    const firstRecipient = db.prepare(`SELECT id FROM whatsapp_marketing_recipients WHERE campaign_id = ? ORDER BY client_name LIMIT 1`).get(created.id) as { id: string }
    db.prepare(`UPDATE whatsapp_marketing_recipients SET status = 'SENDING' WHERE id = ?`).run(firstRecipient.id)
    const cancelled = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns/${created.id}/cancel`, {
      method: 'POST', headers,
    })
    assert.equal(cancelled.status, 200)
    const cancelledCampaign = db.prepare(`
      SELECT status, skipped_count as skippedCount, cancelled_at as cancelledAt, completed_at as completedAt
      FROM whatsapp_marketing_campaigns WHERE id = ?
    `).get(created.id) as { status: string; skippedCount: number; cancelledAt: string; completedAt: string }
    assert.deepEqual(cancelledCampaign, {
      status: 'CANCELLED', skippedCount: 1,
      cancelledAt: fixedNow.toISOString(), completedAt: fixedNow.toISOString(),
    })
    const recipientStates = db.prepare(`SELECT status, last_error as lastError FROM whatsapp_marketing_recipients WHERE campaign_id = ? ORDER BY status`).all(created.id)
    assert.deepEqual(recipientStates, [
      { status: 'SENDING', lastError: null },
      { status: 'SKIPPED', lastError: 'Campanha cancelada' },
    ])

    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp/campaigns/${created.id}/cancel`, { method: 'POST', headers })).status, 404)
    const broadcast = await fetch(`${baseUrl}/api/admin/whatsapp/broadcast`, { method: 'POST', headers })
    assert.equal(broadcast.status, 403)
    assert.equal((await broadcast.json() as { code: string }).code, 'WHATSAPP_BROADCAST_REPLACED')
    const tooLong = await fetch(`${baseUrl}/api/admin/whatsapp/campaigns`,{method:'POST',headers,body:JSON.stringify({name:'Texto longo',message:'a'.repeat(1024),imageDataUrl:`data:image/png;base64,${picture.toString('base64')}`})})
    assert.equal(tooLong.status,400)
    assert.equal((await tooLong.json() as {code:string}).code,'WHATSAPP_CAMPAIGN_MESSAGE_TOO_LONG')
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
