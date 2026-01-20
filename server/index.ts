import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { sessionMiddleware, requireRole, requireActiveSubscription } from './auth.js'
import { getDb } from './db.js'
import { env } from './env.js'
import { badRequest, handleError, notFound, unauthorized } from './http.js'
import { migrate } from './migrate.js'
import { hashPassword, signSession, verifyPassword } from './security.js'

console.log(`[Startup] DATABASE_PATH (Config): ${env.DATABASE_PATH}`)
console.log(`[Startup] DATABASE_PATH (Resolved): ${path.resolve(env.DATABASE_PATH)}`)
console.log(`[Startup] NODE_ENV: ${env.NODE_ENV}`)

migrate()
const db = getDb()

const app = express()

const isDevHost = (hostname: string) => {
  const host = (hostname ?? '').toLowerCase()
  if (env.DEV_HOST) return host === env.DEV_HOST.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return env.NODE_ENV !== 'production'
  // Suporte a subdomínios em produção (ex: dev.lashdesigner.space)
  if (host.startsWith('dev.') && host.endsWith('.lashdesigner.space')) return true
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

  // Correção: Permitir dev.lashdesigner.space como exceção se necessário, mas geralmente dev é reservado
  // Se o host for exatamente dev.lashdesigner.space, não deve ser tratado como tenant slug 'dev'
  if (first === 'dev' && parts.length === 3 && parts[1] === 'lashdesigner' && parts[2] === 'space') return null

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

const utcForLocalTime = (input: {
  timeZone: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
}) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: input.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const targetUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second ?? 0,
  )

  let utc = new Date(targetUtc)
  for (let i = 0; i < 4; i++) {
    const parts = fmt.formatToParts(utc)
    const get = (type: string) => parts.find((p) => p.type === type)?.value
    const y = Number(get('year'))
    const m = Number(get('month'))
    const d = Number(get('day'))
    const hh = Number(get('hour'))
    const mm = Number(get('minute'))
    const ss = Number(get('second'))
    if (![y, m, d, hh, mm, ss].every(Number.isFinite)) return utc

    const seenUtc = Date.UTC(y, m - 1, d, hh, mm, ss)
    const diff = targetUtc - seenUtc
    if (diff === 0) break
    utc = new Date(utc.getTime() + diff)
  }
  return utc
}

