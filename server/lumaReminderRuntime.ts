import type Database from 'better-sqlite3'
type Send = (
  tenantId: string,
  phone: string,
  text: string,
  options: {
    purpose: 'SYSTEM'
    source: 'SYSTEM'
    persist: boolean
    onProviderMessageId: (id: string | null) => void
  },
) => Promise<boolean>
export function createLumaReminderRuntime(db: Database.Database, send: Send) {
  let timer: ReturnType<typeof setInterval> | undefined,
    running = false
  async function processDue() {
    if (running) return
    running = true
    try {
      // A previous send interrupted by a restart cannot be safely retried: the provider may have accepted it.
      db.prepare(
        "UPDATE assistant_reminders SET status='UNKNOWN',error_code='INTERRUPTED_SEND',processed_at=? WHERE status='SENDING' AND processed_at<?",
      ).run(
        new Date().toISOString(),
        new Date(Date.now() - 5 * 60000).toISOString(),
      )
      const rows = db
        .prepare(
          "SELECT id,tenant_id as tenantId,user_id as userId,body FROM assistant_reminders WHERE status='SCHEDULED' AND due_at<=? ORDER BY due_at LIMIT 20",
        )
        .all(new Date().toISOString()) as Array<{
        id: string
        tenantId: string
        userId: string
        body: string
      }>
      for (const row of rows) {
        const account = db
          .prepare(
            `SELECT u.phone FROM users u JOIN tenants t ON t.id=u.tenant_id JOIN subscriptions s ON s.tenant_id=t.id WHERE u.id=? AND u.tenant_id=? AND u.role='ADMIN' AND t.status='ACTIVE' AND s.status='ACTIVE' AND (s.current_period_end IS NULL OR s.current_period_end>?)`,
          )
          .get(row.userId, row.tenantId, new Date().toISOString()) as
          | { phone: string }
          | undefined
        if (!account?.phone) {
          db.prepare(
            "UPDATE assistant_reminders SET status='FAILED',error_code='ACCOUNT_UNAVAILABLE',processed_at=? WHERE id=? AND status='SCHEDULED'",
          ).run(new Date().toISOString(), row.id)
          continue
        }
        const acquired = db
          .prepare(
            "UPDATE assistant_reminders SET status='SENDING',processed_at=? WHERE id=? AND status='SCHEDULED'",
          )
          .run(new Date().toISOString(), row.id)
        if (!acquired.changes) continue
        let messageId: string | null = null
        try {
          const accepted = await send(
            row.tenantId,
            account.phone,
            `Luma · seu lembrete\n\n${row.body}`,
            {
              purpose: 'SYSTEM',
              source: 'SYSTEM',
              persist: false,
              onProviderMessageId: (id) => {
                messageId = id
              },
            },
          )
          db.prepare(
            "UPDATE assistant_reminders SET status=?,provider_message_id=?,processed_at=?,error_code=? WHERE id=? AND status='SENDING'",
          ).run(
            accepted ? 'SENT' : 'UNKNOWN',
            messageId,
            new Date().toISOString(),
            accepted ? null : 'PROVIDER_NOT_CONFIRMED',
            row.id,
          )
        } catch {
          db.prepare(
            "UPDATE assistant_reminders SET status='UNKNOWN',error_code='PROVIDER_ERROR',processed_at=? WHERE id=? AND status='SENDING'",
          ).run(new Date().toISOString(), row.id)
        }
      }
    } finally {
      running = false
    }
  }
  function start() {
    if (timer) return
    void processDue().catch(() => {})
    timer = setInterval(() => {
      void processDue().catch(() => {})
    }, 30000)
    timer.unref()
  }
  function stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  return { start, stop, processDue }
}
