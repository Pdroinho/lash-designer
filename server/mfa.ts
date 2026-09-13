import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import type Database from 'better-sqlite3'
import { secretHmac } from './secretCrypto.js'

const CHALLENGE_TTL_MS = 5 * 60 * 1000
export const TRUSTED_DEVICE_TTL_MS = 365 * 24 * 60 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5

export type AuthChallengeKind = 'WHATSAPP_OTP'

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const otpHash = (userId: string, code: string) => secretHmac(`${userId}:${code}`, 'professional-whatsapp-otp')

export function createWhatsappOtpChallenge(
  db: Database.Database,
  input: { userId: string; keepSigned: boolean; phone: string },
) {
  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const code = String(randomInt(100000, 1000000))
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS)

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE auth_challenges
      SET consumed_at = ?
      WHERE user_id = ? AND kind = 'WHATSAPP_OTP' AND consumed_at IS NULL
    `).run(now.toISOString(), input.userId)

    db.prepare(`
      INSERT INTO auth_challenges (
        id, user_id, kind, token_hash, code_hash, phone_snapshot, keep_signed,
        attempts, sent_at, created_at, expires_at, consumed_at
      ) VALUES (?, ?, 'WHATSAPP_OTP', ?, ?, ?, ?, 0, ?, ?, ?, NULL)
    `).run(
      id,
      input.userId,
      tokenHash(token),
      otpHash(input.userId, code),
      input.phone,
      input.keepSigned ? 1 : 0,
      now.toISOString(),
      now.toISOString(),
      expiresAt.toISOString(),
    )
  })
  tx()

  return { id, token, code, phone: input.phone, expiresAt: expiresAt.toISOString() }
}


export function refreshWhatsappOtpChallenge(
  db: Database.Database,
  challengeId: string,
  userId: string,
  phone: string,
) {
  const code = String(randomInt(100000, 1000000))
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS)
  const result = db.prepare(`
    UPDATE auth_challenges
    SET code_hash = ?, phone_snapshot = ?, attempts = 0, sent_at = ?, expires_at = ?
    WHERE id = ? AND user_id = ? AND kind = 'WHATSAPP_OTP' AND consumed_at IS NULL
  `).run(otpHash(userId, code), phone, now.toISOString(), expiresAt.toISOString(), challengeId, userId)
  if (result.changes !== 1) return null
  return { code, phone, expiresAt: expiresAt.toISOString() }
}

export function resolveAuthChallenge(db: Database.Database, token: string) {
  if (!token || token.length < 32 || token.length > 256) return null
  const row = db.prepare(`
    SELECT c.id, c.user_id as userId, c.kind, c.phone_snapshot as phone,
           c.keep_signed as keepSigned, c.attempts, c.expires_at as expiresAt,
           u.email, u.role, u.tenant_id as tenantId
    FROM auth_challenges c
    JOIN users u ON u.id = c.user_id
    WHERE c.token_hash = ? AND c.consumed_at IS NULL
    LIMIT 1
  `).get(tokenHash(token)) as
    | {
        id: string
        userId: string
        kind: AuthChallengeKind
        phone: string
        keepSigned: number
        attempts: number
        expiresAt: string
        email: string
        role: string
        tenantId: string | null
      }
    | undefined

  if (!row || row.kind !== 'WHATSAPP_OTP' || Date.parse(row.expiresAt) <= Date.now()) return null
  if (row.role !== 'DEV' && row.role !== 'ADMIN') return null
  return { ...row, keepSigned: Boolean(row.keepSigned) }
}

export function verifyAndConsumeWhatsappOtpChallenge(
  db: Database.Database,
  challengeId: string,
  userId: string,
  code: string,
) {
  if (!/^\d{6}$/.test(code)) return false

  return db.transaction(() => {
    const row = db.prepare(`
      SELECT code_hash as codeHash, attempts, expires_at as expiresAt, consumed_at as consumedAt
      FROM auth_challenges
      WHERE id = ? AND user_id = ? AND kind = 'WHATSAPP_OTP'
      LIMIT 1
    `).get(challengeId, userId) as
      | { codeHash: string; attempts: number; expiresAt: string; consumedAt: string | null }
      | undefined

    if (!row || row.consumedAt || Date.parse(row.expiresAt) <= Date.now() || row.attempts >= MAX_OTP_ATTEMPTS) return false

    const expected = Buffer.from(row.codeHash, 'utf8')
    const actual = Buffer.from(otpHash(userId, code), 'utf8')
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual)

    if (!valid) {
      db.prepare(`UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL`).run(challengeId)
      return false
    }

    const result = db.prepare(`
      UPDATE auth_challenges
      SET consumed_at = ?
      WHERE id = ? AND user_id = ? AND consumed_at IS NULL AND attempts < ?
    `).run(new Date().toISOString(), challengeId, userId, MAX_OTP_ATTEMPTS)
    return result.changes === 1
  })()
}

export function createTrustedDevice(db: Database.Database, userId: string, userAgent?: string | null) {
  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS)
  const label = deviceLabel(userAgent)
  db.prepare(`
    INSERT INTO trusted_devices (id, user_id, token_hash, label, created_at, last_used_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(id, userId, tokenHash(token), label, now.toISOString(), now.toISOString(), expiresAt.toISOString())
  return { id, token, label, expiresAt: expiresAt.toISOString() }
}

