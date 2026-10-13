import { createAppmaxReferralService, referralQuoteFingerprint, type TeamQuote } from './appmaxReferralService.js'
import { AppmaxRequestError } from './appmax.js'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { nextBillingPeriodEnd } from './plans.js'
import { badRequest } from './http.js'
import { isBillingRecoveryTenant } from './tenantRecovery.js'
import { teamPlanByCode, type TeamPlanCode } from './teamPlans.js'

type Link = { linkId: number; checkoutUrl: string }
type Provider = {
  createPaymentLink: (input: { name: string; amountCents: number; description: string }) => Promise<Link>
  verifyPaymentLinkOrder: (input: { linkId: number; orderId: number; expectedAmountCents: number }) => Promise<boolean>
  inspectPaymentLinkOrder?: (input: { linkId: number; orderId: number; expectedAmountCents: number }) => Promise<'PAID' | 'REVERSED' | 'UNKNOWN'>
  listPaymentLinkOrders?: (linkId: number) => Promise<Array<{ id: number; status: string }>>
}

type Intent = { id: string; tenantId: string; planCode: TeamPlanCode; amountCents: number; grossAmountCents: number; discountPercent: number; referralRedemptionId: string | null; paymentLinkId: number | null; checkoutUrl: string | null; status: string; orderId: number | null }