const dayBoundsUtc = (input: { timeZone: string; ymd: string }) => {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(input.ymd)
  if (!m) throw badRequest('Data inválida', 'INVALID_DATE')
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (![year, month, day].every(Number.isFinite)) throw badRequest('Data inválida', 'INVALID_DATE')

  const start = utcForLocalTime({ timeZone: input.timeZone, year, month, day, hour: 0, minute: 0, second: 0 })
  const nextDay = utcForLocalTime({ timeZone: input.timeZone, year, month, day: day + 1, hour: 0, minute: 0, second: 0 })

  return { start, endExclusive: nextDay }
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
app.use(express.json({ limit: '50mb' }))
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

app.get('/api/public/availability', (req, res, next) => {
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
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
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

app.get('/api/public/tenant/:slug/availability', (req, res, next) => {
  try {
    const slug = z.string().min(1).parse(req.params.slug).trim().toLowerCase()
    const tenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug) as
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
                 t.slug as tenantSlug,
                 (
                   SELECT status 
                   FROM appmax_subscriptions 
                   WHERE tenant_id = u.tenant_id 
                   ORDER BY updated_at DESC LIMIT 1
                 ) as subscriptionStatus
          FROM users u
          LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE u.id = ?
        `,
      )
      .get(req.sessionUser.id)

    const testMode = (db.prepare(`SELECT value FROM platform_settings WHERE key = 'test_mode'`).get() as { value: string } | undefined)?.value === 'true'

    res.json({ user: u ?? null, allowDevBootstrap, isTestMode: testMode })
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

    const email = body.email.toLowerCase()
    const isDev = isDevHost(req.hostname)
    const tenantId = req.resolvedTenant?.id ?? null

    const row = (():
      | {
          id: string
          tenantId: string | null
          email: string
          passwordHash: string
          role: 'DEV' | 'ADMIN' | 'CLIENT'
        }
      | undefined => {
      if (isDev) {
        return db
          .prepare(
            `
              SELECT id, tenant_id as tenantId, email, password_hash as passwordHash, role
              FROM users
              WHERE email = ?
                AND tenant_id IS NULL
              LIMIT 1
            `,
          )
          .get(email) as
          | {
              id: string
              tenantId: string | null
              email: string
              passwordHash: string
              role: 'DEV' | 'ADMIN' | 'CLIENT'
            }
          | undefined
      }

      if (!tenantId) throw unauthorized('Use o subdomínio do seu espaço para entrar.', 'TENANT_REQUIRED')

      return db
        .prepare(
          `
            SELECT id, tenant_id as tenantId, email, password_hash as passwordHash, role
            FROM users
            WHERE email = ?
              AND tenant_id = ?
            LIMIT 1
          `,
        )
        .get(email, tenantId) as
        | {
            id: string
            tenantId: string | null
            email: string
            passwordHash: string
            role: 'DEV' | 'ADMIN' | 'CLIENT'
          }
        | undefined
    })()

    if (!row) throw badRequest('E-mail ou senha inválidos', 'INVALID_CREDENTIALS')
    const ok = await verifyPassword(body.password, row.passwordHash)
    if (!ok) throw badRequest('E-mail ou senha inválidos', 'INVALID_CREDENTIALS')

    if (row.role === 'DEV' && !isDevHost(req.hostname)) {
      throw unauthorized('Acesso DEV somente no subdomínio dev.', 'DEV_SUBDOMAIN_ONLY')
    }

    if (row.role !== 'DEV' && tenantId && row.tenantId && tenantId !== row.tenantId) {
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
    const exists = db
      .prepare('SELECT id FROM users WHERE email = ? AND tenant_id = ? LIMIT 1')
      .get(email, tenant.id)
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

app.post('/api/auth/client-fast-login', async (req, res, next) => {
  try {
    const body = z
      .object({
        tenantSlug: z.string().min(1).optional(),
        name: z.string().min(2),
        phone: z.string().min(8), // Basic length check
      })
      .parse(req.body)

    const slug = (body.tenantSlug ?? req.resolvedTenant?.slug ?? '').trim().toLowerCase()
    if (!slug) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const tenant = db.prepare('SELECT id, slug FROM tenants WHERE slug = ?').get(slug) as
      | { id: string; slug: string }
      | undefined
    if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const cleanPhone = body.phone.replace(/\D/g, '')
    if (cleanPhone.length < 8) throw badRequest('Telefone inválido', 'INVALID_PHONE')

    // Generate a deterministic dummy email for this phone + tenant
    // Using phone@tenant-slug.client to avoid collisions with real emails and other tenants
    const dummyEmail = `${cleanPhone}@${tenant.slug}.client`

    const existingUser = db
      .prepare('SELECT id, password_hash, role FROM users WHERE email = ? AND tenant_id = ? LIMIT 1')
      .get(dummyEmail, tenant.id) as
      | { id: string; password_hash: string; role: string }
      | undefined

    let userId = existingUser?.id
    const now = new Date().toISOString()

    const newUser = existingUser
      ? null
      : {
          userId: randomUUID(),
          clientId: randomUUID(),
          passwordHash: await hashPassword(randomUUID() + randomUUID()),
        }

    const tx = db.transaction(() => {
      if (existingUser) {
        db.prepare('UPDATE clients SET name = ? WHERE user_id = ? AND tenant_id = ?').run(
          body.name,
          existingUser.id,
          tenant.id,
        )
        userId = existingUser.id
        return
      }

      if (!newUser) throw new Error('Falha ao criar cliente')

      userId = newUser.userId
      db.prepare(
        `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, 'CLIENT', ?)`
      ).run(newUser.userId, tenant.id, dummyEmail, newUser.passwordHash, now)

      db.prepare(
        `INSERT INTO clients (id, tenant_id, user_id, name, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(newUser.clientId, tenant.id, newUser.userId, body.name, body.phone, now)
    })

    tx()

    if (!userId) throw new Error('Falha ao autenticar usuário')

    const token = signSession({ sub: userId, role: 'CLIENT', tenantId: tenant.id })
    res.cookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 30 * 12, // 1 year for convenience
    })

    res.json({
      user: {
        id: userId,
        email: dummyEmail,
        role: 'CLIENT',
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        name: body.name,
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
    const exists = db
      .prepare(`SELECT id FROM users WHERE email = ? AND tenant_id IS NULL LIMIT 1`)
      .get(email)
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

app.get('/api/dev/settings', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const settings = db.prepare('SELECT key, value FROM platform_settings').all() as Array<{ key: string; value: string }>
    const map: Record<string, string> = {}
    settings.forEach((s) => (map[s.key] = s.value))
    res.json({ settings: map })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/settings', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const body = z.record(z.string()).parse(req.body)
    const now = new Date().toISOString()
    
    const tx = db.transaction(() => {
        Object.entries(body).forEach(([key, value]) => {
            db.prepare(`
                INSERT INTO platform_settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            `).run(key, value, now)
        })
    })
    tx()
    
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/users', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const users = db
      .prepare(`SELECT id, email, created_at as createdAt FROM users WHERE role = 'DEV' ORDER BY created_at DESC`)
      .all()
    res.json({ users })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/users', requireDevHost, requireRole('DEV'), async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(req.body)
    const email = body.email.toLowerCase()
    
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (exists) throw badRequest('E-mail já cadastrado', 'EMAIL_ALREADY_USED')

    const id = randomUUID()
    const passwordHash = await hashPassword(body.password)
    const now = new Date().toISOString()

    db.prepare(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
       VALUES (?, NULL, ?, ?, 'DEV', ?)`
    ).run(id, email, passwordHash, now)

    res.json({ user: { id, email, createdAt: now } })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/dev/users/:id', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id)
    if (id === req.sessionUser?.id) throw badRequest('Não é possível excluir o próprio usuário', 'CANNOT_DELETE_SELF')

    db.prepare('DELETE FROM users WHERE id = ? AND role = \'DEV\'').run(id)
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
        logoUrl: z
          .string()
          .trim()
          .optional()
          .transform((v) => {
            if (typeof v !== 'string') return null
            const s = v.trim()
            return s ? s : null
          })
          .refine(
            (v) => {
              if (v === null) return true
              if (v.startsWith('data:image/')) return v.length <= 250_000
              try {
                new URL(v)
                return true
              } catch {
                return false
              }
            },
            { message: 'Logo inválida' },
          ),
        adminEmail: z.string().email(),
        adminPassword: z.string().min(8),
      })
      .parse(req.body)

    const slug = body.slug.trim().toLowerCase()
    const existsTenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)
    if (existsTenant) throw badRequest('Slug já existe', 'TENANT_SLUG_TAKEN')

    const adminEmail = body.adminEmail.toLowerCase()
    const existsUser = db
      .prepare(`SELECT id FROM users WHERE email = ? AND tenant_id IS NULL LIMIT 1`)
      .get(adminEmail)
    if (existsUser) throw badRequest('E-mail do admin já existe (usuário DEV)', 'EMAIL_ALREADY_USED')

    const now = new Date().toISOString()
    const tenantId = randomUUID()
    const adminId = randomUUID()
    const passwordHash = await hashPassword(body.adminPassword)

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO tenants (id, slug, name, primary_color, logo_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(tenantId, slug, body.name, body.primaryColor, body.logoUrl ?? null, now)

      db.prepare(
        `INSERT INTO tenant_settings (tenant_id, secondary_color, timezone, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(tenantId, '#0f172a', 'America/Sao_Paulo', 'BRL', now, now)

      db.prepare(
        `INSERT INTO booking_rules (tenant_id, min_notice_minutes, max_future_days, slot_step_minutes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(tenantId, 60, 60, 30, now, now)

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

    // Hostinger Integration (Removed as per request)
    // The previous automation logic was here. Now we just proceed.
    // If we need to re-enable, we can uncomment or restore the logic.
    /*
    let hostingerLogs: string[] = []
    try {
        const hToken = (db.prepare("SELECT value FROM platform_settings WHERE key = 'hostinger_api_token'").get() as { value: string } | undefined)?.value
        
        if (hToken) {
            console.log(`[Hostinger] Triggering subdomain creation for ${body.slug}`)
            const result = await createHostingerSubdomain(body.slug, hToken)
            hostingerLogs = result.logs
        }
    } catch (err) {
        console.error(`[Hostinger] Error: ${err}`)
    }
    */

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
      }
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
                 t.status,
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
                 ,(
                   SELECT s.status
                   FROM appmax_subscriptions s
                   WHERE s.tenant_id = t.id
                   ORDER BY s.updated_at DESC, s.created_at DESC
                   LIMIT 1
                 ) as subscriptionStatus
                 ,(
                   SELECT s.current_period_end
                   FROM appmax_subscriptions s
                   WHERE s.tenant_id = t.id
                   ORDER BY s.updated_at DESC, s.created_at DESC
                   LIMIT 1
                 ) as subscriptionPeriodEnd
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
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl, status, created_at as createdAt
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
        status: z.enum(['ACTIVE', 'SUSPENDED', 'DISABLED']).optional(),
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
    if (typeof body.status === 'string') updates.push({ sql: 'status = ?', params: [body.status] })

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
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl, status, created_at as createdAt
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

    const tx = db.transaction(() => {
        // Explicitly delete appointments first because of ON DELETE RESTRICT constraints
        db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(tenantId)
        console.log(`[DeleteTenant] Deleted appointments for tenant ${tenantId}`)
        
        // Now delete the tenant - CASCADE will handle other tables
        db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId)
        console.log(`[DeleteTenant] Deleted tenant ${tenantId}`)
    })
    
    tx()
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/integrations', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const rows = db.prepare('SELECT key, value FROM platform_settings').all() as Array<{
      key: string
      value: string
    }>
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value
    res.json({ settings })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/integrations', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const body = z.record(z.string()).parse(req.body ?? {})
    const now = new Date().toISOString()
    
    const stmt = db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)

    const tx = db.transaction(() => {
      for (const [k, v] of Object.entries(body)) {
        stmt.run(k, v, now)
      }
    })
    tx()

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/test-mode', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const body = z.object({ enabled: z.boolean() }).parse(req.body)
    const now = new Date().toISOString()
    
    db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES ('test_mode', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(String(body.enabled), now)

    res.json({ ok: true, enabled: body.enabled })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/notifications', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const limit = 20
    const events = db.prepare(`
      SELECT id, event_type as eventType, payload_json as payload, received_at as receivedAt
      FROM appmax_events
      WHERE event_type IN ('payment_approved', 'order_created', 'OrderCreated', 'PaymentApproved')
      ORDER BY received_at DESC
      LIMIT ?
    `).all(limit) as Array<{ id: string; eventType: string; payload: string; receivedAt: string }>

    const notifications = events.map(e => {
      let data: any = {}
      try {
        data = JSON.parse(e.payload)
      } catch {
        data = {}
      }
      
      const customerName = data.customer?.firstname ? `${data.customer.firstname} ${data.customer.lastname || ''}` : 'Cliente'
      const total = data.total ? (Number(data.total) / 100).toFixed(2) : '0.00'

      return {
        id: e.id,
        title: e.eventType === 'payment_approved' || e.eventType === 'PaymentApproved' ? 'Pagamento Aprovado' : 'Novo Pedido',
        desc: `${customerName} - R$ ${total}`,
        time: e.receivedAt,
        type: e.eventType
      }
    })

    res.json({ notifications })
  } catch (err) {
    next(err)
  }
})

app.get('/api/dev/backup/export', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const dbPath = path.resolve(env.DATABASE_PATH)
    res.download(dbPath, 'lash-saas-backup.db', (err) => {
        if (err) {
            console.error('Download error:', err)
            if (!res.headersSent) {
                res.status(500).send('Erro ao exportar banco de dados')
            }
        }
    })
  } catch (err) {
    next(err)
  }
})

app.post('/api/dev/backup/import', requireDevHost, requireRole('DEV'), (req, res, next) => {
  try {
    const body = z.object({
        fileData: z.string().min(1) // base64
    }).parse(req.body)

    const dbPath = path.resolve(env.DATABASE_PATH)
    const backupPath = `${dbPath}.bak`
    
    // Backup current
    try {
        const fs = require('node:fs')
        if (fs.existsSync(dbPath)) {
            fs.copyFileSync(dbPath, backupPath)
        }
        
        // Write new
        const buffer = Buffer.from(body.fileData, 'base64')
        fs.writeFileSync(dbPath, buffer)
        
        // Re-open DB connection (optional, but good practice if better-sqlite3 caches handles)
        // Since we are using a singleton getDb(), we might need to restart the process to be 100% safe,
        // or just rely on WAL mode handling it. For SQLite, replacing the file while open is risky.
        // SAFE APPROACH: We should ideally close the DB first.
        // However, better-sqlite3 holds a handle. 
        // For this simple implementation, we will just write. If it fails, we have the backup.
        // Ideally, user should restart the server after import.
        
        console.log('[Backup] Database imported successfully')
        res.json({ ok: true, message: 'Banco de dados importado. Reinicie o servidor se notar anomalias.' })
    } catch (e) {
        console.error('[Backup] Import failed:', e)
        // Try restore
        try {
            const fs = require('node:fs')
            if (fs.existsSync(backupPath)) {
                fs.copyFileSync(backupPath, dbPath)
            }
        } catch (restoreErr) {
            console.error('[Backup] Restore failed:', restoreErr)
        }
        throw badRequest('Falha ao importar banco de dados')
    }
  } catch (err) {
    next(err)
  }
})

app.post('/api/webhooks/appmax', async (req, res, next) => {
  try {
    const body = req.body
    const event = body.event || body.type || 'unknown'
    const id = randomUUID()
    const now = new Date().toISOString()

    // Log event
    db.prepare(`
      INSERT INTO appmax_events (id, event_type, payload_json, received_at)
      VALUES (?, ?, ?, ?)
    `).run(id, event, JSON.stringify(body), now)

    // Process subscription activation
    if (event === 'payment_approved' || event === 'PaymentApproved' || event === 'order_created') {
      const data = body.data || body
      const customerEmail = data.customer?.email
      
      if (customerEmail) {
        // Find tenant by admin email
        const user = db.prepare(`SELECT tenant_id FROM users WHERE email = ? AND role = 'ADMIN'`).get(customerEmail) as { tenant_id: string } | undefined
        
        if (user && user.tenant_id) {
            const subId = randomUUID()
            // Upsert subscription status
            // Check if exists first to decide insert or update
            const existing = db.prepare(`SELECT id FROM appmax_subscriptions WHERE tenant_id = ?`).get(user.tenant_id)
            
            if (existing) {
                db.prepare(`UPDATE appmax_subscriptions SET status = 'ACTIVE', updated_at = ? WHERE tenant_id = ?`).run(now, user.tenant_id)
            } else {
                db.prepare(`INSERT INTO appmax_subscriptions (id, tenant_id, status, created_at, updated_at) VALUES (?, ?, 'ACTIVE', ?, ?)`).run(subId, user.tenant_id, now, now)
            }
            console.log(`[Appmax] Subscription activated for tenant ${user.tenant_id} via email ${customerEmail}`)
        }
      }
    }

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// Test Mode: Simulate Payment
app.post('/api/admin/subscription/test-pay', requireRole('ADMIN'), (req, res, next) => {
    try {
        if (!req.sessionUser?.tenantId) return next(badRequest('Tenant inválido'))
        
        const tenantId = req.sessionUser.tenantId
        const now = new Date().toISOString()
        const subId = randomUUID()
        
        const existing = db.prepare(`SELECT id FROM appmax_subscriptions WHERE tenant_id = ?`).get(tenantId)
        
        if (existing) {
            db.prepare(`UPDATE appmax_subscriptions SET status = 'ACTIVE', updated_at = ? WHERE tenant_id = ?`).run(now, tenantId)
        } else {
            db.prepare(`INSERT INTO appmax_subscriptions (id, tenant_id, status, created_at, updated_at) VALUES (?, ?, 'ACTIVE', ?, ?)`).run(subId, tenantId, now, now)
        }
        
        // Also log a fake event for notifications
        const eventId = randomUUID()
        const payload = JSON.stringify({
            event: 'payment_approved',
            total: 9700,
            customer: {
                firstname: 'Test',
                lastname: 'User',
                email: 'test@example.com'
            }
        })
        db.prepare(`INSERT INTO appmax_events (id, event_type, payload_json, received_at) VALUES (?, ?, ?, ?)`).run(eventId, 'payment_approved', payload, now)

        res.json({ ok: true, status: 'ACTIVE' })
    } catch (err) {
        next(err)
    }
})

// Checkout URL
app.get('/api/admin/subscription/checkout-url', requireRole('ADMIN'), (req, res, next) => {
    try {
        // Here you would generate a real checkout link with user data
        // For now, return a placeholder or config value
        res.json({ url: 'https://appmax.com.br/checkout/example' })
    } catch (err) {
        next(err)
    }
})

// Middleware for admin routes - Check Subscription
app.use('/api/admin', requireActiveSubscription)

app.post('/api/webhooks/evolution', async (req, res, next) => {
  try {
    // Basic evolution webhook handler - just log for now
    console.log('Evolution Webhook:', req.body)
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
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
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
        coverUrl: z.string().max(350_000).optional(),
      })
      .parse(req.body)

    const now = new Date().toISOString()
    const id = randomUUID()
    db.prepare(
      `INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, cover_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, tenantId, body.name, body.durationMinutes, body.priceCents, body.coverUrl ?? null, now)

    const service = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
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

app.patch('/api/admin/services/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const body = z
      .object({
        name: z.string().min(2).optional(),
        durationMinutes: z.number().int().positive().optional(),
        priceCents: z.number().int().nonnegative().optional(),
        coverUrl: z.string().max(350_000).nullable().optional(),
      })
      .parse(req.body)

    const row = db
      .prepare('SELECT id FROM services WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as { id: string } | undefined
    if (!row) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.name === 'string') updates.push({ sql: 'name = ?', params: [body.name] })
    if (typeof body.durationMinutes === 'number')
      updates.push({ sql: 'duration_minutes = ?', params: [body.durationMinutes] })
    if (typeof body.priceCents === 'number') updates.push({ sql: 'price_cents = ?', params: [body.priceCents] })
    if ('coverUrl' in body) {
      const nextCover = body.coverUrl === null ? null : (body.coverUrl ?? '').trim()
      updates.push({ sql: 'cover_url = ?', params: [nextCover ? nextCover : null] })
    }

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE services SET ${setSql} WHERE id = ? AND tenant_id = ?`).run(...params, id, tenantId)

    const service = db
      .prepare(
        `
          SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
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

app.delete('/api/admin/services/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const r = db.prepare('DELETE FROM services WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    if (r.changes === 0) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/appointments', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const q = z
      .object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        limit: z
          .string()
          .regex(/^\d+$/)
          .transform((v) => Number(v))
          .pipe(z.number().int().min(1).max(2000))
          .optional(),
      })
      .parse({
        start: typeof req.query.start === 'string' ? req.query.start : undefined,
        end: typeof req.query.end === 'string' ? req.query.end : undefined,
        limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      })

    const where: string[] = [`a.tenant_id = ?`]
    const params: unknown[] = [tenantId]
    if (q.start) {
      where.push(`a.starts_at >= ?`)
      params.push(q.start)
    }
    if (q.end) {
      where.push(`a.starts_at < ?`)
      params.push(q.end)
    }

    const limit = q.limit ?? 800
    const appointments = db
      .prepare(
        `
          SELECT a.id,
                 a.service_id as serviceId,
                 a.starts_at as startsAt,
                 a.ends_at as endsAt,
                 a.status,
                 u.email as clientEmail,
                 c.name as clientName,
                 c.phone as clientPhone,
                 s.name as serviceName,
                 s.price_cents as priceCents
          FROM appointments a
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          JOIN services s ON s.id = a.service_id
          WHERE ${where.join(' AND ')}
          ORDER BY a.starts_at ASC
          LIMIT ${limit}
        `,
      )
      .all(...params)
    res.json({ appointments })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/appointments', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        clientName: z.string().min(2),
        clientPhone: z.string().min(8).optional(),
        serviceId: z.string().uuid(),
        startsAt: z.string().datetime(),
        status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
      })
      .parse(req.body)

    const service = db
      .prepare(
        `
          SELECT id, duration_minutes as durationMinutes
          FROM services
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(body.serviceId, tenantId) as { id: string; durationMinutes: number } | undefined
    if (!service) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

    const now = new Date().toISOString()
    const startsAt = new Date(body.startsAt)
    if (Number.isNaN(startsAt.getTime())) throw badRequest('Data inválida', 'INVALID_DATE')
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)

    const existingClient = body.clientPhone
      ? (db
          .prepare(
            `
              SELECT c.user_id as userId
              FROM clients c
              WHERE c.tenant_id = ? AND c.phone = ?
              LIMIT 1
            `,
          )
          .get(tenantId, body.clientPhone.trim()) as { userId: string } | undefined)
      : undefined

    let clientUserId = existingClient?.userId ?? null
    const newClient = clientUserId
      ? null
      : {
          userId: randomUUID(),
          clientId: randomUUID(),
          email: `client+${randomUUID()}@lashspace.local`,
          passwordHash: await hashPassword(randomUUID()),
        }

    const appointmentId = randomUUID()

    const tx = db.transaction(() => {
      if (!clientUserId) {
        if (!newClient) throw new Error('Falha ao criar cliente')
        clientUserId = newClient.userId
        db.prepare(
          `INSERT INTO users (id, tenant_id, email, password_hash, role, created_at)
           VALUES (?, ?, ?, ?, 'CLIENT', ?)`
        ).run(newClient.userId, tenantId, newClient.email, newClient.passwordHash, now)

        db.prepare(
          `INSERT INTO clients (id, tenant_id, user_id, name, phone, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          newClient.clientId,
          tenantId,
          newClient.userId,
          body.clientName.trim(),
          body.clientPhone?.trim() || null,
          now,
        )
      }

      db.prepare(
        `
          INSERT INTO appointments (id, tenant_id, service_id, client_user_id, starts_at, ends_at, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        appointmentId,
        tenantId,
        body.serviceId,
        clientUserId,
        startsAt.toISOString(),
        endsAt.toISOString(),
        body.status ?? 'CONFIRMED',
        now,
      )
    })

    tx()

    const appointment = db
      .prepare(
        `
          SELECT a.id,
                 a.service_id as serviceId,
                 a.starts_at as startsAt,
                 a.ends_at as endsAt,
                 a.status,
                 u.email as clientEmail,
                 c.name as clientName,
                 c.phone as clientPhone,
                 s.name as serviceName,
                 s.price_cents as priceCents
          FROM appointments a
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          JOIN services s ON s.id = a.service_id
          WHERE a.id = ? AND a.tenant_id = ?
        `,
      )
      .get(appointmentId, tenantId)

    res.json({ appointment })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/appointments/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const body = z
      .object({
        status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']),
      })
      .parse(req.body)

    const row = db
      .prepare('SELECT id FROM appointments WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as { id: string } | undefined
    if (!row) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))

    db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(body.status, id)

    const appointment = db
      .prepare(
        `
          SELECT a.id,
                 a.service_id as serviceId,
                 a.starts_at as startsAt,
                 a.ends_at as endsAt,
                 a.status,
                 u.email as clientEmail,
                 c.name as clientName,
                 c.phone as clientPhone,
                 s.name as serviceName,
                 s.price_cents as priceCents
          FROM appointments a
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          JOIN services s ON s.id = a.service_id
          WHERE a.id = ?
        `,
      )
      .get(id)

    res.json({ appointment })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/appointments/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const r = db.prepare('DELETE FROM appointments WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    if (r.changes === 0) return next(notFound('Agendamento não encontrado', 'APPOINTMENT_NOT_FOUND'))

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/business-hours', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const businessHours = db
      .prepare(
        `
          SELECT id, weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE tenant_id = ?
          ORDER BY weekday ASC, start_minute ASC
        `,
      )
      .all(tenantId)

    res.json({ businessHours })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/business-hours', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
      })
      .parse(req.body)

    if (body.endMinute <= body.startMinute) {
      return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))
    }

    const overlap = db
      .prepare(
        `
          SELECT id
          FROM business_hours
          WHERE tenant_id = ?
            AND weekday = ?
            AND NOT (end_minute <= ? OR start_minute >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, body.weekday, body.startMinute, body.endMinute) as { id: string } | undefined

    if (overlap) return next(badRequest('Horário sobreposto', 'OVERLAPPING_RANGE'))

    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `
        INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(id, tenantId, body.weekday, body.startMinute, body.endMinute, now)

    const businessHour = db
      .prepare(
        `
          SELECT id, weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId)

    res.json({ businessHour })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/business-hours/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const body = z
      .object({
        weekday: z.number().int().min(0).max(6).optional(),
        startMinute: z.number().int().min(0).max(1440).optional(),
        endMinute: z.number().int().min(0).max(1440).optional(),
      })
      .parse(req.body)

    const row = db
      .prepare(
        `
          SELECT weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId) as { weekday: number; startMinute: number; endMinute: number } | undefined

    if (!row) return next(notFound('Horário não encontrado', 'BUSINESS_HOUR_NOT_FOUND'))

    const nextWeekday = body.weekday ?? row.weekday
    const nextStart = body.startMinute ?? row.startMinute
    const nextEnd = body.endMinute ?? row.endMinute
    if (nextEnd <= nextStart) return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))

    const overlap = db
      .prepare(
        `
          SELECT id
          FROM business_hours
          WHERE tenant_id = ?
            AND weekday = ?
            AND id <> ?
            AND NOT (end_minute <= ? OR start_minute >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, nextWeekday, id, nextStart, nextEnd) as { id: string } | undefined

    if (overlap) return next(badRequest('Horário sobreposto', 'OVERLAPPING_RANGE'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.weekday === 'number') updates.push({ sql: 'weekday = ?', params: [body.weekday] })
    if (typeof body.startMinute === 'number') updates.push({ sql: 'start_minute = ?', params: [body.startMinute] })
    if (typeof body.endMinute === 'number') updates.push({ sql: 'end_minute = ?', params: [body.endMinute] })

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE business_hours SET ${setSql} WHERE id = ? AND tenant_id = ?`).run(...params, id, tenantId)

    const businessHour = db
      .prepare(
        `
          SELECT id, weekday, start_minute as startMinute, end_minute as endMinute
          FROM business_hours
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId)

    res.json({ businessHour })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/business-hours/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const r = db.prepare('DELETE FROM business_hours WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    if (r.changes === 0) return next(notFound('Horário não encontrado', 'BUSINESS_HOUR_NOT_FOUND'))

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

app.get('/api/admin/time-off', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const q = z
      .object({
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        limit: z
          .string()
          .regex(/^\d+$/)
          .transform((v) => Number(v))
          .pipe(z.number().int().min(1).max(2000))
          .optional(),
      })
      .parse({
        start: typeof req.query.start === 'string' ? req.query.start : undefined,
        end: typeof req.query.end === 'string' ? req.query.end : undefined,
        limit: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      })

    const where: string[] = ['tenant_id = ?']
    const params: unknown[] = [tenantId]
    if (q.start) {
      where.push('ends_at > ?')
      params.push(q.start)
    }
    if (q.end) {
      where.push('starts_at < ?')
      params.push(q.end)
    }

    const limit = q.limit ?? 500
    const timeOff = db
      .prepare(
        `
          SELECT id, starts_at as startsAt, ends_at as endsAt, reason, created_at as createdAt
          FROM time_off
          WHERE ${where.join(' AND ')}
          ORDER BY starts_at ASC
          LIMIT ${limit}
        `,
      )
      .all(...params) as Array<{ id: string; startsAt: string; endsAt: string; reason: string | null; createdAt: string }>

    res.json({ timeOff })
  } catch (err) {
    next(err)
  }
})

app.post('/api/admin/time-off', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        reason: z.string().max(200).optional().nullable(),
      })
      .parse(req.body)

    const startsAt = new Date(body.startsAt)
    const endsAt = new Date(body.endsAt)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return next(badRequest('Data inválida', 'INVALID_DATE'))
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))
    }

    const overlapExisting = db
      .prepare(
        `
          SELECT id
          FROM time_off
          WHERE tenant_id = ?
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, startsAt.toISOString(), endsAt.toISOString()) as { id: string } | undefined

    if (overlapExisting) return next(badRequest('Bloqueio sobreposto', 'OVERLAPPING_TIME_OFF'))

    const overlapAppt = db
      .prepare(
        `
          SELECT id
          FROM appointments
          WHERE tenant_id = ?
            AND status IN ('CONFIRMED', 'PENDING')
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, startsAt.toISOString(), endsAt.toISOString()) as { id: string } | undefined

    if (overlapAppt) return next(badRequest('Existe agendamento nesse intervalo', 'TIME_OFF_CONFLICT_APPOINTMENT'))

    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      `
        INSERT INTO time_off (id, tenant_id, starts_at, ends_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(id, tenantId, startsAt.toISOString(), endsAt.toISOString(), body.reason ? body.reason.trim() : null, now)

    const timeOff = db
      .prepare(
        `
          SELECT id, starts_at as startsAt, ends_at as endsAt, reason, created_at as createdAt
          FROM time_off
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId)

    res.json({ timeOff })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/time-off/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const body = z
      .object({
        startsAt: z.string().datetime().optional(),
        endsAt: z.string().datetime().optional(),
        reason: z.string().max(200).optional().nullable(),
      })
      .parse(req.body)

    const row = db
      .prepare(
        `
          SELECT starts_at as startsAt, ends_at as endsAt, reason
          FROM time_off
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId) as { startsAt: string; endsAt: string; reason: string | null } | undefined

    if (!row) return next(notFound('Bloqueio não encontrado', 'TIME_OFF_NOT_FOUND'))

    const nextStartsAt = body.startsAt ?? row.startsAt
    const nextEndsAt = body.endsAt ?? row.endsAt
    const startsAt = new Date(nextStartsAt)
    const endsAt = new Date(nextEndsAt)
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return next(badRequest('Data inválida', 'INVALID_DATE'))
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return next(badRequest('Intervalo inválido', 'INVALID_RANGE'))
    }

    const overlapExisting = db
      .prepare(
        `
          SELECT id
          FROM time_off
          WHERE tenant_id = ?
            AND id <> ?
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, id, startsAt.toISOString(), endsAt.toISOString()) as { id: string } | undefined

    if (overlapExisting) return next(badRequest('Bloqueio sobreposto', 'OVERLAPPING_TIME_OFF'))

    const overlapAppt = db
      .prepare(
        `
          SELECT id
          FROM appointments
          WHERE tenant_id = ?
            AND status IN ('CONFIRMED', 'PENDING')
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, startsAt.toISOString(), endsAt.toISOString()) as { id: string } | undefined

    if (overlapAppt) return next(badRequest('Existe agendamento nesse intervalo', 'TIME_OFF_CONFLICT_APPOINTMENT'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.startsAt === 'string') updates.push({ sql: 'starts_at = ?', params: [startsAt.toISOString()] })
    if (typeof body.endsAt === 'string') updates.push({ sql: 'ends_at = ?', params: [endsAt.toISOString()] })
    if ('reason' in body) updates.push({ sql: 'reason = ?', params: [body.reason ? body.reason.trim() : null] })

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE time_off SET ${setSql} WHERE id = ? AND tenant_id = ?`).run(...params, id, tenantId)

    const timeOff = db
      .prepare(
        `
          SELECT id, starts_at as startsAt, ends_at as endsAt, reason, created_at as createdAt
          FROM time_off
          WHERE id = ? AND tenant_id = ?
        `,
      )
      .get(id, tenantId)

    res.json({ timeOff })
  } catch (err) {
    next(err)
  }
})

