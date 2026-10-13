import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import { verifyCustomDomain, type DomainVerificationConfig, type DomainVerificationResult } from './domains.js'

export type TenantDomainRow = {
  id: string
  tenantId: string
  domain: string
  status: 'PENDING' | 'ACTIVE' | 'ERROR'
  verificationToken: string | null
  createdAt: string
  lastCheckedAt: string | null
  verifiedAt: string | null
  verificationError: string | null
  isPrimary: number
}

export type DomainVerificationOutcome = {
  verified: boolean
  ownershipVerified: boolean
  routingVerified: boolean
  error: string | null
  row?: TenantDomainRow
}

type TimerHandle = { unref: () => unknown }

type DomainVerificationScheduler = {
  setInterval: (callback: () => void, delayMs: number) => TimerHandle
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle
  clearInterval: (handle: TimerHandle) => void
  clearTimeout: (handle: TimerHandle) => void
}

type DomainVerificationRuntimeOptions = {
  db: Database.Database
  config: DomainVerificationConfig
  verifyIntervalMinutes: number
  activeReverifyHours: number
  verifyDomain?: (domain: string, token: string, config: DomainVerificationConfig) => Promise<DomainVerificationResult>
  randomToken?: () => string
  now?: () => Date
  batchLimit?: number
  startupDelayMs?: number
  scheduler?: DomainVerificationScheduler
}

const defaultScheduler: DomainVerificationScheduler = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createDomainVerificationRuntime({
  db,
  config,
  verifyIntervalMinutes,
  activeReverifyHours,
  verifyDomain = verifyCustomDomain,
  randomToken = () => randomBytes(24).toString('hex'),
  now = () => new Date(),
  batchLimit = 25,
  startupDelayMs = 10_000,
  scheduler = defaultScheduler,
}: DomainVerificationRuntimeOptions) {
  let running = false
  let intervalTimer: TimerHandle | null = null
  let startupTimer: TimerHandle | null = null

  const getDomainRow = (id: string, tenantId?: string) => {
    const whereTenant = tenantId ? ' AND tenant_id = ?' : ''
    const params = tenantId ? [id, tenantId] : [id]
    return db.prepare(`
      SELECT id,
             tenant_id AS tenantId,
             domain,
             status,
             verification_token AS verificationToken,
             created_at AS createdAt,
             last_checked_at AS lastCheckedAt,
             verified_at AS verifiedAt,
             verification_error AS verificationError,
             is_primary AS isPrimary
      FROM tenant_domains
      WHERE id = ?${whereTenant}
      LIMIT 1
    `).get(...params) as TenantDomainRow | undefined
  }

  const verifyDomainRow = async (row: TenantDomainRow): Promise<DomainVerificationOutcome> => {
    if (!row.verificationToken) {
      const token = randomToken()
      db.prepare('UPDATE tenant_domains SET verification_token = ? WHERE id = ?').run(token, row.id)
      row.verificationToken = token
    }

    const result = await verifyDomain(row.domain, row.verificationToken, config)
    const nextStatus = result.verified ? 'ACTIVE' : row.status === 'ACTIVE' ? 'ERROR' : 'PENDING'
    db.prepare(`
      UPDATE tenant_domains
      SET status = ?, last_checked_at = ?,
          verified_at = CASE WHEN ? = 'ACTIVE' THEN COALESCE(verified_at, ?) ELSE verified_at END,
          verification_error = ?
      WHERE id = ?
    `).run(nextStatus, result.checkedAt, nextStatus, result.checkedAt, result.error, row.id)

    return { ...result, row: getDomainRow(row.id) }
  }

  const verifyPendingDomains = async () => {
    if (running) return
    running = true
    try {
      const referenceTime = now().getTime()
      const rows = db.prepare(`
        SELECT id,
               tenant_id AS tenantId,
               domain,
               status,
               verification_token AS verificationToken,
               created_at AS createdAt,
               last_checked_at AS lastCheckedAt,
               verified_at AS verifiedAt,
               verification_error AS verificationError,
               is_primary AS isPrimary
        FROM tenant_domains
        WHERE (
          status IN ('PENDING', 'ERROR')
          AND (last_checked_at IS NULL OR last_checked_at <= ?)
        ) OR (
          status = 'ACTIVE'
          AND (last_checked_at IS NULL OR last_checked_at <= ?)
        )
        ORDER BY CASE status WHEN 'ACTIVE' THEN 1 ELSE 0 END, created_at ASC
        LIMIT ?
      `).all(
        new Date(referenceTime - verifyIntervalMinutes * 60_000).toISOString(),
        new Date(referenceTime - activeReverifyHours * 60 * 60_000).toISOString(),
        batchLimit,
      ) as TenantDomainRow[]

      for (const row of rows) {
        try {
          await verifyDomainRow(row)
        } catch (error) {
          const checkedAt = now().toISOString()
          const message = error instanceof Error ? error.message.slice(0, 500) : 'Falha temporária ao consultar DNS'
          db.prepare(`UPDATE tenant_domains SET last_checked_at = ?, verification_error = ? WHERE id = ?`)
            .run(checkedAt, message, row.id)
        }
      }
    } finally {
      running = false
    }
  }

  const start = () => {
    if (intervalTimer || startupTimer) return
    intervalTimer = scheduler.setInterval(() => void verifyPendingDomains(), verifyIntervalMinutes * 60_000)
    intervalTimer.unref()
    startupTimer = scheduler.setTimeout(() => {
      startupTimer = null
      void verifyPendingDomains()
    }, startupDelayMs)
    startupTimer.unref()
  }

  const stop = () => {
    if (intervalTimer) scheduler.clearInterval(intervalTimer)
    if (startupTimer) scheduler.clearTimeout(startupTimer)
    intervalTimer = null
    startupTimer = null
  }

  return { getDomainRow, verifyDomainRow, verifyPendingDomains, start, stop }
}
