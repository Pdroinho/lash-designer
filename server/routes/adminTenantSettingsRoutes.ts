import { brandColumns, logoLayoutSchema, logoSizeSchema } from '../brandPresentation.js'
import Database from 'better-sqlite3'
import { randomBytes, randomUUID } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import {
  assertDomainIsNotReserved,
  normalizeCustomDomain,
  type DomainVerificationConfig,
} from '../domains.js'
import { badRequest, notFound } from '../http.js'
import type { DomainVerificationOutcome, TenantDomainRow } from '../domainVerificationRuntime.js'

export type { TenantDomainRow } from '../domainVerificationRuntime.js'

type AdminTenantSettingsRouterOptions = {
  db: Database.Database
  domainVerifyLimiter: RequestHandler
  domainVerificationConfig: DomainVerificationConfig
  getDomainRow: (id: string, tenantId?: string) => TenantDomainRow | undefined
  verifyDomainRow: (row: TenantDomainRow) => Promise<DomainVerificationOutcome>
  domainSetupPayload: (row: TenantDomainRow) => unknown
}

export function createAdminTenantSettingsRouter(options: AdminTenantSettingsRouterOptions) {
  const {
    db,
    domainVerifyLimiter,
    domainVerificationConfig,
    getDomainRow,
    verifyDomainRow,
    domainSetupPayload,
  } = options
  const router = Router()

  router.patch('/tenant', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        name: z.string().min(2).optional(),
        secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
        backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
        primaryColor: z.string().min(4).optional(),
        logoLayout: logoLayoutSchema.optional(),
        logoSize: logoSizeSchema.optional(),
        logoUrl: z.string().max(450_000).nullable().optional().refine((value) => {
          if (typeof value === 'undefined' || value === null) return true
          const normalized = value.trim()
          return !normalized || normalized.startsWith('data:image/') || /^https?:\/\//.test(normalized)
        }, { message: 'Logo inválida' }),
      }).parse(req.body)

      const row = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId)
      if (!row) return next(notFound('Tenant não encontrado', 'TENANT_NOT_FOUND'))

      const updates: Array<{ sql: string; params: unknown[] }> = []
      if (typeof body.name === 'string') updates.push({ sql: 'name = ?', params: [body.name] })
      if (typeof body.primaryColor === 'string') updates.push({ sql: 'primary_color = ?', params: [body.primaryColor] })
      if ('logoUrl' in body) {
        const nextLogo = body.logoUrl === null ? null : (body.logoUrl ?? '').trim()
        updates.push({ sql: 'logo_url = ?', params: [nextLogo || null] })
      }
      if (body.logoLayout !== undefined || body.logoSize !== undefined || body.secondaryColor !== undefined || body.backgroundColor !== undefined) {
        if (!brandColumns(db)) throw badRequest('Atualize o banco para personalizar a marca.', 'MIGRATION_REQUIRED')
        if (body.logoLayout !== undefined) updates.push({sql:'logo_layout = ?', params:[body.logoLayout]})
        if (body.logoSize !== undefined) updates.push({sql:'logo_size = ?', params:[body.logoSize]})
        if (body.secondaryColor !== undefined) updates.push({sql:'brand_secondary = ?', params:[body.secondaryColor]})
        if (body.backgroundColor !== undefined) updates.push({sql:'brand_background = ?', params:[body.backgroundColor]})
      }
      if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

      db.prepare(`UPDATE tenants SET ${updates.map(update => update.sql).join(', ')} WHERE id = ?`)
        .run(...updates.flatMap(update => update.params), tenantId)
      const tenant = db.prepare(`
        SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl${brandColumns(db)}
        FROM tenants
        WHERE id = ?
      `).get(tenantId)
      res.json({ tenant })
    } catch (err) {
      next(err)
    }
  })

  router.get('/domains', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const domains = db.prepare(`
        SELECT id, tenant_id AS tenantId, domain, status,
               verification_token AS verificationToken, created_at AS createdAt,
               last_checked_at AS lastCheckedAt, verified_at AS verifiedAt,
               verification_error AS verificationError, is_primary AS isPrimary
        FROM tenant_domains
        WHERE tenant_id = ?
        ORDER BY is_primary DESC, created_at DESC
      `).all(tenantId) as TenantDomainRow[]
      res.json({ domains: domains.map(domainSetupPayload) })
    } catch (err) {
      next(err)
    }
  })

  router.post('/domains', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const currentCount = (db.prepare('SELECT COUNT(1) as count FROM tenant_domains WHERE tenant_id = ?').get(tenantId) as { count: number }).count
      if (currentCount >= 5) return next(badRequest('Limite de 5 domínios por espaço atingido', 'DOMAIN_LIMIT_REACHED'))

      const body = z.object({ domain: z.string().min(1).max(253) }).parse(req.body)
      const domain = normalizeCustomDomain(body.domain)
      assertDomainIsNotReserved(domain, domainVerificationConfig)

      const id = randomUUID()
      const token = randomBytes(24).toString('hex')
      try {
        db.prepare(`
          INSERT INTO tenant_domains
            (id, tenant_id, domain, status, verification_token, verification_method, created_at, is_primary)
          VALUES (?, ?, ?, 'PENDING', ?, 'DNS_TXT', ?, 0)
        `).run(id, tenantId, domain, token, new Date().toISOString())
      } catch (err) {
        if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return next(badRequest('Domínio já cadastrado por outro espaço', 'DOMAIN_TAKEN'))
        }
        throw err
      }

      const row = getDomainRow(id, tenantId)
      if (!row) throw new Error('Falha ao carregar domínio criado')
      res.status(201).json({ domain: domainSetupPayload(row) })
    } catch (err) {
      next(err)
    }
  })

  router.post('/domains/:id/verify', domainVerifyLimiter, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const row = getDomainRow(id, tenantId)
      if (!row) return next(notFound('Domínio não encontrado', 'DOMAIN_NOT_FOUND'))

      const result = await verifyDomainRow(row)
      if (!result.row) throw new Error('Falha ao recarregar domínio')
      res.json({
        domain: domainSetupPayload(result.row),
        verification: {
          verified: result.verified,
          ownershipVerified: result.ownershipVerified,
          routingVerified: result.routingVerified,
          error: result.error,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/domains/:id/primary', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const row = getDomainRow(id, tenantId)
      if (!row) return next(notFound('Domínio não encontrado', 'DOMAIN_NOT_FOUND'))
      if (row.status !== 'ACTIVE') return next(badRequest('Verifique o domínio antes de torná-lo principal', 'DOMAIN_NOT_ACTIVE'))

      db.transaction(() => {
        db.prepare('UPDATE tenant_domains SET is_primary = 0 WHERE tenant_id = ?').run(tenantId)
        db.prepare('UPDATE tenant_domains SET is_primary = 1 WHERE id = ? AND tenant_id = ?').run(id, tenantId)
      })()

      const updated = getDomainRow(id, tenantId)
      if (!updated) throw new Error('Falha ao recarregar domínio')
      res.json({ domain: domainSetupPayload(updated) })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/domains/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const row = getDomainRow(id, tenantId)
      if (!row) return next(notFound('Domínio não encontrado', 'DOMAIN_NOT_FOUND'))
      db.prepare('DELETE FROM tenant_domains WHERE id = ? AND tenant_id = ?').run(id, tenantId)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
