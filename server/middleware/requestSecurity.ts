import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export function createSameOriginMiddleware(nodeEnv: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const method = (req.method || 'GET').toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
    const path = req.path || ''
    if (!path.startsWith('/api/') || path.startsWith('/api/webhooks/') || nodeEnv !== 'production') return next()

    const source = (req.headers.origin || req.headers.referer || '').toString()
    if (!source) {
      res.status(403).json({ message: 'Origem inválida', code: 'ORIGIN_REQUIRED' })
      return
    }

    let sourceOrigin: string | null = null
    try {
      sourceOrigin = new URL(source).origin.toLowerCase()
    } catch {
      sourceOrigin = null
    }
    const requestHost = String(req.get('host') ?? '').toLowerCase()
    const expectedOrigin = requestHost ? `${req.protocol}://${requestHost}`.toLowerCase() : null
    if (!sourceOrigin || !expectedOrigin || sourceOrigin !== expectedOrigin) {
      res.status(403).json({ message: 'Origem inválida', code: 'ORIGIN_MISMATCH' })
      return
    }
    next()
  }
}

export function isLoopbackAddress(value: string | undefined) {
  const normalized = String(value ?? '').replace(/^::ffff:/, '')
  return normalized === '127.0.0.1' || normalized === '::1'
}

export function safeTimingEqual(first: string, second: string) {
  const a = Buffer.from(first)
  const b = Buffer.from(second)
  return a.length === b.length && timingSafeEqual(a, b)
}

function webhookSecret(req: Request) {
  const header = req.headers['x-webhook-secret']
  if (typeof header === 'string' && header.trim()) return header.trim()
  if (Array.isArray(header) && typeof header[0] === 'string' && header[0].trim()) return header[0].trim()

  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice('bearer '.length).trim() || null
  return null
}

export function requireWebhookSecret(secret?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!secret) {
      res.status(503).json({ message: 'Webhook não configurado', code: 'WEBHOOK_NOT_CONFIGURED' })
      return
    }
    const provided = webhookSecret(req)
    if (!provided) {
      res.status(401).json({ message: 'Não autorizado', code: 'WEBHOOK_SECRET_REQUIRED' })
      return
    }
    if (!safeTimingEqual(provided, secret)) {
      res.status(401).json({ message: 'Não autorizado', code: 'WEBHOOK_SECRET_INVALID' })
      return
    }
    next()
  }
}
