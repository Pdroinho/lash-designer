import type Database from 'better-sqlite3'
import { Router, type RequestHandler } from 'express'
import { normalizeCustomDomain } from '../domains.js'
import { isLoopbackAddress, safeTimingEqual } from '../middleware/requestSecurity.js'
import type { BillingPlan } from '../plans.js'
import { TEAM_PLANS } from '../teamPlans.js'

type OperationalRouterOptions = {
  db: Database.Database
  appVersion: string
  domainAuthSecret?: string
  platformHostname: string | null
  devHost?: string
  getTenantSlugFromHostname: (hostname: string) => string | null
}

type PublicDevThemeRouterOptions = {
  db: Database.Database
  requireDevHost: RequestHandler
}

export function createOperationalRouter({
  db,
  appVersion,
  domainAuthSecret,
  platformHostname,
  devHost,
  getTenantSlugFromHostname,
}: OperationalRouterOptions) {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'lashdesigner', version: appVersion })
  })

  router.get('/ready', (_req, res) => {
    try {
      db.prepare('SELECT 1 as ok').get()
      res.json({ ok: true, database: 'ready' })
    } catch {
      res.status(503).json({ ok: false, database: 'unavailable' })
    }
  })

  router.get('/internal/domains/authorize/:secret', (req, res) => {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      res.status(404).end()
      return
    }
    if (!domainAuthSecret) {
      res.status(503).json({ message: 'Autorização de domínio não configurada' })
      return
    }

    const provided = typeof req.params.secret === 'string' ? req.params.secret : ''
    if (!provided || !safeTimingEqual(provided, domainAuthSecret)) {
      res.status(401).end()
      return
    }

    let domain: string
    try {
      domain = normalizeCustomDomain(typeof req.query.domain === 'string' ? req.query.domain : '')
    } catch {
      res.status(400).end()
      return
    }

    let authorized = false
    if (platformHostname && domain === platformHostname) {
      authorized = true
    } else if (devHost && domain === devHost.toLowerCase()) {
      authorized = true
    } else if (platformHostname && domain.endsWith(`.${platformHostname}`)) {
      const slug = getTenantSlugFromHostname(domain)
      if (slug) {
        authorized = Boolean(
          db.prepare("SELECT 1 as ok FROM tenants WHERE slug = ? AND status = 'ACTIVE' LIMIT 1").get(slug),
        )
      }
    } else {
      authorized = Boolean(
        db.prepare("SELECT 1 as ok FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id WHERE d.domain = ? AND d.status = 'ACTIVE' AND t.status = 'ACTIVE' LIMIT 1").get(domain),
      )
    }

    if (!authorized) {
      res.status(403).end()
      return
    }
    res.status(204).end()
  })

  return router
}

export function createPublicDevThemeRouter({ db, requireDevHost }: PublicDevThemeRouterOptions) {
  const router = Router()

  router.get('/dev-theme', requireDevHost, (req, res, next) => {
    try {
      const row = db.prepare(`SELECT value FROM platform_settings WHERE key = 'dev_primary_color' LIMIT 1`).get() as { value: string } | undefined
      res.json({ primaryColor: row?.value ?? null })
    } catch (err) {
      next(err)
    }
  })

  return router
}

export function createPublicLegalRouter(legalPublicConfig: () => unknown) {
  const router = Router()

  router.get('/legal', (_req, res) => {
    res.json(legalPublicConfig())
  })

  return router
}

export function createPublicBillingCatalogRouter(_billingPlans: readonly BillingPlan[], checkoutAvailable = false) {
  const router = Router()

  // Billing catalog values always come from the server to avoid commercial drift.
  router.get('/billing/plans', (_req, res) => {
    res.json({ plans: [], teamPlans: TEAM_PLANS, teamCheckoutEnabled: true, checkoutAvailable, checkoutProvider: 'APPMAX', methods: checkoutAvailable ? ['PIX', 'CARD'] : [] })
  })

  return router
}
