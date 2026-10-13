import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const eventSchema = z.object({
  event: z.enum(['order_approved', 'order_paid', 'order_paid_by_pix', 'order_integrated', 'order_refund', 'order_chargeback_in_treatment']),
  event_type: z.literal('order'),
  data: z.object({ order_id: z.number().int().positive(), payment_link_id: z.number().int().positive() }).passthrough(),
}).passthrough()

type BillingService = {
  confirmOrder: (input: { tenantId: string; intentId: string; orderId: number }) => Promise<boolean>
  reconcileOrder?: (input: { tenantId: string; intentId: string; orderId: number }) => Promise<boolean>
  reconcilePendingIntents?: () => Promise<void>
  reconcilePaidIntents?: () => Promise<void>
}

export function createAppmaxWebhookRuntime(db: Database.Database, billing: BillingService, credits?: {reconcile:(input:{tenantId:string;intentId:string;orderId:number})=>Promise<boolean>;reconcileRecent:()=>Promise<void>}) {
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false

  function receive(raw: unknown) {
    const result = eventSchema.safeParse(raw)
    if (!result.success) return false
    const { event, data } = result.data
    const intent = db.prepare(`SELECT id FROM appmax_checkout_intents WHERE payment_link_id = ? AND status IN ('PENDING','PAID')`)
      .get(data.payment_link_id) as { id: string } | undefined
    const credit = credits ? db.prepare("SELECT id FROM assistant_appmax_orders WHERE payment_link_id=? AND status IN ('PENDING','PAID')").get(data.payment_link_id) : null
    if (!intent && !credit) return false
    const pending = db.prepare(`SELECT count(*) as total FROM appmax_webhook_inbox WHERE payment_link_id = ? AND status IN ('PENDING','FAILED')`)
      .get(data.payment_link_id) as { total: number }
    if (pending.total >= 10) return false
    // Only identifiers, type, and hash are persisted; webhook payloads may
    // include sensitive buyer and payment metadata and cannot grant access.
    const hash = createHash('sha256').update(JSON.stringify(raw)).digest('hex')
    const inserted = db.prepare(`INSERT OR IGNORE INTO appmax_webhook_inbox
      (id, event_name, order_id, payment_link_id, payload_hash, status, received_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`).run(randomUUID(), event, data.order_id, data.payment_link_id, hash, new Date().toISOString())
    return inserted.changes === 1
  }

  async function processPending() {
    if (running) return
    running = true
    try {
      const rows = db.prepare(`SELECT id, event_name as eventName, order_id as orderId, payment_link_id as paymentLinkId FROM appmax_webhook_inbox
        WHERE (status = 'PENDING' OR (status = 'FAILED' AND processed_at < ?)) AND received_at > ?
        ORDER BY received_at LIMIT 20`).all(new Date(Date.now() - 60_000).toISOString(), new Date(Date.now() - 30 * 86400_000).toISOString()) as Array<{ id: string; eventName: string; orderId: number; paymentLinkId: number }>
      for (const row of rows) {
        const intent = db.prepare(`SELECT id, tenant_id as tenantId FROM appmax_checkout_intents WHERE payment_link_id = ? AND status IN ('PENDING','PAID')`)
          .get(row.paymentLinkId) as { id: string; tenantId: string } | undefined
        const credit = credits ? db.prepare("SELECT id,tenant_id as tenantId FROM assistant_appmax_orders WHERE payment_link_id=? AND status IN ('PENDING','PAID','REVERSED')").get(row.paymentLinkId) as {id:string;tenantId:string}|undefined : undefined
        try {
          const reversedEvent = row.eventName === 'order_refund' || row.eventName === 'order_chargeback_in_treatment'
          const applied = intent ? reversedEvent
            ? Boolean(billing.reconcileOrder && await billing.reconcileOrder({ tenantId: intent.tenantId, intentId: intent.id, orderId: row.orderId }))
            : await billing.confirmOrder({ tenantId: intent.tenantId, intentId: intent.id, orderId: row.orderId }) : credit && credits ? await credits.reconcile({tenantId:credit.tenantId,intentId:credit.id,orderId:row.orderId}) : false
          db.prepare(`UPDATE appmax_webhook_inbox SET status = ?, error_code = ?, processed_at = ? WHERE id = ?`)
            .run(applied ? 'APPLIED' : 'FAILED', applied ? null : 'ORDER_NOT_CONFIRMED', new Date().toISOString(), row.id)
        } catch {
          db.prepare(`UPDATE appmax_webhook_inbox SET status = 'FAILED', error_code = 'VERIFICATION_ERROR', processed_at = ? WHERE id = ?`)
            .run(new Date().toISOString(), row.id)
        }
      }
      if (billing.reconcilePendingIntents) await billing.reconcilePendingIntents()
      if (billing.reconcilePaidIntents) await billing.reconcilePaidIntents()
      if (credits) await credits.reconcileRecent()
    } finally { running = false }
  }

  function start() {
    if (timer) return
    void processPending()
    timer = setInterval(() => { void processPending() }, 60_000)
    timer.unref()
  }
  function stop() { if (timer) clearInterval(timer); timer = undefined }

  return { receive, processPending, start, stop }
}
