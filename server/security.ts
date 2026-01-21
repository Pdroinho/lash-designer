import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from './env.js'

export type Role = 'DEV' | 'ADMIN' | 'CLIENT'

export type SessionPayload = {
  sub: string
  role: Role
  tenantId: string | null
  sessionVersion: number
}

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(12)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export function signSession(payload: SessionPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' })
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
    if (!decoded || typeof decoded !== 'object') return null
    const obj = decoded as Record<string, unknown>
    const sub = obj.sub
    const role = obj.role
    const tenantId = obj.tenantId
    const sessionVersionRaw = obj.sessionVersion
    if (typeof sub !== 'string') return null
    if (role !== 'DEV' && role !== 'ADMIN' && role !== 'CLIENT') return null
    if (tenantId !== null && typeof tenantId !== 'string') return null

    const sessionVersion = (() => {
      if (sessionVersionRaw === undefined) return 0
      if (typeof sessionVersionRaw !== 'number') return null
      if (!Number.isInteger(sessionVersionRaw)) return null
      if (sessionVersionRaw < 0) return null
      return sessionVersionRaw
    })()
    if (sessionVersion === null) return null

    return { sub, role, tenantId, sessionVersion }
  } catch {
    return null
  }
}