export function createAppmaxBillingService(db: Database.Database, provider: Provider) {
  const referrals = createAppmaxReferralService(db)
  function load(tenantId: string, id: string) {
    return db.prepare(`SELECT id, tenant_id as tenantId, plan_code as planCode, amount_cents as amountCents, gross_amount_cents as grossAmountCents, discount_percent as discountPercent, referral_redemption_id as referralRedemptionId,
      payment_link_id as paymentLinkId, checkout_url as checkoutUrl, status, order_id as orderId
      FROM appmax_checkout_intents WHERE tenant_id = ? AND id = ?`).get(tenantId, id) as Intent | undefined
  }

  async function startCheckout(tenantId: string, code: TeamPlanCode, referralToken?: string, quoteFingerprint?: string) {
    const plan = teamPlanByCode(code)
    if (!plan) throw badRequest('Faixa inválida.', 'INVALID_TEAM_PLAN')
    const existing = db.transaction(() => {
      const tenant = db.prepare('SELECT name, status FROM tenants WHERE id = ?').get(tenantId) as { name: string; status: string } | undefined
      if (!tenant) throw new Error('Estúdio não encontrado.')
      if (tenant.status !== 'ACTIVE' && tenant.status !== 'ONBOARDING' && !isBillingRecoveryTenant(db, tenantId, tenant.status)) {
        throw badRequest('Este estúdio precisa de revisão pela administração da plataforma.', 'TENANT_PAYMENT_BLOCKED')
      }
      const active = db.prepare(`SELECT 1 FROM subscriptions WHERE tenant_id = ? AND status = 'ACTIVE' AND current_period_end > ? LIMIT 1`)
        .get(tenantId, new Date().toISOString())
      if (active) throw badRequest('A migração de uma assinatura ativa requer uma política de períodos pagos.', 'ACTIVE_SUBSCRIPTION_TRANSITION_REQUIRED')
      if (db.prepare("SELECT 1 FROM infinitepay_orders WHERE tenant_id = ? AND status = 'PENDING' LIMIT 1").get(tenantId)) throw badRequest('Existe uma compra anterior em andamento. Solicite conferência em Suporte antes de abrir outra cobrança.', 'CHECKOUT_IN_PROGRESS')
      const pending = db.prepare(`SELECT id FROM appmax_checkout_intents WHERE tenant_id = ? AND status IN ('CREATING','PENDING') ORDER BY created_at DESC LIMIT 1`)
        .get(tenantId) as { id: string } | undefined
      if (pending) {
        const found = load(tenantId, pending.id)!
        if (found.status === 'CREATING' || found.planCode !== code || !found.checkoutUrl) throw badRequest(found.status === 'CREATING' ? 'A criação do pagamento ainda está em conferência. Abra um chamado em Suporte antes de tentar uma nova cobrança.' : 'Já existe uma compra em andamento para este estúdio.', 'CHECKOUT_IN_PROGRESS')
        return { name: tenant.name, intent: found }
      }
      const id = randomUUID()
      const reserved = referrals.reserve(tenantId, id, plan.amountCents, referralToken,quoteFingerprint)
      db.prepare(`INSERT INTO appmax_checkout_intents (id, tenant_id, plan_code, amount_cents, gross_amount_cents, discount_percent, referral_redemption_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATING', ?)`).run(id, tenantId, code, reserved.quote.amountCents, plan.amountCents, reserved.quote.discountPercent, reserved.redemptionId, new Date().toISOString())
      referrals.reserveDebts(id,reserved.debts)
      return { name: tenant.name, intent: load(tenantId, id)! }
    }).immediate()
    if (existing.intent.status === 'PENDING') return { intentId: existing.intent.id, checkoutUrl: existing.intent.checkoutUrl! }

    try {
      const link = await provider.createPaymentLink({ name: existing.name, amountCents: existing.intent.amountCents, description: `Lash Designer · ${plan.label} · um mês` })
      const updated = db.prepare(`UPDATE appmax_checkout_intents SET payment_link_id = ?, checkout_url = ?, status = 'PENDING'
        WHERE id = ? AND tenant_id = ? AND status = 'CREATING'`).run(link.linkId, link.checkoutUrl, existing.intent.id, tenantId)
      if (updated.changes !== 1) throw new Error('A intenção de pagamento mudou durante a criação do link.')
      return { intentId: existing.intent.id, checkoutUrl: link.checkoutUrl }
    } catch (error) {
      // A timeout/5xx may happen after the external link was created. Keep the
      // intent and reservations until reviewed; never create a second charge blindly.
      if (error instanceof AppmaxRequestError && error.status >= 400 && error.status < 500 && error.status !== 408) db.transaction(() => {
        db.prepare(`UPDATE appmax_checkout_intents SET status = 'FAILED' WHERE id = ? AND tenant_id = ? AND status = 'CREATING'`).run(existing.intent.id, tenantId)
        referrals.failed(tenantId,existing.intent.id)
      }).immediate()
      throw error
    }
  }

  async function confirmOrder(input: { tenantId: string; intentId: string; orderId: number }) {
    const intent = load(input.tenantId, input.intentId)
    if (!intent || !intent.paymentLinkId) return false
    if (intent.status === 'PAID') return intent.orderId === input.orderId
    if (intent.status !== 'PENDING') return false
    const confirmed = await provider.verifyPaymentLinkOrder({
      linkId: intent.paymentLinkId, orderId: input.orderId, expectedAmountCents: intent.amountCents,
    })
    if (!confirmed) return false
    return db.transaction(() => {
      const current = load(input.tenantId, input.intentId)
      if (!current || current.status !== 'PENDING' || current.paymentLinkId !== intent.paymentLinkId) return current?.status === 'PAID' && current.orderId === input.orderId
      const now = new Date().toISOString()
      const active = db.prepare(`SELECT 1 FROM subscriptions WHERE tenant_id = ? AND status = 'ACTIVE' AND current_period_end > ? LIMIT 1`).get(input.tenantId, now)
      if (active) throw new Error('Assinatura ativa detectada; conciliação manual necessária antes de aplicar o pagamento.')
      const periodEnd = nextBillingPeriodEnd(null, 1, new Date(now))
      const updated = db.prepare(`UPDATE appmax_checkout_intents SET status = 'PAID', order_id = ?, paid_at = ?
        WHERE tenant_id = ? AND id = ? AND status = 'PENDING'`).run(input.orderId, now, input.tenantId, input.intentId)
      if (updated.changes !== 1) return false
      const previous = db.prepare('SELECT id FROM subscriptions WHERE tenant_id = ?').get(input.tenantId) as { id: string } | undefined
      if (previous) db.prepare(`UPDATE subscriptions SET status = 'ACTIVE', plan_code = ?, billing_cycle = 'MONTHLY', current_period_end = ?, external_id = ?, updated_at = ? WHERE tenant_id = ?`)
        .run(intent.planCode, periodEnd, `appmax:${input.orderId}`, now, input.tenantId)
      else db.prepare(`INSERT INTO subscriptions (id, tenant_id, external_id, status, current_period_end, billing_cycle, plan_code, created_at, updated_at)
        VALUES (?, ?, ?, 'ACTIVE', ?, 'MONTHLY', ?, ?, ?)`).run(randomUUID(), input.tenantId, `appmax:${input.orderId}`, periodEnd, intent.planCode, now, now)
      db.prepare(`UPDATE tenants SET status = 'ACTIVE', suspension_reason = NULL WHERE id = ? AND (status = 'ONBOARDING' OR (status = 'SUSPENDED' AND suspension_reason = 'APPMAX'))`).run(input.tenantId)
      referrals.paid(input.tenantId,input.intentId)
      return true
    }).immediate()
  }

  async function reconcileOrder(input: { tenantId: string; intentId: string; orderId: number }) {
    const intent = load(input.tenantId, input.intentId)
    if (!intent || !intent.paymentLinkId || intent.status === 'REFUNDED' ||
      (intent.status === 'PAID' && intent.orderId !== input.orderId) ||
      !['PENDING', 'PAID'].includes(intent.status) || !provider.inspectPaymentLinkOrder) return false
    const state = await provider.inspectPaymentLinkOrder({
      linkId: intent.paymentLinkId, orderId: input.orderId, expectedAmountCents: intent.amountCents,
    })
    if (state === 'PAID') return intent.status === 'PAID' || confirmOrder(input)
    if (state !== 'REVERSED') return false
    return db.transaction(() => {
      const latest = load(input.tenantId, input.intentId)
      if (!latest || !['PENDING', 'PAID'].includes(latest.status) ||
        (latest.orderId !== null && latest.orderId !== input.orderId)) return false
      const now = new Date().toISOString()
      db.prepare("UPDATE appmax_checkout_intents SET status = 'REFUNDED', order_id = ? WHERE id = ? AND tenant_id = ?")
        .run(input.orderId, input.intentId, input.tenantId)
      referrals.reversed(input.tenantId,input.intentId)
      if (latest.status === 'PAID') {
        // A newer paid order may own the current subscription. Never suspend it.
        const suspended = db.prepare("UPDATE subscriptions SET status = 'CANCELLED', updated_at = ? WHERE tenant_id = ? AND status = 'ACTIVE' AND external_id = ?")
          .run(now, input.tenantId, `appmax:${input.orderId}`)
        if (suspended.changes) db.prepare("UPDATE tenants SET status = 'SUSPENDED', suspension_reason = 'APPMAX' WHERE id = ? AND status = 'ACTIVE'").run(input.tenantId)
      }
      return true
    }).immediate()
  }

  async function reconcilePaidIntents() {
    if (!provider.inspectPaymentLinkOrder) return
    const rows = db.prepare(`SELECT id, tenant_id as tenantId, order_id as orderId
      FROM appmax_checkout_intents WHERE status = 'PAID' AND order_id IS NOT NULL AND paid_at > ?
      ORDER BY coalesce(provider_checked_at, paid_at) ASC LIMIT 20`)
      .all(new Date(Date.now() - 60 * 86400_000).toISOString()) as Array<{ id: string; tenantId: string; orderId: number }>
    for (const row of rows) {
      try {
        await reconcileOrder({ tenantId: row.tenantId, intentId: row.id, orderId: row.orderId })
        db.prepare("UPDATE appmax_checkout_intents SET provider_checked_at = ? WHERE id = ? AND status = 'PAID'")
          .run(new Date().toISOString(), row.id)
      } catch { /* Consulta falhou; mantém acesso e tenta novamente no próximo ciclo. */ }
    }
  }

  async function reconcilePendingIntents() {
    if (!provider.listPaymentLinkOrders) return
    const intents = db.prepare(`SELECT id, tenant_id as tenantId, payment_link_id as paymentLinkId
      FROM appmax_checkout_intents WHERE status = 'PENDING' AND payment_link_id IS NOT NULL AND created_at > ? ORDER BY created_at LIMIT 20`)
      .all(new Date(Date.now() - 30 * 86400_000).toISOString()) as Array<{ id: string; tenantId: string; paymentLinkId: number }>
    for (const intent of intents) {
      try {
        const orders = await provider.listPaymentLinkOrders(intent.paymentLinkId)
        for (const order of orders) {
          if (provider.inspectPaymentLinkOrder) {
            if (await reconcileOrder({ tenantId: intent.tenantId, intentId: intent.id, orderId: order.id })) break
          } else if (['aprovado', 'integrado'].includes(order.status.toLowerCase()) &&
            await confirmOrder({ tenantId: intent.tenantId, intentId: intent.id, orderId: order.id })) break
        }
      } catch { /* Retenta na próxima passagem; nunca libera acesso sem verificação. */ }
    }
  }

  function quoteForTenant(tenantId: string, code: TeamPlanCode): TeamQuote {
    const plan = teamPlanByCode(code)!
    const pending = db.prepare("SELECT id FROM appmax_checkout_intents WHERE tenant_id = ? AND plan_code = ? AND status IN ('CREATING','PENDING') LIMIT 1").get(tenantId,code) as {id:string}|undefined
    if(pending){const intent=load(tenantId,pending.id)!;return {grossAmountCents:intent.grossAmountCents,amountCents:intent.amountCents,discountPercent:intent.discountPercent,discountAmountCents:intent.grossAmountCents-intent.amountCents,source:intent.referralRedemptionId?'REFERRAL':intent.discountPercent?'CREDITS':'NONE'}}
    return referrals.quote(tenantId,plan.amountCents).result
  }
  function publicQuote(code: TeamPlanCode, token?: string) {const quote=referrals.quote(null,teamPlanByCode(code)!.amountCents,token).result;return {...quote,fingerprint:referralQuoteFingerprint(quote,token)}}
  return { creditPreview: (tenantId:string) => referrals.creditPreview(tenantId), quoteForTenant, publicQuote, validateReferral: referrals.validateReferral, startCheckout, confirmOrder, reconcileOrder, reconcilePendingIntents, reconcilePaidIntents }
}
