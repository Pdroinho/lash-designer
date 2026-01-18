import type { NextFunction, Request, Response } from 'express'
import { forbidden, unauthorized } from './http.js'
import type { Role } from './security.js'
import { verifySession } from './security.js'

export type SessionUser = {
  id: string
  role: Role
  tenantId: string | null
}

declare module 'express-serve-static-core' {
  interface Request {
    sessionUser?: SessionUser
  }
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.session
  if (typeof token === 'string' && token.length > 0) {
    const payload = verifySession(token)
    if (payload) {
      req.sessionUser = { id: payload.sub, role: payload.role, tenantId: payload.tenantId }
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
