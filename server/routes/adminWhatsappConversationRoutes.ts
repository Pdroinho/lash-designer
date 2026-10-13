import { readFile } from 'node:fs/promises'
import Database from 'better-sqlite3'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, notFound } from '../http.js'
import { resolvePrivateWhatsappMediaPath } from '../whatsappMedia.js'

type ManualWhatsappSendOptions = {
  source: 'MANUAL'
  persist?: boolean
  displayName?: string | null
}

type AdminWhatsappConversationRouterOptions = {
  db: Database.Database
  whatsappSendLimiter: RequestHandler
  whatsappMediaDir: string
  configureEvolutionWebhookForTenant: (tenantId: string) => Promise<boolean>
  sendWhatsappTextForTenant: (
    tenantId: string,
    phone: string,
    text: string,
    options: ManualWhatsappSendOptions,
  ) => Promise<boolean>
  now?: () => Date
}

export function createAdminWhatsappConversationRouter({
  db,
  whatsappSendLimiter,
  whatsappMediaDir,
  configureEvolutionWebhookForTenant,
  sendWhatsappTextForTenant,
  now = () => new Date(),
}: AdminWhatsappConversationRouterOptions) {
  const router = Router()

  router.post('/whatsapp/send', requireRole('ADMIN'), whatsappSendLimiter, async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        contactName: z.string().trim().min(2).max(120).optional(),
        toPhone: z.string().min(6).max(40),
        text: z.string().min(1).max(2000),
        recordInInbox: z.boolean().optional().default(true),
      }).parse(req.body)

      // Manual conversations must also prepare inbound delivery; previously the webhook was only
      // configured by the appointment-confirmation automation path.
      await configureEvolutionWebhookForTenant(tenantId).catch(() => false)
      const delivered = await sendWhatsappTextForTenant(tenantId, body.toPhone, body.text, {
        source: 'MANUAL',
        persist: body.recordInInbox,
        displayName: body.contactName,
      })
      if (!delivered) return next(badRequest('Falha ao enviar mensagem', 'WHATSAPP_SEND_FAILED'))
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.get('/whatsapp/conversations', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const search = String(req.query.search ?? '').trim().slice(0, 100)
      const like = `%${search.replace(/[%_]/g, '')}%`
      const timestamp = now().toISOString()
      const rows = db.prepare(`
        SELECT wc.id,
               wc.phone_normalized as phone,
               COALESCE(NULLIF(c.name, ''), NULLIF(wc.display_name, ''), wc.phone_normalized) as displayName,
               wc.unread_count as unreadCount,
               wc.last_message_preview as lastMessage,
               wc.last_message_direction as lastDirection,
               wc.last_message_at as lastMessageAt,
               c.id as clientId,
               c.user_id as clientUserId,
               COALESCE(c.marketing_whatsapp_opt_in, 0) as marketingOptIn,
               a.id as upcomingAppointmentId,
               a.starts_at as upcomingStartsAt,
               a.confirmation_status as upcomingConfirmationStatus,
               s.name as upcomingServiceName,
               s.price_cents as upcomingPriceCents,
               (
                 SELECT COUNT(*) FROM appointments hist
                 WHERE hist.tenant_id = wc.tenant_id
                   AND hist.client_user_id = c.user_id
                   AND hist.status != 'CANCELLED'
                   AND hist.starts_at < ?
               ) as appointmentsCount
        FROM whatsapp_conversations wc
        LEFT JOIN clients c ON c.user_id = wc.client_user_id AND c.tenant_id = wc.tenant_id
        LEFT JOIN appointments a ON a.id = (
          SELECT upcoming.id FROM appointments upcoming
          WHERE upcoming.tenant_id = wc.tenant_id
            AND upcoming.client_user_id = c.user_id
            AND upcoming.status != 'CANCELLED'
            AND upcoming.starts_at > ?
          ORDER BY upcoming.starts_at ASC
          LIMIT 1
        )
        LEFT JOIN services s ON s.id = a.service_id
        WHERE wc.tenant_id = ?
          AND (? = '' OR COALESCE(c.name, wc.display_name, '') LIKE ? OR wc.phone_normalized LIKE ?)
        ORDER BY COALESCE(wc.last_message_at, wc.updated_at) DESC
        LIMIT 120
      `).all(timestamp, timestamp, tenantId, search, like, like) as Array<Record<string, unknown>>
      res.json({
        conversations: rows.map((row) => ({
          id: String(row.id),
          phone: String(row.phone),
          displayName: String(row.displayName),
          unreadCount: Number(row.unreadCount ?? 0),
          lastMessage: row.lastMessage ? String(row.lastMessage) : '',
          lastDirection: row.lastDirection ? String(row.lastDirection) : null,
          lastMessageAt: row.lastMessageAt ? String(row.lastMessageAt) : null,
          client: row.clientId ? {
            id: String(row.clientId),
            userId: String(row.clientUserId),
            name: String(row.displayName),
            marketingOptIn: Boolean(row.marketingOptIn),
            appointmentsCount: Number(row.appointmentsCount ?? 0),
          } : null,
          upcomingAppointment: row.upcomingAppointmentId ? {
            id: String(row.upcomingAppointmentId),
            startsAt: String(row.upcomingStartsAt),
            serviceName: String(row.upcomingServiceName ?? 'Serviço'),
            priceCents: Number(row.upcomingPriceCents ?? 0),
            confirmationStatus: String(row.upcomingConfirmationStatus ?? 'NOT_REQUESTED'),
          } : null,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/whatsapp/conversations/:id/messages', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const conversationId = z.string().uuid().parse(req.params.id)
      const conversation = db.prepare(`SELECT id FROM whatsapp_conversations WHERE id = ? AND tenant_id = ? LIMIT 1`).get(conversationId, tenantId)
      if (!conversation) return next(notFound('Conversa não encontrada', 'WHATSAPP_CONVERSATION_NOT_FOUND'))
      const rows = db.prepare(`
        SELECT id, direction, message_type as messageType, body_text as text, source, sent_at as sentAt,
               delivery_status as deliveryStatus, status_updated_at as statusUpdatedAt,
               media_mime_type as mediaMimeType, media_file_name as mediaFileName, media_size_bytes as mediaSizeBytes, media_status as mediaStatus
        FROM whatsapp_messages
        WHERE tenant_id = ? AND conversation_id = ?
        ORDER BY sent_at DESC, created_at DESC
        LIMIT 120
      `).all(tenantId, conversationId) as Array<{ id: string; direction: string; messageType: string; text: string; source: string; sentAt: string }>
      res.json({ messages: rows.reverse() })
    } catch (err) {
      next(err)
    }
  })

  router.get('/whatsapp/messages/:id/media', requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const messageId = z.string().uuid().parse(req.params.id)
      const row = db.prepare(`
        SELECT media_status as mediaStatus, media_mime_type as mimeType, media_file_name as fileName,
               media_storage_path as storagePath, media_size_bytes as sizeBytes
        FROM whatsapp_messages
        WHERE id = ? AND tenant_id = ? AND direction = 'INBOUND'
        LIMIT 1
      `).get(messageId, tenantId) as { mediaStatus: string; mimeType: string | null; fileName: string | null; storagePath: string | null; sizeBytes: number | null } | undefined
      if (!row || row.mediaStatus !== 'READY' || !row.storagePath) return next(notFound('Mídia não disponível', 'WHATSAPP_MEDIA_NOT_FOUND'))
      const absolutePath = resolvePrivateWhatsappMediaPath(whatsappMediaDir, row.storagePath)
      const content = await readFile(absolutePath)
      if (row.sizeBytes && content.length !== row.sizeBytes) return next(notFound('Mídia indisponível', 'WHATSAPP_MEDIA_CORRUPT'))
      res.setHeader('Content-Type', row.mimeType || 'application/octet-stream')
      res.setHeader('Content-Length', String(content.length))
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      if (row.fileName) {
        const safeName = row.fileName.replace(/[\r\n"\\]/g, '_').slice(0, 160)
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`)
      }
      res.send(content)
    } catch (err) {
      next(err)
    }
  })

  router.post('/whatsapp/conversations/:id/read', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const conversationId = z.string().uuid().parse(req.params.id)
      const changed = db.prepare(`UPDATE whatsapp_conversations SET unread_count = 0, updated_at = ? WHERE id = ? AND tenant_id = ?`)
        .run(now().toISOString(), conversationId, tenantId)
      if (!changed.changes) return next(notFound('Conversa não encontrada', 'WHATSAPP_CONVERSATION_NOT_FOUND'))
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.post('/whatsapp/conversations/:id/messages', requireRole('ADMIN'), whatsappSendLimiter, async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const conversationId = z.string().uuid().parse(req.params.id)
      const body = z.object({ text: z.string().trim().min(1).max(2000) }).parse(req.body)
      const conversation = db.prepare(`SELECT phone_normalized as phone FROM whatsapp_conversations WHERE id = ? AND tenant_id = ? LIMIT 1`).get(conversationId, tenantId) as { phone: string } | undefined
      if (!conversation) return next(notFound('Conversa não encontrada', 'WHATSAPP_CONVERSATION_NOT_FOUND'))
      const delivered = await sendWhatsappTextForTenant(tenantId, conversation.phone, body.text, { source: 'MANUAL' })
      if (!delivered) return next(badRequest('Falha ao enviar mensagem', 'WHATSAPP_SEND_FAILED'))
      const row = db.prepare(`
        SELECT id, direction, message_type as messageType, body_text as text, source, sent_at as sentAt,
               delivery_status as deliveryStatus, status_updated_at as statusUpdatedAt,
               media_mime_type as mediaMimeType, media_file_name as mediaFileName, media_size_bytes as mediaSizeBytes, media_status as mediaStatus
        FROM whatsapp_messages
        WHERE tenant_id = ? AND conversation_id = ?
        ORDER BY sent_at DESC, created_at DESC
        LIMIT 1
      `).get(tenantId, conversationId)
      res.json({ ok: true, message: row ?? null })
    } catch (err) {
      next(err)
    }
  })

  return router
}
