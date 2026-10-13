import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, forbidden, notFound } from '../http.js'
import { campaignMessageWithOptOut } from '../marketingCampaign.js'
import type { WhatsappSettings } from './adminWhatsappSettingsRoutes.js'

export type MarketingCampaignRow = {
  id: string
  tenantId: string
  name: string
  messageText: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'
  totalRecipients: number
  sentCount: number
  failedCount: number
  skippedCount: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  lastError: string | null
}

type AdminWhatsappCampaignRouterOptions = {
  db: Database.Database
  campaignsEnabled: boolean
  maxRecipients: number
  sendIntervalSeconds: number
  requireWhatsappSettings: (tenantId: string) => WhatsappSettings | null
  defaultWhatsappSettings: WhatsappSettings
  now?: () => Date
}

function marketingCampaignPayload(row: MarketingCampaignRow) {
  return {
    id: row.id,
    name: row.name,
    messageText: row.messageText,
    status: row.status,
    totalRecipients: Number(row.totalRecipients || 0),
    sentCount: Number(row.sentCount || 0),
    failedCount: Number(row.failedCount || 0),
    skippedCount: Number(row.skippedCount || 0),
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    lastError: row.lastError,
  }
}

export function createAdminWhatsappCampaignRouter({
  db,
  campaignsEnabled,
  maxRecipients,
  sendIntervalSeconds,
  requireWhatsappSettings,
  defaultWhatsappSettings,
  now = () => new Date(),
}: AdminWhatsappCampaignRouterOptions) {
  const router = Router()

  router.get('/whatsapp/campaigns', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const campaigns = db.prepare(`
        SELECT id, tenant_id as tenantId, name, message_text as messageText, status,
               total_recipients as totalRecipients, sent_count as sentCount,
               failed_count as failedCount, skipped_count as skippedCount,
               created_at as createdAt, started_at as startedAt, completed_at as completedAt,
               cancelled_at as cancelledAt, last_error as lastError
        FROM whatsapp_marketing_campaigns
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(tenantId) as MarketingCampaignRow[]
      res.json({
        enabled: campaignsEnabled,
        maxRecipients,
        sendIntervalSeconds,
        campaigns: campaigns.map(marketingCampaignPayload),
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/whatsapp/campaigns', requireRole('ADMIN'), (req, res, next) => {
    try {
      if (!campaignsEnabled) {
        return next(forbidden(
          'Campanhas promocionais estão desativadas nesta instalação. Ative explicitamente a função somente após validar sua configuração do WhatsApp.',
          'WHATSAPP_CAMPAIGNS_DISABLED',
        ))
      }
      const tenantId = req.sessionUser?.tenantId
      const userId = req.sessionUser?.id
      if (!tenantId || !userId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        name: z.string().trim().min(2).max(80),
        message: z.string().trim().min(10).max(1400),
      }).strict().parse(req.body)

      const settings = requireWhatsappSettings(tenantId) ?? defaultWhatsappSettings
      if (!settings.promoEnabled) {
        return next(badRequest('Ative o modelo promocional antes de criar uma campanha.', 'WHATSAPP_PROMO_MODEL_DISABLED'))
      }
      const active = db.prepare(`
        SELECT id FROM whatsapp_marketing_campaigns
        WHERE tenant_id = ? AND status IN ('QUEUED','RUNNING') LIMIT 1
      `).get(tenantId) as { id: string } | undefined
      if (active) {
        return next(badRequest('Já existe uma campanha em andamento. Aguarde ou cancele a campanha atual.', 'WHATSAPP_CAMPAIGN_ALREADY_ACTIVE'))
      }

      const audience = db.prepare(`
        SELECT c.user_id as userId, c.name, c.phone_normalized as phone
        FROM clients c
        WHERE c.tenant_id = ?
          AND c.marketing_whatsapp_opt_in = 1
          AND c.phone_normalized IS NOT NULL
          AND trim(c.phone_normalized) <> ''
        ORDER BY c.created_at ASC
        LIMIT ?
      `).all(tenantId, maxRecipients + 1) as Array<{ userId: string; name: string; phone: string }>
      if (!audience.length) {
        return next(badRequest('Nenhuma cliente possui consentimento promocional ativo.', 'WHATSAPP_CAMPAIGN_EMPTY_AUDIENCE'))
      }
      if (audience.length > maxRecipients) {
        return next(badRequest(
          `A audiência atual ultrapassa o limite operacional de ${maxRecipients} destinatários por campanha.`,
          'WHATSAPP_CAMPAIGN_AUDIENCE_LIMIT',
        ))
      }

      const campaignId = randomUUID()
      const timestamp = now().toISOString()
      const messageText = campaignMessageWithOptOut(body.message)
      db.transaction(() => {
        db.prepare(`
          INSERT INTO whatsapp_marketing_campaigns
            (id, tenant_id, created_by_user_id, name, message_text, status, total_recipients, sent_count, failed_count, skipped_count, created_at)
          VALUES (?, ?, ?, ?, ?, 'QUEUED', ?, 0, 0, 0, ?)
        `).run(campaignId, tenantId, userId, body.name, messageText, audience.length, timestamp)
        const insertRecipient = db.prepare(`
          INSERT INTO whatsapp_marketing_recipients
            (id, campaign_id, tenant_id, client_user_id, phone_normalized, client_name, status, attempts, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?)
        `)
        for (const recipient of audience) {
          insertRecipient.run(
            randomUUID(), campaignId, tenantId, recipient.userId,
            recipient.phone, recipient.name, timestamp,
          )
        }
      })()

      res.json({
        ok: true,
        campaign: {
          id: campaignId,
          name: body.name,
          status: 'QUEUED',
          totalRecipients: audience.length,
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          createdAt: timestamp,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/whatsapp/campaigns/:campaignId/cancel', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const campaignId = z.string().uuid().parse(req.params.campaignId)
      const timestamp = now().toISOString()
      const changed = db.transaction(() => {
        const result = db.prepare(`
          UPDATE whatsapp_marketing_campaigns
          SET status = 'CANCELLED', cancelled_at = ?, completed_at = COALESCE(completed_at, ?)
          WHERE id = ? AND tenant_id = ? AND status IN ('QUEUED','RUNNING')
        `).run(timestamp, timestamp, campaignId, tenantId)
        if (!result.changes) return false
        const skipped = db.prepare(`
          UPDATE whatsapp_marketing_recipients
          SET status = 'SKIPPED', last_error = 'Campanha cancelada'
          WHERE campaign_id = ? AND tenant_id = ? AND status = 'PENDING'
        `).run(campaignId, tenantId).changes
        db.prepare(`
          UPDATE whatsapp_marketing_campaigns
          SET skipped_count = skipped_count + ? WHERE id = ? AND tenant_id = ?
        `).run(skipped, campaignId, tenantId)
        return true
      })()
      if (!changed) return next(notFound('Campanha ativa não encontrada.', 'WHATSAPP_CAMPAIGN_NOT_FOUND'))
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  // Old clients must never bypass the queued and consent-aware campaign path.
  router.post('/whatsapp/broadcast', requireRole('ADMIN'), (_req, _res, next) => {
    next(forbidden('Use o fluxo de campanhas com fila e audiência consentida.', 'WHATSAPP_BROADCAST_REPLACED'))
  })

  return router
}
