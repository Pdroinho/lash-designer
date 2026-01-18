import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from './env.js'

export type Role = 'DEV' | 'ADMIN' | 'CLIENT'

export type SessionPayload = {
  sub: string
  role: Role
  tenantId: string | null
}

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(12)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

export function signSession(payload: SessionPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' })
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET)
    if (!decoded || typeof decoded !== 'object') return null
    const obj = decoded as Record<string, unknown>
    const sub = obj.sub
    const role = obj.role
    const tenantId = obj.tenantId
    if (typeof sub !== 'string') return null
    if (role !== 'DEV' && role !== 'ADMIN' && role !== 'CLIENT') return null
    if (tenantId !== null && typeof tenantId !== 'string') return null
    return { sub, role, tenantId }
  } catch {
    return null
  }
}
