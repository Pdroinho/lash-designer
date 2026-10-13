import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, notFound } from '../http.js'

export type AppointmentAutomationKind =
  | 'CONFIRMATION_REQUEST'
  | 'CONFIRMATION_RETRY'
  | 'NO_RESPONSE_CUTOFF'
  | 'APPOINTMENT_REMINDER'

type AppointmentConfirmationStatus =
  | 'NOT_REQUESTED'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'NO_RESPONSE'
  | 'DELIVERY_FAILED'
  | 'MANUALLY_CONFIRMED'

export type ConfirmationAppointment = {
  id: string
  tenantId: string
  startsAt: string
  status: string
  confirmationStatus: AppointmentConfirmationStatus
  confirmationCode: string | null
  confirmationSentAt: string | null
  clientName: string | null
  clientPhone: string | null
  clientPhoneNormalized: string | null
  serviceName: string
  tenantName: string
  timeZone: string
}

type AdminAppointmentsRouterOptions = {
  db: Database.Database
  staffEnabled?: boolean
  normalizePhone: (raw: string) => string
  hashPassword: (password: string) => Promise<string>
  scheduleAppointmentAutomationJobs: (tenantId: string, appointmentId: string) => void
  cancelAppointmentJobs: (tenantId: string, appointmentId: string, kinds?: AppointmentAutomationKind[]) => void
  confirmationAppointmentById: (tenantId: string, appointmentId: string) => ConfirmationAppointment | undefined
  sendAppointmentConfirmation: (appointment: ConfirmationAppointment, eventType: 'REQUEST_SENT' | 'RESENT') => Promise<{ ok: true } | { ok: false; code: string }>
  confirmationEvent: (input: { tenantId: string; appointmentId: string; eventType: string; channel?: string }) => void
}

const appointmentFields = (staffEnabled: boolean) => `
  SELECT a.id,
         a.service_id as serviceId,
         a.starts_at as startsAt,
         a.ends_at as endsAt,
         a.status,
         a.confirmation_status as confirmationStatus,
         a.confirmation_sent_at as confirmationSentAt,
         a.confirmation_reminder_sent_at as confirmationReminderSentAt,
         a.confirmation_responded_at as confirmationRespondedAt,
         a.appointment_reminder_sent_at as appointmentReminderSentAt,
         u.email as clientEmail,
         c.name as clientName,
         c.phone as clientPhone,
         s.name as serviceName,
         s.price_cents as priceCents
         ${staffEnabled ? ', a.professional_id as professionalId, p.name as professionalName' : ''}
  FROM appointments a
  JOIN users u ON u.id = a.client_user_id
  LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
  JOIN services s ON s.id = a.service_id
  ${staffEnabled ? 'LEFT JOIN professionals p ON p.tenant_id = a.tenant_id AND p.id = a.professional_id' : ''}
`

