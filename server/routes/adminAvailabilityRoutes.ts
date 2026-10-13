import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, notFound } from '../http.js'

type AdminAvailabilityRouterOptions = {
  db: Database.Database
}

const businessHourFields = `
  SELECT id, weekday, start_minute as startMinute, end_minute as endMinute
  FROM business_hours
`

const timeOffFields = `
  SELECT id, starts_at as startsAt, ends_at as endsAt, reason, created_at as createdAt
  FROM time_off
`

export function createAdminAvailabilityRouter({ db }: AdminAvailabilityRouterOptions) {
  const router = Router()

  router.get('/business-hours', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const businessHours = db.prepare(`
        ${businessHourFields}
        WHERE tenant_id = ?
        ORDER BY weekday ASC, start_minute ASC
      `).all(tenantId)

      res.json({ businessHours })
    } catch (err) {
      next(err)
    }
  })

  router.post('/business-hours', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const body = z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
      }).parse(req.body)
      if (body.endMinute <= body.startMinute) return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))

      const overlap = db.prepare(`
        SELECT id
        FROM business_hours
        WHERE tenant_id = ?
          AND weekday = ?
          AND NOT (end_minute <= ? OR start_minute >= ?)
        LIMIT 1
      `).get(tenantId, body.weekday, body.startMinute, body.endMinute)
      if (overlap) return next(badRequest('Horário sobreposto', 'OVERLAPPING_RANGE'))

      const id = randomUUID()
      db.prepare(`
        INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, body.weekday, body.startMinute, body.endMinute, new Date().toISOString())

      const businessHour = db.prepare(`${businessHourFields} WHERE id = ? AND tenant_id = ?`).get(id, tenantId)
      res.json({ businessHour })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/business-hours/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const body = z.object({
        weekday: z.number().int().min(0).max(6).optional(),
        startMinute: z.number().int().min(0).max(1440).optional(),
        endMinute: z.number().int().min(0).max(1440).optional(),
      }).parse(req.body)

      const row = db.prepare(`
        SELECT weekday, start_minute as startMinute, end_minute as endMinute
        FROM business_hours
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as { weekday: number; startMinute: number; endMinute: number } | undefined
      if (!row) return next(notFound('Horário não encontrado', 'BUSINESS_HOUR_NOT_FOUND'))

      const nextWeekday = body.weekday ?? row.weekday
      const nextStart = body.startMinute ?? row.startMinute
      const nextEnd = body.endMinute ?? row.endMinute
      if (nextEnd <= nextStart) return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))

      const overlap = db.prepare(`
        SELECT id
        FROM business_hours
        WHERE tenant_id = ?
          AND weekday = ?
          AND id <> ?
          AND NOT (end_minute <= ? OR start_minute >= ?)
        LIMIT 1
      `).get(tenantId, nextWeekday, id, nextStart, nextEnd)
      if (overlap) return next(badRequest('Horário sobreposto', 'OVERLAPPING_RANGE'))

      const updates: Array<{ sql: string; params: unknown[] }> = []
      if (typeof body.weekday === 'number') updates.push({ sql: 'weekday = ?', params: [body.weekday] })
      if (typeof body.startMinute === 'number') updates.push({ sql: 'start_minute = ?', params: [body.startMinute] })
      if (typeof body.endMinute === 'number') updates.push({ sql: 'end_minute = ?', params: [body.endMinute] })
      if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

      db.prepare(`UPDATE business_hours SET ${updates.map(update => update.sql).join(', ')} WHERE id = ? AND tenant_id = ?`)
        .run(...updates.flatMap(update => update.params), id, tenantId)

      const businessHour = db.prepare(`${businessHourFields} WHERE id = ? AND tenant_id = ?`).get(id, tenantId)
      res.json({ businessHour })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/business-hours/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const result = db.prepare('DELETE FROM business_hours WHERE id = ? AND tenant_id = ?').run(id, tenantId)
      if (result.changes === 0) return next(notFound('Horário não encontrado', 'BUSINESS_HOUR_NOT_FOUND'))
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.get('/time-off', requireRole('ADMIN'), (req, res, next) => {
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

      const where = ['tenant_id = ?']
      const params: unknown[] = [tenantId]
      if (query.start) {
        where.push('ends_at > ?')
        params.push(query.start)
      }
      if (query.end) {
        where.push('starts_at < ?')
        params.push(query.end)
      }

      const timeOff = db.prepare(`
        ${timeOffFields}
        WHERE ${where.join(' AND ')}
        ORDER BY starts_at ASC
        LIMIT ${query.limit ?? 500}
      `).all(...params)
      res.json({ timeOff })
    } catch (err) {
      next(err)
    }
  })

  router.post('/time-off', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        reason: z.string().max(200).optional().nullable(),
      }).parse(req.body)
      const startsAt = new Date(body.startsAt)
      const endsAt = new Date(body.endsAt)
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return next(badRequest('Data inválida', 'INVALID_DATE'))
      if (endsAt.getTime() <= startsAt.getTime()) return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))

      const overlapExisting = db.prepare(`
        SELECT id FROM time_off
        WHERE tenant_id = ? AND NOT (ends_at <= ? OR starts_at >= ?)
        LIMIT 1
      `).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
      if (overlapExisting) return next(badRequest('Bloqueio sobreposto', 'OVERLAPPING_TIME_OFF'))

      const overlapAppointment = db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ?
          AND status IN ('CONFIRMED', 'PENDING')
          AND NOT (ends_at <= ? OR starts_at >= ?)
        LIMIT 1
      `).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
      if (overlapAppointment) return next(badRequest('Existe agendamento nesse intervalo', 'TIME_OFF_CONFLICT_APPOINTMENT'))

      const id = randomUUID()
      db.prepare(`
        INSERT INTO time_off (id, tenant_id, starts_at, ends_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, startsAt.toISOString(), endsAt.toISOString(), body.reason ? body.reason.trim() : null, new Date().toISOString())

      const timeOff = db.prepare(`${timeOffFields} WHERE id = ? AND tenant_id = ?`).get(id, tenantId)
      res.json({ timeOff })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/time-off/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const body = z.object({
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
        reason: z.string().max(200).optional().nullable(),
      }).parse(req.body)

      const row = db.prepare(`
        SELECT starts_at as startsAt, ends_at as endsAt, reason
        FROM time_off
        WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as { startsAt: string; endsAt: string; reason: string | null } | undefined
      if (!row) return next(notFound('Bloqueio não encontrado', 'TIME_OFF_NOT_FOUND'))

      const startsAt = new Date(body.startsAt ?? row.startsAt)
      const endsAt = new Date(body.endsAt ?? row.endsAt)
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return next(badRequest('Data inválida', 'INVALID_DATE'))
      if (endsAt.getTime() <= startsAt.getTime()) return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))

      const overlapExisting = db.prepare(`
        SELECT id FROM time_off
        WHERE tenant_id = ?
          AND id <> ?
          AND NOT (ends_at <= ? OR starts_at >= ?)
        LIMIT 1
      `).get(tenantId, id, startsAt.toISOString(), endsAt.toISOString())
      if (overlapExisting) return next(badRequest('Bloqueio sobreposto', 'OVERLAPPING_TIME_OFF'))

      const overlapAppointment = db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ?
          AND status IN ('CONFIRMED', 'PENDING')
          AND NOT (ends_at <= ? OR starts_at >= ?)
        LIMIT 1
      `).get(tenantId, startsAt.toISOString(), endsAt.toISOString())
      if (overlapAppointment) return next(badRequest('Existe agendamento nesse intervalo', 'TIME_OFF_CONFLICT_APPOINTMENT'))

      const updates: Array<{ sql: string; params: unknown[] }> = []
      if (typeof body.startsAt === 'string') updates.push({ sql: 'starts_at = ?', params: [startsAt.toISOString()] })
      if (typeof body.endsAt === 'string') updates.push({ sql: 'ends_at = ?', params: [endsAt.toISOString()] })
      if ('reason' in body) updates.push({ sql: 'reason = ?', params: [body.reason ? body.reason.trim() : null] })
      if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

      db.prepare(`UPDATE time_off SET ${updates.map(update => update.sql).join(', ')} WHERE id = ? AND tenant_id = ?`)
        .run(...updates.flatMap(update => update.params), id, tenantId)

      const timeOff = db.prepare(`${timeOffFields} WHERE id = ? AND tenant_id = ?`).get(id, tenantId)
      res.json({ timeOff })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/time-off/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const result = db.prepare('DELETE FROM time_off WHERE id = ? AND tenant_id = ?').run(id, tenantId)
      if (result.changes === 0) return next(notFound('Bloqueio não encontrado', 'TIME_OFF_NOT_FOUND'))
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
