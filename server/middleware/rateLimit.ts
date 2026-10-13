import type Database from 'better-sqlite3'
import type { NextFunction, Request, Response } from 'express'

export type RateLimiterOptions = {
  windowMs: number
  max: number
  keyPrefix: string
  keyFn?: (req: Request) => string
  persistent?: boolean
}

export function createRateLimiter(db: Database.Database, opts: RateLimiterOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>()
  const prune = (now: number) => {
    if (hits.size < 15_000) return
    for (const [key, value] of hits) {
      if (value.resetAt <= now) hits.delete(key)
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    prune(now)
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString()
    const subject = (() => {
      if (!opts.keyFn) return ip
      try {
        const value = String(opts.keyFn(req) ?? '').trim().toLowerCase()
        return value || ip
      } catch {
        return ip
      }
    })()
    const key = `${opts.keyPrefix}:${subject}`

    if (opts.persistent) {
      const decision = db.transaction(() => {
        const row = db.prepare(`
          SELECT count, window_started_at as windowStartedAt, blocked_until as blockedUntil,
                 penalty_level as penaltyLevel, updated_at as updatedAt
          FROM security_rate_limits WHERE key = ? LIMIT 1
        `).get(key) as { count: number; windowStartedAt: string; blockedUntil: string | null; penaltyLevel: number; updatedAt: string } | undefined
        const nowIso = new Date(now).toISOString()
        const blockedUntilMs = row?.blockedUntil ? Date.parse(row.blockedUntil) : 0
        if (blockedUntilMs > now) return { allowed: false, retryAt: blockedUntilMs }

        const windowStarted = row ? Date.parse(row.windowStartedAt) : 0
        const stalePenalty = row ? Date.parse(row.updatedAt) + 24 * 60 * 60 * 1000 <= now : false
        const penaltyLevel = stalePenalty ? 0 : (row?.penaltyLevel ?? 0)
        const count = !row || !Number.isFinite(windowStarted) || windowStarted + opts.windowMs <= now ? 1 : row.count + 1
        const nextWindowStarted = count === 1 ? nowIso : row!.windowStartedAt

        if (count > opts.max) {
          const nextPenalty = Math.min(6, penaltyLevel + 1)
          const blockMs = Math.min(24 * 60 * 60 * 1000, Math.max(opts.windowMs, 60_000) * 2 ** (nextPenalty - 1))
          const retryAt = now + blockMs
          db.prepare(`
            INSERT INTO security_rate_limits (key, count, window_started_at, blocked_until, penalty_level, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_started_at = excluded.window_started_at,
              blocked_until = excluded.blocked_until, penalty_level = excluded.penalty_level, updated_at = excluded.updated_at
          `).run(key, count, nextWindowStarted, new Date(retryAt).toISOString(), nextPenalty, nowIso)
          return { allowed: false, retryAt }
        }

        db.prepare(`
          INSERT INTO security_rate_limits (key, count, window_started_at, blocked_until, penalty_level, updated_at)
          VALUES (?, ?, ?, NULL, ?, ?)
          ON CONFLICT(key) DO UPDATE SET count = excluded.count, window_started_at = excluded.window_started_at,
            blocked_until = NULL, penalty_level = excluded.penalty_level, updated_at = excluded.updated_at
        `).run(key, count, nextWindowStarted, penaltyLevel, nowIso)
        return { allowed: true, retryAt: 0 }
      })()

      if (!decision.allowed) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((decision.retryAt - now) / 1000))))
        res.status(429).json({ message: 'Muitas tentativas. Tente novamente mais tarde.', code: 'RATE_LIMITED' })
        return
      }
      next()
      return
    }

    const value = hits.get(key)
    if (!value || value.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs })
      next()
      return
    }

    value.count += 1
    hits.set(key, value)
    if (value.count > opts.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((value.resetAt - now) / 1000))))
      res.status(429).json({ message: 'Muitas requisições', code: 'RATE_LIMITED' })
      return
    }
    next()
  }
}