app.delete('/api/admin/time-off/:id', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const id = z.string().uuid().parse(req.params.id)

    const r = db.prepare('DELETE FROM time_off WHERE id = ? AND tenant_id = ?').run(id, tenantId)
    if (r.changes === 0) return next(notFound('Bloqueio não encontrado', 'TIME_OFF_NOT_FOUND'))

    res.json({ ok: true })
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

    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const newClients = db
      .prepare(
        `
          SELECT COUNT(1) as newClientsCount
          FROM clients
          WHERE tenant_id = ?
            AND created_at >= ?
        `,
      )
      .get(tenantId, thirtyDaysAgo.toISOString()) as { newClientsCount: number } | undefined

    const pending = db
      .prepare(
        `
          SELECT COUNT(1) as pendingAppointmentsCount
          FROM appointments
          WHERE tenant_id = ?
            AND status = 'PENDING'
            AND starts_at >= ?
        `,
      )
      .get(tenantId, now.toISOString()) as { pendingAppointmentsCount: number } | undefined

    const recentActivity = db
      .prepare(
        `
          SELECT kind,
                 at,
                 clientName,
                 clientEmail,
                 serviceName,
                 priceCents,
                 amountCents,
                 note
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
            WHERE t.tenant_id = ?
              AND t.type = 'EXPENSE'
          )
          ORDER BY at DESC
          LIMIT 12
        `,
      )
      .all(tenantId, tenantId) as Array<{
      kind: string
      at: string
      clientName: string | null
      clientEmail: string | null
      serviceName: string | null
      priceCents: number | null
      amountCents: number | null
      note: string | null
    }>

    res.json({
      today: {
        appointmentsCount: today?.appointmentsCount ?? 0,
        expectedRevenueCents: today?.expectedRevenueCents ?? 0,
      },
      newClients30d: newClients?.newClientsCount ?? 0,
      pendingAppointments: pending?.pendingAppointmentsCount ?? 0,
      upcoming,
      recentActivity,
    })
  } catch (err) {
    next(err)
  }
})

