import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { marketingWhatsappOptOutIntent } from '../whatsappIntent.js'
import {
  extractEvolutionConnectionState,
  extractEvolutionMessageUpdates,
  nextWhatsappDeliveryStatus,
} from '../whatsappWebhook.js'

export type EvolutionInbound = {
  event: string
  instanceName: string
  providerMessageId: string | null
  providerRemoteJid: string | null
  quotedProviderMessageId: string | null
  fromMe: boolean
  phone: string
  text: string
  pushName: string
  messageType: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'UNKNOWN'
  sentAt: string
  isGroup: boolean
}

type EvolutionWebhookRouterOptions = {
  db: Database.Database
  requireEvolutionWebhookSecret: RequestHandler
  extractEvolutionInbound: (payload: unknown) => EvolutionInbound
  recordWhatsappMessage: (input: {
    tenantId: string
    phone: string
    direction: 'INBOUND' | 'OUTBOUND'
    type?: EvolutionInbound['messageType']
    text?: string
    source?: 'WEBHOOK' | 'MANUAL' | 'AUTOMATION' | 'SYSTEM'
    providerMessageId?: string | null
    sentAt?: string
    displayName?: string | null
    providerRemoteJid?: string | null
  }) => { inserted: boolean; clientUserId?: string | null }
  setClientWhatsappMarketingConsent: (input: { tenantId: string; userId: string; granted: boolean; source: string }) => { changed: boolean }
  sendWhatsappTextForTenant: (tenantId: string, phone: string, text: string, options?: { purpose?: 'SYSTEM' }) => Promise<boolean>
  updateEvolutionConnectionFromWebhook: (tenantId: string, instanceName: string, state: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'UNKNOWN') => void
  handleEvolutionConfirmationWebhook: (payload: unknown, expectedTenantId: string) => Promise<Record<string, unknown> & { handled?: boolean }>
}

const evolutionWebhookPayloadHash = (payload: unknown) => {
  const serialized = JSON.stringify(payload ?? null)
  return createHash('sha256').update(serialized.length > 250_000 ? serialized.slice(0, 250_000) : serialized).digest('hex')
}

