import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createWhatsappEvolutionRuntime } from './whatsappEvolutionRuntime.js'
import { createClientMarketingConsentService } from './clientMarketingConsentService.js'

const fixedNow = new Date('2030-08-01T12:00:00.000Z')
const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'

function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT, encrypted INTEGER, updated_at TEXT);
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, name TEXT);
    CREATE TABLE whatsapp_instances (
      id TEXT PRIMARY KEY, tenant_id TEXT, provider TEXT, base_url TEXT, api_key TEXT,
      instance_name TEXT, status TEXT, connection_state TEXT, last_health_check_at TEXT,
      last_connected_at TEXT, reconnect_attempts INTEGER DEFAULT 0, reconnect_after TEXT,
      last_connection_error TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE whatsapp_settings (
      tenant_id TEXT PRIMARY KEY, confirmations_enabled INTEGER, confirmation_offset_hours INTEGER,
      confirmation_retry_hours INTEGER, no_response_cutoff_hours INTEGER, confirmation_message TEXT,
      auto_cancel_declined INTEGER, reminders_enabled INTEGER, reminder_offset_hours INTEGER,
      reminder_message TEXT, promo_enabled INTEGER, promo_message TEXT, updated_at TEXT
    );
    CREATE TABLE clients (
      user_id TEXT, tenant_id TEXT, name TEXT, phone TEXT, phone_normalized TEXT,
      marketing_whatsapp_opt_in INTEGER DEFAULT 0, marketing_whatsapp_opt_in_at TEXT,
      marketing_whatsapp_opt_out_at TEXT, marketing_consent_version TEXT, marketing_consent_source TEXT,
      PRIMARY KEY (user_id, tenant_id)
    );
    CREATE TABLE whatsapp_conversations (
      id TEXT PRIMARY KEY, tenant_id TEXT, phone_normalized TEXT, display_name TEXT,
      client_user_id TEXT, unread_count INTEGER, last_message_preview TEXT,
      last_message_direction TEXT, last_message_at TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE whatsapp_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT, conversation_id TEXT, phone_normalized TEXT,
      direction TEXT, message_type TEXT, body_text TEXT, source TEXT, provider_message_id TEXT,
      sent_at TEXT, created_at TEXT, delivery_status TEXT, status_updated_at TEXT,
      media_status TEXT, media_remote_jid TEXT, media_next_attempt_at TEXT
    );
    CREATE TABLE client_marketing_consent_events (
      id TEXT PRIMARY KEY, tenant_id TEXT, client_user_id TEXT, channel TEXT, action TEXT,
      policy_version TEXT, consent_text TEXT, source TEXT, created_at TEXT
    );
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, client_user_id TEXT, starts_at TEXT, status TEXT,
      confirmation_code TEXT, confirmation_sent_at TEXT, confirmation_reminder_sent_at TEXT,
      confirmation_status TEXT, confirmation_responded_at TEXT, confirmation_last_inbound_at TEXT,
      confirmation_last_inbound_text TEXT
    );
    CREATE TABLE appointment_confirmation_events (
      id TEXT PRIMARY KEY, tenant_id TEXT, appointment_id TEXT, event_type TEXT,
      provider_message_id TEXT, created_at TEXT
    );
    INSERT INTO platform_settings VALUES
      ('evolution_api_url', 'https://platform.example/', 0, '${fixedNow.toISOString()}'),
      ('evolution_api_key', 'cipher:global-secret', 1, '${fixedNow.toISOString()}');
    INSERT INTO tenants VALUES
      ('${tenantOne}', 'studio-aurora', 'Studio Aurora'),
      ('${tenantTwo}', 'studio-lua', 'Studio Lua');
    INSERT INTO whatsapp_instances
      (id, tenant_id, provider, base_url, api_key, instance_name, status, connection_state, reconnect_attempts, created_at, updated_at)
    VALUES
      ('instance-one', '${tenantOne}', 'EVOLUTION', 'https://tenant.example/', 'cipher:tenant-secret', 'studio-one', 'CONNECTED', 'CONNECTED', 0, '${fixedNow.toISOString()}', '${fixedNow.toISOString()}');
    INSERT INTO clients (user_id, tenant_id, name, phone, phone_normalized, marketing_whatsapp_opt_in)
    VALUES
      ('client-one', '${tenantOne}', 'Ana', '+5511999999999', '5511999999999', 0),
      ('client-two', '${tenantTwo}', 'Bia', '+5511999999999', '5511999999999', 0);
  `)
  return db
}

function createRuntime(db: Database.Database, options: {
  production?: boolean
  fetchFn?: typeof fetch
  resolveExternalHttpsBaseUrl?: (raw: string) => Promise<string>
  events?: Array<Record<string, unknown>>
  cancellations?: Array<Record<string, unknown>>
} = {}) {
  let id = 0
  const events = options.events ?? []
  const cancellations = options.cancellations ?? []
  return createWhatsappEvolutionRuntime({
    db,
    production: options.production ?? false,
    appBaseUrl: 'https://app.example/',
    webhookSecret: 'webhook-secret',
    normalizeFallbackPhone: raw => raw.replace(/\D/g, ''),
    decryptPlatformApiKey: value => value?.replace(/^cipher:/, '') ?? null,
    decryptTenantApiKey: value => value?.replace(/^cipher:/, '') ?? null,
    resolveExternalHttpsBaseUrl: options.resolveExternalHttpsBaseUrl ?? (async raw => raw.replace(/\/$/, '')),
    getAppointmentAutomation: () => ({
      confirmationAppointmentById: () => ({ timeZone: 'UTC' }),
      formatAppointmentLocal: () => ({ dateText: '2 de agosto', timeText: '12:00' }),
      cancelAppointmentJobs: (tenantId, appointmentId, kinds) => cancellations.push({ tenantId, appointmentId, kinds }),
      confirmationEvent: input => { events.push(input) },
    }),
    now: () => new Date(fixedNow),
    fetchFn: options.fetchFn ?? (async () => new Response(JSON.stringify({ key: { id: 'provider-out' } }), { status: 200 })) as typeof fetch,
    randomId: () => `generated-${++id}`,
  })
}

test('configuração por tenant respeita segredos locais, modo gerenciado e criação isolada', () => {
  const db = createTestDb()
  const local = createRuntime(db).requireWhatsappConfig(tenantOne)
  assert.equal(local?.baseUrl, 'https://tenant.example/')
  assert.equal(local?.apiKey, 'tenant-secret')
  assert.equal(local?.usesGlobalApiKey, false)

  const managedRuntime = createRuntime(db, { production: true })
  const managed = managedRuntime.requireWhatsappConfig(tenantOne)
  assert.equal(managed?.baseUrl, 'https://platform.example/')
  assert.equal(managed?.apiKey, 'global-secret')
  assert.equal(managed?.storedApiKeyCiphertext, 'cipher:tenant-secret')
  assert.equal(managed?.usesGlobalApiKey, true)

  const created = managedRuntime.ensurePlatformWhatsappConfig(tenantTwo)
  assert.match(created?.instanceName ?? '', /^lash-studio-lua-22222222$/)
  assert.equal(created?.apiKey, 'global-secret')
  assert.equal((db.prepare(`SELECT COUNT(*) as n FROM whatsapp_instances WHERE tenant_id = ?`).get(tenantOne) as { n: number }).n, 1)
  db.close()
})

test('webhook passa pela resolução HTTPS protegida e valida contrato completo', async () => {
  const db = createTestDb()
  const resolved: string[] = []
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const runtime = createRuntime(db, {
    resolveExternalHttpsBaseUrl: async raw => { resolved.push(raw); return raw.replace(/\/$/, '') },
    fetchFn: (async (input, init) => {
      requests.push({ url: String(input), init })
      if (String(input).includes('/webhook/find/')) return new Response(JSON.stringify({ webhook: {
        enabled: true,
        url: `https://app.example/api/webhooks/evolution/${tenantOne}`,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      } }), { status: 200 })
      return new Response('{}', { status: 200 })
    }) as typeof fetch,
  })

  assert.equal(await runtime.configureEvolutionWebhookForTenant(tenantOne), true)
  assert.equal(await runtime.evolutionWebhookConfiguredForTenant(tenantOne), true)
  assert.deepEqual(resolved, ['https://tenant.example/', 'https://tenant.example/'])
  assert.match(requests[0].url, /\/webhook\/set\/studio-one$/)
  const body = JSON.parse(String(requests[0].init?.body)) as Record<string, unknown>
  assert.equal(body.url, `https://app.example/api/webhooks/evolution/${tenantOne}`)
  assert.deepEqual(body.events, ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'])
  assert.deepEqual(body.headers, { 'x-webhook-secret': 'webhook-secret' })
  assert.equal(requests.every(request => request.init?.redirect === 'error' || request.url.includes('/webhook/find/')), true)
  db.close()
})

