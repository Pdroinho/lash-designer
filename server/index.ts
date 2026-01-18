import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
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

app.disable('x-powered-by')
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN ? [env.FRONTEND_ORIGIN] : true,
    credentials: true,
  }),
)
app.use(helmet())
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
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
        tenantSlug: z.string().min(1),
        name: z.string().min(2),
        phone: z.string().optional(),
        email: z.string().email(),
        password: z.string().min(8),
      })
      .parse(req.body)

    const slug = body.tenantSlug.trim().toLowerCase()
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

app.post('/api/dev/bootstrap', async (req, res, next) => {
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

app.post('/api/dev/tenants', requireRole('DEV'), async (req, res, next) => {
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

    const startsAt = new Date(body.startsAt)
    if (Number.isNaN(startsAt.getTime())) throw badRequest('Data inválida', 'INVALID_DATE')
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)

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
  app.get(/^(?!\/api).*$/, (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'))
  })
}

app.use(handleError)

app.listen(env.PORT, () => {
  console.log(`server listening on :${env.PORT}`)
})
