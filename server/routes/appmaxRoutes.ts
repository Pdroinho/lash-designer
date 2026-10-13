import type Database from 'better-sqlite3'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, forbidden, notFound } from '../http.js'
import { TEAM_PLANS } from '../teamPlans.js'
import type { createAppmaxBillingService } from '../appmaxBillingService.js'
import type { createAppmaxWebhookRuntime } from '../appmaxWebhookRuntime.js'

type Billing = ReturnType<typeof createAppmaxBillingService>

export function createAdminAppmaxRouter(db: Database.Database, billing: Billing | null, enabled: boolean, production: boolean) {
  const router = Router()
  router.get('/subscription/team-plans', requireRole('ADMIN'), (req, res) => {
    const tenantId = req.sessionUser!.tenantId!
    const subscription = db.prepare(`SELECT plan_code as planCode, current_period_end as currentPeriodEnd FROM subscriptions
      WHERE tenant_id = ? AND status = 'ACTIVE' AND current_period_end > ? LIMIT 1`).get(tenantId, new Date().toISOString()) as { planCode: string; currentPeriodEnd: string } | undefined
    const activeCount = db.prepare(`SELECT count(*) as count FROM professionals WHERE tenant_id = ? AND active = 1 AND bookable = 1`).get(tenantId) as { count: number }
    res.json({ quotes: billing ? Object.fromEntries(TEAM_PLANS.map(plan => [plan.code,billing.quoteForTenant(tenantId,plan.code)])) : {}, plans: TEAM_PLANS, checkoutAvailable: enabled && Boolean(billing), activeProfessionals: activeCount.count,
      orders: db.prepare('SELECT id as orderNsu, amount_cents as amountCents, status, created_at as createdAt, paid_at as paidAt FROM appmax_checkout_intents WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 10').all(tenantId),
      currentSubscription: subscription ?? null, provider: 'APPMAX', interval: 'MONTHLY', recurring: false })
  })
  router.post('/subscription/team-checkout', requireRole('ADMIN'), async (req, res, next) => {
    try {
      if (!enabled || !billing) throw badRequest('O checkout Appmax ainda não foi habilitado.', 'APPMAX_CHECKOUT_DISABLED')
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) throw forbidden('Estúdio inválido.', 'INVALID_TENANT')
      if (production && req.resolvedTenant?.id !== tenantId) throw forbidden('Use o endereço do seu estúdio.', 'TENANT_HOST_REQUIRED')
      const { planCode } = z.object({ planCode: z.enum(['TEAM_3', 'TEAM_6', 'TEAM_15']) }).strict().parse(req.body)
      const activeCount = db.prepare(`SELECT count(*) as count FROM professionals WHERE tenant_id = ? AND active = 1 AND bookable = 1`).get(tenantId) as { count: number }
      const plan = TEAM_PLANS.find(item => item.code === planCode)!
      if (activeCount.count > plan.seats) throw badRequest('A equipe ativa excede as vagas desta faixa.', 'TEAM_PLAN_TOO_SMALL')
      const checkout = await billing.startCheckout(tenantId, planCode)
      res.json(checkout)
    } catch (error) { next(error) }
  })
  router.get('/subscription/team-order/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      const id = z.string().uuid().parse(req.params.id)
      const order = db.prepare(`SELECT status, plan_code as planCode, amount_cents as amountCents, paid_at as paidAt
        FROM appmax_checkout_intents WHERE tenant_id = ? AND id = ?`).get(tenantId, id)
      if (!order) throw notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND')
      res.json({ order })
    } catch (error) { next(error) }
  })
  return router
}

export function createAppmaxWebhookRouter(runtime: ReturnType<typeof createAppmaxWebhookRuntime> | null) {
  const router = Router()
  router.post('/appmax', (req, res) => {
    if (!runtime) { res.status(503).json({ received: false }); return }
    runtime.receive(req.body)
    res.json({ received: true })
    queueMicrotask(() => { void runtime.processPending() })
  })
  return router
}
