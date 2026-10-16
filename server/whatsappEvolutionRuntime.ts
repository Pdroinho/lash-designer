import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { normalizeBrazilPhone } from './phone.js'
import { confirmationReplyIntent } from './whatsappIntent.js'
import type { EvolutionInbound } from './routes/evolutionWebhookRoutes.js'

export type WhatsappMessageDirection = 'INBOUND' | 'OUTBOUND'
export type WhatsappMessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'UNKNOWN'
export type WhatsappMessageSource = 'WEBHOOK' | 'MANUAL' | 'AUTOMATION' | 'SYSTEM'
export type WhatsappPurpose = 'MARKETING' | 'APPOINTMENT_AUTOMATION' | 'MANUAL' | 'SYSTEM'

type WhatsappConfig = {
  id: string
  provider: string
  baseUrl: string | null
  apiKey: string | null
  instanceName: string | null
  status: string
  updatedAt: string
  storedBaseUrl: string | null
  storedApiKeyCiphertext: string | null
  usesGlobalBaseUrl: boolean
  usesGlobalApiKey: boolean
}

export const defaultWhatsappSettings = {
  confirmationsEnabled: true,
  confirmationOffsetHours: 24,
  confirmationRetryHours: 8,
  noResponseCutoffHours: 4,
  confirmationMessage:
    'Oi {{nome}}! Seu horário de {{servico}} com {{profissional}} no {{espaco}} está chegando. Responda 1 para confirmar ou 2 se não puder comparecer.',
  autoCancelDeclined: false,
  remindersEnabled: true,
  reminderOffsetHours: 2,
  reminderMessage:
    'Oi {{nome}}! Passando para lembrar que seu horário de {{servico}} com {{profissional}} é hoje às {{hora}} no {{espaco}}. Até já!',
  promoEnabled: false,
  promoMessage:
    'Oi {{nome}}, temos uma novidade especial para você esta semana no {{espaco}}. Responda esta mensagem para saber mais.',
}

type AppointmentConfirmationStatus = 'NOT_REQUESTED' | 'AWAITING_CONFIRMATION' | 'CONFIRMED' | 'DECLINED' | 'NO_RESPONSE' | 'DELIVERY_FAILED'

type AppointmentAutomationBridge = {
  confirmationAppointmentById: (tenantId: string, appointmentId: string) => { timeZone: string } | undefined
  formatAppointmentLocal: (startsAt: string, timeZone: string) => { dateText: string; timeText: string }
  cancelAppointmentJobs: (tenantId: string, appointmentId: string, kinds?: Array<'CONFIRMATION_REQUEST' | 'CONFIRMATION_RETRY' | 'NO_RESPONSE_CUTOFF' | 'APPOINTMENT_REMINDER'>) => void
  confirmationEvent: (input: { tenantId: string; appointmentId: string; eventType: string; providerMessageId?: string | null; details?: Record<string, unknown> }) => void
}

type WhatsappEvolutionRuntimeOptions = {
  db: Database.Database
  production: boolean
  appBaseUrl?: string
  webhookSecret?: string
  normalizeFallbackPhone: (raw: string) => string
  decryptPlatformApiKey: (value: string | null | undefined) => string | null
  decryptTenantApiKey: (value: string | null | undefined, tenantId: string) => string | null
  resolveExternalHttpsBaseUrl: (raw: string) => Promise<string>
  getAppointmentAutomation: () => AppointmentAutomationBridge
  now?: () => Date
  fetchFn?: typeof fetch
  randomId?: () => string
}

