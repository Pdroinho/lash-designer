import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, notFound } from '../http.js'
import { TEAM_PLANS } from '../teamPlans.js'
import { revokeSessionsForUser } from '../session.js'

const hoursSchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
      })
      .refine((row) => row.startMinute < row.endMinute),
  )
  .max(28)
  .superRefine((rows, ctx) => {
    const sorted = [...rows].sort(
      (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute,
    )
    if (
      sorted.some(
        (row, i) =>
          i > 0 &&
          sorted[i - 1].weekday === row.weekday &&
          sorted[i - 1].endMinute > row.startMinute,
      )
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Os períodos de atendimento do mesmo dia não podem se sobrepor.',
      })
  })

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    active: z.boolean().optional(),
    bookable: z.boolean().optional(),
    serviceIds: z.array(z.string().uuid()).max(100).optional(),
    hours: hoursSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0)

export function createAdminProfessionalsRouter(db: Database.Database) {
  const router = Router()

  const detail = (tenantId: string, id: string) => {
    const professional = db
      .prepare(
        `SELECT p.id, p.name, p.active, p.bookable, p.user_id as userId, u.staff_access_disabled_at as accessDisabledAt, u.role as accessRole
      FROM professionals p LEFT JOIN users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id WHERE p.tenant_id = ? AND p.id = ?`,
      )
      .get(tenantId, id) as
      | {
          id: string
          name: string
          active: number
          bookable: number
          userId: string | null
          accessDisabledAt: string | null
          accessRole: string | null
        }
      | undefined
    if (!professional)
      throw notFound('Profissional não encontrada.', 'PROFESSIONAL_NOT_FOUND')
    const serviceIds = db
      .prepare(
        'SELECT service_id as serviceId FROM professional_services WHERE tenant_id = ? AND professional_id = ?',
      )
      .all(tenantId, id) as Array<{ serviceId: string }>
    const hours = db
      .prepare(
        'SELECT weekday, start_minute as startMinute, end_minute as endMinute FROM professional_hours WHERE tenant_id = ? AND professional_id = ? ORDER BY weekday, start_minute',
      )
      .all(tenantId, id)
    const pendingInvitation =
      db
        .prepare(
          'SELECT email, expires_at as expiresAt FROM professional_invitations WHERE tenant_id = ? AND professional_id = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
        )
        .get(tenantId, id, new Date().toISOString()) ?? null
    return {
      pendingInvitation,
      ...professional,
      active: Boolean(professional.active),
      bookable: Boolean(professional.bookable),
      serviceIds: serviceIds.map((row) => row.serviceId),
      hours,
    }
  }

  const seatLimit = (tenantId: string) => {
    const subscription = db
      .prepare(
        'SELECT plan_code as planCode FROM subscriptions WHERE tenant_id = ?',
      )
      .get(tenantId) as { planCode: string } | undefined
    // Legacy subscribers stay capped at three bookable professionals.
    return (
      TEAM_PLANS.find((plan) => plan.code === subscription?.planCode)?.seats ??
      3
    )
  }

  const validateServiceIds = (tenantId: string, serviceIds: string[]) => {
    if (new Set(serviceIds).size !== serviceIds.length)
      throw badRequest('Há serviços repetidos.', 'DUPLICATE_SERVICE')
    if (
      serviceIds.some(
        (id) =>
          !db
            .prepare(
              'SELECT 1 FROM services WHERE tenant_id = ? AND id = ? AND active = 1',
            )
            .get(tenantId, id),
      )
    ) {
      throw badRequest(
        'Selecione serviços ativos deste estúdio.',
        'INVALID_PROFESSIONAL_SERVICE',
      )
    }
  }

  router.get('/professionals', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser!.tenantId!
      const rows = db
        .prepare(
          'SELECT id FROM professionals WHERE tenant_id = ? ORDER BY created_at, id',
        )
        .all(tenantId) as Array<{ id: string }>
      res.json({
        professionals: rows.map((row) => detail(tenantId, row.id)),
        seatLimit: seatLimit(tenantId),
        businessHours: db
          .prepare(
            'SELECT weekday, start_minute as startMinute, end_minute as endMinute FROM business_hours WHERE tenant_id = ? ORDER BY weekday, start_minute',
          )
          .all(tenantId),
        timezone:
          (
            db
              .prepare(
                'SELECT timezone FROM tenant_settings WHERE tenant_id = ?',
              )
              .get(tenantId) as { timezone: string } | undefined
          )?.timezone ?? 'America/Sao_Paulo',
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/professionals', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser!.tenantId!
      const body = z
        .object({
          name: z.string().trim().min(2).max(120),
          serviceIds: z.array(z.string().uuid()).max(100),
          hours: hoursSchema.optional(),
        })
        .strict()
        .parse(req.body)
      const id = randomUUID()
      db.transaction(() => {
        const active = db
          .prepare(
            'SELECT COUNT(*) as total FROM professionals WHERE tenant_id = ? AND active = 1 AND bookable = 1',
          )
          .get(tenantId) as { total: number }
        if (active.total >= seatLimit(tenantId))
          throw badRequest(
            'O plano atual não comporta mais profissionais.',
            'PROFESSIONAL_LIMIT',
          )
        validateServiceIds(tenantId, body.serviceIds)
        const now = new Date().toISOString()
        db.prepare(
          'INSERT INTO professionals (id, tenant_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ).run(id, tenantId, body.name, now, now)
        for (const serviceId of body.serviceIds)
          db.prepare(
            'INSERT INTO professional_services (tenant_id, professional_id, service_id) VALUES (?, ?, ?)',
          ).run(tenantId, id, serviceId)
        for (const hour of body.hours ?? [])
          db.prepare(
            'INSERT INTO professional_hours (id, tenant_id, professional_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(
            randomUUID(),
            tenantId,
            id,
            hour.weekday,
            hour.startMinute,
            hour.endMinute,
          )
      }).immediate()
      res.status(201).json({ professional: detail(tenantId, id) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/professionals/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser!.tenantId!
      const id = z.string().uuid().parse(req.params.id)
      const body = patchSchema.parse(req.body)
      db.transaction(() => {
        const existing = detail(tenantId, id)
        if (body.active === false || body.bookable === false) {
          const future = db
            .prepare(
              `SELECT 1 FROM appointments WHERE tenant_id = ? AND professional_id = ?
            AND status IN ('CONFIRMED', 'PENDING') AND ends_at > ? LIMIT 1`,
            )
            .get(tenantId, id, new Date().toISOString())
          if (future)
            throw badRequest(
              'Reatribua ou cancele os horários futuros antes de desativar.',
              'PROFESSIONAL_HAS_APPOINTMENTS',
            )
        }
        const nextActive = body.active ?? existing.active
        const nextBookable = body.bookable ?? existing.bookable
        if (
          nextActive &&
          nextBookable &&
          !(existing.active && existing.bookable)
        ) {
          const active = db
            .prepare(
              'SELECT COUNT(*) as total FROM professionals WHERE tenant_id = ? AND active = 1 AND bookable = 1',
            )
            .get(tenantId) as { total: number }
          if (active.total >= seatLimit(tenantId))
            throw badRequest(
              'O plano atual não comporta mais profissionais.',
              'PROFESSIONAL_LIMIT',
            )
        }
        if (body.serviceIds) validateServiceIds(tenantId, body.serviceIds)
        db.prepare(
          'UPDATE professionals SET name = ?, active = ?, bookable = ?, updated_at = ? WHERE tenant_id = ? AND id = ?',
        ).run(
          body.name ?? existing.name,
          nextActive ? 1 : 0,
          nextBookable ? 1 : 0,
          new Date().toISOString(),
          tenantId,
          id,
        )
        if (!nextActive && existing.userId && existing.accessRole === 'STAFF')
          revokeSessionsForUser(db, existing.userId)
        if (body.serviceIds) {
          db.prepare(
            'DELETE FROM professional_services WHERE tenant_id = ? AND professional_id = ?',
          ).run(tenantId, id)
          for (const serviceId of body.serviceIds)
            db.prepare(
              'INSERT INTO professional_services (tenant_id, professional_id, service_id) VALUES (?, ?, ?)',
            ).run(tenantId, id, serviceId)
        }
        if (body.hours) {
          db.prepare(
            'DELETE FROM professional_hours WHERE tenant_id = ? AND professional_id = ?',
          ).run(tenantId, id)
          for (const hour of body.hours)
            db.prepare(
              'INSERT INTO professional_hours (id, tenant_id, professional_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?, ?, ?)',
            ).run(
              randomUUID(),
              tenantId,
              id,
              hour.weekday,
              hour.startMinute,
              hour.endMinute,
            )
        }
      }).immediate()
      res.json({ professional: detail(tenantId, id) })
    } catch (error) {
      next(error)
    }
  })

  router.patch(
    '/professionals/:id/access',
    requireRole('ADMIN'),
    (req, res, next) => {
      try {
        const tenantId = req.sessionUser!.tenantId!
        const id = z.string().uuid().parse(req.params.id)
        const { enabled } = z
          .object({ enabled: z.boolean() })
          .strict()
          .parse(req.body)
        db.transaction(() => {
          const person = detail(tenantId, id)
          if (!person.userId || person.accessRole !== 'STAFF')
            throw notFound('Acesso não encontrado.', 'STAFF_ACCOUNT_NOT_FOUND')
          db.prepare(
            "UPDATE users SET staff_access_disabled_at = ? WHERE id = ? AND tenant_id = ? AND role = 'STAFF'",
          ).run(
            enabled ? null : new Date().toISOString(),
            person.userId,
            tenantId,
          )
          if (!enabled) revokeSessionsForUser(db, person.userId)
        }).immediate()
        res.json({ professional: detail(tenantId, id) })
      } catch (error) {
        next(error)
      }
    },
  )

  router.get(
    '/professionals/:id/time-off',
    requireRole('ADMIN'),
    (req, res, next) => {
      try {
        const tenantId = req.sessionUser!.tenantId!
        const id = z.string().uuid().parse(req.params.id)
        detail(tenantId, id)
        const rows = db
          .prepare(
            `SELECT id, starts_at as startsAt, ends_at as endsAt, reason
        FROM professional_time_off WHERE tenant_id = ? AND professional_id = ? AND ends_at > ? ORDER BY starts_at`,
          )
          .all(tenantId, id, new Date().toISOString())
        res.json({ timeOff: rows })
      } catch (error) {
        next(error)
      }
    },
  )

  router.post(
    '/professionals/:id/time-off',
    requireRole('ADMIN'),
    (req, res, next) => {
      try {
        const tenantId = req.sessionUser!.tenantId!
        const id = z.string().uuid().parse(req.params.id)
        const body = z
          .object({
            startsAt: z.string().datetime({ offset: true }),
            endsAt: z.string().datetime({ offset: true }),
            reason: z.string().trim().max(200).optional(),
          })
          .strict()
          .parse(req.body)
        const start = new Date(body.startsAt).toISOString()
        const end = new Date(body.endsAt).toISOString()
        if (start >= end || start < new Date().toISOString())
          throw badRequest(
            'Informe um intervalo futuro válido.',
            'INVALID_TIME_OFF',
          )
        const blockId = randomUUID()
        db.transaction(() => {
          detail(tenantId, id)
          const conflict = db
            .prepare(
              `SELECT 1 FROM appointments WHERE tenant_id = ? AND professional_id = ?
          AND status IN ('CONFIRMED', 'PENDING') AND starts_at < ? AND ends_at > ? LIMIT 1`,
            )
            .get(tenantId, id, end, start)
          if (conflict)
            throw badRequest(
              'Esta profissional já tem agendamentos nesse período. Reagende-os antes de bloquear.',
              'TIME_OFF_APPOINTMENT_CONFLICT',
            )
          const duplicate = db
            .prepare(
              `SELECT 1 FROM professional_time_off WHERE tenant_id = ? AND professional_id = ?
          AND starts_at < ? AND ends_at > ? LIMIT 1`,
            )
            .get(tenantId, id, end, start)
          if (duplicate)
            throw badRequest(
              'Este intervalo já está bloqueado.',
              'TIME_OFF_OVERLAP',
            )
          db.prepare(
            'INSERT INTO professional_time_off (id, tenant_id, professional_id, starts_at, ends_at, reason) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(blockId, tenantId, id, start, end, body.reason || null)
        }).immediate()
        res.status(201).json({ id: blockId, startsAt: start, endsAt: end })
      } catch (error) {
        next(error)
      }
    },
  )

  router.delete(
    '/professionals/:id/time-off/:blockId',
    requireRole('ADMIN'),
    (req, res, next) => {
      try {
        const tenantId = req.sessionUser!.tenantId!
        const id = z.string().uuid().parse(req.params.id)
        const blockId = z.string().uuid().parse(req.params.blockId)
        detail(tenantId, id)
        const removed = db
          .prepare(
            'DELETE FROM professional_time_off WHERE id = ? AND tenant_id = ? AND professional_id = ?',
          )
          .run(blockId, tenantId, id)
        if (!removed.changes)
          throw notFound('Bloqueio não encontrado.', 'TIME_OFF_NOT_FOUND')
        res.json({ ok: true })
      } catch (error) {
        next(error)
      }
    },
  )

  return router
}