app.patch('/api/admin/tenant', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        name: z.string().min(2).optional(),
        primaryColor: z.string().min(4).optional(),
        logoUrl: z
          .string()
          .max(450_000)
          .nullable()
          .optional()
          .refine(
            (v) => {
              if (typeof v === 'undefined') return true
              if (v === null) return true
              if (typeof v !== 'string') return false
              const s = v.trim()
              if (!s) return true
              return s.startsWith('data:image/') || /^https?:\/\//.test(s)
            },
            { message: 'Logo inválida' },
          ),
      })
      .parse(req.body)

    const row = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId) as { id: string } | undefined
    if (!row) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

    const updates: Array<{ sql: string; params: unknown[] }> = []
    if (typeof body.name === 'string') updates.push({ sql: 'name = ?', params: [body.name] })
    if (typeof body.primaryColor === 'string')
      updates.push({ sql: 'primary_color = ?', params: [body.primaryColor] })
    if ('logoUrl' in body) {
      const nextLogo = body.logoUrl === null ? null : (body.logoUrl ?? '').trim()
      updates.push({ sql: 'logo_url = ?', params: [nextLogo ? nextLogo : null] })
    }

    if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

    const setSql = updates.map((u) => u.sql).join(', ')
    const params = updates.flatMap((u) => u.params)
    db.prepare(`UPDATE tenants SET ${setSql} WHERE id = ?`).run(...params, tenantId)

    const tenant = db
      .prepare(
        `
          SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl
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

    const now = new Date()
    const monthStart = new Date(now)
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const sixMonthsStart = new Date(monthStart)
    sixMonthsStart.setMonth(sixMonthsStart.getMonth() - 5)

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

    const lastEntries = db
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
            AND a.status = 'CONFIRMED'
          ORDER BY a.starts_at DESC
          LIMIT 100
        `,
      )
      .all(tenantId) as Array<{
      id: string
      startsAt: string
      status: string
      serviceName: string
      priceCents: number
      clientEmail: string
      clientName: string | null
    }>

    const entriesByMonth = db
      .prepare(
        `
          SELECT substr(a.starts_at, 1, 7) as ym,
                 COALESCE(SUM(s.price_cents), 0) as entriesCents
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.status = 'CONFIRMED'
            AND a.starts_at >= ?
          GROUP BY ym
          ORDER BY ym ASC
        `,
      )
      .all(tenantId, sixMonthsStart.toISOString()) as Array<{ ym: string; entriesCents: number }>

    const expensesByMonth = db
      .prepare(
        `
          SELECT substr(created_at, 1, 7) as ym,
                 COALESCE(SUM(amount_cents), 0) as expensesCents
          FROM cash_transactions
          WHERE tenant_id = ?
            AND type = 'EXPENSE'
            AND created_at >= ?
          GROUP BY ym
          ORDER BY ym ASC
        `,
      )
      .all(tenantId, sixMonthsStart.toISOString()) as Array<{ ym: string; expensesCents: number }>

    const entriesByMonthMap = new Map(entriesByMonth.map((r) => [r.ym, r.entriesCents]))
    const expensesByMonthMap = new Map(expensesByMonth.map((r) => [r.ym, r.expensesCents]))
    const monthly = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(sixMonthsStart)
      d.setMonth(sixMonthsStart.getMonth() + i)
      const ym = d.toISOString().slice(0, 7)
      return {
        ym,
        entriesCents: entriesByMonthMap.get(ym) ?? 0,
        expensesCents: expensesByMonthMap.get(ym) ?? 0,
      }
    })

    const entriesCents = entries?.entriesCents ?? 0
    const expensesCents = expenses?.expensesCents ?? 0

    res.json({
      totals: {
        entriesCents,
        expensesCents,
        profitCents: entriesCents - expensesCents,
      },
      lastExpenses,
      lastEntries,
      monthly,
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

const defaultWhatsappSettings = {
  remindersEnabled: true,
  reminderOffsetHours: 24,
  reminderMessage:
    'Oi {{nome}}, tudo bem? Só passando para lembrar do seu horário amanhã às {{hora}} aqui no {{espaco}}. Até lá!',
  promoEnabled: false,
  promoMessage:
    'Oi {{nome}}, temos uma novidade especial para você esta semana no {{espaco}}. Responda esta mensagem para saber mais.',
}

const requireWhatsappSettings = (tenantId: string) => {
  const row = db
    .prepare(
      `
        SELECT tenant_id as tenantId,
               reminders_enabled as remindersEnabled,
               reminder_offset_hours as reminderOffsetHours,
               reminder_message as reminderMessage,
               promo_enabled as promoEnabled,
               promo_message as promoMessage,
               updated_at as updatedAt
        FROM whatsapp_settings
        WHERE tenant_id = ?
        LIMIT 1
      `,
    )
    .get(tenantId) as
    | {
        tenantId: string
        remindersEnabled: number
        reminderOffsetHours: number
        reminderMessage: string
        promoEnabled: number
        promoMessage: string
        updatedAt: string
      }
    | undefined

  if (!row) return null
  return {
    remindersEnabled: Boolean(row.remindersEnabled),
    reminderOffsetHours: row.reminderOffsetHours,
    reminderMessage: row.reminderMessage,
    promoEnabled: Boolean(row.promoEnabled),
    promoMessage: row.promoMessage,
    updatedAt: row.updatedAt,
  }
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

app.get('/api/admin/whatsapp/settings', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
    const settings = requireWhatsappSettings(tenantId)
    res.json({ settings: settings ?? defaultWhatsappSettings })
  } catch (err) {
    next(err)
  }
})

app.put('/api/admin/whatsapp/settings', requireRole('ADMIN'), (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        remindersEnabled: z.boolean().optional(),
        reminderOffsetHours: z.number().int().min(1).max(168).optional(),
        reminderMessage: z
          .string()
          .max(2000)
          .transform((v) => v.trim())
          .pipe(z.string().min(1))
          .optional(),
        promoEnabled: z.boolean().optional(),
        promoMessage: z
          .string()
          .max(2000)
          .transform((v) => v.trim())
          .pipe(z.string().min(1))
          .optional(),
      })
      .parse(req.body)

    const existing = requireWhatsappSettings(tenantId) ?? defaultWhatsappSettings

    const remindersEnabled = body.remindersEnabled ?? existing.remindersEnabled
    const reminderOffsetHours = body.reminderOffsetHours ?? existing.reminderOffsetHours
    const reminderMessage = body.reminderMessage ?? existing.reminderMessage
    const promoEnabled = body.promoEnabled ?? existing.promoEnabled
    const promoMessage = body.promoMessage ?? existing.promoMessage

    const now = new Date().toISOString()
    const row = db.prepare('SELECT tenant_id as tenantId FROM whatsapp_settings WHERE tenant_id = ?').get(tenantId) as
      | { tenantId: string }
      | undefined

    if (row) {
      db.prepare(
        `
          UPDATE whatsapp_settings
          SET reminders_enabled = ?,
              reminder_offset_hours = ?,
              reminder_message = ?,
              promo_enabled = ?,
              promo_message = ?,
              updated_at = ?
          WHERE tenant_id = ?
        `,
      ).run(
        remindersEnabled ? 1 : 0,
        reminderOffsetHours,
        reminderMessage,
        promoEnabled ? 1 : 0,
        promoMessage,
        now,
        tenantId,
      )
      res.json({ ok: true })
      return
    }

    db.prepare(
      `
        INSERT INTO whatsapp_settings (
          tenant_id,
          reminders_enabled,
          reminder_offset_hours,
          reminder_message,
          promo_enabled,
          promo_message,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      tenantId,
      remindersEnabled ? 1 : 0,
      reminderOffsetHours,
      reminderMessage,
      promoEnabled ? 1 : 0,
      promoMessage,
      now,
      now,
    )
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

app.post('/api/admin/whatsapp/send', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const tenantId = req.sessionUser?.tenantId
    if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

    const body = z
      .object({
        toPhone: z.string().min(6).max(40),
        text: z.string().min(1).max(2000),
      })
      .parse(req.body)

    const row = requireWhatsappConfig(tenantId)
    if (!row?.baseUrl || !row.apiKey || !row.instanceName) {
      return next(badRequest('WhatsApp não configurado', 'WHATSAPP_NOT_CONFIGURED'))
    }

    const number = body.toPhone.trim()
    const url = `${normalizeBaseUrl(row.baseUrl)}/message/sendText/${encodeURIComponent(row.instanceName)}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: row.apiKey },
      body: JSON.stringify({ number, text: body.text, textMessage: body.text }),
    })

    if (!resp.ok) {
      return next(badRequest('Falha ao enviar mensagem', 'WHATSAPP_SEND_FAILED'))
    }

    res.json({ ok: true })
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

    const timeOffOverlap = db
      .prepare(
        `
          SELECT id FROM time_off
          WHERE tenant_id = ?
            AND NOT (ends_at <= ? OR starts_at >= ?)
          LIMIT 1
        `,
      )
      .get(tenantId, startsAt.toISOString(), endsAt.toISOString())

    if (timeOffOverlap) throw badRequest('Horário indisponível', 'SLOT_UNAVAILABLE')

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
    // Basic catch-all to serve index.html for all non-API routes
    // React Router will handle the routing logic (redirects, etc) on the client side
    res.sendFile(path.join(clientDir, 'index.html'))
  })
}

app.use(handleError)

app.listen(env.PORT, () => {
  console.log(`server listening on :${env.PORT}`)
})
