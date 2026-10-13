import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { badRequest } from './http.js'
type Provider = {
  createPaymentLink: (input: {
    name: string
    amountCents: number
    description: string
  }) => Promise<{ linkId: number; checkoutUrl: string }>
  inspectPaymentLinkOrder: (input: {
    linkId: number
    orderId: number
    expectedAmountCents: number
  }) => Promise<'PAID' | 'REVERSED' | 'UNKNOWN'>
  listPaymentLinkOrders: (
    id: number,
  ) => Promise<Array<{ id: number; status: string }>>
}
type Order = {
  id: string
  tenantId: string
  userId: string
  orderNsu: string
  credits: number
  amountCents: number
  paymentLinkId: number
  status: string
}
export function createLumaAppmaxCredits(
  db: Database.Database,
  provider: Provider,
) {
  const projection = `o.id,o.tenant_id as tenantId,o.user_id as userId,o.order_nsu as orderNsu,o.credits,o.amount_cents as amountCents,a.payment_link_id as paymentLinkId,a.status`
  async function checkout(input: {
    tenantId: string
    userId: string
    pack: { id: string; credits: number; amountCents: number }
  }) {
    const pending = db
      .prepare(
        `SELECT o.order_nsu as orderNsu,o.checkout_url as url FROM assistant_credit_orders o JOIN assistant_appmax_orders a ON a.id=o.id WHERE o.tenant_id=? AND o.user_id=? AND o.pack_id=? AND a.status='PENDING' AND o.checkout_url IS NOT NULL AND o.created_at>? ORDER BY o.created_at DESC LIMIT 1`,
      )
      .get(
        input.tenantId,
        input.userId,
        input.pack.id,
        new Date(Date.now() - 24 * 3600000).toISOString(),
      ) as { orderNsu: string; url: string } | undefined
    if (pending) return pending
    const id = randomUUID(),
      nsu = `ld-luma-${input.pack.id}-${id}`,
      now = new Date().toISOString()
    db.transaction(() => {
      db.prepare(
        "INSERT INTO assistant_credit_orders(id,tenant_id,user_id,order_nsu,pack_id,credits,amount_cents,status,created_at) VALUES (?,?,?,?,?,?,?,'PENDING',?)",
      ).run(
        id,
        input.tenantId,
        input.userId,
        nsu,
        input.pack.id,
        input.pack.credits,
        input.pack.amountCents,
        now,
      )
      db.prepare(
        'INSERT INTO assistant_appmax_orders(id,tenant_id,updated_at) VALUES (?,?,?)',
      ).run(id, input.tenantId, now)
    })()
    try {
      const link = await provider.createPaymentLink({
        name: `Luma ${id}`,
        amountCents: input.pack.amountCents,
        description: `${input.pack.credits} mensagens extras da Luma, sem expiração`,
      })
      const url = new URL(link.checkoutUrl)
      if (url.protocol !== 'https:' || url.username || url.password)
        throw badRequest('O provedor retornou um checkout inválido.')
      db.transaction(() => {
        if (
          db
            .prepare(
              'SELECT 1 FROM appmax_checkout_intents WHERE payment_link_id=?',
            )
            .get(link.linkId)
        )
          throw badRequest('Link de pagamento já associado a outro pedido.')
        db.prepare(
          'UPDATE assistant_appmax_orders SET payment_link_id=?,updated_at=? WHERE id=?',
        ).run(link.linkId, new Date().toISOString(), id)
        db.prepare(
          'UPDATE assistant_credit_orders SET checkout_url=? WHERE id=?',
        ).run(link.checkoutUrl, id)
      })()
      return { url: link.checkoutUrl, orderNsu: nsu }
    } catch (error) {
      db.transaction(() => {
        db.prepare(
          "UPDATE assistant_appmax_orders SET status='FAILED',updated_at=? WHERE id=? AND status='PENDING'",
        ).run(new Date().toISOString(), id)
        db.prepare(
          "UPDATE assistant_credit_orders SET status='FAILED' WHERE id=? AND status='PENDING'",
        ).run(id)
      })()
      throw error
    }
  }
  async function reconcile(input: {
    tenantId: string
    intentId: string
    orderId: number
  }) {
    const order = db
      .prepare(
        `SELECT ${projection} FROM assistant_credit_orders o JOIN assistant_appmax_orders a ON a.id=o.id WHERE o.id=? AND o.tenant_id=? AND a.status IN ('PENDING','PAID','REVERSED')`,
      )
      .get(input.intentId, input.tenantId) as Order | undefined
    if (!order?.paymentLinkId) return false
    const verified = await provider.inspectPaymentLinkOrder({
      linkId: order.paymentLinkId,
      orderId: input.orderId,
      expectedAmountCents: order.amountCents,
    })
    if (verified === 'UNKNOWN') return false
    return db
      .transaction(() => {
        const state = db
          .prepare(
            'SELECT status,provider_order_id as providerOrderId FROM assistant_appmax_orders WHERE id=?',
          )
          .get(order.id) as { status: string; providerOrderId: number | null }
        if (state.providerOrderId && state.providerOrderId !== input.orderId)
          return false
        if (verified === 'PAID') {
          if (state.status === 'REVERSED' || state.status === 'FAILED')
            return false
          if (state.status === 'PAID') return true
          db.prepare(
            "UPDATE assistant_appmax_orders SET status='PAID',provider_order_id=?,updated_at=? WHERE id=? AND status='PENDING'",
          ).run(input.orderId, new Date().toISOString(), order.id)
          db.prepare(
            "INSERT INTO assistant_message_credit_ledger(id,tenant_id,user_id,delta_messages,source,reference_order_nsu,note,created_at) VALUES (?,?,?,?,'PURCHASE',?,'Compra Appmax de créditos Luma',?)",
          ).run(
            randomUUID(),
            order.tenantId,
            order.userId,
            order.credits,
            order.orderNsu,
            new Date().toISOString(),
          )
          db.prepare(
            "UPDATE assistant_credit_orders SET status='PAID',paid_at=? WHERE id=?",
          ).run(new Date().toISOString(), order.id)
        } else {
          if (state.status === 'REVERSED') return true
          if (state.status === 'PAID')
            db.prepare(
              "INSERT INTO assistant_message_credit_ledger(id,tenant_id,user_id,delta_messages,source,reference_order_nsu,note,created_at) VALUES (?,?,?,?,'APPMAX_REVERSAL',?,'Estorno Appmax de créditos Luma',?)",
            ).run(
              randomUUID(),
              order.tenantId,
              order.userId,
              -order.credits,
              order.orderNsu,
              new Date().toISOString(),
            )
          db.prepare(
            "UPDATE assistant_appmax_orders SET status='REVERSED',provider_order_id=?,updated_at=? WHERE id=?",
          ).run(input.orderId, new Date().toISOString(), order.id)
          if (state.status !== 'PAID')
            db.prepare(
              "UPDATE assistant_credit_orders SET status='FAILED' WHERE id=?",
            ).run(order.id)
        }
        return true
      })
      .immediate()
  }
  async function refreshOrder(tenantId: string, orderNsu: string) {
    const order = db
      .prepare(
        `SELECT ${projection} FROM assistant_credit_orders o JOIN assistant_appmax_orders a ON a.id=o.id WHERE o.tenant_id=? AND o.order_nsu=?`,
      )
      .get(tenantId, orderNsu) as Order | undefined
    if (!order) return
    if (order.paymentLinkId && ['PENDING', 'PAID'].includes(order.status)) {
      const orders = await provider.listPaymentLinkOrders(order.paymentLinkId)
      for (const p of orders.slice(0, 20)) {
        if (await reconcile({ tenantId, intentId: order.id, orderId: p.id }))
          break
      }
    }
  }
  async function reconcileRecent() {
    const rows = db
      .prepare(
        `SELECT o.tenant_id as tenantId,o.order_nsu as orderNsu FROM assistant_credit_orders o JOIN assistant_appmax_orders a ON a.id=o.id WHERE a.status IN ('PENDING','PAID') AND o.created_at>? ORDER BY a.updated_at LIMIT 20`,
      )
      .all(new Date(Date.now() - 90 * 86400000).toISOString()) as Array<{
      tenantId: string
      orderNsu: string
    }>
    for (const r of rows) {
      try {
        await refreshOrder(r.tenantId, r.orderNsu)
        db.prepare(
          'UPDATE assistant_appmax_orders SET updated_at=? WHERE id=(SELECT id FROM assistant_credit_orders WHERE order_nsu=?)',
        ).run(new Date().toISOString(), r.orderNsu)
      } catch {
        /* Retry on the next worker pass; never grant on verification failure. */
      }
    }
  }
  return { checkout, reconcile, refreshOrder, reconcileRecent }
}
