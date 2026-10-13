import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { dayBoundsUtc, getZonedDateTimeParts } from './dateTime.js'
import { badRequest, notFound } from './http.js'

type CustomerAppointmentServiceOptions = {
  db: Database.Database
  scheduleAppointmentAutomationJobs: (tenantId: string, appointmentId: string) => unknown
  syncClientConversation?: (tenantId: string, userId: string) => void
  staffEnabled?: boolean
  now?: () => Date
  randomId?: () => string
}

export type CreateCustomerAppointmentInput = {
  tenantId: string
  userId: string
  serviceId: string
  startsAt: string
  professionalId?: string
}

export function createCustomerAppointmentService({
  db,
  scheduleAppointmentAutomationJobs,
  staffEnabled = false,
  syncClientConversation,
  now = () => new Date(),
  randomId = randomUUID,
}: CustomerAppointmentServiceOptions) {
  const createAppointmentForUser = (input: CreateCustomerAppointmentInput) => {
    const { tenantId, userId } = input
    const service = db.prepare(`
      SELECT id, duration_minutes as durationMinutes
      FROM services
      WHERE id = ? AND tenant_id = ? AND active = 1
    `).get(input.serviceId, tenantId) as { id: string; durationMinutes: number } | undefined
    if (!service) throw notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND')

    const settings = db.prepare(`SELECT timezone FROM tenant_settings WHERE tenant_id = ?`).get(tenantId) as { timezone: string } | undefined
    const bookingRules = db.prepare(`
      SELECT min_notice_minutes as minNoticeMinutes,
             max_future_days as maxFutureDays,
             slot_step_minutes as slotStepMinutes
      FROM booking_rules
      WHERE tenant_id = ?
    `).get(tenantId) as { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number } | undefined
    const businessHours = db.prepare(`
      SELECT weekday, start_minute as startMinute, end_minute as endMinute
      FROM business_hours
      WHERE tenant_id = ?
      ORDER BY weekday ASC, start_minute ASC
    `).all(tenantId) as Array<{ weekday: number; startMinute: number; endMinute: number }>

    const startsAt = new Date(input.startsAt)
    if (Number.isNaN(startsAt.getTime())) throw badRequest('Data inválida', 'INVALID_DATE')
    if (!Number.isFinite(service.durationMinutes) || service.durationMinutes <= 0) {
      throw badRequest('Duração do serviço inválida', 'INVALID_SERVICE_DURATION')
    }
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)
    const rules = bookingRules ?? { minNoticeMinutes: 60, maxFutureDays: 60, slotStepMinutes: 15 }
    const currentTime = now()
    const minStart = new Date(currentTime.getTime() + rules.minNoticeMinutes * 60_000)
    if (startsAt < minStart) throw badRequest('Horário com pouca antecedência', 'MIN_NOTICE')
    const maxStart = new Date(currentTime)
    maxStart.setDate(maxStart.getDate() + rules.maxFutureDays)
    if (startsAt > maxStart) throw badRequest('Horário muito distante', 'MAX_FUTURE')

    const timeZone = settings?.timezone ?? 'America/Sao_Paulo'
    const startParts = getZonedDateTimeParts(startsAt, timeZone)
    const endParts = getZonedDateTimeParts(endsAt, timeZone)
    if (!startParts || !endParts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
    if (startParts.weekday !== endParts.weekday || endParts.minutesOfDay < startParts.minutesOfDay) {
      throw badRequest('Agendamento não pode atravessar o dia', 'CROSS_DAY')
    }
    if (!businessHours.length) {
      throw badRequest('Horários de atendimento não configurados', 'BUSINESS_HOURS_EMPTY')
    }
    const stepMinutes = Math.max(5, rules.slotStepMinutes)
    const fits = businessHours.filter(row => row.weekday === startParts.weekday).some(row => {
      const aligned = (startParts.minutesOfDay - row.startMinute) % stepMinutes === 0
      return aligned && startParts.minutesOfDay >= row.startMinute && startParts.minutesOfDay < row.endMinute && endParts.minutesOfDay <= row.endMinute
    })
    if (!fits) throw badRequest('Horário fora do atendimento', 'OUTSIDE_BUSINESS_HOURS')

    const timeOffOverlap = db.prepare(`
      SELECT id FROM time_off
      WHERE tenant_id = ? AND NOT (ends_at <= ? OR starts_at >= ?)
      LIMIT 1
    `).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
    if (timeOffOverlap) throw badRequest('Horário indisponível', 'SLOT_UNAVAILABLE')

    const id = randomId()
    const createdAt = currentTime.toISOString()
    const dayBounds = staffEnabled ? dayBoundsUtc({ timeZone, ymd: startParts.ymd }) : null
    let chosenProfessional: { id: string; name: string } | undefined
    const transaction = db.transaction(() => {
      if (staffEnabled) {
        const candidates = db.prepare(`
          SELECT p.id, p.name FROM professionals p
          JOIN professional_services ps ON ps.tenant_id = p.tenant_id AND ps.professional_id = p.id
          WHERE p.tenant_id = ? AND ps.service_id = ? AND p.active = 1 AND p.bookable = 1
          ORDER BY p.id
        `).all(tenantId, input.serviceId) as Array<{ id: string; name: string }>
        if (input.professionalId && !candidates.some(person => person.id === input.professionalId)) {
          throw badRequest('Profissional não atende este serviço.', 'PROFESSIONAL_UNAVAILABLE')
        }
        const available: Array<{ id: string; name: string; dailyCount: number }> = []
        for (const person of candidates) {
          if (input.professionalId && person.id !== input.professionalId) continue
          const personalHours = db.prepare('SELECT weekday, start_minute as startMinute, end_minute as endMinute FROM professional_hours WHERE tenant_id = ? AND professional_id = ?')
            .all(tenantId, person.id) as Array<{ weekday: number; startMinute: number; endMinute: number }>
          const schedule = personalHours.length ? personalHours : businessHours
          const fitsPerson = schedule.filter(row => row.weekday === startParts.weekday).some(row =>
            startParts.minutesOfDay >= row.startMinute && endParts.minutesOfDay <= row.endMinute)
          if (!fitsPerson) continue
          if (db.prepare(`SELECT 1 FROM professional_time_off WHERE tenant_id = ? AND professional_id = ? AND NOT (ends_at <= ? OR starts_at >= ?) LIMIT 1`)
            .get(tenantId, person.id, startsAt.toISOString(), endsAt.toISOString())) continue
          if (db.prepare(`SELECT 1 FROM appointments WHERE tenant_id = ? AND professional_id = ? AND status IN ('CONFIRMED','PENDING')
            AND NOT (ends_at <= ? OR starts_at >= ?) LIMIT 1`).get(tenantId, person.id, startsAt.toISOString(), endsAt.toISOString())) continue
          const dailyCount = db.prepare(`SELECT COUNT(*) as total FROM appointments WHERE tenant_id = ? AND professional_id = ?
            AND status IN ('CONFIRMED','PENDING') AND starts_at >= ? AND starts_at < ?`).get(tenantId, person.id,
              dayBounds!.start.toISOString(), dayBounds!.endExclusive.toISOString()) as { total: number }
          available.push({ ...person, dailyCount: dailyCount.total })
        }
        available.sort((left, right) => left.dailyCount - right.dailyCount || left.id.localeCompare(right.id))
        chosenProfessional = available[0]
        if (!chosenProfessional) throw badRequest('Horário indisponível', 'SLOT_UNAVAILABLE')
        db.prepare(`INSERT INTO appointments
          (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, confirmation_status, created_at, professional_id)
          VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'NOT_REQUESTED', ?, ?)`).run(id, tenantId, input.serviceId, userId,
          startsAt.toISOString(), endsAt.toISOString(), createdAt, chosenProfessional.id)
      } else {
        const overlap = db.prepare(`SELECT id FROM appointments WHERE tenant_id = ? AND status IN ('CONFIRMED','PENDING')
          AND NOT (ends_at <= ? OR starts_at >= ?) LIMIT 1`).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
        if (overlap) throw badRequest('Horário indisponível', 'SLOT_UNAVAILABLE')
        db.prepare(`INSERT INTO appointments
          (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, confirmation_status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'NOT_REQUESTED', ?)`).run(id, tenantId, input.serviceId, userId,
          startsAt.toISOString(), endsAt.toISOString(), createdAt)
      }
      syncClientConversation?.(tenantId,userId)
      scheduleAppointmentAutomationJobs(tenantId, id)
    })
    transaction.immediate()

    return {
      id,
      serviceId: input.serviceId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: 'PENDING' as const,
      confirmationStatus: 'NOT_REQUESTED' as const,
      ...(chosenProfessional ? { professionalId: chosenProfessional.id, professionalName: chosenProfessional.name } : {}),
    }
  }

  return { createAppointmentForUser }
}
