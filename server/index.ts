import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { sessionMiddleware, requireRole } from './auth.js'
import { getDb } from './db.js'
import { env } from './env.js'
import { badRequest, handleError, notFound, unauthorized } from './http.js'
import { migrate } from './migrate.js'
import { hashPassword, signSession, verifyPassword } from './security.js'

migrate()
const db = getDb()

const app = express()

const isDevHost = (hostname: string) => {
  const host = (hostname ?? '').toLowerCase()
  if (env.DEV_HOST) return host === env.DEV_HOST.toLowerCase()
  return host.startsWith('dev.')
}

const requireDevHost = (req: Request, _res: Response, next: NextFunction) => {
  if (!isDevHost(req.hostname)) return next(notFound())
  next()
}

const getTenantSlugFromHostname = (hostname: string) => {
  const host = (hostname ?? '').trim().toLowerCase()
  if (!host) return null
  if (host === 'localhost') return null
  if (host === '127.0.0.1') return null
  if (host === '::1') return null

  if (isDevHost(host)) return null

  const parts = host.split('.').filter(Boolean)
  if (parts.length < 2) return null

  const isLocalhostSubdomain = parts.length === 2 && parts[1] === 'localhost'
  if (!isLocalhostSubdomain && parts.length < 3) return null

  const reserved = new Set(['www', 'app', 'api', 'dev'])
  const first = parts[0]
  if (!first || reserved.has(first)) return null

  if (!/^[a-z0-9-]+$/.test(first)) return null
  return first
}

const resolveTenantFromSubdomain = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const host = (req.hostname ?? '').trim().toLowerCase()
    if (!host) return next()
    if (!isDevHost(host)) {
      const mapped = db
        .prepare(
          `
            SELECT t.id, t.slug
            FROM tenant_domains d
            JOIN tenants t ON t.id = d.tenant_id
            WHERE d.domain = ?
            LIMIT 1
          `,
        )
        .get(host) as { id: string; slug: string } | undefined
      if (mapped) {
        req.resolvedTenant = mapped
        return next()
      }
    }

    const slug = getTenantSlugFromHostname(host)
    if (!slug) return next()

    const tenant = db
      .prepare(
        `
          SELECT id, slug
          FROM tenants
          WHERE slug = ?
        `,
      )
      .get(slug) as { id: string; slug: string } | undefined

    if (tenant) req.resolvedTenant = tenant
    next()
  } catch (err) {
    next(err)
  }
}

const normalizeCustomDomain = (raw: string) => {
  const v = String(raw ?? '').trim().toLowerCase()
  if (!v) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (v.includes('://')) throw badRequest('Use apenas o host (sem http/https)', 'INVALID_DOMAIN')
  if (/[\s/?#@]/.test(v)) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (v.startsWith('.') || v.endsWith('.')) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')

  let url: URL
  try {
    url = new URL(`http://${v}`)
  } catch {
    throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  }

  if (url.hostname !== v) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (!url.hostname.includes('.')) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (isDevHost(url.hostname)) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (!/^[a-z0-9.-]+$/.test(url.hostname)) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')

  return url.hostname
}

app.disable('x-powered-by')
app.use(
  cors({
    origin: (() => {
      if (!env.FRONTEND_ORIGIN) return true
      let allowedHost: string | null = null
      try {
        allowedHost = new URL(env.FRONTEND_ORIGIN).host
      } catch {
        allowedHost = null
      }

      return (origin, cb) => {
        if (!origin) return cb(null, true)
        if (!allowedHost) return cb(null, origin === env.FRONTEND_ORIGIN)
        try {
          const o = new URL(origin)
          const h = o.host
          const hn = o.hostname
          if (h === allowedHost) return cb(null, true)
          if (h.endsWith(`.${allowedHost}`)) return cb(null, true)

          const mapped = db
            .prepare('SELECT 1 as ok FROM tenant_domains WHERE domain = ? LIMIT 1')
            .get(hn) as { ok: 1 } | undefined
          if (mapped) return cb(null, true)

          return cb(null, false)
        } catch {
          return cb(null, false)
        }
      }
    })(),
    credentials: true,
  }),
)
app.use(helmet())
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(resolveTenantFromSubdomain)
app.use(sessionMiddleware)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/public/tenant/:slug', (req, res, next) => {
  try {
    const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl
          FROM tenants
          WHERE slug = ?
        `,
      )
      .get(slug)

    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
    res.json({ tenant })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/tenant', (req, res, next) => {
  try {
    const t = req.resolvedTenant
    if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl
          FROM tenants
          WHERE id = ?
        `,
      )
      .get(t.id)

    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
    res.json({ tenant })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/services', (req, res, next) => {
  try {
    const t = req.resolvedTenant
    if (!t) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const services = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents
          FROM services
          WHERE tenant_id = ?
          ORDER BY created_at DESC
        `,
      )
      .all(t.id)

    res.json({ services })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/booking', (req, res, next) => {
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

app.get('/api/public/tenant/:slug/services', (req, res, next) => {
  try {
    const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
    const tenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug) as
      | { id: string }
      | undefined
    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const services = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents
          FROM services
          WHERE tenant_id = ?
          ORDER BY created_at DESC
        `,
      )
      .all(tenant.id)

    res.json({ services })
  } catch (err) {
    next(err)
  }
})