export function createEvolutionWebhookRouter(options: EvolutionWebhookRouterOptions) {
  const {
    db,
    requireEvolutionWebhookSecret,
    extractEvolutionInbound,
    recordWhatsappMessage,
    setClientWhatsappMarketingConsent,
    sendWhatsappTextForTenant,
    updateEvolutionConnectionFromWebhook,
    handleEvolutionConfirmationWebhook,
  } = options
  const router = Router()

  const recordEvolutionWebhookEvent = (input: {
    tenantId: string
    instanceName: string | null
    eventType: string
    providerMessageId?: string | null
    payload: unknown
    outcome: 'HANDLED' | 'IGNORED' | 'ERROR'
    errorCode?: string | null
  }) => {
    db.prepare(`
      INSERT INTO evolution_webhook_events
        (id, tenant_id, instance_name, event_type, provider_message_id, outcome, error_code, payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(), input.tenantId, input.instanceName, input.eventType.slice(0, 80), input.providerMessageId ?? null,
      input.outcome, input.errorCode?.slice(0, 120) ?? null, evolutionWebhookPayloadHash(input.payload), new Date().toISOString(),
    )
  }

  const touchEvolutionWebhook = (tenantId: string, instanceName: string) => {
    const now = new Date().toISOString()
    db.prepare(`UPDATE whatsapp_instances SET webhook_last_at = ?, updated_at = ? WHERE tenant_id = ? AND instance_name = ?`)
      .run(now, now, tenantId, instanceName)
  }

  const updateWhatsappDeliveryStatus = (tenantId: string, providerMessageId: string, incomingStatus: string) => {
    const row = db.prepare(`
      SELECT id, delivery_status as deliveryStatus
      FROM whatsapp_messages
      WHERE tenant_id = ? AND provider_message_id = ? AND direction = 'OUTBOUND'
      LIMIT 1
    `).get(tenantId, providerMessageId) as { id: string; deliveryStatus: string | null } | undefined
    if (!row) return false
    const next = nextWhatsappDeliveryStatus(row.deliveryStatus, incomingStatus)
    if (!next) return false
    db.prepare(`UPDATE whatsapp_messages SET delivery_status = ?, status_updated_at = ? WHERE id = ? AND tenant_id = ?`)
      .run(next, new Date().toISOString(), row.id, tenantId)
    return true
  }

  router.post('/evolution/:tenantId', requireEvolutionWebhookSecret, async (req, res) => {
    const tenantIdRaw = String(req.params.tenantId ?? '')
    const inbound = extractEvolutionInbound(req.body)
    let tenantId = tenantIdRaw
    try {
      tenantId = z.string().uuid().parse(tenantIdRaw)
      const instance = inbound.instanceName
        ? db.prepare(`SELECT tenant_id as tenantId FROM whatsapp_instances WHERE instance_name = ? AND tenant_id = ? LIMIT 1`).get(inbound.instanceName, tenantId) as { tenantId: string } | undefined
        : undefined
      if (!instance) {
        recordEvolutionWebhookEvent({ tenantId, instanceName: inbound.instanceName || null, eventType: inbound.event || 'UNKNOWN', payload: req.body, outcome: 'IGNORED', errorCode: 'UNKNOWN_INSTANCE' })
        return res.json({ ok: true, handled: false })
      }

      touchEvolutionWebhook(instance.tenantId, inbound.instanceName)
      let handled = false

      if (inbound.event === 'MESSAGES_UPSERT' && inbound.phone && !inbound.isGroup) {
        const recorded = recordWhatsappMessage({
          tenantId: instance.tenantId,
          phone: inbound.phone,
          direction: inbound.fromMe ? 'OUTBOUND' : 'INBOUND',
          type: inbound.messageType,
          text: inbound.text,
          source: 'WEBHOOK',
          providerMessageId: inbound.providerMessageId,
          sentAt: inbound.sentAt,
          displayName: inbound.fromMe ? null : inbound.pushName,
          providerRemoteJid: inbound.providerRemoteJid,
        })
        handled = handled || recorded.inserted
        if (!inbound.fromMe && inbound.text && recorded.clientUserId && marketingWhatsappOptOutIntent(inbound.text)) {
          const consent = setClientWhatsappMarketingConsent({ tenantId: instance.tenantId, userId: recorded.clientUserId, granted: false, source: 'WHATSAPP_KEYWORD' })
          if (consent.changed) {
            await sendWhatsappTextForTenant(instance.tenantId, inbound.phone, 'Tudo certo. Você não receberá mais novidades e ofertas por WhatsApp. Mensagens sobre seus agendamentos e acesso continuam funcionando normalmente.', { purpose: 'SYSTEM' }).catch(() => false)
          }
          handled = true
        }
      }

      if (inbound.event === 'MESSAGES_UPDATE') {
        const updates = extractEvolutionMessageUpdates(req.body)
        for (const update of updates) handled = updateWhatsappDeliveryStatus(instance.tenantId, update.providerMessageId, update.status) || handled
      }

      if (inbound.event === 'CONNECTION_UPDATE') {
        const state = extractEvolutionConnectionState(req.body)
        if (state) {
          updateEvolutionConnectionFromWebhook(instance.tenantId, inbound.instanceName, state)
          handled = true
        }
      }

      const confirmation = await handleEvolutionConfirmationWebhook(req.body, tenantId)
      handled = handled || Boolean(confirmation.handled)
      recordEvolutionWebhookEvent({ tenantId: instance.tenantId, instanceName: inbound.instanceName, eventType: inbound.event || 'UNKNOWN', providerMessageId: inbound.providerMessageId, payload: req.body, outcome: handled ? 'HANDLED' : 'IGNORED' })
      res.json({ ...confirmation, ok: true, handled })
    } catch (err) {
      // Ack provider webhooks even on internal errors to avoid provider retry storms; keep a redacted audit record instead.
      console.error('[Evolution webhook]', err)
      try {
        recordEvolutionWebhookEvent({ tenantId, instanceName: inbound.instanceName || null, eventType: inbound.event || 'UNKNOWN', providerMessageId: inbound.providerMessageId, payload: req.body, outcome: 'ERROR', errorCode: err instanceof Error ? err.name : 'INTERNAL_ERROR' })
      } catch { /* best-effort observability only */ }
      res.json({ ok: true, handled: false })
    }
  })

  return router
}
