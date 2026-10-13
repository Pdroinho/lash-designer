import type Database from 'better-sqlite3'
import { Router, type Request, type RequestHandler, type Response } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, notFound, unauthorized } from '../http.js'
import type { ClientAccessInput, VerifyClientAccessInput } from '../clientAccessService.js'

type AppointmentPayload = {
  id: string
  serviceId: string
  startsAt: string
  endsAt: string
  status: string
  confirmationStatus: string
}

type PublicClientAccessRouterOptions = {
  clientAccessRequestLimiter: RequestHandler
  clientAccessPhoneLimiter: RequestHandler
  clientAccessVerifyLimiter: RequestHandler
  requestClientAccess: (input: ClientAccessInput) => Promise<{ sent: true }>
  verifyClientAccess: (input: VerifyClientAccessInput) => {
    id: string
    email: string
    role: 'CLIENT'
    tenantId: string
    tenantSlug: string
    name: string
  }
  createAndSetSession: (req: Request, res: Response, userId: string, persistent: boolean) => unknown
}

type ClientPortalRouterOptions = {
  db: Database.Database
  setClientWhatsappMarketingConsent: (input: {
    tenantId: string
    userId: string
    granted: boolean
    source: string
  }) => { optedIn: boolean }
  createAppointmentForUser: (input: {
    tenantId: string
    userId: string
    serviceId: string
    startsAt: string
    professionalId?: string
  }) => AppointmentPayload
}

export function createPublicClientAccessRouter({
  clientAccessRequestLimiter,
  clientAccessPhoneLimiter,
  clientAccessVerifyLimiter,
  requestClientAccess,
  verifyClientAccess,
  createAndSetSession,
}: PublicClientAccessRouterOptions) {
  const router = Router()

  router.post('/client-access/request', clientAccessRequestLimiter, clientAccessPhoneLimiter, async (req, res, next) => {
    try {
      const body = z.object({ tenantSlug: z.string().min(1).max(80), phone: z.string().min(8).max(40) }).parse(req.body)
      res.json(await requestClientAccess(body))
    } catch (err) { next(err) }
  })

  router.post('/client-access/verify', clientAccessVerifyLimiter, (req, res, next) => {
    try {
      const body = z.object({ tenantSlug: z.string().min(1).max(80), phone: z.string().min(8).max(40), code: z.string().regex(/^\d{6}$/) }).parse(req.body)
      const user = verifyClientAccess({
        ...body,
        onVerified: userId => createAndSetSession(req, res, userId, true),
      })
      res.json({ user })
    } catch (err) { next(err) }
  })

  return router
}

export function createClientPortalRouter({
  db,
  setClientWhatsappMarketingConsent,
  createAppointmentForUser,
}: ClientPortalRouterOptions) {
  const router = Router()

  router.get('/marketing-preferences', requireRole('CLIENT'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      const userId = req.sessionUser?.id
      if (!tenantId || !userId) return next(badRequest('Sessão de cliente inválida', 'INVALID_CLIENT_SESSION'))
      const row = db.prepare(`
        SELECT marketing_whatsapp_opt_in as whatsappPromotions,
               marketing_whatsapp_opt_in_at as optedInAt,
               marketing_whatsapp_opt_out_at as optedOutAt
        FROM clients
        WHERE tenant_id = ? AND user_id = ?
        LIMIT 1
      `).get(tenantId, userId) as { whatsappPromotions: number; optedInAt: string | null; optedOutAt: string | null } | undefined
      if (!row) return next(notFound('Cliente não encontrado', 'CLIENT_NOT_FOUND'))
      res.json({ preferences: { whatsappPromotions: Boolean(row.whatsappPromotions), optedInAt: row.optedInAt, optedOutAt: row.optedOutAt } })
    } catch (err) { next(err) }
  })

  router.put('/marketing-preferences', requireRole('CLIENT'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      const userId = req.sessionUser?.id
      if (!tenantId || !userId) return next(badRequest('Sessão de cliente inválida', 'INVALID_CLIENT_SESSION'))
      const body = z.object({ whatsappPromotions: z.boolean() }).strict().parse(req.body)
      const result = setClientWhatsappMarketingConsent({ tenantId, userId, granted: body.whatsappPromotions, source: 'CLIENT_PORTAL' })
      res.json({ preferences: { whatsappPromotions: result.optedIn } })
    } catch (err) { next(err) }
  })

  router.get('/appointments', requireRole('CLIENT'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const tenantId = sessionUser.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const appointments = db.prepare(`
        SELECT a.id,
               a.starts_at as startsAt,
               a.ends_at as endsAt,
               a.status,
               a.confirmation_status as confirmationStatus,
               a.confirmation_sent_at as confirmationSentAt,
               a.confirmation_responded_at as confirmationRespondedAt,
               s.name as serviceName,
               a.professional_id as professionalId, p.name as professionalName,
               s.price_cents as priceCents
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        LEFT JOIN professionals p ON p.id = a.professional_id AND p.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND a.client_user_id = ?
        ORDER BY a.starts_at DESC
        LIMIT 100
      `).all(tenantId, sessionUser.id)

      const settings = db.prepare('SELECT timezone FROM tenant_settings WHERE tenant_id=?').get(tenantId) as {timezone:string}|undefined
      res.json({ appointments, timezone: settings?.timezone ?? 'America/Sao_Paulo' })
    } catch (err) { next(err) }
  })

  router.post('/appointments', requireRole('CLIENT'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const tenantId = sessionUser.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        serviceId: z.string().uuid(),
        startsAt: z.string().datetime(),
        professionalId: z.string().uuid().optional(),
      }).parse(req.body)
      const appointment = createAppointmentForUser({
        tenantId,
        userId: sessionUser.id,
        serviceId: body.serviceId,
        startsAt: body.startsAt,
        ...(body.professionalId ? { professionalId: body.professionalId } : {}),
      })
      res.json({ appointment })
    } catch (err) { next(err) }
  })

  return router
}