app.get('/api/public/tenant/:slug/booking', (req, res, next) => {
  try {
    const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
    const tenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug) as
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

app.get('/api/auth/me', (req, res, next) => {
  try {
    const allowDevBootstrap =
      (db.prepare(`SELECT COUNT(1) as n FROM users WHERE role = 'DEV'`).get() as { n: number })
        .n === 0

    if (!req.sessionUser) {
      res.json({ user: null, allowDevBootstrap })
      return
    }

    const u = db
      .prepare(
        `
          SELECT u.id, u.email, u.role, u.tenant_id as tenantId,
                 t.slug as tenantSlug
          FROM users u
          LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE u.id = ?
        `,
      )
      .get(req.sessionUser.id)

    res.json({ user: u ?? null, allowDevBootstrap })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
      })
      .parse(req.body)

    const row = db
      .prepare(
        `
          SELECT id, tenant_id as tenantId, email, password_hash as passwordHash, role
          FROM users
          WHERE email = ?
        `,
      )
      .get(body.email.toLowerCase()) as
      | {
          id: string
          tenantId: string | null
          email: string
          passwordHash: string
          role: 'DEV' | 'ADMIN' | 'CLIENT'
        }
      | undefined

    if (!row) throw badRequest('E-mail ou senha inválidos', 'INVALID_CREDENTIALS')
    const ok = await verifyPassword(body.password, row.passwordHash)
    if (!ok) throw badRequest('E-mail ou senha inválidos', 'INVALID_CREDENTIALS')

    if (row.role === 'DEV' && !isDevHost(req.hostname)) {
      throw unauthorized('Acesso DEV somente no subdomínio dev.', 'DEV_SUBDOMAIN_ONLY')
    }

    if (row.role !== 'DEV' && req.resolvedTenant && row.tenantId && req.resolvedTenant.id !== row.tenantId) {
      throw unauthorized('Use o subdomínio da sua loja para entrar.', 'TENANT_HOST_MISMATCH')
    }

    const token = signSession({ sub: row.id, role: row.role, tenantId: row.tenantId ?? null })
    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    })

    const tenantSlug =
      row.tenantId && row.role !== 'DEV'
        ? (
            (db.prepare('SELECT slug FROM tenants WHERE id = ?').get(row.tenantId) as
              | { slug: string }
              | undefined)?.slug ?? null
          )
        : null

    res.json({
      user: {
        id: row.id,
        email: row.email,
        role: row.role,
        tenantId: row.tenantId ?? null,
        tenantSlug,
      },
    })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('session', { path: '/' })
  res.json({ ok: true })
})

