import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { infinitePayWebhookHash, infinitePayWebhookPayloadSchema, safeInfinitePayReceiptUrl } from '../infinitePay.js'
import { nextBillingPeriodEnd, type BillingCycle } from '../plans.js'

type LogInfinitePayWebhookEvent = (input: {
  orderNsu?: string | null
  eventHash: string
  outcome: string
  errorCode?: string | null
}) => void

type VerifyInfinitePayPayment = (input: {
  orderNsu: string
  transactionNsu: string
  invoiceSlug: string
  expectedAmountCents: number
}) => Promise<{ capture_method?: string }>

type InfinitePayWebhookRouterOptions = {
  db: Database.Database
  infinitePayWebhookLimiter: RequestHandler
  infinitePayConfigured: boolean
  logInfinitePayWebhookEvent: LogInfinitePayWebhookEvent
  verifyInfinitePayPayment: VerifyInfinitePayPayment
}

export function createInfinitePayWebhookRouter(options: InfinitePayWebhookRouterOptions) {
  const {
    db,
    infinitePayWebhookLimiter,
    infinitePayConfigured,
    logInfinitePayWebhookEvent,
    verifyInfinitePayPayment,
  } = options
  const router = Router()

  router.post('/infinitepay', infinitePayWebhookLimiter, async (req, res) => {
    const eventHash = infinitePayWebhookHash(req.body)
    const parsedBody = infinitePayWebhookPayloadSchema.safeParse(req.body ?? {})
    const candidateOrderNsu = typeof req.body?.order_nsu === 'string' ? req.body.order_nsu.slice(0, 200) : null
    if (!parsedBody.success) {
      logInfinitePayWebhookEvent({ orderNsu: candidateOrderNsu, eventHash, outcome: 'REJECTED', errorCode: 'INVALID_PAYLOAD' })
      return res.status(400).json({ success: false, message: 'Payload inválido' })
    }
    if (!infinitePayConfigured) {
      logInfinitePayWebhookEvent({ orderNsu: parsedBody.data.order_nsu, eventHash, outcome: 'ERROR', errorCode: 'NOT_CONFIGURED' })
      return res.status(503).json({ success: false, message: 'InfinitePay não configurada' })
    }

    const body = parsedBody.data
    const orderNsu = body.order_nsu
    const transactionNsu = body.transaction_nsu
    const amount = body.amount
    const invoiceSlug = body.invoice_slug || body.slug!
    const receiptUrl = safeInfinitePayReceiptUrl(body.receipt_url)

    const creditOrder = db.prepare(`
      SELECT id, tenant_id as tenantId, user_id as userId, amount_cents as amountCents,
             credits, status
      FROM assistant_credit_orders
      WHERE order_nsu = ?
    `).get(orderNsu) as { id: string; tenantId: string; userId: string; amountCents: number; credits: number; status: string } | undefined

    if (creditOrder) {
      if (creditOrder.amountCents !== amount) {
        logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REJECTED', errorCode: 'AMOUNT_MISMATCH' })
        return res.status(400).json({ success: false, message: 'Pedido não encontrado ou valor inválido' })
      }
      if (creditOrder.status === 'PAID') {
        logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REPLAY_IGNORED' })
        return res.json({ success: true, message: null })
      }
      if (creditOrder.status !== 'PENDING') {
        logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REJECTED', errorCode: 'ORDER_NOT_PENDING' })
        return res.status(400).json({ success: false, message: 'Pedido não está pendente' })
      }

      try {
        const checked = await verifyInfinitePayPayment({ orderNsu, transactionNsu, invoiceSlug, expectedAmountCents: creditOrder.amountCents })
        const now = new Date().toISOString()
        const credited = db.transaction(() => {
          const updated = db.prepare(`
            UPDATE assistant_credit_orders
            SET status = 'PAID', transaction_nsu = ?, invoice_slug = ?, receipt_url = ?, capture_method = ?, paid_at = ?
            WHERE id = ? AND status = 'PENDING'
          `).run(transactionNsu, invoiceSlug, receiptUrl, checked.capture_method || '', now, creditOrder.id)
          if (updated.changes !== 1) return false
          db.prepare(`
            INSERT INTO assistant_message_credit_ledger (
              id, tenant_id, user_id, delta_messages, source, note, reference_order_nsu, created_at
            ) VALUES (?, ?, ?, ?, 'PURCHASE', ?, ?, ?)
          `).run(randomUUID(), creditOrder.tenantId, creditOrder.userId, creditOrder.credits, `Compra de ${creditOrder.credits} créditos extras da Luma`, orderNsu, now)
          return true
        })()
        logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: credited ? 'APPLIED' : 'REPLAY_IGNORED' })
        return res.json({ success: true, message: null, credited: credited ? creditOrder.credits : 0 })
      } catch (err) {
        console.error('[InfinitePay credits verification]', err instanceof Error ? err.message : 'verification failed')
        logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'ERROR', errorCode: 'PAYMENT_CHECK_FAILED' })
        return res.status(400).json({ success: false, message: 'Falha ao confirmar pagamento' })
      }
    }

    const order = db.prepare(`
      SELECT id, tenant_id as tenantId, amount_cents as amountCents, status,
             billing_cycle as billingCycle, period_months as periodMonths,
             referral_redemption_id as referralRedemptionId
      FROM infinitepay_orders
      WHERE order_nsu = ?
    `).get(orderNsu) as { id: string; tenantId: string; amountCents: number; status: string; billingCycle: BillingCycle; periodMonths: number; referralRedemptionId: string | null } | undefined

    if (!order || order.amountCents !== amount) {
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REJECTED', errorCode: order ? 'AMOUNT_MISMATCH' : 'ORDER_NOT_FOUND' })
      return res.status(400).json({ success: false, message: 'Pedido não encontrado ou valor inválido' })
    }
    if (order.status === 'PAID') {
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REPLAY_IGNORED' })
      return res.json({ success: true, message: null })
    }
    if (order.status !== 'PENDING') {
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'REJECTED', errorCode: 'ORDER_NOT_PENDING' })
      return res.status(400).json({ success: false, message: 'Pedido não está pendente' })
    }

    try {
      const checked = await verifyInfinitePayPayment({ orderNsu, transactionNsu, invoiceSlug, expectedAmountCents: order.amountCents })
      const now = new Date().toISOString()
      const applied = db.transaction(() => {
        const updated = db.prepare(`
          UPDATE infinitepay_orders
          SET status = 'PAID', transaction_nsu = ?, invoice_slug = ?, receipt_url = ?, capture_method = ?, paid_at = ?
          WHERE id = ? AND status = 'PENDING'
        `).run(transactionNsu, invoiceSlug, receiptUrl, checked.capture_method || '', now, order.id)
        if (updated.changes !== 1) return false

        const existing = db.prepare(`SELECT id, current_period_end as currentPeriodEnd FROM subscriptions WHERE tenant_id = ?`).get(order.tenantId) as { id: string; currentPeriodEnd: string | null } | undefined
        const periodEnd = nextBillingPeriodEnd(existing?.currentPeriodEnd, order.periodMonths || 12, new Date(now))
        if (existing) {
          db.prepare(`UPDATE subscriptions SET status = 'ACTIVE', current_period_end = ?, external_id = ?, billing_cycle = ?, plan_code = 'PRO', updated_at = ? WHERE tenant_id = ?`)
            .run(periodEnd, transactionNsu, order.billingCycle || 'ANNUAL', now, order.tenantId)
        } else {
          db.prepare(`INSERT INTO subscriptions (id, tenant_id, external_id, status, current_period_end, billing_cycle, plan_code, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, 'PRO', ?, ?)`)
            .run(randomUUID(), order.tenantId, transactionNsu, periodEnd, order.billingCycle || 'ANNUAL', now, now)
        }
        db.prepare(`UPDATE tenants SET status = 'ACTIVE' WHERE id = ? AND status = 'ONBOARDING'`).run(order.tenantId)
        db.prepare(`UPDATE referral_credits SET status = 'APPLIED', applied_at = ?, reserved_at = NULL WHERE owner_tenant_id = ? AND applied_order_nsu = ? AND status = 'RESERVED'`)
          .run(now, order.tenantId, orderNsu)
        if (order.referralRedemptionId) {
          const redemption = db.prepare(`
            SELECT rr.id, rr.referrer_reward_percent as rewardPercent, rl.owner_tenant_id as ownerTenantId
            FROM referral_redemptions rr
            JOIN referral_links rl ON rl.id = rr.link_id
            WHERE rr.id = ? AND rr.status = 'PENDING'
          `).get(order.referralRedemptionId) as { id: string; rewardPercent: number; ownerTenantId: string | null } | undefined
          if (redemption) {
            db.prepare(`UPDATE referral_redemptions SET status = 'PAID', paid_at = ? WHERE id = ? AND status = 'PENDING'`).run(now, redemption.id)
            if (redemption.ownerTenantId && redemption.ownerTenantId !== order.tenantId && redemption.rewardPercent > 0) {
              db.prepare(`INSERT OR IGNORE INTO referral_credits (id, owner_tenant_id, redemption_id, discount_percent, status, created_at) VALUES (?, ?, ?, ?, 'AVAILABLE', ?)`)
                .run(randomUUID(), redemption.ownerTenantId, redemption.id, Math.min(30, redemption.rewardPercent), now)
            }
          }
        }
        return true
      })()
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: applied ? 'APPLIED' : 'REPLAY_IGNORED' })
      return res.json({ success: true, message: null })
    } catch (err) {
      console.error('[InfinitePay verification]', err instanceof Error ? err.message : 'verification failed')
      logInfinitePayWebhookEvent({ orderNsu, eventHash, outcome: 'ERROR', errorCode: 'PAYMENT_CHECK_FAILED' })
      return res.status(400).json({ success: false, message: 'Falha ao confirmar pagamento' })
    }
  })

  return router
}