export function createWhatsappEvolutionRuntime({
  db,
  production,
  appBaseUrl,
  webhookSecret,
  normalizeFallbackPhone,
  decryptPlatformApiKey,
  decryptTenantApiKey,
  resolveExternalHttpsBaseUrl,
  getAppointmentAutomation,
  now = () => new Date(),
  fetchFn = fetch,
  randomId = randomUUID,
}: WhatsappEvolutionRuntimeOptions) {
  const whatsappPhone = (raw: string) => normalizeBrazilPhone(raw) ?? normalizeFallbackPhone(raw)

  const requireWhatsappConfig = (tenantId: string): WhatsappConfig | undefined => {
    const row = db.prepare(`
      SELECT id, provider, base_url as baseUrl, api_key as apiKey, instance_name as instanceName,
             status, updated_at as updatedAt
      FROM whatsapp_instances WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1
    `).get(tenantId) as Omit<WhatsappConfig, 'storedBaseUrl' | 'storedApiKeyCiphertext' | 'usesGlobalBaseUrl' | 'usesGlobalApiKey'> | undefined
    if (!row) return undefined
    const globals = db.prepare(`SELECT key, value FROM platform_settings WHERE key IN ('evolution_api_url', 'evolution_api_key')`).all() as Array<{ key: string; value: string }>
    const defaults = Object.fromEntries(globals.map(item => [item.key, item.value])) as Record<string, string>
    const tenantApiKey = decryptTenantApiKey(row.apiKey, tenantId)
    const globalApiKey = decryptPlatformApiKey(defaults.evolution_api_key)
    return {
      ...row,
      storedBaseUrl: row.baseUrl,
      storedApiKeyCiphertext: row.apiKey,
      baseUrl: production ? (defaults.evolution_api_url || null) : (row.baseUrl || defaults.evolution_api_url || null),
      apiKey: production ? (globalApiKey || null) : (tenantApiKey || globalApiKey || null),
      usesGlobalBaseUrl: production ? Boolean(defaults.evolution_api_url) : (!row.baseUrl && Boolean(defaults.evolution_api_url)),
      usesGlobalApiKey: production ? Boolean(globalApiKey) : (!row.apiKey && Boolean(globalApiKey)),
    }
  }

  const ensurePlatformWhatsappConfig = (tenantId: string) => {
    const existing = requireWhatsappConfig(tenantId)
    if (existing) return existing
    const globals = db.prepare(`SELECT key, value FROM platform_settings WHERE key IN ('evolution_api_url', 'evolution_api_key')`).all() as Array<{ key: string; value: string }>
    const defaults = Object.fromEntries(globals.map(item => [item.key, item.value])) as Record<string, string>
    const globalApiKey = decryptPlatformApiKey(defaults.evolution_api_key)
    if (!defaults.evolution_api_url || !globalApiKey) return undefined
    const tenant = db.prepare(`SELECT slug FROM tenants WHERE id = ?`).get(tenantId) as { slug: string } | undefined
    if (!tenant) return undefined
    const safeSlug = tenant.slug.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48)
    const instanceName = `lash-${safeSlug}-${tenantId.replace(/-/g, '').slice(0, 8)}`.slice(0, 80)
    const timestamp = now().toISOString()
    db.prepare(`
      INSERT INTO whatsapp_instances (id, tenant_id, provider, base_url, api_key, instance_name, status, created_at, updated_at)
      VALUES (?, ?, 'EVOLUTION', NULL, NULL, ?, 'CONFIGURED', ?, ?)
    `).run(randomId(), tenantId, instanceName, timestamp, timestamp)
    return requireWhatsappConfig(tenantId)
  }

  const requireWhatsappSettings = (tenantId: string) => {
    const row = db.prepare(`
      SELECT confirmations_enabled as confirmationsEnabled, confirmation_offset_hours as confirmationOffsetHours,
             confirmation_retry_hours as confirmationRetryHours, no_response_cutoff_hours as noResponseCutoffHours,
             confirmation_message as confirmationMessage, auto_cancel_declined as autoCancelDeclined,
             reminders_enabled as remindersEnabled, reminder_offset_hours as reminderOffsetHours,
             reminder_message as reminderMessage, promo_enabled as promoEnabled, promo_message as promoMessage,
             updated_at as updatedAt
      FROM whatsapp_settings WHERE tenant_id = ? LIMIT 1
    `).get(tenantId) as {
      confirmationsEnabled: number; confirmationOffsetHours: number; confirmationRetryHours: number
      noResponseCutoffHours: number; confirmationMessage: string; autoCancelDeclined: number
      remindersEnabled: number; reminderOffsetHours: number; reminderMessage: string
      promoEnabled: number; promoMessage: string; updatedAt: string
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

  const whatsappMessagePreview = (type: WhatsappMessageType, text: string) => {
    const clean = text.trim()
    if (clean) return clean.slice(0, 220)
    if (type === 'IMAGE') return 'Imagem recebida'
    if (type === 'AUDIO') return 'Áudio recebido'
    if (type === 'DOCUMENT') return 'Documento recebido'
    return 'Mensagem recebida'
  }

  const whatsappConversationForPhone = (tenantId: string, rawPhone: string, displayName?: string | null) => {
    const phone = whatsappPhone(rawPhone)
    if (!phone) return null
    const client = db.prepare(`SELECT user_id as userId, name FROM clients WHERE tenant_id = ? AND phone_normalized = ? LIMIT 1`).get(tenantId, phone) as { userId: string; name: string } | undefined
    const existing = db.prepare(`
      SELECT id, display_name as displayName, client_user_id as clientUserId
      FROM whatsapp_conversations WHERE tenant_id = ? AND phone_normalized = ? LIMIT 1
    `).get(tenantId, phone) as { id: string; displayName: string | null; clientUserId: string | null } | undefined
    const timestamp = now().toISOString()
    const resolvedName = client?.name || displayName?.trim() || existing?.displayName || null
    if (existing) {
      const clientUserId = client?.userId || existing.clientUserId || null
      db.prepare(`UPDATE whatsapp_conversations SET display_name = ?, client_user_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
        .run(resolvedName, clientUserId, timestamp, existing.id, tenantId)
      return { id: existing.id, phone, displayName: resolvedName, clientUserId }
    }
    const id = randomId()
    db.prepare(`
      INSERT INTO whatsapp_conversations (id, tenant_id, phone_normalized, display_name, client_user_id, unread_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, tenantId, phone, resolvedName, client?.userId || null, timestamp, timestamp)
    return { id, phone, displayName: resolvedName, clientUserId: client?.userId || null }
  }

  const recordWhatsappMessage = (input: {
    tenantId: string; phone: string; direction: WhatsappMessageDirection; type?: WhatsappMessageType
    text?: string; source?: WhatsappMessageSource; providerMessageId?: string | null; sentAt?: string
    displayName?: string | null; providerRemoteJid?: string | null
  }) => {
    const conversation = whatsappConversationForPhone(input.tenantId, input.phone, input.displayName)
    if (!conversation) return { inserted: false as const }
    const type = input.type ?? 'TEXT'
    const text = String(input.text ?? '').trim().slice(0, 12_000)
    const timestamp = now()
    const sentAt = input.sentAt && !Number.isNaN(new Date(input.sentAt).getTime()) ? new Date(input.sentAt).toISOString() : timestamp.toISOString()
    const providerMessageId = input.providerMessageId?.trim() || null
    if (providerMessageId) {
      const duplicate = db.prepare(`SELECT id FROM whatsapp_messages WHERE tenant_id = ? AND provider_message_id = ? LIMIT 1`).get(input.tenantId, providerMessageId) as { id: string } | undefined
      if (duplicate) return { inserted: false as const, id: duplicate.id, conversationId: conversation.id, clientUserId: conversation.clientUserId }
    } else {
      const recentDuplicate = db.prepare(`
        SELECT id FROM whatsapp_messages
        WHERE tenant_id = ? AND conversation_id = ? AND direction = ? AND body_text = ? AND sent_at >= ? LIMIT 1
      `).get(input.tenantId, conversation.id, input.direction, text, new Date(timestamp.getTime() - 8_000).toISOString()) as { id: string } | undefined
      if (recentDuplicate) return { inserted: false as const, id: recentDuplicate.id, conversationId: conversation.id, clientUserId: conversation.clientUserId }
    }
    const id = randomId()
    const createdAt = timestamp.toISOString()
    const hasPendingMedia = input.direction === 'INBOUND' && ['IMAGE', 'AUDIO', 'DOCUMENT'].includes(type) && providerMessageId
    db.prepare(`
      INSERT INTO whatsapp_messages
        (id, tenant_id, conversation_id, phone_normalized, direction, message_type, body_text, source, provider_message_id,
         sent_at, created_at, delivery_status, status_updated_at, media_status, media_remote_jid, media_next_attempt_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.tenantId, conversation.id, conversation.phone, input.direction, type, text, input.source ?? 'WEBHOOK',
      providerMessageId, sentAt, createdAt, input.direction === 'OUTBOUND' ? 'SENT' : 'RECEIVED', createdAt,
      hasPendingMedia ? 'PENDING' : 'NONE', input.providerRemoteJid ?? null, hasPendingMedia ? createdAt : null,
    )
    db.prepare(`
      UPDATE whatsapp_conversations
      SET unread_count = unread_count + ?, last_message_preview = ?, last_message_direction = ?, last_message_at = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(input.direction === 'INBOUND' ? 1 : 0, whatsappMessagePreview(type, text), input.direction, sentAt, createdAt, conversation.id, input.tenantId)
    return { inserted: true as const, id, conversationId: conversation.id, clientUserId: conversation.clientUserId }
  }

  const updateEvolutionConnectionFromWebhook = (tenantId: string, instanceName: string, state: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'UNKNOWN') => {
    const timestamp = now().toISOString()
    db.prepare(`
      UPDATE whatsapp_instances SET connection_state = ?, last_health_check_at = ?,
        last_connected_at = CASE WHEN ? = 'CONNECTED' THEN ? ELSE last_connected_at END,
        reconnect_attempts = CASE WHEN ? = 'CONNECTED' THEN 0 ELSE reconnect_attempts END,
        reconnect_after = CASE WHEN ? = 'CONNECTED' THEN NULL ELSE reconnect_after END,
        last_connection_error = CASE WHEN ? = 'CONNECTED' THEN NULL ELSE last_connection_error END, updated_at = ?
      WHERE tenant_id = ? AND instance_name = ?
    `).run(state, timestamp, state, timestamp, state, state, state, timestamp, tenantId, instanceName)
  }

  const extractWhatsappProviderMessageId = (value: unknown): string | null => {
    if (!value || typeof value !== 'object') return null
    const root = value as Record<string, unknown>
    const key = root.key && typeof root.key === 'object' ? root.key as Record<string, unknown> : null
    if (typeof key?.id === 'string' && key.id.trim()) return key.id.trim()
    if (typeof root.id === 'string' && root.id.trim()) return root.id.trim()
    for (const child of Object.values(root)) {
      const nested = extractWhatsappProviderMessageId(child)
      if (nested) return nested
    }
    return null
  }

  const webhookUrl = (tenantId: string) => `${String(appBaseUrl).replace(/\/$/, '')}/api/webhooks/evolution/${encodeURIComponent(tenantId)}`

  const configureEvolutionWebhookForTenant = async (tenantId: string) => {
    const config = requireWhatsappConfig(tenantId)
    if (!config?.baseUrl || !config.apiKey || !config.instanceName || !appBaseUrl || !webhookSecret) return false
    const response = await fetchFn(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/webhook/set/${encodeURIComponent(config.instanceName)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ enabled: true, url: webhookUrl(tenantId), events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'], headers: { 'x-webhook-secret': webhookSecret }, base64: false }),
    }).catch(() => null)
    return Boolean(response?.ok)
  }

  const evolutionWebhookConfiguredForTenant = async (tenantId: string) => {
    const config = requireWhatsappConfig(tenantId)
    if (!config?.baseUrl || !config.apiKey || !config.instanceName || !appBaseUrl) return null
    const response = await fetchFn(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/webhook/find/${encodeURIComponent(config.instanceName)}`, {
      headers: { apikey: config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(8_000),
    }).catch(() => null)
    if (!response?.ok) return null
    const raw = await response.json().catch(() => null)
    const findWebhookRecord = (value: unknown): Record<string, unknown> | null => {
      if (!value || typeof value !== 'object') return null
      if (Array.isArray(value)) {
        for (const item of value) { const found = findWebhookRecord(item); if (found) return found }
        return null
      }
      const record = value as Record<string, unknown>
      if (typeof record.url === 'string' && (Array.isArray(record.events) || 'enabled' in record)) return record
      for (const child of Object.values(record)) { const found = findWebhookRecord(child); if (found) return found }
      return null
    }
    const record = findWebhookRecord(raw)
    if (!record) return false
    const events = Array.isArray(record.events) ? record.events.map(event => String(event).toUpperCase()) : []
    const configuredUrl = typeof record.url === 'string' ? record.url.replace(/\/$/, '') : ''
    return (typeof record.enabled !== 'boolean' || record.enabled) && configuredUrl === webhookUrl(tenantId).replace(/\/$/, '')
      && ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'].every(event => events.includes(event))
  }

  const extractEvolutionInbound = (payload: unknown): EvolutionInbound => {
    const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
    const firstRecord = (value: unknown) => Array.isArray(value) ? asRecord(value.find(item => item && typeof item === 'object')) : asRecord(value)
    const root = asRecord(payload)
    const data = firstRecord(root.data)
    const envelope = Object.keys(data).length ? data : root
    const key = firstRecord(envelope.key)
    const message = firstRecord(envelope.message)
    const extended = firstRecord(message.extendedTextMessage)
    const buttons = firstRecord(message.buttonsResponseMessage)
    const template = firstRecord(message.templateButtonReplyMessage)
    const list = firstRecord(message.listResponseMessage)
    const image = firstRecord(message.imageMessage)
    const document = firstRecord(message.documentMessage)
    const audio = firstRecord(message.audioMessage)
    const contexts = [extended.contextInfo, image.contextInfo, document.contextInfo, audio.contextInfo, message.contextInfo].map(firstRecord)
    const quoted = contexts.map(context => context.stanzaId ?? context.stanzaID).find(value => typeof value === 'string' && value.trim())
    const single = firstRecord(list.singleSelectReply)
    const text = [message.conversation, extended.text, image.caption, document.caption, buttons.selectedDisplayText, buttons.selectedButtonId, template.selectedDisplayText, template.selectedId, single.selectedRowId, list.title]
      .find(value => typeof value === 'string' && value.trim())
    const remoteJid = typeof key.remoteJid === 'string' ? key.remoteJid : typeof envelope.remoteJid === 'string' ? envelope.remoteJid : ''
    const remoteJidAlt = typeof key.remoteJidAlt === 'string' ? key.remoteJidAlt : typeof envelope.remoteJidAlt === 'string' ? envelope.remoteJidAlt : ''
    const preferredJid = remoteJid.endsWith('@lid') && remoteJidAlt ? remoteJidAlt : (remoteJid || remoteJidAlt)
    const phoneRaw = preferredJid.split('@')[0] || ''
    const rawTimestamp = envelope.messageTimestamp ?? root.messageTimestamp
    const numericTimestamp = typeof rawTimestamp === 'number' ? rawTimestamp : typeof rawTimestamp === 'string' ? Number(rawTimestamp) : NaN
    const sentAt = Number.isFinite(numericTimestamp) ? new Date(numericTimestamp < 10_000_000_000 ? numericTimestamp * 1000 : numericTimestamp).toISOString() : now().toISOString()
    const messageType: WhatsappMessageType = Object.keys(image).length ? 'IMAGE' : Object.keys(audio).length ? 'AUDIO' : Object.keys(document).length ? 'DOCUMENT' : text ? 'TEXT' : 'UNKNOWN'
    return {
      event: String(root.event ?? root.type ?? envelope.event ?? '').replace(/[.-]/g, '_').toUpperCase(),
      instanceName: String(root.instance ?? root.instanceName ?? envelope.instance ?? envelope.instanceName ?? ''),
      providerMessageId: typeof key.id === 'string' ? key.id : typeof envelope.id === 'string' ? envelope.id : null,
      providerRemoteJid: preferredJid || null,
      quotedProviderMessageId: typeof quoted === 'string' ? quoted.trim() : null,
      fromMe: Boolean(key.fromMe ?? envelope.fromMe),
      phone: normalizeBrazilPhone(phoneRaw) ?? phoneRaw.replace(/\D/g, ''),
      text: typeof text === 'string' ? text.trim() : '',
      pushName: typeof envelope.pushName === 'string' ? envelope.pushName.trim() : typeof root.pushName === 'string' ? root.pushName.trim() : '',
      messageType, sentAt, isGroup: remoteJid.endsWith('@g.us') || remoteJidAlt.endsWith('@g.us'),
    }
  }

  const sendWhatsappTextForTenant = async (
    tenantId: string,
    phone: string,
    text: string,
    options: { mediaDataUrl?: string | null; source?: WhatsappMessageSource; persist?: boolean; displayName?: string | null; purpose?: WhatsappPurpose; onProviderMessageId?: (id: string | null) => void } = {},
  ) => {
    const config = requireWhatsappConfig(tenantId)
    if (!config?.baseUrl || !config.apiKey || !config.instanceName) return false
    const normalizedPhone = whatsappPhone(phone)
    if (!normalizedPhone) return false
    const resolvedBaseUrl = await resolveExternalHttpsBaseUrl(config.baseUrl)
    if (options.purpose === 'MARKETING') {
      const consent = db.prepare(`SELECT marketing_whatsapp_opt_in as optedIn FROM clients WHERE tenant_id = ? AND phone_normalized = ? LIMIT 1`).get(tenantId, normalizedPhone) as { optedIn: number } | undefined
      if (!consent?.optedIn) return false
    }
    const image = options.mediaDataUrl ? /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(options.mediaDataUrl) : null
    if (options.mediaDataUrl && !image) return false
    const response = await fetchFn(`${resolvedBaseUrl}/message/${image ? 'sendMedia' : 'sendText'}/${encodeURIComponent(config.instanceName)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(10_000),
      body: JSON.stringify(image ? { number: normalizedPhone, mediatype: 'image', mimetype: `image/${image[1]}`, caption: text, media: image[2], fileName: 'campanha.jpg' } : { number: normalizedPhone, text, textMessage: text }),
    }).catch(() => null)
    if (!response?.ok) return false
    const providerMessageId = extractWhatsappProviderMessageId(await response.json().catch(() => null))
    if (options.purpose === 'MARKETING' && !providerMessageId) return false
    options.onProviderMessageId?.(providerMessageId)
    if (options.persist !== false) recordWhatsappMessage({
      tenantId, phone: normalizedPhone, direction: 'OUTBOUND', type: image ? 'IMAGE' : 'TEXT', text,
      source: options.source ?? 'AUTOMATION', providerMessageId, sentAt: now().toISOString(), displayName: options.displayName ?? null,
    })
    return true
  }

  const handleEvolutionConfirmationWebhook = async (payload: unknown, expectedTenantId: string) => {
    const inbound = extractEvolutionInbound(payload)
    if (inbound.event !== 'MESSAGES_UPSERT' || inbound.fromMe || !inbound.instanceName || !inbound.phone || !inbound.text) return { handled: false }
    if (inbound.providerMessageId) {
      const duplicate = db.prepare(`SELECT id FROM appointment_confirmation_events WHERE provider_message_id = ? LIMIT 1`).get(inbound.providerMessageId)
      if (duplicate) return { handled: true, duplicate: true }
    }
    const parsed = confirmationReplyIntent(inbound.text)
    if (!parsed.intent) return { handled: false }
    const instance = db.prepare(`SELECT tenant_id as tenantId FROM whatsapp_instances WHERE instance_name = ? AND tenant_id = ? LIMIT 1`).get(inbound.instanceName, expectedTenantId) as { tenantId: string } | undefined
    if (!instance) return { handled: false }
    const automation = getAppointmentAutomation()
    const explicitlyRepliedAppointment = inbound.quotedProviderMessageId
      ? db.prepare(`
          SELECT appointment_id as appointmentId FROM appointment_confirmation_events
          WHERE tenant_id = ? AND provider_message_id = ? AND event_type IN ('REQUEST_SENT','RESENT')
          ORDER BY created_at DESC LIMIT 1
        `).get(instance.tenantId, inbound.quotedProviderMessageId) as { appointmentId: string } | undefined
      : undefined
    const referenceTime = now()
    const rows = db.prepare(`
      SELECT a.id, a.confirmation_code as confirmationCode, a.starts_at as startsAt,
             a.confirmation_sent_at as confirmationSentAt, a.confirmation_reminder_sent_at as confirmationReminderSentAt,
             a.confirmation_status as confirmationStatus, c.name as clientName, c.phone as clientPhone
      FROM appointments a JOIN clients c ON c.user_id = a.client_user_id AND c.tenant_id = a.tenant_id
      WHERE a.tenant_id = ? AND c.phone_normalized = ? AND a.status != 'CANCELLED'
        AND a.starts_at > ? AND a.starts_at < ?
        AND COALESCE(a.confirmation_reminder_sent_at, a.confirmation_sent_at) >= ?
        AND a.confirmation_status IN ('AWAITING_CONFIRMATION','NO_RESPONSE','DELIVERY_FAILED')
      ORDER BY a.starts_at ASC LIMIT 8
    `).all(
      instance.tenantId, inbound.phone, referenceTime.toISOString(),
      new Date(referenceTime.getTime() + 72 * 60 * 60_000).toISOString(),
      new Date(referenceTime.getTime() - 72 * 60 * 60_000).toISOString(),
    ) as Array<{ id: string; confirmationCode: string | null; startsAt: string; confirmationSentAt: string | null; confirmationReminderSentAt: string | null; confirmationStatus: AppointmentConfirmationStatus; clientName: string | null; clientPhone: string | null }>
    const candidates = explicitlyRepliedAppointment ? rows.filter(row => row.id === explicitlyRepliedAppointment.appointmentId)
      : parsed.code ? rows.filter(row => row.confirmationCode === parsed.code) : rows
    if (!candidates.length) return { handled: false }
    if (candidates.length > 1) {
      const details = candidates.map((row, index) => {
        const local = automation.formatAppointmentLocal(row.startsAt, automation.confirmationAppointmentById(instance.tenantId, row.id)?.timeZone || 'America/Sao_Paulo')
        return `${index + 1}. ${local.dateText} às ${local.timeText}`
      }).join('\n')
      automation.confirmationEvent({ tenantId: instance.tenantId, appointmentId: candidates[0].id, eventType: 'AMBIGUOUS_REPLY', providerMessageId: inbound.providerMessageId, details: { candidateCount: candidates.length, text: inbound.text } })
      if (candidates[0].clientPhone) await sendWhatsappTextForTenant(instance.tenantId, candidates[0].clientPhone, `Encontrei mais de um horário aguardando confirmação:\n${details}\n\nResponda diretamente à mensagem do horário correto para confirmar ou cancelar.`, { purpose: 'SYSTEM' })
      return { handled: true, ambiguous: true, candidateCount: candidates.length }
    }
    const appointment = candidates[0]
    const timestamp = now().toISOString()
    if (parsed.intent === 'CONFIRM') {
      db.prepare(`
        UPDATE appointments SET confirmation_status = 'CONFIRMED', confirmation_responded_at = ?, confirmation_last_inbound_at = ?, confirmation_last_inbound_text = ?
        WHERE id = ? AND tenant_id = ? AND confirmation_status IN ('AWAITING_CONFIRMATION','NO_RESPONSE','DELIVERY_FAILED')
      `).run(timestamp, timestamp, inbound.text.slice(0, 500), appointment.id, instance.tenantId)
      automation.cancelAppointmentJobs(instance.tenantId, appointment.id, ['CONFIRMATION_REQUEST', 'CONFIRMATION_RETRY', 'NO_RESPONSE_CUTOFF'])
      automation.confirmationEvent({ tenantId: instance.tenantId, appointmentId: appointment.id, eventType: 'CLIENT_CONFIRMED', providerMessageId: inbound.providerMessageId, details: { text: inbound.text } })
      if (appointment.clientPhone) await sendWhatsappTextForTenant(instance.tenantId, appointment.clientPhone, 'Presença confirmada 💕 Seu horário segue reservado. Até lá!')
      return { handled: true, appointmentId: appointment.id, confirmationStatus: 'CONFIRMED' }
    }
    const settings = requireWhatsappSettings(instance.tenantId) ?? defaultWhatsappSettings
    db.prepare(`
      UPDATE appointments SET confirmation_status = 'DECLINED', confirmation_responded_at = ?, confirmation_last_inbound_at = ?, confirmation_last_inbound_text = ?,
        status = CASE WHEN ? = 1 THEN 'CANCELLED' ELSE status END
      WHERE id = ? AND tenant_id = ? AND confirmation_status IN ('AWAITING_CONFIRMATION','NO_RESPONSE','DELIVERY_FAILED')
    `).run(timestamp, timestamp, inbound.text.slice(0, 500), settings.autoCancelDeclined ? 1 : 0, appointment.id, instance.tenantId)
    automation.cancelAppointmentJobs(instance.tenantId, appointment.id)
    automation.confirmationEvent({ tenantId: instance.tenantId, appointmentId: appointment.id, eventType: settings.autoCancelDeclined ? 'CLIENT_DECLINED_AUTO_CANCELLED' : 'CLIENT_DECLINED', providerMessageId: inbound.providerMessageId, details: { text: inbound.text } })
    if (appointment.clientPhone) await sendWhatsappTextForTenant(instance.tenantId, appointment.clientPhone, settings.autoCancelDeclined ? 'Tudo certo. Seu horário foi cancelado e ficou disponível novamente.' : 'Recebemos sua resposta. O espaço foi avisado e vai cuidar do seu horário.')
    return { handled: true, appointmentId: appointment.id, confirmationStatus: 'DECLINED' }
  }

  return {
    requireWhatsappConfig,
    ensurePlatformWhatsappConfig,
    requireWhatsappSettings,
    defaultWhatsappSettings,
    whatsappPhone,
    recordWhatsappMessage,
    updateEvolutionConnectionFromWebhook,
    configureEvolutionWebhookForTenant,
    evolutionWebhookConfiguredForTenant,
    extractEvolutionInbound,
    sendWhatsappTextForTenant,
    handleEvolutionConfirmationWebhook,
  }
}