app.post('/api/auth/register-client', async (req, res, next) => {
  try {
    const body = z
      .object({
        tenantSlug: z.string().min(1).optional(),
        name: z.string().min(2),
        phone: z.string().optional(),
        email: z.string().email(),
        password: z.string().min(8),
      })
      .parse(req.body)

    const slug = (body.tenantSlug ?? req.resolvedTenant?.slug ?? '').trim().toLowerCase()
    if (!slug) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const tenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug) as
      | { id: string }
      | undefined
    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const email = body.email.toLowerCase()
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (exists) throw badRequest('E-mail já cadastrado', 'EMAIL_ALREADY_USED')

    const now = new Date().toISOString()
    const userId = randomUUID()
    const clientId = randomUUID()
    const passwordHash = await hashPassword(body.password)

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, 'CLIENT', ?)`
      ).run(userId, tenant.id, email, passwordHash, now)

      db.prepare(
        `INSERT INTO clients (id, tenant_id, user_id, name, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(clientId, tenant.id, userId, body.name, body.phone ?? null, now)
    })

    tx()

    const token = signSession({ sub: userId, role: 'CLIENT', tenantId: tenant.id })
    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    })

    res.json({
      user: {
        id: userId,
        email,
        role: 'CLIENT',
        tenantId: tenant.id,
        tenantSlug: slug,
      },
    })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/bootstrap', requireDevHost, async (req, res, next) => {
  try {
    const allowDevBootstrap =
      (db.prepare(`SELECT COUNT(1) as n FROM users WHERE role = 'DEV'`).get() as { n: number })
        .n === 0
    if (!allowDevBootstrap) throw badRequest('Bootstrap DEV indisponível', 'BOOTSTRAP_DISABLED')

    const body = z
      .object({ email: z.string().email(), password: z.string().min(8) })
      .parse(req.body)

    const email = body.email.toLowerCase()
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (exists) throw badRequest('E-mail já cadastrado', 'EMAIL_ALREADY_USED')

    const now = new Date().toISOString()
    const id = randomUUID()
    const passwordHash = await hashPassword(body.password)
    db.prepare(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
       VALUES (?, NULL, ?, ?, 'DEV', ?)`
    ).run(id, email, passwordHash, now)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/tenants', requireDevHost, requireRole('DEV'), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(2),
        slug: z
          .string()
          .min(2)
          .regex(/^[a-z0-9-]+$/),
        primaryColor: z.string().min(4),
        adminEmail: z.string().email(),
        adminPassword: z.string().min(8),
      })
      .parse(req.body)

    const slug = body.slug.trim().toLowerCase()
    const existsTenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)
    if (existsTenant) throw badRequest('Slug já existe', 'TENANT_SLUG_TAKEN')

    const adminEmail = body.adminEmail.toLowerCase()
    const existsUser = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail)
    if (existsUser) throw badRequest('E-mail do admin já existe', 'EMAIL_ALREADY_USED')

    const now = new Date().toISOString()
    const tenantId = randomUUID()
    const adminId = randomUUID()
    const passwordHash = await hashPassword(body.adminPassword)

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO tenants (id, slug, name, primary_color, logo_url, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`
      ).run(tenantId, slug, body.name, body.primaryColor, now)

      db.prepare(
        `INSERT INTO tenant_settings (tenant_id, secondary_color, timezone, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(tenantId, '#0f172a', 'America/Sao_Paulo', 'BRL', now, now)

      db.prepare(
        `INSERT INTO booking_rules (tenant_id, min_notice_minutes, max_future_days, slot_step_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(tenantId, 60, 60, 15, now, now)

      const insertBusinessHours = db.prepare(
        `INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const weekday of [1, 2, 3, 4, 5]) {
        insertBusinessHours.run(randomUUID(), tenantId, weekday, 9 * 60, 18 * 60, now)
      }
      insertBusinessHours.run(randomUUID(), tenantId, 6, 9 * 60, 14 * 60, now)

      db.prepare(
        `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, 'ADMIN', ?)`
      ).run(adminId, tenantId, adminEmail, passwordHash, now)
    })

    tx()

    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl
          FROM tenants
          WHERE id = ?
        `,
      )
      .get(tenantId)

    res.json({
      tenant,
      adminUser: {
        id: adminId,
        email: adminEmail,
        role: 'ADMIN',
        tenantId,
        tenantSlug: slug,
      },
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/tenants', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenants = db
      .prepare(
        `
          SELECT t.id,
                 t.slug,
                 t.name,
                 t.primary_color as primaryColor,
                 t.logo_url as logoUrl,
                 t.created_at as createdAt,
                 (
                   SELECT u.email
                   FROM users u
                   WHERE u.tenant_id = t.id AND u.role = 'ADMIN'
                   ORDER BY u.created_at ASC
                   LIMIT 1
                 ) as adminEmail,
                 (
                   SELECT COUNT(1)
                   FROM users u
                   WHERE u.tenant_id = t.id
                 ) as userCount
          FROM tenants t
          ORDER BY t.created_at DESC
        `,
      )
      .all()

    res.json({ tenants })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenantId = z.string().uuid().parse(req.params.tenantId)
    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl, created_at as createdAt
          FROM tenants
          WHERE id = ?
        `,
      )
      .get(tenantId)

    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const settings = db
      .prepare(
        `
          SELECT secondary_color as secondaryColor, timezone, currency, created_at as createdAt, updated_at as updatedAt
          FROM tenant_settings
          WHERE tenant_id = ?
        `,
      )
      .get(tenantId)

    const bookingRules = db
      .prepare(
        `
          SELECT min_notice_minutes as minNoticeMinutes,
                 max_future_days as maxFutureDays,
                 slot_step_minutes as slotStepMinutes,
                 created_at as createdAt,
                 updated_at as updatedAt
          FROM booking_rules
          WHERE tenant_id = ?
        `,
      )
      .get(tenantId)

    res.json({ tenant, settings: settings ?? null, bookingRules: bookingRules ?? null })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/dev/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenantId = z.string().uuid().parse(req.params.tenantId)
    const body = z
      .object({
        name: z.string().min(2).optional(),
        slug: z
          .string()
          .min(2)
          .regex(/^[a-z0-9-]+$/)
          .optional(),
        primaryColor: z.string().min(4).optional(),
        logoUrl: z.string().url().nullable().optional(),
      })
      .parse(req.body)

    const exists = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId) as
      | { id: string }
      | undefined
    if (!exists) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.name === 'string') updates.push({ sql: 'name = ?', params: [body.name] })
    if (typeof body.primaryColor === 'string')
      updates.push({ sql: 'primary_color = ?', params: [body.primaryColor] })
    if ('logoUrl' in body) updates.push({ sql: 'logo_url = ?', params: [body.logoUrl ?? null] })

    if (typeof body.slug === 'string') {
      const slug = body.slug.trim().toLowerCase()
      const taken = db.prepare('SELECT id FROM tenants WHERE slug = ? AND id <> ?').get(slug, tenantId)
      if (taken) return next(badRequest('Slug já existe', 'TENANT_SLUG_TAKEN'))
      updates.push({ sql: 'slug = ?', params: [slug] })
    }

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE tenants SET ${setSql} WHERE id = ?`).run(...params, tenantId)

    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl, created_at as createdAt
          FROM tenants
          WHERE id = ?
        `,
      )
      .get(tenantId)

    res.json({ tenant })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/dev/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const tenantId = z.string().uuid().parse(req.params.tenantId)
    const row = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId) as
      | { id: string }
      | undefined
    if (!row) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/services', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const services = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents
          FROM services
          WHERE tenant_id = ?
          ORDER BY created_at DESC
        `,
      )
      .all(tenantId)
    res.json({ services })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/services', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const body = z
      .object({
        name: z.string().min(2),
        durationMinutes: z.number().int().positive(),
        priceCents: z.number().int().nonnegative(),
      })
      .parse(req.body)

    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, tenantId, body.name, body.durationMinutes, body.priceCents, now)

    const service = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents
          FROM services
          WHERE id = ?
        `,
      )
      .get(id)

    res.json({ service })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/appointments', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const appointments = db
      .prepare(
        `
          SELECT a.id,
                 a.starts_at as startsAt,
                 a.status,
                 u.email as clientEmail,
                 s.name as serviceName
          FROM appointments a
          JOIN users u ON u.id = a.client_user_id
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
          ORDER BY a.starts_at ASC
          LIMIT 200
        `,
      )
      .all(tenantId)
    res.json({ appointments })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/dashboard', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(24, 0, 0, 0)

    const today = db
      .prepare(
        `
          SELECT
            COUNT(1) as appointmentsCount,
            COALESCE(SUM(s.price_cents), 0) as expectedRevenueCents
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.starts_at >= ?
            AND a.starts_at < ?
            AND a.status IN ('PENDING', 'CONFIRMED')
        `,
      )
      .get(tenantId, start.toISOString(), end.toISOString()) as
      | { appointmentsCount: number; expectedRevenueCents: number }
      | undefined

    const upcoming = db
      .prepare(
        `
          SELECT a.id,
                 a.starts_at as startsAt,
                 a.status,
                 s.name as serviceName,
                 s.price_cents as priceCents,
                 u.email as clientEmail,
                 c.name as clientName
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          WHERE a.tenant_id = ?
            AND a.starts_at >= ?
          ORDER BY a.starts_at ASC
          LIMIT 30
        `,
      )
      .all(tenantId, new Date().toISOString()) as Array<{
      id: string
      startsAt: string
      status: string
      serviceName: string
      priceCents: number
      clientEmail: string
      clientName: string | null
    }>

    res.json({
      today: {
        appointmentsCount: today?.appointmentsCount ?? 0,
        expectedRevenueCents: today?.expectedRevenueCents ?? 0,
      },
      upcoming,
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/clients', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const clients = db
      .prepare(
        `
          SELECT
            c.id,
            c.name,
            c.phone,
            u.email as email,
            COALESCE(SUM(CASE WHEN a.status = 'CONFIRMED' THEN s.price_cents ELSE 0 END), 0) as totalSpentCents,
            MAX(CASE WHEN a.status = 'CONFIRMED' THEN a.starts_at ELSE NULL END) as lastVisitAt
          FROM clients c
          JOIN users u ON u.id = c.user_id
          LEFT JOIN appointments a ON a.tenant_id = c.tenant_id AND a.client_user_id = c.user_id
          LEFT JOIN services s ON s.id = a.service_id
          WHERE c.tenant_id = ?
          GROUP BY c.id
          ORDER BY (lastVisitAt IS NULL) ASC, lastVisitAt DESC, totalSpentCents DESC
          LIMIT 500
        `,
      )
      .all(tenantId) as Array<{
      id: string
      name: string
      phone: string | null
      email: string
      totalSpentCents: number
      lastVisitAt: string | null
    }>

    res.json({ clients })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/finance', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const entries = db
      .prepare(
        `
          SELECT COALESCE(SUM(s.price_cents), 0) as entriesCents
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.status = 'CONFIRMED'
        `,
      )
      .get(tenantId) as { entriesCents: number } | undefined

    const expenses = db
      .prepare(
        `
          SELECT COALESCE(SUM(amount_cents), 0) as expensesCents
          FROM cash_transactions
          WHERE tenant_id = ?
            AND type = 'EXPENSE'
        `,
      )
      .get(tenantId) as { expensesCents: number } | undefined

    const lastExpenses = db
      .prepare(
        `
          SELECT id,
                 amount_cents as amountCents,
                 method,
                 note,
                 created_at as createdAt
          FROM cash_transactions
          WHERE tenant_id = ?
            AND type = 'EXPENSE'
          ORDER BY created_at DESC
          LIMIT 100
        `,
      )
      .all(tenantId) as Array<{ id: string; amountCents: number; method: string; note: string | null; createdAt: string }>

    const entriesCents = entries?.entriesCents ?? 0
    const expensesCents = expenses?.expensesCents ?? 0

    res.json({
      totals: {
        entriesCents,
        expensesCents,
        profitCents: entriesCents - expensesCents,
      },
      lastExpenses,
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/domains', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const domains = db
      .prepare(
        `
          SELECT id, domain, created_at as createdAt
          FROM tenant_domains
          WHERE tenant_id = ?
          ORDER BY created_at DESC
        `,
      )
      .all(tenantId) as Array<{ id: string; domain: string; createdAt: string }>

    res.json({ domains })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/domains', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        domain: z.string().min(1),
      })
      .parse(req.body)

    const domain = normalizeCustomDomain(body.domain)
    const id = randomUUID()
    const now = new Date().toISOString()

    try {
      db.prepare(
        `
          INSERT INTO tenant_domains (id, tenant_id, domain, created_at)
          VALUES (?, ?, ?, ?)
        `,
      ).run(id, tenantId, domain, now)
    } catch (err) {
      const e = err as { code?: string }
      if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return next(badRequest('Domínio já cadastrado', 'DOMAIN_TAKEN'))
      }
      throw err
    }

    res.json({ domain: { id, domain, createdAt: now } })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/domains/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const row = db
      .prepare('SELECT id FROM tenant_domains WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as { id: string } | undefined
    if (!row) return next(notFound('Domínio não encontrado', 'DOMAIN_NOT_FOUND'))

    db.prepare('DELETE FROM tenant_domains WHERE id = ?').run(id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/finance/expenses', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        amountCents: z.number().int().positive(),
        method: z.string().min(1).optional(),
        note: z.string().optional(),
      })
      .parse(req.body)

    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `
        INSERT INTO cash_transactions (id, tenant_id, type, amount_cents, method, note, created_at)
        VALUES (?, ?, 'EXPENSE', ?, ?, ?, ?)
      `,
    ).run(id, tenantId, body.amountCents, body.method?.trim() || 'MANUAL', body.note?.trim() || null, now)

    res.json({
      expense: {
        id,
        amountCents: body.amountCents,
        method: body.method?.trim() || 'MANUAL',
        note: body.note?.trim() || null,
        createdAt: now,
      },
    })
  } catch (err) {
    next(err)
  }
})

const requireWhatsappConfig = (tenantId: string) => {
  const row = db
    .prepare(
      `
        SELECT id,
               provider,
               base_url as baseUrl,
               api_key as apiKey,
               instance_name as instanceName,
               status,
               updated_at as updatedAt
        FROM whatsapp_instances
        WHERE tenant_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `,
    )
    .get(tenantId) as
    | {
        id: string
        provider: string
        baseUrl: string | null
        apiKey: string | null
        instanceName: string | null
        status: string
        updatedAt: string
      }
    | undefined

  return row
}

app.get('/api/admin/whatsapp', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const row = requireWhatsappConfig(tenantId)
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
      },
    })
  } catch (err) {
    next(err)
  }
})

app.put('/api/admin/whatsapp', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        provider: z.string().min(1).optional(),
        baseUrl: z.string().min(4).optional(),
        apiKey: z.string().min(1).optional(),
        instanceName: z.string().min(1).optional(),
      })
      .parse(req.body)

    const now = new Date().toISOString()
    const existing = requireWhatsappConfig(tenantId)
    const provider = body.provider?.trim() || existing?.provider || 'EVOLUTION'
    const baseUrl = body.baseUrl?.trim() || existing?.baseUrl || null
    const apiKey = body.apiKey?.trim() || existing?.apiKey || null
    const instanceName = body.instanceName?.trim() || existing?.instanceName || null
    const status = 'CONFIGURED'

    if (existing) {
      db.prepare(
        `
          UPDATE whatsapp_instances
          SET provider = ?, base_url = ?, api_key = ?, instance_name = ?, status = ?, updated_at = ?
          WHERE id = ?
        `,
      ).run(provider, baseUrl, apiKey, instanceName, status, now, existing.id)
      res.json({ ok: true })
      return
    }

    const id = randomUUID()
    db.prepare(
      `
        INSERT INTO whatsapp_instances (id, tenant_id, provider, base_url, api_key, instance_name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(id, tenantId, provider, baseUrl, apiKey, instanceName, status, now, now)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

const normalizeBaseUrl = (raw: string) => raw.replace(/\/+$/, '')

const extractQrCode = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') {
    const v = value.trim()
    if (!v) return null
    if (v.startsWith('data:image/')) return v
    if (/^[A-Za-z0-9+/=]+$/.test(v) && v.length > 100) return `data:image/png;base64,${v}`
    return null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractQrCode(item)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const candidates = ['qrCode', 'qrcode', 'qr', 'base64', 'code']
    for (const k of candidates) {
      const found = extractQrCode(o[k])
      if (found) return found
    }
    for (const k of Object.keys(o)) {
      const found = extractQrCode(o[k])
      if (found) return found
    }
  }
  return null
}