export function createAdminAppointmentsRouter(options: AdminAppointmentsRouterOptions) {
  const {
    db,
    staffEnabled = false,
    normalizePhone,
    hashPassword,
    scheduleAppointmentAutomationJobs,
    cancelAppointmentJobs,
    confirmationAppointmentById,
    sendAppointmentConfirmation,
    confirmationEvent,
  } = options
  const router = Router()

  router.get('/appointments', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const query = z.object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(2000)).optional(),
      }).parse({
        start: typeof req.query.start === 'string' ? req.query.start : undefined,
        end: typeof req.query.end === 'string' ? req.query.end : undefined,
        limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      })

      const where = ['a.tenant_id = ?']
      const params: unknown[] = [tenantId]
      if (query.start) {
        where.push('a.starts_at >= ?')
        params.push(query.start)
      }
      if (query.end) {
        where.push('a.starts_at < ?')
        params.push(query.end)
      }
      const appointments = db.prepare(`
        ${appointmentFields(staffEnabled)}
        WHERE ${where.join(' AND ')}
        ORDER BY a.starts_at ASC
        LIMIT ${query.limit ?? 800}
      `).all(...params)
      res.json({ appointments })
    } catch (err) {
      next(err)
    }
  })

  router.post('/appointments', requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        clientName: z.string().min(2),
        clientPhone: z.string().min(8).optional(),
        serviceId: z.string().uuid(),
        startsAt: z.string().datetime(),
        professionalId: z.string().uuid().optional(),
        status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
      }).parse(req.body)

      const service = db.prepare(`
        SELECT id, duration_minutes as durationMinutes
        FROM services
        WHERE id = ? AND tenant_id = ?
      `).get(body.serviceId, tenantId) as { id: string; durationMinutes: number } | undefined
      if (!service) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

      const now = new Date().toISOString()
      const startsAt = new Date(body.startsAt)
      if (Number.isNaN(startsAt.getTime())) throw badRequest('Data inválida', 'INVALID_DATE')
      const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)
      const normalizedPhone = body.clientPhone ? normalizePhone(body.clientPhone) : null
      const existingClient = normalizedPhone
        ? db.prepare(`SELECT c.user_id as userId FROM clients c WHERE c.tenant_id = ? AND c.phone_normalized = ? LIMIT 1`)
            .get(tenantId, normalizedPhone) as { userId: string } | undefined
        : undefined

      let clientUserId = existingClient?.userId ?? null
      const newClient = clientUserId ? null : {
        userId: randomUUID(),
        clientId: randomUUID(),
        email: `client+${randomUUID()}@lashdesigner.local`,
        passwordHash: await hashPassword(randomUUID()),
      }
      const appointmentId = randomUUID()
      const professionalId = staffEnabled ? (body.professionalId ?? tenantId) : null

      const transaction = db.transaction(() => {
        if (staffEnabled) {
          const person = db.prepare(`SELECT 1 FROM professionals p JOIN professional_services ps ON ps.tenant_id = p.tenant_id AND ps.professional_id = p.id
            WHERE p.tenant_id = ? AND p.id = ? AND ps.service_id = ? AND p.active = 1 AND p.bookable = 1`)
            .get(tenantId, professionalId, body.serviceId)
          if (!person) throw badRequest('Profissional indisponível para este serviço', 'PROFESSIONAL_UNAVAILABLE')
        }
        const overlap = db.prepare(`
          SELECT id FROM appointments
          WHERE tenant_id = ?
            ${staffEnabled ? 'AND professional_id = ?' : ''}
            AND status IN ('PENDING', 'CONFIRMED')
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `).get(...(staffEnabled ? [tenantId, professionalId, startsAt.toISOString(), endsAt.toISOString()] : [tenantId, startsAt.toISOString(), endsAt.toISOString()]))
        if (overlap) throw badRequest('Já existe um agendamento nesse período', 'SLOT_UNAVAILABLE')

        const timeOffOverlap = db.prepare(`
          SELECT id FROM time_off
          WHERE tenant_id = ?
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
        if (timeOffOverlap) throw badRequest('O período está bloqueado na agenda', 'SLOT_UNAVAILABLE')
        if (staffEnabled && db.prepare(`SELECT 1 FROM professional_time_off WHERE tenant_id = ? AND professional_id = ?
          AND NOT (ends_at <= ? OR starts_at >= ?) LIMIT 1`).get(tenantId, professionalId, startsAt.toISOString(), endsAt.toISOString())) {
          throw badRequest('O período está bloqueado para esta profissional', 'SLOT_UNAVAILABLE')
        }

        if (!clientUserId) {
          if (!newClient) throw new Error('Falha ao criar cliente')
          clientUserId = newClient.userId
          db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'CLIENT', ?)`)
            .run(newClient.userId, tenantId, newClient.email, newClient.passwordHash, now)
          db.prepare(`INSERT INTO clients (id, tenant_id, user_id, name, phone, phone_normalized, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(newClient.clientId, tenantId, newClient.userId, body.clientName.trim(), body.clientPhone?.trim() || null, normalizedPhone, now)
        }

        db.prepare(`
          INSERT INTO appointments (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, created_at${staffEnabled ? ', professional_id' : ''})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?${staffEnabled ? ', ?' : ''})
        `).run(...(staffEnabled
          ? [appointmentId, tenantId, body.serviceId, clientUserId, startsAt.toISOString(), endsAt.toISOString(), body.status ?? 'CONFIRMED', now, professionalId]
          : [appointmentId, tenantId, body.serviceId, clientUserId, startsAt.toISOString(), endsAt.toISOString(), body.status ?? 'CONFIRMED', now]))
      })
      transaction.immediate()

      if (existingClient?.userId) {
        db.prepare(`UPDATE clients SET name = ?, phone = COALESCE(?, phone), phone_normalized = COALESCE(?, phone_normalized) WHERE tenant_id = ? AND user_id = ?`)
          .run(body.clientName.trim(), body.clientPhone?.trim() || null, normalizedPhone, tenantId, existingClient.userId)
      }

      scheduleAppointmentAutomationJobs(tenantId, appointmentId)
      const appointment = db.prepare(`${appointmentFields(staffEnabled)} WHERE a.id = ? AND a.tenant_id = ?`).get(appointmentId, tenantId)
      res.json({ appointment })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/appointments/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const body = z.object({ status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']) }).parse(req.body)
      const row = db.prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId)
      if (!row) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))

      db.prepare('UPDATE appointments SET status = ? WHERE id = ? AND tenant_id = ?').run(body.status, id, tenantId)
      if (body.status === 'CANCELLED') cancelAppointmentJobs(tenantId, id)
      else scheduleAppointmentAutomationJobs(tenantId, id)

      const appointment = db.prepare(`${appointmentFields(staffEnabled)} WHERE a.id = ? AND a.tenant_id = ?`).get(id, tenantId)
      res.json({ appointment })
    } catch (err) {
      next(err)
    }
  })

  router.post('/appointments/:id/confirmation/resend', requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const appointment = confirmationAppointmentById(tenantId, id)
      if (!appointment) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))
      if (appointment.status === 'CANCELLED') return next(badRequest('Agendamento cancelado não pode receber confirmação.', 'APPOINTMENT_CANCELLED'))
      if (!appointment.clientPhone) return next(badRequest('Cadastre o WhatsApp da cliente antes de enviar a confirmação.', 'NO_CLIENT_PHONE'))
      const result = await sendAppointmentConfirmation(appointment, appointment.confirmationSentAt ? 'RESENT' : 'REQUEST_SENT')
      if (!result.ok) return next(badRequest('Não foi possível enviar a confirmação pelo WhatsApp.', result.code))
      scheduleAppointmentAutomationJobs(tenantId, id)
      res.json({ confirmationStatus: 'AWAITING_CONFIRMATION' })
    } catch (err) {
      next(err)
    }
  })

  router.post('/appointments/:id/confirmation/manual', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const appointment = confirmationAppointmentById(tenantId, id)
      if (!appointment) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))
      if (appointment.status === 'CANCELLED') return next(badRequest('Agendamento cancelado não pode ser confirmado.', 'APPOINTMENT_CANCELLED'))
      const now = new Date().toISOString()
      db.prepare(`UPDATE appointments SET confirmation_status = 'MANUALLY_CONFIRMED', confirmation_responded_at = ? WHERE id = ? AND tenant_id = ?`).run(now, id, tenantId)
      cancelAppointmentJobs(tenantId, id, ['CONFIRMATION_REQUEST', 'CONFIRMATION_RETRY', 'NO_RESPONSE_CUTOFF'])
      confirmationEvent({ tenantId, appointmentId: id, eventType: 'MANUALLY_CONFIRMED', channel: 'OWNER' })
      scheduleAppointmentAutomationJobs(tenantId, id)
      res.json({ confirmationStatus: 'MANUALLY_CONFIRMED', confirmationRespondedAt: now })
    } catch (err) {
      next(err)
    }
  })

  router.get('/appointments/:id/confirmation/events', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const appointment = db.prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId)
      if (!appointment) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))
      const events = db.prepare(`
        SELECT id, event_type as eventType, channel, details_json as detailsJson, created_at as createdAt
        FROM appointment_confirmation_events
        WHERE tenant_id = ? AND appointment_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `).all(tenantId, id)
      res.json({ events })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/appointments/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const result = db.prepare('DELETE FROM appointments WHERE id = ? AND tenant_id = ?').run(id, tenantId)
      if (result.changes === 0) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
