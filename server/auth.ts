import type { NextFunction, Request, Response } from 'express'
import { getDb } from './db.js'
import { forbidden, unauthorized } from './http.js'
import { env } from './env.js'
import type { Role } from './security.js'
import { resolveSession } from './session.js'
import { isBillingRecoveryRequest, isBillingRecoveryTenant } from './tenantRecovery.js'

export type SessionUser = {
  id: string
  role: Role
  tenantId: string | null
  sessionId: string
  persistent: boolean
  trustedDeviceId: string | null
  billingRecovery?: boolean
}

export type ResolvedTenant = {
  id: string
  slug: string
  billingRecovery?: boolean
}

declare module 'express-serve-static-core' {
  interface Request {
    sessionUser?: SessionUser
    resolvedTenant?: ResolvedTenant
  }
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = env.NODE_ENV === 'production' ? req.cookies?.['__Host-session'] : req.cookies?.session
  if (typeof token !== 'string' || token.length === 0) {
    next()
    return
  }

  try {
    const session = resolveSession(getDb(), token)
    if (!session) {
      next()
      return
    }

    const billingRecovery = Boolean(session.role === 'ADMIN' && session.tenantId && session.tenantStatus !== 'ACTIVE'
      && req.resolvedTenant?.id === session.tenantId && isBillingRecoveryRequest(req)
      && isBillingRecoveryTenant(getDb(), session.tenantId, session.tenantStatus))
    if (session.role !== 'DEV') {
      if (!session.tenantId || (session.tenantStatus !== 'ACTIVE' && !billingRecovery)) {
        next()
        return
      }
      if (req.resolvedTenant && req.resolvedTenant.id !== session.tenantId) {
        next()
        return
      }
      if (session.role === 'STAFF' && !getDb().prepare(`SELECT 1 FROM professionals p JOIN users u ON u.id = p.user_id
        WHERE p.tenant_id = ? AND p.user_id = ? AND p.active = 1 AND u.staff_access_disabled_at IS NULL LIMIT 1`)
        .get(session.tenantId, session.userId)) { next(); return }
    }

    req.sessionUser = {
      id: session.userId,
      role: session.role,
      tenantId: session.tenantId,
      sessionId: session.id,
      persistent: session.persistent,
      trustedDeviceId: session.trustedDeviceId,
      ...(billingRecovery ? { billingRecovery: true } : {}),
    }
  } catch {
    next()
    return
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
  if (req.sessionUser?.role === 'DEV') return next()
  if (req.resolvedTenant?.billingRecovery || req.sessionUser?.billingRecovery) {
    return next(forbidden('Conclua o pagamento para acessar o estúdio.', 'SUBSCRIPTION_REQUIRED'))
  }

  const tenantId = req.sessionUser?.tenantId ?? req.resolvedTenant?.id
  if (!tenantId) return next(forbidden('Espaço não identificado', 'TENANT_REQUIRED'))

  const db = getDb()
  const isTestMode =
    env.NODE_ENV !== 'production' &&
    (db.prepare(`SELECT value FROM platform_settings WHERE key = 'test_mode'`).get() as
      | { value: string }
      | undefined
    )?.value === 'true'

  if (isTestMode) return next()

  const sub = db.prepare(`
    SELECT status, current_period_end AS currentPeriodEnd
    FROM subscriptions
    WHERE tenant_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(tenantId) as { status: string; currentPeriodEnd: string | null } | undefined

  const periodExpired = Boolean(
    sub?.currentPeriodEnd && Date.parse(sub.currentPeriodEnd) <= Date.now(),
  )

  if (!sub || sub.status !== 'ACTIVE' || periodExpired) {
    return next(forbidden('Assinatura inativa ou vencida', 'SUBSCRIPTION_REQUIRED'))
  }

  next()
}
