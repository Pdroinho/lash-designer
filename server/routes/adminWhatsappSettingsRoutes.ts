import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, forbidden } from '../http.js'

export type WhatsappConfig = {
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

export type WhatsappSettings = {
  confirmationsEnabled: boolean
  confirmationOffsetHours: number
  confirmationRetryHours: number
  noResponseCutoffHours: number
  confirmationMessage: string
  autoCancelDeclined: boolean
  remindersEnabled: boolean
  reminderOffsetHours: number
  reminderMessage: string
  promoEnabled: boolean
  promoMessage: string
  updatedAt?: string
}

type AdminWhatsappSettingsRouterOptions = {
  db: Database.Database
  production: boolean
  requireWhatsappConfig: (tenantId: string) => WhatsappConfig | undefined
  ensurePlatformWhatsappConfig: (tenantId: string) => WhatsappConfig | undefined
  requireWhatsappSettings: (tenantId: string) => WhatsappSettings | null
  defaultWhatsappSettings: WhatsappSettings
  resolveExternalHttpsBaseUrl: (raw: string) => Promise<string>
  encryptTenantApiKey: (apiKey: string, tenantId: string) => string
  scheduleAppointmentAutomationJobsForTenant: (tenantId: string) => unknown
  now?: () => Date
}

export function createAdminWhatsappSettingsRouter({
  db,
  production,
  requireWhatsappConfig,
  ensurePlatformWhatsappConfig,
  requireWhatsappSettings,
  defaultWhatsappSettings,
  resolveExternalHttpsBaseUrl,
  encryptTenantApiKey,
  scheduleAppointmentAutomationJobsForTenant,
  now = () => new Date(),
}: AdminWhatsappSettingsRouterOptions) {
  const router = Router()

  router.get('/whatsapp', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const row = ensurePlatformWhatsappConfig(tenantId)
      if (!row) {
        res.json({ instance: null })
        return
      }

      res.json({
        instance: {
          id: row.id,
          provider: row.provider,
          baseUrl: row.baseUrl,
          instanceName: row.instanceName,
          status: row.status,
          updatedAt: row.updatedAt,
          hasApiKey: Boolean(row.apiKey && row.apiKey.length > 0),
          usesGlobalBaseUrl: row.usesGlobalBaseUrl,
          usesGlobalApiKey: row.usesGlobalApiKey,
          platformManaged: row.usesGlobalBaseUrl && row.usesGlobalApiKey,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  router.put('/whatsapp', requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const body = z.object({
        provider: z.literal('EVOLUTION').optional(),
        baseUrl: z.string().trim().min(1).max(500).optional(),
        apiKey: z.string().trim().min(16).max(500).optional(),
        instanceName: z.string().trim().regex(/^[a-zA-Z0-9_-]{2,80}$/).optional(),
      }).strict().parse(req.body)

      if (production && (body.baseUrl || body.apiKey)) {
        throw forbidden('A integração WhatsApp é gerenciada pela plataforma em produção.', 'WHATSAPP_PLATFORM_MANAGED')
      }

      const timestamp = now().toISOString()
      const existing = requireWhatsappConfig(tenantId)
      const provider = body.provider?.trim() || existing?.provider || 'EVOLUTION'
      const baseUrl = body.baseUrl?.trim()
        ? await resolveExternalHttpsBaseUrl(body.baseUrl)
        : existing?.storedBaseUrl || null
      const apiKey = body.apiKey?.trim()
        ? encryptTenantApiKey(body.apiKey.trim(), tenantId)
        : existing?.storedApiKeyCiphertext || null
      const instanceName = body.instanceName?.trim() || existing?.instanceName || null
      const status = 'CONFIGURED'

      if (existing) {
        db.prepare(`
          UPDATE whatsapp_instances
          SET provider = ?, base_url = ?, api_key = ?, instance_name = ?, status = ?, updated_at = ?
          WHERE id = ?
        `).run(provider, baseUrl, apiKey, instanceName, status, timestamp, existing.id)
        res.json({ ok: true })
        return
      }

      db.prepare(`
        INSERT INTO whatsapp_instances (id, tenant_id, provider, base_url, api_key, instance_name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), tenantId, provider, baseUrl, apiKey, instanceName, status, timestamp, timestamp)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.get('/whatsapp/settings', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const settings = requireWhatsappSettings(tenantId)
      res.json({ settings: settings ?? defaultWhatsappSettings })
    } catch (err) {
      next(err)
    }
  })

  router.put('/whatsapp/settings', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const body = z.object({
        confirmationsEnabled: z.boolean().optional(),
        confirmationOffsetHours: z.number().int().min(6).max(168).optional(),
        confirmationRetryHours: z.number().int().min(1).max(72).optional(),
        noResponseCutoffHours: z.number().int().min(1).max(24).optional(),
        confirmationMessage: z.string().max(2000).transform((value) => value.trim()).pipe(z.string().min(1)).optional(),
        autoCancelDeclined: z.boolean().optional(),
        remindersEnabled: z.boolean().optional(),
        reminderOffsetHours: z.number().int().min(1).max(24).optional(),
        reminderMessage: z.string().max(2000).transform((value) => value.trim()).pipe(z.string().min(1)).optional(),
        promoEnabled: z.boolean().optional(),
        promoMessage: z.string().max(2000).transform((value) => value.trim()).pipe(z.string().min(1)).optional(),
      }).parse(req.body)

      const existing = requireWhatsappSettings(tenantId) ?? defaultWhatsappSettings
      const confirmationsEnabled = body.confirmationsEnabled ?? existing.confirmationsEnabled
      const confirmationOffsetHours = body.confirmationOffsetHours ?? existing.confirmationOffsetHours
      const confirmationRetryHours = body.confirmationRetryHours ?? existing.confirmationRetryHours
      const noResponseCutoffHours = body.noResponseCutoffHours ?? existing.noResponseCutoffHours
      const confirmationMessage = body.confirmationMessage ?? existing.confirmationMessage
      const autoCancelDeclined = body.autoCancelDeclined ?? existing.autoCancelDeclined
      const remindersEnabled = body.remindersEnabled ?? existing.remindersEnabled
      const reminderOffsetHours = body.reminderOffsetHours ?? existing.reminderOffsetHours
      const reminderMessage = body.reminderMessage ?? existing.reminderMessage
      const promoEnabled = body.promoEnabled ?? existing.promoEnabled
      const promoMessage = body.promoMessage ?? existing.promoMessage

      if (noResponseCutoffHours >= confirmationOffsetHours) {
        return next(badRequest('O limite sem resposta precisa acontecer antes do horário do atendimento.', 'INVALID_CONFIRMATION_WINDOW'))
      }
      if (confirmationRetryHours >= confirmationOffsetHours - noResponseCutoffHours) {
        return next(badRequest('O reenvio precisa acontecer antes do limite de sem resposta.', 'INVALID_CONFIRMATION_RETRY'))
      }

      const timestamp = now().toISOString()
      const row = db.prepare('SELECT tenant_id as tenantId FROM whatsapp_settings WHERE tenant_id = ?').get(tenantId) as
        | { tenantId: string }
        | undefined
      const values = [
        confirmationsEnabled ? 1 : 0,
        confirmationOffsetHours,
        confirmationRetryHours,
        noResponseCutoffHours,
        confirmationMessage,
        autoCancelDeclined ? 1 : 0,
        remindersEnabled ? 1 : 0,
        reminderOffsetHours,
        reminderMessage,
        promoEnabled ? 1 : 0,
        promoMessage,
      ]

      if (row) {
        db.prepare(`
          UPDATE whatsapp_settings
          SET confirmations_enabled = ?, confirmation_offset_hours = ?, confirmation_retry_hours = ?,
              no_response_cutoff_hours = ?, confirmation_message = ?, auto_cancel_declined = ?,
              reminders_enabled = ?, reminder_offset_hours = ?, reminder_message = ?,
              promo_enabled = ?, promo_message = ?, updated_at = ?
          WHERE tenant_id = ?
        `).run(...values, timestamp, tenantId)
      } else {
        db.prepare(`
          INSERT INTO whatsapp_settings (
            tenant_id, confirmations_enabled, confirmation_offset_hours, confirmation_retry_hours,
            no_response_cutoff_hours, confirmation_message, auto_cancel_declined, reminders_enabled,
            reminder_offset_hours, reminder_message, promo_enabled, promo_message, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tenantId, ...values, timestamp, timestamp)
      }

      scheduleAppointmentAutomationJobsForTenant(tenantId)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