test('persistência deduplica por tenant, preserva mídia e não cruza conversas', () => {
  const db = createTestDb()
  const runtime = createRuntime(db)
  const first = runtime.recordWhatsappMessage({
    tenantId: tenantOne, phone: '+55 (11) 99999-9999', direction: 'INBOUND', type: 'IMAGE',
    providerMessageId: 'provider-same', providerRemoteJid: '5511999999999@s.whatsapp.net', displayName: 'Nome externo',
  })
  const duplicate = runtime.recordWhatsappMessage({ tenantId: tenantOne, phone: '5511999999999', direction: 'INBOUND', providerMessageId: 'provider-same' })
  const foreign = runtime.recordWhatsappMessage({ tenantId: tenantTwo, phone: '5511999999999', direction: 'INBOUND', providerMessageId: 'provider-same' })
  assert.equal(first.inserted, true)
  assert.equal(duplicate.inserted, false)
  assert.equal(foreign.inserted, true)
  const rows = db.prepare(`SELECT tenant_id as tenantId, media_status as mediaStatus, media_remote_jid as remoteJid FROM whatsapp_messages ORDER BY rowid`).all()
  assert.deepEqual(rows, [
    { tenantId: tenantOne, mediaStatus: 'PENDING', remoteJid: '5511999999999@s.whatsapp.net' },
    { tenantId: tenantTwo, mediaStatus: 'NONE', remoteJid: null },
  ])
  const conversation = db.prepare(`SELECT display_name as name, client_user_id as clientUserId, unread_count as unread FROM whatsapp_conversations WHERE tenant_id = ?`).get(tenantOne)
  assert.deepEqual(conversation, { name: 'Ana', clientUserId: 'client-one', unread: 1 })
  db.close()
})