app.get('/api/admin/whatsapp/status', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const row = requireWhatsappConfig(tenantId)
    if (!row?.baseUrl || !row.apiKey || !row.instanceName) {
      res.json({ state: 'NOT_CONFIGURED' })
      return
    }

    const url = `${normalizeBaseUrl(row.baseUrl)}/instance/connectionState/${encodeURIComponent(row.instanceName)}`
    const resp = await fetch(url, { headers: { apikey: row.apiKey } })
    const raw = await resp.json().catch(() => null)

    const rawObj = typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : null
    const instanceObj =
      rawObj && typeof rawObj.instance === 'object' && rawObj.instance
        ? (rawObj.instance as Record<string, unknown>)
        : null
    const instanceState = instanceObj?.state
    const rootState = rawObj?.state
    const state =
      (typeof instanceState === 'string' && instanceState) ||
      (typeof rootState === 'string' && rootState) ||
      (resp.ok ? 'unknown' : 'error')

    res.json({ state, raw })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/whatsapp/qrcode', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const row = requireWhatsappConfig(tenantId)
    if (!row?.baseUrl || !row.apiKey || !row.instanceName) {
      res.json({ qrCode: null, state: 'NOT_CONFIGURED' })
      return
    }

    const url = `${normalizeBaseUrl(row.baseUrl)}/instance/connect/${encodeURIComponent(row.instanceName)}`
    const resp = await fetch(url, { headers: { apikey: row.apiKey } })
    const raw = await resp.json().catch(() => null)
    const qrCode = extractQrCode(raw)
    res.json({ qrCode, raw })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/whatsapp/broadcast', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        text: z.string().min(1).max(2000),
        limit: z.number().int().positive().max(2000).optional(),
      })
      .parse(req.body)

    const row = requireWhatsappConfig(tenantId)
    if (!row?.baseUrl || !row.apiKey || !row.instanceName) {
      return next(badRequest('WhatsApp não configurado', 'WHATSAPP_NOT_CONFIGURED'))
    }

    const limit = body.limit ?? 300
    const phones = db
      .prepare(
        `
          SELECT phone
          FROM clients
          WHERE tenant_id = ?
            AND phone IS NOT NULL
            AND TRIM(phone) <> ''
          ORDER BY created_at DESC
          LIMIT ?
        `,
      )
      .all(tenantId, limit) as Array<{ phone: string }>

    const numbers = phones
      .map((p) => String(p.phone || '').trim())
      .filter(Boolean)

    const url = `${normalizeBaseUrl(row.baseUrl)}/message/sendText/${encodeURIComponent(row.instanceName)}`

    let sent = 0
    let failed = 0
    for (const number of numbers) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: row.apiKey },
          body: JSON.stringify({ number, text: body.text, textMessage: body.text }),
        })
        if (!resp.ok) {
          failed += 1
          continue
        }
        sent += 1
      } catch {
        failed += 1
      }
    }

    res.json({ sent, failed, total: numbers.length })
  } catch (err) {
    next(err)
  }
})

