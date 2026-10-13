import express from 'express'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { dayBoundsUtc } from '../dateTime.js'
import { notFound } from '../http.js'

type PublicRouterOptions = {
  db: Database.Database
}

export function createPublicRouter({ db }: PublicRouterOptions) {
  const router = express.Router()

  router.get('/tenant/:slug', (req, res, next) => {
    try {
      const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
      const tenant = db
        .prepare(
          `
            SELECT t.id, t.slug, t.name, t.primary_color as primaryColor, t.logo_url as logoUrl,
                   (
                     SELECT 'https://' || d.domain
                     FROM tenant_domains d
                     WHERE d.tenant_id = t.id AND d.status = 'ACTIVE'
                     ORDER BY d.is_primary DESC, d.verified_at DESC, d.created_at DESC
                     LIMIT 1
                   ) as publicBaseUrl
            FROM tenants t
            WHERE t.slug = ? AND t.status = 'ACTIVE'
          `,
        )
        .get(slug)

      if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
      res.json({ tenant: req.resolvedTenant?.billingRecovery ? { ...(tenant as Record<string, unknown>), billingRecovery: true } : tenant })
    } catch (err) {
      next(err)
    }
  })



  router.get('/tenant', (req, res, next) => {
    try {
      const t = req.resolvedTenant
      if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const tenant = db
        .prepare(
          `
            SELECT t.id, t.slug, t.name, t.primary_color as primaryColor, t.logo_url as logoUrl,
                   (
                     SELECT 'https://' || d.domain
                     FROM tenant_domains d
                     WHERE d.tenant_id = t.id AND d.status = 'ACTIVE'
                     ORDER BY d.is_primary DESC, d.verified_at DESC, d.created_at DESC
                     LIMIT 1
                   ) as publicBaseUrl
            FROM tenants t
            WHERE t.id = ?
          `,
        )
        .get(t.id)

      if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
      res.json({ tenant: req.resolvedTenant?.billingRecovery ? { ...(tenant as Record<string, unknown>), billingRecovery: true } : tenant })
    } catch (err) {
      next(err)
    }
  })

  router.get('/services', (req, res, next) => {
    try {
      const t = req.resolvedTenant
      if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const services = db
        .prepare(
          `
            SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents
            FROM services
            WHERE tenant_id = ? AND active = 1
            ORDER BY created_at DESC
          `,
        )
        .all(t.id)

      res.json({ services })
    } catch (err) {
      next(err)
    }
  })

  router.get('/booking', (req, res, next) => {
    try {
      const t = req.resolvedTenant
      if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const settings = db
        .prepare(
          `
            SELECT timezone, currency
            FROM tenant_settings
            WHERE tenant_id = ?
          `,
        )
        .get(t.id) as { timezone: string; currency: string } | undefined

      const bookingRules = db
        .prepare(
          `
            SELECT min_notice_minutes as minNoticeMinutes,
                   max_future_days as maxFutureDays,
                   slot_step_minutes as slotStepMinutes
            FROM booking_rules
            WHERE tenant_id = ?
          `,
        )
        .get(t.id) as
        | { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number }
        | undefined

      const businessHours = db
        .prepare(
          `
            SELECT weekday, start_minute as startMinute, end_minute as endMinute
            FROM business_hours
            WHERE tenant_id = ?
            ORDER BY weekday ASC, start_minute ASC
          `,
        )
        .all(t.id)

      res.json({
        timezone: settings?.timezone ?? 'America/Sao_Paulo',
        currency: settings?.currency ?? 'BRL',
        bookingRules: bookingRules ?? { minNoticeMinutes: 60, maxFutureDays: 60, slotStepMinutes: 15 },
        businessHours,
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/availability', (req, res, next) => {
    try {
      const t = req.resolvedTenant
      if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const q = z
        .object({
          date: z.string().min(10).max(10),
        })
        .parse({ date: typeof req.query.date === 'string' ? req.query.date : '' })

      const settings = db
        .prepare(
          `
            SELECT timezone
            FROM tenant_settings
            WHERE tenant_id = ?
          `,
        )
        .get(t.id) as { timezone: string } | undefined

      const timeZone = settings?.timezone ?? 'America/Sao_Paulo'
      const { start, endExclusive } = dayBoundsUtc({ timeZone, ymd: q.date })

      const appointments = db
        .prepare(
          `
            SELECT starts_at as startsAt, ends_at as endsAt, 'appointment' as kind
            FROM appointments
            WHERE tenant_id = ?
              AND status IN ('CONFIRMED', 'PENDING')
              AND starts_at < ?
              AND ends_at > ?
          `,
        )
        .all(t.id, endExclusive.toISOString(), start.toISOString()) as Array<{ startsAt: string; endsAt: string }>

      const timeOff = db
        .prepare(
          `
            SELECT starts_at as startsAt, ends_at as endsAt, 'time_off' as kind
            FROM time_off
            WHERE tenant_id = ?
              AND starts_at < ?
              AND ends_at > ?
          `,
        )
        .all(t.id, endExclusive.toISOString(), start.toISOString()) as Array<{ startsAt: string; endsAt: string }>

      // Combine and return blocks
      res.json({ blocks: [...appointments, ...timeOff] })
    } catch (err) {
      next(err)
    }
  })

  router.get('/tenant/:slug/services', (req, res, next) => {
    try {
      const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
      const tenant = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'").get(slug) as
        | { id: string }
        | undefined
      if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const services = db
        .prepare(
          `
            SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
            FROM services
            WHERE tenant_id = ? AND active = 1
            ORDER BY created_at DESC
          `,
        )
        .all(tenant.id)

      res.json({ services })
    } catch (err) {
      next(err)
    }
  })

  router.get('/tenant/:slug/booking', (req, res, next) => {
    try {
      const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
      const tenant = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'").get(slug) as
        | { id: string }
        | undefined
      if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const settings = db
        .prepare(
          `
            SELECT timezone, currency
            FROM tenant_settings
            WHERE tenant_id = ?
          `,
        )
        .get(tenant.id) as { timezone: string; currency: string } | undefined

      const bookingRules = db
        .prepare(
          `
            SELECT min_notice_minutes as minNoticeMinutes,
                   max_future_days as maxFutureDays,
                   slot_step_minutes as slotStepMinutes
            FROM booking_rules
            WHERE tenant_id = ?
          `,
        )
        .get(tenant.id) as
        | { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number }
        | undefined

      const businessHours = db
        .prepare(
          `
            SELECT weekday, start_minute as startMinute, end_minute as endMinute
            FROM business_hours
            WHERE tenant_id = ?
            ORDER BY weekday ASC, start_minute ASC
          `,
        )
        .all(tenant.id)

      res.json({
        timezone: settings?.timezone ?? 'America/Sao_Paulo',
        currency: settings?.currency ?? 'BRL',
        bookingRules: bookingRules ?? { minNoticeMinutes: 60, maxFutureDays: 60, slotStepMinutes: 15 },
        businessHours,
      })
    } catch (err) {
      next(err)
    }
  })

  router.get('/tenant/:slug/availability', (req, res, next) => {
    try {
      const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
      const tenant = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'").get(slug) as
        | { id: string }
        | undefined
      if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const q = z
        .object({
          date: z.string().min(10).max(10),
        })
        .parse({ date: typeof req.query.date === 'string' ? req.query.date : '' })

      const settings = db
        .prepare(
          `
            SELECT timezone
            FROM tenant_settings
            WHERE tenant_id = ?
          `,
        )
        .get(tenant.id) as { timezone: string } | undefined

      const timeZone = settings?.timezone ?? 'America/Sao_Paulo'
      const { start, endExclusive } = dayBoundsUtc({ timeZone, ymd: q.date })

      const appointments = db
        .prepare(
          `
            SELECT starts_at as startsAt, ends_at as endsAt, 'appointment' as kind
            FROM appointments
            WHERE tenant_id = ?
              AND status IN ('CONFIRMED', 'PENDING')
              AND starts_at < ?
              AND ends_at > ?
          `,
        )
        .all(tenant.id, endExclusive.toISOString(), start.toISOString()) as Array<{ startsAt: string; endsAt: string }>

      const timeOff = db
        .prepare(
          `
            SELECT starts_at as startsAt, ends_at as endsAt, 'time_off' as kind
            FROM time_off
            WHERE tenant_id = ?
              AND starts_at < ?
              AND ends_at > ?
          `,
        )
        .all(tenant.id, endExclusive.toISOString(), start.toISOString()) as Array<{ startsAt: string; endsAt: string }>

      res.json({ blocks: [...appointments, ...timeOff] })
    } catch (err) {
      next(err)
    }
  })

  return router
}