test('envio promocional exige consentimento e persiste id do provedor', async () => {
  const db = createTestDb()
  let fetchCount = 0
  const runtime = createRuntime(db, {
    fetchFn: (async () => {
      fetchCount += 1
      return new Response(JSON.stringify({ data: { key: { id: 'provider-campaign' } } }), { status: 200 })
    }) as typeof fetch,
  })
  const { setClientWhatsappMarketingConsent } = createClientMarketingConsentService({
    db,
    now: () => new Date(fixedNow),
    randomId: () => 'consent-event',
  })
  assert.equal(await runtime.sendWhatsappTextForTenant(tenantOne, '5511999999999', 'Oferta', { purpose: 'MARKETING' }), false)
  assert.equal(fetchCount, 0)
  assert.deepEqual(setClientWhatsappMarketingConsent({ tenantId: tenantOne, userId: 'client-one', granted: true, source: 'CLIENT_PORTAL' }), { changed: true, optedIn: true })
  assert.equal(await runtime.sendWhatsappTextForTenant(tenantOne, '5511999999999', 'Oferta', { purpose: 'MARKETING' }), true)
  assert.equal(fetchCount, 1)
  const message = db.prepare(`SELECT tenant_id as tenantId, provider_message_id as providerId, source, delivery_status as status FROM whatsapp_messages`).get()
  assert.deepEqual(message, { tenantId: tenantOne, providerId: 'provider-campaign', source: 'AUTOMATION', status: 'SENT' })
  assert.equal((db.prepare(`SELECT COUNT(*) as n FROM client_marketing_consent_events WHERE tenant_id = ?`).get(tenantOne) as { n: number }).n, 1)
  db.close()
})

