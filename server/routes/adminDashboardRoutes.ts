import Database from 'better-sqlite3'
import { Router } from 'express'
import { requireRole } from '../auth.js'
import { dayBoundsUtc, getZonedDateTimeParts } from '../dateTime.js'
import { badRequest } from '../http.js'

type AppointmentConfirmationStatus =
  | 'NOT_REQUESTED'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'NO_RESPONSE'
  | 'DELIVERY_FAILED'
  | 'MANUALLY_CONFIRMED'

type AdminDashboardRouterOptions = {
  db: Database.Database
  now?: () => Date
}

export function createAdminDashboardRouter({ db, now = () => new Date() }: AdminDashboardRouterOptions) {
  const router = Router()

  router.get('/dashboard', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const currentTime = now()
      const settings = db.prepare(`SELECT timezone FROM tenant_settings WHERE tenant_id = ?`).get(tenantId) as
        | { timezone: string }
        | undefined
      const timeZone = settings?.timezone || 'America/Sao_Paulo'
      const todayParts = getZonedDateTimeParts(currentTime, timeZone)
      if (!todayParts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
      const { start, endExclusive: end } = dayBoundsUtc({ timeZone, ymd: todayParts.ymd })

      const today = db.prepare(`
        SELECT
          COUNT(1) as appointmentsCount,
          COALESCE(SUM(s.price_cents), 0) as expectedRevenueCents
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
          AND a.starts_at >= ?
          AND a.starts_at < ?
          AND a.status IN ('PENDING', 'CONFIRMED')
      `).get(tenantId, start.toISOString(), end.toISOString()) as
        | { appointmentsCount: number; expectedRevenueCents: number }
        | undefined

      const upcoming = db.prepare(`
        SELECT a.id,
               a.starts_at as startsAt,
               a.status,
               a.confirmation_status as confirmationStatus,
               a.confirmation_sent_at as confirmationSentAt,
               a.confirmation_responded_at as confirmationRespondedAt,
               s.name as serviceName,
               s.price_cents as priceCents,
               u.email as clientEmail,
               c.name as clientName,
               c.phone as clientPhone
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        JOIN users u ON u.id = a.client_user_id
        LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND a.starts_at >= ?
          AND a.status != 'CANCELLED'
        ORDER BY a.starts_at ASC
        LIMIT 30
      `).all(tenantId, currentTime.toISOString()) as Array<{
        id: string
        startsAt: string
        status: string
        confirmationStatus: AppointmentConfirmationStatus
        confirmationSentAt: string | null
        confirmationRespondedAt: string | null
        serviceName: string
        priceCents: number
        clientEmail: string
        clientName: string | null
        clientPhone: string | null
      }>

      const thirtyDaysAgo = new Date(currentTime)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const newClients = db.prepare(`
        SELECT COUNT(1) as newClientsCount
        FROM clients
        WHERE tenant_id = ? AND created_at >= ?
      `).get(tenantId, thirtyDaysAgo.toISOString()) as { newClientsCount: number } | undefined

      const pending = db.prepare(`
        SELECT COUNT(1) as pendingAppointmentsCount
        FROM appointments
        WHERE tenant_id = ? AND status = 'PENDING' AND starts_at >= ?
      `).get(tenantId, currentTime.toISOString()) as { pendingAppointmentsCount: number } | undefined

      const confirmationSummary = db.prepare(`
        SELECT
          SUM(CASE WHEN confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED') THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN confirmation_status = 'AWAITING_CONFIRMATION' THEN 1 ELSE 0 END) as awaiting,
          SUM(CASE WHEN confirmation_status = 'NO_RESPONSE' THEN 1 ELSE 0 END) as noResponse,
          SUM(CASE WHEN confirmation_status = 'DELIVERY_FAILED' THEN 1 ELSE 0 END) as deliveryFailed,
          SUM(CASE WHEN confirmation_status = 'DECLINED' THEN 1 ELSE 0 END) as declined,
          SUM(CASE WHEN confirmation_status = 'NOT_REQUESTED' THEN 1 ELSE 0 END) as notRequested
        FROM appointments
        WHERE tenant_id = ? AND status != 'CANCELLED' AND starts_at >= ? AND starts_at < ?
      `).get(tenantId, start.toISOString(), end.toISOString()) as {
        confirmed: number | null
        awaiting: number | null
        noResponse: number | null
        deliveryFailed: number | null
        declined: number | null
        notRequested: number | null
      } | undefined

      const attentionEnd = new Date(currentTime.getTime() + 7 * 24 * 60 * 60_000).toISOString()
      const confirmationAttention = db.prepare(`
        SELECT a.id, a.starts_at as startsAt, a.status, a.confirmation_status as confirmationStatus,
               a.confirmation_sent_at as confirmationSentAt, s.name as serviceName,
               c.name as clientName, c.phone as clientPhone
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        LEFT JOIN clients c ON c.user_id = a.client_user_id AND c.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND a.status != 'CANCELLED'
          AND a.starts_at >= ? AND a.starts_at <= ?
          AND a.confirmation_status IN ('NO_RESPONSE','DELIVERY_FAILED','DECLINED')
        ORDER BY CASE a.confirmation_status WHEN 'DECLINED' THEN 0 ELSE 1 END, a.starts_at ASC
        LIMIT 12
      `).all(tenantId, currentTime.toISOString(), attentionEnd)

      const recentActivity = db.prepare(`
        SELECT kind, at, clientName, clientEmail, serviceName, priceCents, amountCents, note
        FROM (
          SELECT 'APPOINTMENT_CREATED' as kind,
                 a.created_at as at,
                 c.name as clientName,
                 u.email as clientEmail,
                 s.name as serviceName,
                 s.price_cents as priceCents,
                 NULL as amountCents,
                 NULL as note
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          WHERE a.tenant_id = ?

          UNION ALL

          SELECT 'EXPENSE_CREATED' as kind,
                 t.created_at as at,
                 NULL as clientName,
                 NULL as clientEmail,
                 NULL as serviceName,
                 NULL as priceCents,
                 t.amount_cents as amountCents,
                 t.note as note
          FROM cash_transactions t
          WHERE t.tenant_id = ? AND t.type = 'EXPENSE'
        )
        ORDER BY at DESC
        LIMIT 12
      `).all(tenantId, tenantId)

      const primaryDomain = db.prepare(`
        SELECT domain
        FROM tenant_domains
        WHERE tenant_id = ? AND status = 'ACTIVE'
        ORDER BY is_primary DESC, verified_at DESC, created_at DESC
        LIMIT 1
      `).get(tenantId) as { domain: string } | undefined

      res.json({
        timeZone,
        publicBaseUrl: primaryDomain ? `https://${primaryDomain.domain}` : null,
        today: {
          appointmentsCount: today?.appointmentsCount ?? 0,
          expectedRevenueCents: today?.expectedRevenueCents ?? 0,
        },
        newClients30d: newClients?.newClientsCount ?? 0,
        pendingAppointments: pending?.pendingAppointmentsCount ?? 0,
        confirmationSummary: {
          confirmed: Number(confirmationSummary?.confirmed ?? 0),
          awaiting: Number(confirmationSummary?.awaiting ?? 0),
          noResponse: Number(confirmationSummary?.noResponse ?? 0),
          deliveryFailed: Number(confirmationSummary?.deliveryFailed ?? 0),
          declined: Number(confirmationSummary?.declined ?? 0),
          notRequested: Number(confirmationSummary?.notRequested ?? 0),
        },
        confirmationAttention,
        upcoming,
        recentActivity,
      })
    } catch (err) {
      next(err)
    }
  })

  return router
}
