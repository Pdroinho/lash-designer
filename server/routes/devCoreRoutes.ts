import express, { type RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { env } from '../env.js'
import { badRequest, notFound, unauthorized } from '../http.js'
import { safeTimingEqual } from '../middleware/requestSecurity.js'
import { hashPassword } from '../security.js'
import { revokeSessionsForTenant } from '../session.js'

type DevCoreRouterOptions = {
  db: Database.Database
  requireDevHost: RequestHandler
  devBootstrapLimiter: RequestHandler
  assertTenantSlugIsAvailable: (slug: string) => void
  normalizeUserE164Phone: (raw: string) => string
}

export function createDevCoreRouter(options: DevCoreRouterOptions) {
  const { db, requireDevHost, devBootstrapLimiter, assertTenantSlugIsAvailable, normalizeUserE164Phone } = options
  const router = express.Router()

  router.post('/bootstrap', requireDevHost, devBootstrapLimiter, async (req, res, next) => {
    try {
      const allowDevBootstrap =
        (db.prepare(`SELECT COUNT(1) as n FROM users WHERE role = 'DEV'`).get() as { n: number })
          .n === 0
      if (!allowDevBootstrap) throw badRequest('Bootstrap DEV indisponível', 'BOOTSTRAP_DISABLED')

      const body = z
        .object({ email: z.string().email(), phone: z.string().min(8).max(40), password: z.string().min(8), bootstrapSecret: z.string().optional() })
        .parse(req.body)

      if (env.NODE_ENV === 'production') {
        const provided = body.bootstrapSecret?.trim() ?? ''
        if (!env.DEV_BOOTSTRAP_SECRET || !provided || !safeTimingEqual(provided, env.DEV_BOOTSTRAP_SECRET)) {
          throw unauthorized('Código de bootstrap inválido', 'INVALID_BOOTSTRAP_SECRET')
        }
      }

      const email = body.email.toLowerCase()
      const exists = db
        .prepare(`SELECT id FROM users WHERE email = ? AND tenant_id IS NULL LIMIT 1`)
        .get(email)
      if (exists) throw badRequest('E-mail já cadastrado', 'EMAIL_ALREADY_USED')

      const now = new Date().toISOString()
      const id = randomUUID()
      const passwordHash = await hashPassword(body.password)
      const phone = normalizeUserE164Phone(body.phone)
      db.prepare(
        `INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
         VALUES (?, NULL, ?, ?, ?, 'DEV', ?)`
      ).run(id, email, passwordHash, phone, now)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.get('/settings', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const row = db
        .prepare(`SELECT value FROM platform_settings WHERE key = 'dev_primary_color' LIMIT 1`)
        .get() as { value: string } | undefined
      res.json({ settings: row ? { dev_primary_color: row.value } : {} })
    } catch (err) {
      next(err)
    }
  })

  router.post('/settings', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const body = z
        .object({ dev_primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
        .strict()
        .parse(req.body)
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO platform_settings (key, value, updated_at)
        VALUES ('dev_primary_color', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(body.dev_primary_color.toLowerCase(), now)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.get('/users', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const users = db
        .prepare(`SELECT id, email, phone, created_at as createdAt FROM users WHERE role = 'DEV' ORDER BY created_at DESC`)
        .all()
      res.json({ users })
    } catch (err) {
      next(err)
    }
  })

  router.post('/users', requireDevHost, requireRole('DEV'), async (req, res, next) => {
    try {
      const body = z.object({ email: z.string().email(), phone: z.string().min(8).max(40), password: z.string().min(8) }).parse(req.body)
      const email = body.email.toLowerCase()
      
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
      if (exists) throw badRequest('E-mail já cadastrado', 'EMAIL_ALREADY_USED')

      const id = randomUUID()
      const passwordHash = await hashPassword(body.password)
      const phone = normalizeUserE164Phone(body.phone)
      const now = new Date().toISOString()

      db.prepare(
        `INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
         VALUES (?, NULL, ?, ?, ?, 'DEV', ?)`
      ).run(id, email, passwordHash, phone, now)

      res.json({ user: { id, email, phone, createdAt: now } })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/users/:id', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id)
      if (id === req.sessionUser?.id) throw badRequest('Não é possível excluir o próprio usuário', 'CANNOT_DELETE_SELF')

      db.prepare('DELETE FROM users WHERE id = ? AND role = \'DEV\'').run(id)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.post('/tenants', requireDevHost, requireRole('DEV'), async (req, res, next) => {
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
          adminPhone: z.string().min(8).max(40),
          adminPassword: z.string().min(8),
        })
        .parse(req.body)

      const slug = body.slug.trim().toLowerCase()
      assertTenantSlugIsAvailable(slug)
      const existsTenant = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)
      if (existsTenant) throw badRequest('Slug já existe', 'TENANT_SLUG_TAKEN')

      const adminEmail = body.adminEmail.toLowerCase()
      const adminPhone = normalizeUserE164Phone(body.adminPhone)
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
          `INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at)
           VALUES (?, ?, ?, ?, ?, 'ADMIN', ?)`
        ).run(adminId, tenantId, adminEmail, passwordHash, adminPhone, now)
      })

      tx()

      // O tenant está pronto para uso no domínio principal ou via proxy reverso.

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

  router.get('/tenants', requireDevHost, requireRole('DEV'), (req, res, next) => {
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
                     FROM subscriptions s
                     WHERE s.tenant_id = t.id
                     ORDER BY s.updated_at DESC, s.created_at DESC
                     LIMIT 1
                   ) as subscriptionStatus
                   ,(
                     SELECT s.current_period_end
                     FROM subscriptions s
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

  router.get('/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
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

  router.patch('/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
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
      if (typeof body.status === 'string') {
        updates.push({ sql: 'status = ?', params: [body.status] })
        updates.push({ sql: 'suspension_reason = ?', params: [body.status === 'SUSPENDED' ? 'MANUAL' : null] })
      }

      if (typeof body.slug === 'string') {
        const slug = body.slug.trim().toLowerCase()
        assertTenantSlugIsAvailable(slug)
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

  router.delete('/tenants/:tenantId', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const tenantId = z.string().uuid().parse(req.params.tenantId)
      const row = db.prepare('SELECT id, status FROM tenants WHERE id = ?').get(tenantId) as
        | { id: string; status: string }
        | undefined
      if (!row) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const now = new Date().toISOString()
      const tx = db.transaction(() => {
        db.prepare(`UPDATE tenants SET status = 'DISABLED' WHERE id = ?`).run(tenantId)
        revokeSessionsForTenant(db, tenantId)
        db.prepare(`
          UPDATE tenant_domains
          SET status = 'ERROR', is_primary = 0, last_checked_at = ?, verification_error = 'Espaço desativado pela plataforma.'
          WHERE tenant_id = ?
        `).run(now, tenantId)
      })
      tx()

      res.json({ ok: true, mode: 'disabled' })
    } catch (err) {
      next(err)
    }
  })

  router.post('/tenants/:tenantId/permanent-delete', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const tenantId = z.string().uuid().parse(req.params.tenantId)
      const body = z.object({ confirmation: z.string().trim().min(1), acknowledgeBackup: z.literal(true) }).parse(req.body)
      const tenant = db.prepare(`SELECT id, slug, name, status FROM tenants WHERE id = ?`).get(tenantId) as { id: string; slug: string; name: string; status: string } | undefined
      if (!tenant) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))
      if (tenant.status !== 'DISABLED') return next(badRequest('Desative o espaço antes da exclusão definitiva.', 'TENANT_MUST_BE_DISABLED'))
      const expected = `EXCLUIR ${tenant.slug}`
      if (body.confirmation !== expected) return next(badRequest(`Digite exatamente: ${expected}`, 'INVALID_CONFIRMATION'))
      const requestedBy = req.sessionUser?.id
      if (!requestedBy) return next(unauthorized())
      const now = new Date().toISOString()
      db.transaction(() => {
        db.prepare(`INSERT INTO tenant_deletion_audit (id, tenant_id, tenant_slug, tenant_name, requested_by_user_id, confirmation_text, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), tenant.id, tenant.slug, tenant.name, requestedBy, body.confirmation, now)
        db.prepare(`DELETE FROM tenants WHERE id = ?`).run(tenant.id)
      })()
      res.json({ ok: true, mode: 'permanent', deletedAt: now })
    } catch (err) { next(err) }
  })

  return router
}

