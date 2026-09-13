import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const SESSION_ABSOLUTE_MS = DAY_MS
const SESSION_IDLE_MS = 12 * HOUR_MS
const PERSISTENT_SESSION_ABSOLUTE_MS = 30 * DAY_MS
const PERSISTENT_SESSION_IDLE_MS = 7 * DAY_MS
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000

export type SessionRecord = {
  id: string
  userId: string
  role: 'DEV' | 'ADMIN' | 'CLIENT'
  tenantId: string | null
  tenantStatus: string | null
  persistent: boolean
  trustedDeviceId: string | null
}

type CreateSessionInput = {
  userId: string
  persistent?: boolean
  trustedDeviceId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

const sessionTokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

const boundedMetadata = (value: string | null | undefined, maxLength: number) => {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

export function createSession(db: Database.Database, input: CreateSessionInput) {
  const token = randomBytes(32).toString('base64url')
  const id = randomUUID()
  const now = new Date()
  const persistent = Boolean(input.persistent)
  const expiresAt = new Date(now.getTime() + (persistent ? PERSISTENT_SESSION_ABSOLUTE_MS : SESSION_ABSOLUTE_MS))

  db.prepare(`
    INSERT INTO auth_sessions (
      id, user_id, trusted_device_id, token_hash, persistent,
      created_at, last_seen_at, expires_at, revoked_at, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    id,
    input.userId,
    input.trustedDeviceId ?? null,
    sessionTokenHash(token),
    persistent ? 1 : 0,
    now.toISOString(),
    now.toISOString(),
    expiresAt.toISOString(),
    boundedMetadata(input.ipAddress, 128),
    boundedMetadata(input.userAgent, 512),
  )

  return { id, token, expiresAt: expiresAt.toISOString(), persistent }
}

export function resolveSession(db: Database.Database, token: string): SessionRecord | null {
  if (!token || token.length < 32 || token.length > 256) return null
  const now = new Date()
  const row = db.prepare(`
    SELECT s.id,
           s.user_id as userId,
           s.trusted_device_id as trustedDeviceId,
           s.persistent,
           s.last_seen_at as lastSeenAt,
           s.expires_at as expiresAt,
           u.role,
           u.tenant_id as tenantId,
           t.status as tenantStatus
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
    LIMIT 1
  `).get(sessionTokenHash(token)) as
    | {
        id: string
        userId: string
        trustedDeviceId: string | null
        persistent: number
        lastSeenAt: string
        expiresAt: string
        role: string
        tenantId: string | null
        tenantStatus: string | null
      }
    | undefined

  if (!row) return null

  const expiresAt = Date.parse(row.expiresAt)
  const lastSeenAt = Date.parse(row.lastSeenAt)
  const idleLimit = row.persistent ? PERSISTENT_SESSION_IDLE_MS : SESSION_IDLE_MS
  const invalidTime = !Number.isFinite(expiresAt) || !Number.isFinite(lastSeenAt)
  const expired = invalidTime || expiresAt <= now.getTime() || lastSeenAt + idleLimit <= now.getTime()
  if (expired) {
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now.toISOString(), row.id)
    return null
  }

  if (row.role !== 'DEV' && row.role !== 'ADMIN' && row.role !== 'CLIENT') return null

  if (now.getTime() - lastSeenAt >= LAST_SEEN_WRITE_INTERVAL_MS) {
    db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL').run(now.toISOString(), row.id)
  }

  return {
    id: row.id,
    userId: row.userId,
    role: row.role,
    tenantId: row.tenantId ?? null,
    tenantStatus: row.tenantStatus ?? null,
    persistent: Boolean(row.persistent),
    trustedDeviceId: row.trustedDeviceId ?? null,
  }
}

export function revokeSession(db: Database.Database, sessionId: string) {
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(new Date().toISOString(), sessionId)
}

export function revokeSessionsForUser(db: Database.Database, userId: string) {
  db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(new Date().toISOString(), userId)
}

export function revokeSessionsForTenant(db: Database.Database, tenantId: string) {
  db.prepare(`
    UPDATE auth_sessions
    SET revoked_at = ?
    WHERE revoked_at IS NULL
      AND user_id IN (SELECT id FROM users WHERE tenant_id = ?)
  `).run(new Date().toISOString(), tenantId)
}