export function resolveTrustedDevice(db: Database.Database, userId: string, token: string) {
  if (!token || token.length < 32 || token.length > 256) return null
  const row = db.prepare(`
    SELECT id, label, expires_at as expiresAt
    FROM trusted_devices
    WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL
    LIMIT 1
  `).get(userId, tokenHash(token)) as { id: string; label: string; expiresAt: string } | undefined
  if (!row || Date.parse(row.expiresAt) <= Date.now()) return null
  db.prepare('UPDATE trusted_devices SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id)
  return row
}

export function revokeTrustedDevice(db: Database.Database, userId: string, deviceId: string) {
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('UPDATE trusted_devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').run(now, deviceId, userId)
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE trusted_device_id = ? AND user_id = ? AND revoked_at IS NULL').run(now, deviceId, userId)
  })
  tx()
}

export function revokeAllTrustedDevices(db: Database.Database, userId: string) {
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('UPDATE trusted_devices SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId)
    db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND trusted_device_id IS NOT NULL AND revoked_at IS NULL').run(now, userId)
  })
  tx()
}

export function logSecurityEvent(
  db: Database.Database,
  input: { eventType: string; userId?: string | null; tenantId?: string | null; ipAddress?: string | null; userAgent?: string | null; details?: Record<string, unknown> | null },
) {
  db.prepare(`
    INSERT INTO security_events (id, user_id, tenant_id, event_type, ip_address, user_agent, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(), input.userId ?? null, input.tenantId ?? null, input.eventType,
    String(input.ipAddress ?? '').slice(0, 128) || null,
    String(input.userAgent ?? '').slice(0, 512) || null,
    input.details ? JSON.stringify(input.details).slice(0, 4000) : null,
    new Date().toISOString(),
  )
}

export function listSecurityState(db: Database.Database, userId: string) {
  const user = db.prepare(`SELECT phone FROM users WHERE id = ? LIMIT 1`).get(userId) as { phone: string | null } | undefined
  const devices = db.prepare(`
    SELECT id, label, created_at as createdAt, last_used_at as lastUsedAt, expires_at as expiresAt
    FROM trusted_devices WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
    ORDER BY last_used_at DESC
  `).all(userId, new Date().toISOString())
  const sessions = db.prepare(`
    SELECT id, trusted_device_id as trustedDeviceId, persistent, created_at as createdAt,
           last_seen_at as lastSeenAt, expires_at as expiresAt, user_agent as userAgent
    FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
    ORDER BY last_seen_at DESC
  `).all(userId, new Date().toISOString())
  return { phone: user?.phone ?? null, whatsappMfaReady: Boolean(user?.phone), devices, sessions }
}

export function deviceLabel(userAgent?: string | null) {
  const ua = String(userAgent ?? '')
  const browser = ua.includes('Edg/') ? 'Edge' : ua.includes('Chrome/') ? 'Chrome' : ua.includes('Firefox/') ? 'Firefox' : ua.includes('Safari/') ? 'Safari' : 'Navegador'
  const os = ua.includes('Windows') ? 'Windows' : ua.includes('Mac OS') ? 'macOS' : ua.includes('Android') ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : ua.includes('Linux') ? 'Linux' : 'dispositivo'
  return `${browser} · ${os}`
}
