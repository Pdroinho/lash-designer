import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import helmet from 'helmet'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

type FoundationOptions = {
  db: Database.Database
  nodeEnv: string
  devHost?: string
  platformHostname: string | null
  getTenantSlugFromHostname: (hostname: string) => string | null
  resolveTenantFromSubdomain: RequestHandler
  sessionMiddleware: RequestHandler
  requireSameOrigin: RequestHandler
}

export function configureAppFoundation(app: express.Express, options: FoundationOptions) {
  const { db } = options
  app.disable('x-powered-by')
  if (options.nodeEnv === 'production') app.set('trust proxy', 1)

  app.use((req: Request, res: Response, next: NextFunction) => {
    const supplied = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : ''
    res.setHeader('X-Request-Id', supplied ? supplied.slice(0, 128) : randomUUID())
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)')
    next()
  })

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || options.nodeEnv !== 'production') return callback(null, true)
      try {
        const source = new URL(origin)
        const hostname = source.hostname.toLowerCase()
        if (source.protocol !== 'https:' || source.port) return callback(null, false)
        if (options.platformHostname && hostname === options.platformHostname) return callback(null, true)
        if (options.devHost && hostname === options.devHost.toLowerCase()) return callback(null, true)

        const tenantSlug = options.getTenantSlugFromHostname(hostname)
        if (tenantSlug) {
          const tenant = db.prepare("SELECT 1 as ok FROM tenants WHERE slug = ? AND status = 'ACTIVE' LIMIT 1").get(tenantSlug)
          return callback(null, Boolean(tenant))
        }
        const mapped = db.prepare("SELECT 1 as ok FROM tenant_domains d JOIN tenants t ON t.id = d.tenant_id WHERE d.domain = ? AND d.status = 'ACTIVE' AND t.status = 'ACTIVE' LIMIT 1").get(hostname)
        return callback(null, Boolean(mapped))
      } catch {
        return callback(null, false)
      }
    },
    credentials: true,
  }))

  app.use(helmet({
    contentSecurityPolicy: options.nodeEnv === 'production' ? {
      useDefaults: true,
      directives: {
        'base-uri': ["'self'"], 'object-src': ["'none'"], 'frame-ancestors': ["'none'"],
        'img-src': ["'self'", 'data:', 'https:'], 'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'connect-src': ["'self'", 'https:'], 'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
    hsts: options.nodeEnv === 'production' ? { maxAge: 31_536_000, includeSubDomains: false, preload: false } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }))

  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: false, limit: '64kb' }))
  app.use(cookieParser())
  app.use(options.resolveTenantFromSubdomain)
  app.use(options.sessionMiddleware)
  app.use(options.requireSameOrigin)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.path || '').startsWith('/api/')) res.setHeader('Cache-Control', 'no-store')
    next()
  })
}
