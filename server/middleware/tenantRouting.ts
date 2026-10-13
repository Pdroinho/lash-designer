import type Database from 'better-sqlite3'
import type { NextFunction, Request, Response } from 'express'
import { badRequest, notFound } from '../http.js'
import { isBillingRecoveryRequest, isBillingRecoveryTenant } from '../tenantRecovery.js'

type TenantRoutingOptions = {
  db: Database.Database
  nodeEnv: string
  devHost?: string
  platformHostname: string | null
}

const reservedTenantSlugs = new Set(['www', 'app', 'api', 'dev', 'domains', 'admin', 'support', 'status'])

export function createTenantRouting(options: TenantRoutingOptions) {
  const { db, nodeEnv, platformHostname } = options

  const isDevHost = (hostname: string) => {
    const host = (hostname ?? '').toLowerCase()
    if (options.devHost) return host === options.devHost.toLowerCase()
    return (host === 'localhost' || host === '127.0.0.1' || host === '::1') && nodeEnv !== 'production'
  }

  const assertTenantSlugIsAvailable = (slug: string) => {
    if (reservedTenantSlugs.has(slug)) {
      throw badRequest('Esse endereço é reservado pela plataforma', 'TENANT_SLUG_RESERVED')
    }
  }

  const requireDevHost = (req: Request, _res: Response, next: NextFunction) => {
    if (!isDevHost(req.hostname)) return next(notFound())
    next()
  }

  const getTenantSlugFromHostname = (hostname: string) => {
    const host = (hostname ?? '').trim().toLowerCase()
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || isDevHost(host)) return null

    if (host.endsWith('.localhost')) {
      const label = host.slice(0, -'.localhost'.length)
      return /^[a-z0-9-]+$/.test(label) && !label.includes('.') ? label : null
    }

    if (!platformHostname || host === platformHostname || !host.endsWith(`.${platformHostname}`)) return null
    const label = host.slice(0, -(platformHostname.length + 1))
    if (!label || label.includes('.') || reservedTenantSlugs.has(label) || !/^[a-z0-9-]+$/.test(label)) return null
    return label
  }

  const resolveTenantFromSubdomain = (req: Request, _res: Response, next: NextFunction) => {
    try {
      const host = (req.hostname ?? '').trim().toLowerCase()
      if (!host) return next()
      if (!isDevHost(host)) {
        const mapped = db.prepare(`
          SELECT t.id, t.slug, t.status
          FROM tenant_domains d
          JOIN tenants t ON t.id = d.tenant_id
          WHERE d.domain = ? AND d.status = 'ACTIVE' AND t.status IN ('ACTIVE', 'ONBOARDING', 'SUSPENDED')
          LIMIT 1
        `).get(host) as { id: string; slug: string; status: string } | undefined
        if (mapped && (mapped.status === 'ACTIVE' || (isBillingRecoveryRequest(req) && isBillingRecoveryTenant(db, mapped.id, mapped.status)))) {
          req.resolvedTenant = { id: mapped.id, slug: mapped.slug, ...(mapped.status !== 'ACTIVE' ? { billingRecovery: true } : {}) }
          return next()
        }
      }

      const slug = getTenantSlugFromHostname(host)
      if (!slug) return next()
      const tenant = db.prepare(`
        SELECT id, slug, status FROM tenants WHERE slug = ? AND status IN ('ACTIVE', 'ONBOARDING', 'SUSPENDED')
      `).get(slug) as { id: string; slug: string; status: string } | undefined
      if (tenant && (tenant.status === 'ACTIVE' || (isBillingRecoveryRequest(req) && isBillingRecoveryTenant(db, tenant.id, tenant.status)))) {
        req.resolvedTenant = { id: tenant.id, slug: tenant.slug, ...(tenant.status !== 'ACTIVE' ? { billingRecovery: true } : {}) }
      }
      next()
    } catch (error) {
      next(error)
    }
  }

  return { assertTenantSlugIsAvailable, getTenantSlugFromHostname, isDevHost, requireDevHost, resolveTenantFromSubdomain }
}