test('parser usa remoteJidAlt e confirmação citada permanece no tenant esperado', async () => {
  const db = createTestDb()
  const events: Array<Record<string, unknown>> = []
  const cancellations: Array<Record<string, unknown>> = []
  const runtime = createRuntime(db, { events, cancellations })
  db.exec(`
    INSERT INTO appointments
      (id, tenant_id, client_user_id, starts_at, status, confirmation_code, confirmation_sent_at, confirmation_status)
    VALUES
      ('appointment-one', '${tenantOne}', 'client-one', '2030-08-02T12:00:00.000Z', 'PENDING', NULL, '${fixedNow.toISOString()}', 'AWAITING_CONFIRMATION');
    INSERT INTO appointment_confirmation_events
      (id, tenant_id, appointment_id, event_type, provider_message_id, created_at)
    VALUES
      ('event-one', '${tenantOne}', 'appointment-one', 'REQUEST_SENT', 'provider-request', '${fixedNow.toISOString()}');
  `)
  const payload = {
    event: 'messages.upsert', instance: 'studio-one',
    data: {
      key: { id: 'provider-reply', remoteJid: '123456789@lid', remoteJidAlt: '5511999999999@s.whatsapp.net', fromMe: false },
      message: { extendedTextMessage: { text: '1', contextInfo: { stanzaId: 'provider-request' } } },
      messageTimestamp: Math.floor(fixedNow.getTime() / 1000), pushName: 'Ana',
    },
  }
  const inbound = runtime.extractEvolutionInbound(payload)
  assert.equal(inbound.phone, '5511999999999')
  assert.equal(inbound.quotedProviderMessageId, 'provider-request')
  assert.deepEqual(await runtime.handleEvolutionConfirmationWebhook(payload, tenantTwo), { handled: false })
  const handled = await runtime.handleEvolutionConfirmationWebhook(payload, tenantOne)
  assert.deepEqual(handled, { handled: true, appointmentId: 'appointment-one', confirmationStatus: 'CONFIRMED' })
  assert.equal((db.prepare(`SELECT confirmation_status as status FROM appointments WHERE id = 'appointment-one'`).get() as { status: string }).status, 'CONFIRMED')
  assert.deepEqual(cancellations, [{ tenantId: tenantOne, appointmentId: 'appointment-one', kinds: ['CONFIRMATION_REQUEST', 'CONFIRMATION_RETRY', 'NO_RESPONSE_CUTOFF'] }])
  assert.equal(events[0]?.eventType, 'CLIENT_CONFIRMED')
  db.close()
})

 test('media campaign transport sends image and caption once; missing receipt is not success', async()=>{
  const db=createTestDb();db.prepare('UPDATE clients SET marketing_whatsapp_opt_in=1 WHERE tenant_id=?').run(tenantOne)
  let calls=0,url='',payload:Record<string,unknown>={}
  const runtime=createRuntime(db,{fetchFn:async(input,init)=>{calls++;url=String(input);payload=JSON.parse(String(init?.body));return new Response(JSON.stringify(calls===1?{key:{id:'media-accepted'}}:{}))}})
  assert.equal(await runtime.sendWhatsappTextForTenant(tenantOne,'5511999999999','Novidade · responda SAIR',{purpose:'MARKETING',mediaDataUrl:'data:image/jpeg;base64,aGVsbG8='}),true)
  assert.ok(url.includes('/message/sendMedia/'));assert.equal(payload.mediatype,'image');assert.equal(payload.caption,'Novidade · responda SAIR');assert.equal(payload.media,'aGVsbG8=')
  assert.equal(await runtime.sendWhatsappTextForTenant(tenantOne,'5511999999999','Novidade · responda SAIR',{purpose:'MARKETING'}),false);assert.equal(calls,2);db.close()
 })
