import { randomBytes, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { badRequest, forbidden, notFound } from '../http.js'

type AppointmentPayload = {
  id: string
  serviceId: string
  startsAt: string
  endsAt: string
  status: string
  confirmationStatus: string
}

type PublicBookingRouterOptions = {
  db: Database.Database
  publicBookingLimiter: RequestHandler
  publicBookingPhoneLimiter: RequestHandler
  normalizePhone: (raw: string) => string
  hashPassword: (password: string) => Promise<string>
  createAppointmentForUser: (input: {
    tenantId: string
    userId: string
    serviceId: string
    startsAt: string
    professionalId?: string
  }) => AppointmentPayload
  setClientWhatsappMarketingConsent: (input: {
    tenantId: string
    userId: string
    granted: boolean
    source: string
  }) => unknown
  now?: () => Date
}

export function createPublicBookingRouter({
  db,
  publicBookingLimiter,
  publicBookingPhoneLimiter,
  normalizePhone,
  hashPassword,
  createAppointmentForUser,
  setClientWhatsappMarketingConsent,
  now = () => new Date(),
}: PublicBookingRouterOptions) {
  const router = Router()

  async function upsertBookingClient(tenantId: string, nameRaw: string, phoneRaw: string) {
    const name = nameRaw.trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 120) throw badRequest('Nome inválido', 'INVALID_CLIENT_NAME')
    const phone = normalizePhone(phoneRaw)
    const existing = db.prepare(`
      SELECT u.id as userId, u.session_version as sessionVersion, c.id as clientId
      FROM clients c
      JOIN users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
      WHERE c.tenant_id = ? AND c.phone_normalized = ?
      LIMIT 1
    `).get(tenantId, phone) as { userId: string; sessionVersion: number; clientId: string } | undefined

    if (existing) {
      // Public booking may reuse an existing phone, but must not overwrite verified client identity.
      return { userId: existing.userId, sessionVersion: existing.sessionVersion, phone }
    }

    const userId = randomUUID()
    const clientId = randomUUID()
    const timestamp = now().toISOString()
    const placeholderEmail = `${phone}.${tenantId.replace(/-/g, '')}@client.local`
    const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))
    const createClient = db.transaction(() => {
      // Recheck under an IMMEDIATE transaction so simultaneous public bookings for
      // the same phone cannot manufacture parallel CLIENT identities.
      const concurrent = db.prepare(`
        SELECT u.id as userId, u.session_version as sessionVersion
        FROM clients c
        JOIN users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
        WHERE c.tenant_id = ? AND c.phone_normalized = ?
        LIMIT 1
      `).get(tenantId, phone) as { userId: string; sessionVersion: number } | undefined
      if (concurrent) return { userId: concurrent.userId, sessionVersion: concurrent.sessionVersion, phone }
      db.prepare(`
        INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, 'CLIENT', ?)
      `).run(userId, tenantId, placeholderEmail, passwordHash, timestamp)
      db.prepare(`
        INSERT INTO clients (id, tenant_id, user_id, name, phone, phone_normalized, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(clientId, tenantId, userId, name, phoneRaw.trim(), phone, timestamp)
      return { userId, sessionVersion: 0, phone }
    })
    return createClient.immediate()
  }

  async function createPublicAppointment(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2], explicitSlug?: string) {
    try {
      const body = z.object({
        serviceId: z.string().uuid(),
        startsAt: z.string().datetime(),
        professionalId: z.string().uuid().optional(),
        name: z.string().min(2).max(120),
        phone: z.string().min(8).max(40),
        marketingConsent: z.boolean().optional().default(false),
      }).strict().parse(req.body)
      const slug = (explicitSlug ?? req.resolvedTenant?.slug ?? '').trim().toLowerCase()
      if (!slug || !/^[a-z0-9-]+$/.test(slug)) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
      if (req.resolvedTenant && req.resolvedTenant.slug !== slug) {
        return next(forbidden('Use o endereço do espaço escolhido.', 'TENANT_HOST_MISMATCH'))
      }
      const tenant = db.prepare(`SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'`).get(slug) as { id: string } | undefined
      if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
      const client = await upsertBookingClient(tenant.id, body.name, body.phone)
      const appointment = createAppointmentForUser({
        tenantId: tenant.id,
        userId: client.userId,
        serviceId: body.serviceId,
        startsAt: body.startsAt,
        ...(body.professionalId ? { professionalId: body.professionalId } : {}),
      })
      // Consent is committed only after the booking succeeds. Leaving the optional box unchecked never revokes an earlier grant.
      if (body.marketingConsent) {
        setClientWhatsappMarketingConsent({
          tenantId: tenant.id,
          userId: client.userId,
          granted: true,
          source: 'PUBLIC_BOOKING',
        })
      }
      res.json({ appointment })
    } catch (err) {
      next(err)
    }
  }

  router.post('/appointments', publicBookingLimiter, publicBookingPhoneLimiter, (req, res, next) => {
    void createPublicAppointment(req, res, next)
  })
  router.post('/tenant/:slug/appointments', publicBookingLimiter, publicBookingPhoneLimiter, (req, res, next) => {
    void createPublicAppointment(req, res, next, String(req.params.slug ?? ''))
  })

  return router
}
