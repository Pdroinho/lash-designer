import type { NextFunction, Request, Response } from 'express'
import { getDb } from './db.js'
import { forbidden, unauthorized } from './http.js'
import type { Role } from './security.js'
import { verifySession } from './security.js'

export type SessionUser = {
  id: string
  role: Role
  tenantId: string | null
}

export type ResolvedTenant = {
  id: string
  slug: string
}

declare module 'express-serve-static-core' {
  interface Request {
    sessionUser?: SessionUser
    resolvedTenant?: ResolvedTenant
  }
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.session
  if (typeof token === 'string' && token.length > 0) {
    const payload = verifySession(token)
    if (payload) {
      try {
        const db = getDb()
        const row = db
          .prepare(
            `
              SELECT id,
                     role,
                     tenant_id as tenantId,
                     session_version as sessionVersion
              FROM users
              WHERE id = ?
              LIMIT 1
            `,
          )
          .get(payload.sub) as
          | { id: string; role: string; tenantId: string | null; sessionVersion: number }
          | undefined

        if (!row) {
          next()
          return
        }

        if (row.sessionVersion !== payload.sessionVersion) {
          next()
          return
        }

        if (row.role !== 'DEV' && row.role !== 'ADMIN' && row.role !== 'CLIENT') {
          next()
          return
        }

        req.sessionUser = { id: row.id, role: row.role, tenantId: row.tenantId ?? null }
      } catch {
        next()
        return
      }
    }
  }
  next()
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.sessionUser) return next(unauthorized())
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.sessionUser) return next(unauthorized())
    if (!roles.includes(req.sessionUser.role)) return next(forbidden())
    next()
  }
}

export function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
  // Ignorar se não tiver tenant resolvido (ex: dev host ou login sem tenant)
  if (!req.resolvedTenant) return next()
  
  // Se for admin, verifica assinatura
  // (Poderíamos checar para todos os users do tenant, mas o admin é o principal)
  
  const db = getDb()

  // Se estiver em modo DEV (localhost ou dev host), podemos ignorar ou simular
  // Mas como o user pediu Test Mode explícito, vamos implementar a checagem real
  
  // Check Test Mode Global
  const isTestMode = (db.prepare(`SELECT value FROM platform_settings WHERE key = 'test_mode'`).get() as { value: string } | undefined)?.value === 'true'
  
  if (isTestMode) return next()

  // Consultando o banco
  const sub = db.prepare(`
    SELECT status FROM appmax_subscriptions 
    WHERE tenant_id = ? 
    ORDER BY updated_at DESC LIMIT 1
  `).get(req.resolvedTenant.id) as { status: string } | undefined

  if (!sub || sub.status !== 'ACTIVE') {
    // Permitir algumas rotas específicas se necessário, mas o bloqueio é geral
    // Retornamos um código específico para o frontend saber que é erro de assinatura
    return next(forbidden('Assinatura inativa ou não encontrada', 'SUBSCRIPTION_REQUIRED'))
  }

  next()
}
