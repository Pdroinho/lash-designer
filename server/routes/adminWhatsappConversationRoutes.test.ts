import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminWhatsappConversationRouter } from './adminWhatsappConversationRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const conversationOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const conversationTwo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const textMessageOld = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const textMessageNew = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const mediaMessage = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const foreignMessage = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const fixedNow = new Date('2030-04-10T12:00:00.000Z')

test('conversas WhatsApp preservam envio, mídia, leitura, limitador e isolamento', async () => {
  const mediaRoot = await mkdtemp(path.join(tmpdir(), 'lash-whatsapp-media-'))
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT,
      marketing_whatsapp_opt_in INTEGER
    );
    CREATE TABLE services (
      id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, price_cents INTEGER
    );
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, client_user_id TEXT, service_id TEXT,
      status TEXT, starts_at TEXT, confirmation_status TEXT
    );
    CREATE TABLE whatsapp_conversations (
      id TEXT PRIMARY KEY, tenant_id TEXT, phone_normalized TEXT, display_name TEXT,
      client_user_id TEXT, unread_count INTEGER, last_message_preview TEXT,
      last_message_direction TEXT, last_message_at TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE whatsapp_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT, conversation_id TEXT, phone_normalized TEXT,
      direction TEXT, message_type TEXT, body_text TEXT, source TEXT,
      provider_message_id TEXT, sent_at TEXT, created_at TEXT,
      delivery_status TEXT, status_updated_at TEXT, media_status TEXT,
      media_mime_type TEXT, media_file_name TEXT, media_size_bytes INTEGER,
      media_storage_path TEXT
    );

    INSERT INTO clients VALUES
      ('client-1', '${tenantOne}', 'user-1', 'Ana Lima', 1),
      ('client-foreign', '${tenantTwo}', 'user-2', 'Cliente externa', 1);
    INSERT INTO services VALUES
      ('service-1', '${tenantOne}', 'Volume brasileiro', 15990),
      ('service-foreign', '${tenantTwo}', 'Outro serviço', 99999);
    INSERT INTO appointments VALUES
      ('appointment-history', '${tenantOne}', 'user-1', 'service-1', 'COMPLETED', '2030-04-01T12:00:00.000Z', 'CONFIRMED'),
      ('appointment-cancelled', '${tenantOne}', 'user-1', 'service-1', 'CANCELLED', '2030-04-02T12:00:00.000Z', 'DECLINED'),
      ('appointment-upcoming', '${tenantOne}', 'user-1', 'service-1', 'CONFIRMED', '2030-04-20T12:00:00.000Z', 'AWAITING_CONFIRMATION'),
      ('appointment-foreign', '${tenantTwo}', 'user-2', 'service-foreign', 'CONFIRMED', '2030-04-11T12:00:00.000Z', 'CONFIRMED');
    INSERT INTO whatsapp_conversations VALUES
      ('${conversationOne}', '${tenantOne}', '5579999990001', 'Nome antigo', 'user-1', 2,
       'Mensagem mais recente', 'INBOUND', '2030-04-10T11:00:00.000Z', '2030-01-01T00:00:00.000Z', '2030-04-10T11:00:00.000Z'),
      ('${conversationTwo}', '${tenantTwo}', '5579999990002', 'Conversa externa', 'user-2', 9,
       'Segredo externo', 'INBOUND', '2099-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z');
    INSERT INTO whatsapp_messages VALUES
      ('${textMessageOld}', '${tenantOne}', '${conversationOne}', '5579999990001', 'INBOUND', 'TEXT', 'Primeira', 'WEBHOOK', 'provider-1',
       '2030-04-10T10:00:00.000Z', '2030-04-10T10:00:00.000Z', 'RECEIVED', '2030-04-10T10:00:00.000Z', 'NONE', NULL, NULL, NULL, NULL),
      ('${textMessageNew}', '${tenantOne}', '${conversationOne}', '5579999990001', 'OUTBOUND', 'TEXT', 'Segunda', 'MANUAL', 'provider-2',
       '2030-04-10T10:30:00.000Z', '2030-04-10T10:30:00.000Z', 'SENT', '2030-04-10T10:30:00.000Z', 'NONE', NULL, NULL, NULL, NULL),
      ('${foreignMessage}', '${tenantTwo}', '${conversationTwo}', '5579999990002', 'INBOUND', 'TEXT', 'Mensagem externa', 'WEBHOOK', 'provider-x',
       '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', 'RECEIVED', '2099-01-01T00:00:00.000Z', 'NONE', NULL, NULL, NULL, NULL);
  `)

  const mediaContent = Buffer.from('imagem privada do teste')
  const relativeMediaPath = path.join(tenantOne, `${mediaMessage}.png`)
  await mkdir(path.dirname(path.join(mediaRoot, relativeMediaPath)), { recursive: true })
  await writeFile(path.join(mediaRoot, relativeMediaPath), mediaContent)
  db.prepare(`
    INSERT INTO whatsapp_messages VALUES (?, ?, ?, ?, 'INBOUND', 'IMAGE', '', 'WEBHOOK', 'provider-media',
      '2030-04-10T10:45:00.000Z', '2030-04-10T10:45:00.000Z', 'RECEIVED', '2030-04-10T10:45:00.000Z',
      'READY', 'image/png', ?, ?, ?)
  `).run(mediaMessage, tenantOne, conversationOne, '5579999990001', 'foto\r\n"suspeita.png', mediaContent.length, relativeMediaPath)

  let limiterCalls = 0
  const webhookTenants: string[] = []
  const sends: Array<{ tenantId: string; phone: string; text: string; options: Record<string, unknown> }> = []
  let sendSucceeds = true
  let generatedMessages = 0

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
  app.use('/api/admin', createAdminWhatsappConversationRouter({
    db,
    whatsappMediaDir: mediaRoot,
    whatsappSendLimiter: (_req, _res, next) => {
      limiterCalls += 1
      next()
    },
    configureEvolutionWebhookForTenant: async tenantId => {
      webhookTenants.push(tenantId)
      return true
    },
    sendWhatsappTextForTenant: async (tenantId, phone, text, options) => {
      sends.push({ tenantId, phone, text, options })
      if (!sendSucceeds) return false
      if (options.persist !== false && phone === '5579999990001') {
        generatedMessages += 1
        db.prepare(`
          INSERT INTO whatsapp_messages
            (id, tenant_id, conversation_id, phone_normalized, direction, message_type, body_text, source,
             provider_message_id, sent_at, created_at, delivery_status, status_updated_at, media_status)
          VALUES (?, ?, ?, ?, 'OUTBOUND', 'TEXT', ?, 'MANUAL', ?, ?, ?, 'SENT', ?, 'NONE')
        `).run(
          `99999999-9999-4999-8999-${String(generatedMessages).padStart(12, '0')}`,
          tenantId, conversationOne, phone, text, `manual-${generatedMessages}`,
          fixedNow.toISOString(), fixedNow.toISOString(), fixedNow.toISOString(),
        )
      }
      return true
    },
    now: () => fixedNow,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp/conversations`)).status, 401)

    const listed = await fetch(`${baseUrl}/api/admin/whatsapp/conversations?search=Ana%25_`, { headers })
      .then(response => response.json()) as { conversations: Array<Record<string, unknown>> }
    assert.equal(listed.conversations.length, 1)
    assert.deepEqual(listed.conversations[0], {
      id: conversationOne,
      phone: '5579999990001',
      displayName: 'Ana Lima',
      unreadCount: 2,
      lastMessage: 'Mensagem mais recente',
      lastDirection: 'INBOUND',
      lastMessageAt: '2030-04-10T11:00:00.000Z',
      client: {
        id: 'client-1', userId: 'user-1', name: 'Ana Lima',
        marketingOptIn: true, appointmentsCount: 1,
      },
      upcomingAppointment: {
        id: 'appointment-upcoming', startsAt: '2030-04-20T12:00:00.000Z',
        serviceName: 'Volume brasileiro', priceCents: 15990,
        confirmationStatus: 'AWAITING_CONFIRMATION',
      },
    })

    const messages = await fetch(`${baseUrl}/api/admin/whatsapp/conversations/${conversationOne}/messages`, { headers })
      .then(response => response.json()) as { messages: Array<{ id: string }> }
    assert.deepEqual(messages.messages.map(message => message.id), [textMessageOld, textMessageNew, mediaMessage])
    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp/conversations/${conversationTwo}/messages`, { headers })).status, 404)

    const media = await fetch(`${baseUrl}/api/admin/whatsapp/messages/${mediaMessage}/media`, { headers })
    assert.equal(media.status, 200)
    assert.equal(media.headers.get('content-type'), 'image/png')
    assert.equal(media.headers.get('cache-control'), 'private, max-age=300')
    assert.equal(media.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(media.headers.get('content-disposition'), 'inline; filename="foto___suspeita.png"')
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), mediaContent)
    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp/messages/${foreignMessage}/media`, { headers })).status, 404)

    const markedRead = await fetch(`${baseUrl}/api/admin/whatsapp/conversations/${conversationOne}/read`, { method: 'POST', headers })
    assert.equal(markedRead.status, 200)
    assert.deepEqual(db.prepare(`SELECT unread_count as unreadCount, updated_at as updatedAt FROM whatsapp_conversations WHERE id = ?`).get(conversationOne), {
      unreadCount: 0, updatedAt: fixedNow.toISOString(),
    })
    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp/conversations/${conversationTwo}/read`, { method: 'POST', headers })).status, 404)

    const newConversationSend = await fetch(`${baseUrl}/api/admin/whatsapp/send`, {
      method: 'POST', headers,
      body: JSON.stringify({ contactName: 'Nova cliente', toPhone: '5579999990999', text: 'Olá!', recordInInbox: false }),
    })
    assert.equal(newConversationSend.status, 200)
    assert.deepEqual(webhookTenants, [tenantOne])
    assert.deepEqual(sends.at(-1), {
      tenantId: tenantOne, phone: '5579999990999', text: 'Olá!',
      options: { source: 'MANUAL', persist: false, displayName: 'Nova cliente' },
    })

    sendSucceeds = false
    const failedSend = await fetch(`${baseUrl}/api/admin/whatsapp/send`, {
      method: 'POST', headers,
      body: JSON.stringify({ toPhone: '5579999990999', text: 'Falha simulada' }),
    })
    assert.equal(failedSend.status, 400)
    assert.equal((await failedSend.json() as { code: string }).code, 'WHATSAPP_SEND_FAILED')

    sendSucceeds = true
    const reply = await fetch(`${baseUrl}/api/admin/whatsapp/conversations/${conversationOne}/messages`, {
      method: 'POST', headers, body: JSON.stringify({ text: 'Resposta manual' }),
    })
    assert.equal(reply.status, 200)
    const replyBody = await reply.json() as { message: { text: string; source: string } }
    assert.equal(replyBody.message.text, 'Resposta manual')
    assert.equal(replyBody.message.source, 'MANUAL')
    assert.deepEqual(sends.at(-1), {
      tenantId: tenantOne, phone: '5579999990001', text: 'Resposta manual',
      options: { source: 'MANUAL' },
    })

    const sendsBeforeForeignAttempt = sends.length
    assert.equal((await fetch(`${baseUrl}/api/admin/whatsapp/conversations/${conversationTwo}/messages`, {
      method: 'POST', headers, body: JSON.stringify({ text: 'Tentativa externa' }),
    })).status, 404)
    assert.equal(sends.length, sendsBeforeForeignAttempt)
    assert.equal(limiterCalls, 4)
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
    await rm(mediaRoot, { recursive: true, force: true })
  }
})
