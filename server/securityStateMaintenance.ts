import type Database from 'better-sqlite3'

type SecurityStateMaintenanceOptions = {
  db: Database.Database
  now?: () => number
  setIntervalFn?: typeof setInterval
  setTimeoutFn?: typeof setTimeout
  clearIntervalFn?: typeof clearInterval
  clearTimeoutFn?: typeof clearTimeout
}

export function createSecurityStateMaintenance({
  db,
  now = Date.now,
  setIntervalFn = setInterval,
  setTimeoutFn = setTimeout,
  clearIntervalFn = clearInterval,
  clearTimeoutFn = clearTimeout,
}: SecurityStateMaintenanceOptions) {
  let intervalTimer: ReturnType<typeof setInterval> | undefined
  let startupTimer: ReturnType<typeof setTimeout> | undefined

  const pruneTransientSecurityState = () => {
    const currentTime = now()
    const oneDayAgo = new Date(currentTime - 24 * 60 * 60_000).toISOString()
    const thirtyDaysAgo = new Date(currentTime - 30 * 24 * 60 * 60_000).toISOString()
    const ninetyDaysAgo = new Date(currentTime - 90 * 24 * 60 * 60_000).toISOString()
    db.transaction(() => {
      db.prepare(`DELETE FROM security_rate_limits WHERE updated_at < ?`).run(thirtyDaysAgo)
      db.prepare(`DELETE FROM auth_challenges WHERE expires_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)`).run(oneDayAgo, oneDayAgo)
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='password_reset_challenges'").get()) db.prepare('DELETE FROM password_reset_challenges WHERE expires_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)').run(oneDayAgo, oneDayAgo)
      db.prepare(`DELETE FROM auth_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).run(ninetyDaysAgo, ninetyDaysAgo)
      db.prepare(`DELETE FROM trusted_devices WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`).run(ninetyDaysAgo, ninetyDaysAgo)
    })()
  }

  const start = () => {
    if (intervalTimer || startupTimer) return false
    intervalTimer = setIntervalFn(pruneTransientSecurityState, 6 * 60 * 60_000)
    intervalTimer.unref()
    startupTimer = setTimeoutFn(pruneTransientSecurityState, 25_000)
    startupTimer.unref()
    return true
  }

  const stop = () => {
    if (intervalTimer) clearIntervalFn(intervalTimer)
    if (startupTimer) clearTimeoutFn(startupTimer)
    intervalTimer = undefined
    startupTimer = undefined
  }

  return { pruneTransientSecurityState, start, stop }
}
