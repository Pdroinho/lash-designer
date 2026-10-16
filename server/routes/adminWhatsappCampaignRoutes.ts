import { prepareCampaignImage } from '../campaignImage.js'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, forbidden, notFound } from '../http.js'
import { campaignMessageWithOptOut, renderMarketingCampaignMessage } from '../marketingCampaign.js'
import type { WhatsappSettings } from './adminWhatsappSettingsRoutes.js'

export type MarketingCampaignRow = {
  id: string
  tenantId: string
  name: string
  imageDataUrl?: string | null
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
    hasImage: Boolean(row.imageDataUrl),
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
  maxRecipients = Math.min(50, maxRecipients)
  sendIntervalSeconds = Math.max(60, sendIntervalSeconds)

  router.get('/whatsapp/campaigns', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const campaigns = db.prepare(`
        SELECT id, tenant_id as tenantId, name, message_text as messageText, image_data_url as imageDataUrl, status,
               total_recipients as totalRecipients, sent_count as sentCount,
               failed_count as failedCount, skipped_count as skippedCount,
               created_at as createdAt, started_at as startedAt, completed_at as completedAt,
               cancelled_at as cancelledAt, last_error as lastError
        FROM whatsapp_marketing_campaigns
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(tenantId) as MarketingCampaignRow[]
      const dailyUsed = Number((db.prepare('SELECT COUNT(*) as n FROM whatsapp_marketing_recipients WHERE tenant_id=? AND dispatch_started_at>=?').get(tenantId,new Date(now().getTime()-86400000).toISOString()) as {n:number}).n)
      const eligible = Number((db.prepare(`SELECT COUNT(DISTINCT c.phone_normalized) as n FROM clients c WHERE c.tenant_id=? AND c.marketing_whatsapp_opt_in=1 AND c.phone_normalized IS NOT NULL AND trim(c.phone_normalized)<>'' AND NOT EXISTS(SELECT 1 FROM whatsapp_marketing_recipients r WHERE r.tenant_id=c.tenant_id AND r.phone_normalized=c.phone_normalized AND r.dispatch_started_at>=?)`).get(tenantId,new Date(now().getTime()-7*86400000).toISOString()) as {n:number}).n)
      res.json({
        enabled: campaignsEnabled,
        plannedRecipients: Math.min(eligible,maxRecipients,Math.max(0,50-dailyUsed)),
        maxRecipients,
        sendIntervalSeconds,
        dailyLimit: 50,
        contactIntervalDays: 7,
        campaigns: campaigns.map(marketingCampaignPayload),
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/whatsapp/campaigns', requireRole('ADMIN'), async (req, res, next) => {
    try {
      if (!campaignsEnabled) {
        return next(forbidden(
          'O envio de campanhas ainda não está disponível para este espaço. Fale com o suporte para configurar.',
          'WHATSAPP_CAMPAIGNS_DISABLED',
        ))
      }
      const tenantId = req.sessionUser?.tenantId
      const userId = req.sessionUser?.id
      if (!tenantId || !userId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        name: z.string().trim().min(2).max(80),
        message: z.string().trim().min(10).max(1400),
        imageDataUrl: z.string().max(1_400_000).nullable().optional(),
      }).strict().parse(req.body)

      const imageDataUrl = await prepareCampaignImage(body.imageDataUrl)
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

      const budget = Math.max(0, 50 - Number((db.prepare('SELECT COUNT(*) as n FROM whatsapp_marketing_recipients WHERE tenant_id=? AND dispatch_started_at>=?').get(tenantId, new Date(now().getTime()-86400000).toISOString()) as {n:number}).n))
      if (!budget) return next(badRequest('O limite de campanhas de hoje foi alcançado. Aguarde para enviar outra novidade.', 'WHATSAPP_CAMPAIGN_DAILY_LIMIT'))
      const audience = db.prepare(`
        SELECT c.user_id as userId, c.name, c.phone_normalized as phone
        FROM clients c
        WHERE c.tenant_id = ?
          AND c.marketing_whatsapp_opt_in = 1
          AND c.phone_normalized IS NOT NULL
          AND trim(c.phone_normalized) <> ''
          AND NOT EXISTS (SELECT 1 FROM whatsapp_marketing_recipients r WHERE r.tenant_id=c.tenant_id AND r.phone_normalized=c.phone_normalized AND r.dispatch_started_at>=?)
        GROUP BY c.phone_normalized
        ORDER BY c.created_at ASC
        LIMIT ?
      `).all(tenantId, new Date(now().getTime()-7*86400000).toISOString(), Math.min(maxRecipients,budget)) as Array<{ userId: string; name: string; phone: string }>
      if (!audience.length) {
        return next(badRequest('Nenhuma cliente está disponível para esta campanha. Só entram clientes que autorizaram e não receberam uma campanha nos últimos 7 dias.', 'WHATSAPP_CAMPAIGN_EMPTY_AUDIENCE'))
      }

      if (audience.length > budget) return next(badRequest('Esta campanha ultrapassa o limite restante de hoje. Aguarde antes de criar outra.', 'WHATSAPP_CAMPAIGN_DAILY_LIMIT'))
      const campaignId = randomUUID()
      const timestamp = now().toISOString()
      const messageText = campaignMessageWithOptOut(body.message)
      const studio = db.prepare('SELECT name FROM tenants WHERE id=?').get(tenantId) as {name:string}|undefined
      if (audience.some(client => renderMarketingCampaignMessage(messageText,{clientName:client.name,tenantName:studio?.name ?? ''}).length > (imageDataUrl ? 1024 : 4096))) return next(badRequest(imageDataUrl ? 'Encurte a mensagem que acompanha a imagem. Ela pode ter até 1.024 caracteres após incluir os nomes e a opção de sair.' : 'Encurte a mensagem ou use menos repetições dos nomes.', 'WHATSAPP_CAMPAIGN_MESSAGE_TOO_LONG'))
      db.transaction(() => {
        if (db.prepare("SELECT id FROM whatsapp_marketing_campaigns WHERE tenant_id=? AND status IN ('QUEUED','RUNNING')").get(tenantId)) throw badRequest('Já existe uma campanha em andamento.', 'WHATSAPP_CAMPAIGN_ALREADY_ACTIVE')
        db.prepare(`
          INSERT INTO whatsapp_marketing_campaigns
            (id, tenant_id, created_by_user_id, name, message_text, image_data_url, status, total_recipients, sent_count, failed_count, skipped_count, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'QUEUED', ?, 0, 0, 0, ?)
        `).run(campaignId, tenantId, userId, body.name, messageText, imageDataUrl, audience.length, timestamp)
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
      }).immediate()

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