app.get('/api/client/appointments', requireRole('CLIENT'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())

    const tenantId = sessionUser.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const appointments = db
      .prepare(
        `
          SELECT a.id,
                 a.starts_at as startsAt,
                 a.ends_at as endsAt,
                 a.status,
                 s.name as serviceName,
                 s.price_cents as priceCents
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.client_user_id = ?
          ORDER BY a.starts_at DESC
          LIMIT 100
        `,
      )
      .all(tenantId, sessionUser.id)

    res.json({ appointments })
  } catch (err) {
    next(err)
  }
})

app.post('/api/client/appointments', requireRole('CLIENT'), (req, res, next) => {
  try {
    const sessionUser = req.sessionUser
    if (!sessionUser) return next(unauthorized())

    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        serviceId: z.string().uuid(),
        startsAt: z.string().datetime(),
      })
      .parse(req.body)

    const service = db
      .prepare(
        `SELECT id, duration_minutes as durationMinutes FROM services WHERE id = ? AND tenant_id = ?`,
      )
      .get(body.serviceId, tenantId) as { id: string; durationMinutes: number } | undefined
    if (!service) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

    const settings = db
      .prepare(
        `
          SELECT timezone
          FROM tenant_settings
          WHERE tenant_id = ?
        `,
      )
      .get(tenantId) as { timezone: string } | undefined

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
      .get(tenantId) as
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
      .all(tenantId) as Array<{ weekday: number; startMinute: number; endMinute: number }>

    const startsAt = new Date(body.startsAt)
    if (Number.isNaN(startsAt.getTime())) throw badRequest('Data inválida', 'INVALID_DATE')
    if (!Number.isFinite(service.durationMinutes) || service.durationMinutes <= 0) {
      throw badRequest('Duração do serviço inválida', 'INVALID_SERVICE_DURATION')
    }
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)

    const rules = bookingRules ?? { minNoticeMinutes: 60, maxFutureDays: 60, slotStepMinutes: 15 }
    const nowDt = new Date()
    const minStart = new Date(nowDt.getTime() + rules.minNoticeMinutes * 60_000)
    if (startsAt.getTime() < minStart.getTime()) {
      throw badRequest('Horário com pouca antecedência', 'MIN_NOTICE')
    }
    const maxStart = new Date(nowDt)
    maxStart.setDate(maxStart.getDate() + rules.maxFutureDays)
    if (startsAt.getTime() > maxStart.getTime()) {
      throw badRequest('Horário muito distante', 'MAX_FUTURE')
    }

    const timeZone = settings?.timezone ?? 'America/Sao_Paulo'
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    let zonedFormatter: Intl.DateTimeFormat
    try {
      zonedFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    } catch {
      throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
    }

    const getZonedParts = (d: Date) => {
      const parts = zonedFormatter.formatToParts(d)
      const weekdayToken = parts.find((p) => p.type === 'weekday')?.value
      const hourToken = parts.find((p) => p.type === 'hour')?.value
      const minuteToken = parts.find((p) => p.type === 'minute')?.value
      const weekday = weekdayToken ? weekdayMap[weekdayToken] : undefined
      const hour = hourToken ? Number(hourToken) : NaN
      const minute = minuteToken ? Number(minuteToken) : NaN
      if (weekday === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) {
        throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
      }
      return { weekday, minutesOfDay: hour * 60 + minute }
    }

    const startParts = getZonedParts(startsAt)
    const endParts = getZonedParts(endsAt)
    if (startParts.weekday !== endParts.weekday || endParts.minutesOfDay < startParts.minutesOfDay) {
      throw badRequest('Agendamento não pode atravessar o dia', 'CROSS_DAY')
    }
    if (businessHours.length === 0) {
      throw badRequest('Horários de atendimento não configurados', 'BUSINESS_HOURS_EMPTY')
    }

    const stepMinutes = Math.max(5, rules.slotStepMinutes)
    const matchingRanges = businessHours.filter((r) => r.weekday === startParts.weekday)
    const fitsAnyRange = matchingRanges.some((r) => {
      const aligned = (startParts.minutesOfDay - r.startMinute) % stepMinutes === 0
      if (!aligned) return false
      return (
        startParts.minutesOfDay >= r.startMinute &&
        startParts.minutesOfDay < r.endMinute &&
        endParts.minutesOfDay <= r.endMinute
      )
    })
    if (!fitsAnyRange) {
      throw badRequest('Horário fora do atendimento', 'OUTSIDE_BUSINESS_HOURS')
    }

    const overlap = db
      .prepare(
        `
          SELECT id FROM appointments
          WHERE tenant_id = ?
            AND status IN ('CONFIRMED', 'PENDING')
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, startsAt.toISOString(), endsAt.toISOString())

    if (overlap) throw badRequest('Horário indisponível', 'SLOT_UNAVAILABLE')

    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `
        INSERT INTO appointments (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
      `,
    ).run(
      id,
      tenantId,
      body.serviceId,
      sessionUser.id,
      startsAt.toISOString(),
      endsAt.toISOString(),
      now,
    )

    res.json({
      appointment: {
        id,
        serviceId: body.serviceId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: 'PENDING',
      },
    })
  } catch (err) {
    next(err)
  }
})

app.all('/api/*path', (_req, _res, next) => next(notFound()))

if (env.NODE_ENV === 'production') {
  const clientDir = path.resolve('dist/client')
  app.use(express.static(clientDir))
  app.get(/^(?!\/api).*$/, (req, res, next) => {
    const host = (req.hostname ?? '').toLowerCase()
    const devHost = env.DEV_HOST ? host === env.DEV_HOST.toLowerCase() : host.startsWith('dev.')
    const p = req.path

    if (devHost) {
      if (p !== '/' && p !== '/login' && !p.startsWith('/dev')) return next(notFound())
      res.sendFile(path.join(clientDir, 'index.html'))
      return
    }

    if (p.startsWith('/dev')) return next(notFound())
    res.sendFile(path.join(clientDir, 'index.html'))
  })
}

app.use(handleError)

app.listen(env.PORT, () => {
  console.log(`server listening on :${env.PORT}`)
})
