import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { env } from '../env.js'
import { badRequest, forbidden, notFound } from '../http.js'

export const LUMA_CREDIT_PACKS = [
  { id: 'starter', label: '25 créditos', credits: 25, amountCents: 490 },
  { id: 'growth', label: '100 créditos', credits: 100, amountCents: 1290, featured: true },
  { id: 'power', label: '250 créditos', credits: 250, amountCents: 2490 },
] as const

type CreateInfinitePayLink = (input: {
  orderNsu: string
  amountCents: number
  customerName: string
  customerEmail: string
  planLabel: string
  months: number
  redirectUrl: string
  itemDescription?: string
}) => Promise<string>

type AdminLumaBillingRouterOptions = {
  db: Database.Database
  createInfinitePayLink: CreateInfinitePayLink
}

const lumaCreditPackById = new Map(LUMA_CREDIT_PACKS.map(pack => [pack.id, pack]))

export function lumaExtraCreditBalance(db: Database.Database, tenantId: string) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(delta_messages), 0) AS balance
    FROM assistant_message_credit_ledger
    WHERE tenant_id = ?
  `).get(tenantId) as { balance?: number } | undefined
  return Math.max(0, Number(row?.balance ?? 0))
}

export function createAdminLumaBillingRouter(options: AdminLumaBillingRouterOptions) {
  const { db, createInfinitePayLink } = options
  const router = Router()

  router.post('/assistant/credits/checkout-url', requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      const sessionUser = req.sessionUser
      if (!tenantId || !sessionUser) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      if (env.NODE_ENV === 'production' && req.resolvedTenant?.id !== tenantId) {
        return next(forbidden('Abra a compra de créditos pelo endereço do seu espaço.', 'TENANT_HOST_REQUIRED'))
      }

      const body = z.object({ packId: z.enum(['starter', 'growth', 'power']) }).parse(req.body ?? {})
      const pack = lumaCreditPackById.get(body.packId)
      if (!pack) return next(badRequest('Pacote de créditos inválido.', 'INVALID_LUMA_CREDIT_PACK'))

      const account = db.prepare(`SELECT email FROM users WHERE id = ?`).get(sessionUser.id) as { email: string } | undefined
      const email = account?.email || 'cliente@lashdesigner.local'
      const requestOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin
      const orderId = randomUUID()
      const orderNsu = `ld-luma-${pack.id}-${orderId}`
      const now = new Date().toISOString()

      db.prepare(`
        INSERT INTO assistant_credit_orders (
          id, tenant_id, user_id, order_nsu, pack_id, credits, amount_cents, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
      `).run(orderId, tenantId, sessionUser.id, orderNsu, pack.id, pack.credits, pack.amountCents, now)

      try {
        const checkoutUrl = await createInfinitePayLink({
          orderNsu,
          amountCents: pack.amountCents,
          customerName: email.split('@')[0],
          customerEmail: email,
          planLabel: 'Luma',
          months: 1,
          itemDescription: `Luma — ${pack.credits} créditos extras (1 crédito = 1 mensagem, sem expiração)`,
          redirectUrl: `${requestOrigin}/admin?lumaCredits=return`,
        })
        db.prepare(`UPDATE assistant_credit_orders SET checkout_url = ? WHERE id = ?`).run(checkoutUrl, orderId)
        return res.json({ url: checkoutUrl, orderNsu, pack })
      } catch (error) {
        db.prepare(`UPDATE assistant_credit_orders SET status = 'FAILED' WHERE id = ? AND status = 'PENDING'`).run(orderId)
        throw error
      }
    } catch (err) {
      next(err)
    }
  })

  router.get('/assistant/credits/order-status', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      const orderNsu = typeof req.query.orderNsu === 'string' ? req.query.orderNsu.trim() : ''
      if (!tenantId || !orderNsu) return next(badRequest('Pedido inválido', 'INVALID_ORDER'))
      const order = db.prepare(`
        SELECT status, credits, amount_cents as amountCents, paid_at as paidAt
        FROM assistant_credit_orders
        WHERE tenant_id = ? AND order_nsu = ?
        LIMIT 1
      `).get(tenantId, orderNsu) as { status: string; credits: number; amountCents: number; paidAt: string | null } | undefined
      if (!order) return next(notFound('Pedido não encontrado', 'ORDER_NOT_FOUND'))
      return res.json({ order, balance: lumaExtraCreditBalance(db, tenantId) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
