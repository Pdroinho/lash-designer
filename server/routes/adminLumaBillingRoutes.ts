import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { env } from '../env.js'
import type { createLumaAppmaxCredits } from '../lumaAppmaxCredits.js'
import { badRequest, forbidden, notFound } from '../http.js'

export const LUMA_CREDIT_PACKS = [
  { id: 'starter', label: '25 créditos', credits: 25, amountCents: 500 },
  {
    id: 'growth',
    label: '100 créditos',
    credits: 100,
    amountCents: 1290,
    featured: true,
  },
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
  appmaxCredits?: ReturnType<typeof createLumaAppmaxCredits> | null
  appmaxEnabled?: boolean
}

const lumaCreditPackById = new Map(
  LUMA_CREDIT_PACKS.map((pack) => [pack.id, pack]),
)

export function lumaExtraCreditBalance(
  db: Database.Database,
  tenantId: string,
) {
  const row = db
    .prepare(
      `
    SELECT COALESCE(SUM(delta_messages), 0) AS balance
    FROM assistant_message_credit_ledger
    WHERE tenant_id = ?
  `,
    )
    .get(tenantId) as { balance?: number } | undefined
  return Math.max(0, Number(row?.balance ?? 0))
}

export function createAdminLumaBillingRouter(
  options: AdminLumaBillingRouterOptions,
) {
  const { db, createInfinitePayLink } = options
  const router = Router()

  router.post(
    '/assistant/credits/checkout-url',
    requireRole('ADMIN'),
    async (req, res, next) => {
      try {
        const tenantId = req.sessionUser?.tenantId
        const sessionUser = req.sessionUser
        if (!tenantId || !sessionUser)
          return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
        if (
          env.NODE_ENV === 'production' &&
          req.resolvedTenant?.id !== tenantId
        ) {
          return next(
            forbidden(
              'Abra a compra de créditos pelo endereço do seu espaço.',
              'TENANT_HOST_REQUIRED',
            ),
          )
        }

        const body = z
          .object({ packId: z.enum(['starter', 'growth', 'power']) })
          .parse(req.body ?? {})
        const pack = lumaCreditPackById.get(body.packId)
        if (!pack)
          return next(
            badRequest(
              'Pacote de créditos inválido.',
              'INVALID_LUMA_CREDIT_PACK',
            ),
          )

        if (options.appmaxEnabled) {
          if (!options.appmaxCredits)
            return next(
              forbidden(
                'A compra de créditos está temporariamente indisponível.',
                'LUMA_CHECKOUT_UNAVAILABLE',
              ),
            )
          const result = await options.appmaxCredits.checkout({
            tenantId,
            userId: sessionUser.id,
            pack,
          })
          return res.json({ ...result, pack, provider: 'APPMAX' })
        }

        const account = db
          .prepare(`SELECT email FROM users WHERE id = ?`)
          .get(sessionUser.id) as { email: string } | undefined
        const email = account?.email || 'cliente@lashdesigner.local'
        const requestOrigin = new URL(`${req.protocol}://${req.get('host')}`)
          .origin
        const orderId = randomUUID()
        const orderNsu = `ld-luma-${pack.id}-${orderId}`
        const now = new Date().toISOString()

        db.prepare(
          `
        INSERT INTO assistant_credit_orders (
          id, tenant_id, user_id, order_nsu, pack_id, credits, amount_cents, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
      `,
        ).run(
          orderId,
          tenantId,
          sessionUser.id,
          orderNsu,
          pack.id,
          pack.credits,
          pack.amountCents,
          now,
        )

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
          db.prepare(
            `UPDATE assistant_credit_orders SET checkout_url = ? WHERE id = ?`,
          ).run(checkoutUrl, orderId)
          return res.json({ url: checkoutUrl, orderNsu, pack })
        } catch (error) {
          db.prepare(
            `UPDATE assistant_credit_orders SET status = 'FAILED' WHERE id = ? AND status = 'PENDING'`,
          ).run(orderId)
          throw error
        }
      } catch (err) {
        next(err)
      }
    },
  )

  router.get(
    '/assistant/credits/order-status',
    requireRole('ADMIN'),
    async (req, res, next) => {
      try {
        const tenantId = req.sessionUser?.tenantId
        const orderNsu =
          typeof req.query.orderNsu === 'string'
            ? req.query.orderNsu.trim()
            : ''
        if (!tenantId || !orderNsu)
          return next(badRequest('Pedido inválido', 'INVALID_ORDER'))
        if (options.appmaxEnabled && options.appmaxCredits)
          await options.appmaxCredits.refreshOrder(tenantId, orderNsu)
        const order = db
          .prepare(
            `
        SELECT status, credits, amount_cents as amountCents, paid_at as paidAt
        FROM assistant_credit_orders
        WHERE tenant_id = ? AND order_nsu = ?
        LIMIT 1
      `,
          )
          .get(tenantId, orderNsu) as
          | {
              status: string
              credits: number
              amountCents: number
              paidAt: string | null
            }
          | undefined
        if (!order)
          return next(notFound('Pedido não encontrado', 'ORDER_NOT_FOUND'))
        if (options.appmaxEnabled) {
          const status = db
            .prepare(
              'SELECT a.status FROM assistant_appmax_orders a JOIN assistant_credit_orders o ON o.id=a.id WHERE o.tenant_id=? AND o.order_nsu=?',
            )
            .get(tenantId, orderNsu) as { status: string } | undefined
          if (status) order.status = status.status
        }
        return res.json({
          order,
          balance: lumaExtraCreditBalance(db, tenantId),
        })
      } catch (err) {
        next(err)
      }
    },
  )

  router.get('/assistant/credits/history',requireRole('ADMIN'),(req,res,next)=>{try{
    const rows=db.prepare(options.appmaxEnabled ? `SELECT o.order_nsu as orderNsu,o.credits,o.amount_cents as amountCents,COALESCE(a.status,o.status) as status,o.created_at as createdAt,o.paid_at as paidAt FROM assistant_credit_orders o LEFT JOIN assistant_appmax_orders a ON a.id=o.id WHERE o.tenant_id=? ORDER BY o.created_at DESC LIMIT 50` : `SELECT order_nsu as orderNsu,credits,amount_cents as amountCents,status,created_at as createdAt,paid_at as paidAt FROM assistant_credit_orders WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50`).all(req.sessionUser!.tenantId)
    res.json({orders:rows,balance:lumaExtraCreditBalance(db,req.sessionUser!.tenantId!)})
  }catch(error){next(error)}})
  return router
}
