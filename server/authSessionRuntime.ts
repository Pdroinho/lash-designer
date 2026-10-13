import type Database from 'better-sqlite3'
import type { Request, Response } from 'express'
import { TRUSTED_DEVICE_TTL_MS } from './mfa.js'
import { createSession } from './session.js'

export function createAuthSessionRuntime(db: Database.Database, nodeEnv: string) {
  const production = nodeEnv === 'production'
  const sessionCookieName = production ? '__Host-session' : 'session'
  const preauthCookieName = production ? '__Host-preauth' : 'preauth'
  const trustedDeviceCookieName = production ? '__Host-device' : 'device'
  const sessionCookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: production, path: '/' }
  const clearOptions = { path: '/', sameSite: 'lax' as const, secure: production }

  const setSessionCookie = (res: Response, token: string, persistent = false) => {
    res.cookie(sessionCookieName, token, {
      ...sessionCookieOptions,
      ...(persistent ? { maxAge: 1000 * 60 * 60 * 24 * 30 } : {}),
    })
  }

  const setPreauthCookie = (res: Response, token: string) => {
    res.cookie(preauthCookieName, token, { ...sessionCookieOptions, maxAge: 10 * 60 * 1000 })
  }
  const clearPreauthCookie = (res: Response) => res.clearCookie(preauthCookieName, clearOptions)
  const setTrustedDeviceCookie = (res: Response, token: string) => {
    res.cookie(trustedDeviceCookieName, token, { ...sessionCookieOptions, maxAge: TRUSTED_DEVICE_TTL_MS })
  }
  const clearTrustedDeviceCookie = (res: Response) => res.clearCookie(trustedDeviceCookieName, clearOptions)

  const requestSecurityMetadata = (req: Request) => ({
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
  })

  const createAndSetSession = (req: Request, res: Response, userId: string, persistent = false, trustedDeviceId?: string | null) => {
    const session = createSession(db, {
      userId,
      persistent,
      trustedDeviceId: trustedDeviceId ?? null,
      ...requestSecurityMetadata(req),
    })
    setSessionCookie(res, session.token, persistent)
    return session
  }

  return {
    clearPreauthCookie,
    clearTrustedDeviceCookie,
    createAndSetSession,
    preauthCookieName,
    requestSecurityMetadata,
    sessionCookieName,
    setSessionCookie,
    setPreauthCookie,
    setTrustedDeviceCookie,
    trustedDeviceCookieName,
  }
}
