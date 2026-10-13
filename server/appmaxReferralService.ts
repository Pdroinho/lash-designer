import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { badRequest } from './http.js'
import {
  discountQuote,
  MAX_REFERRER_RENEWAL_DISCOUNT_PERCENT,
} from './referrals.js'

type Link = {
  id: string
  ownerTenantId: string | null
  inviteePercent: number
  rewardPercent: number
  label: string
}
type Credit = { id: string; percent: number }
type Debt = { creditId: string; percent: number }
export type TeamQuote = {
  grossAmountCents: number
  amountCents: number
  discountPercent: number
  discountAmountCents: number
  source: 'REFERRAL' | 'CREDITS' | 'NONE'
  debtRecoveryPercent?: number
  referralLabel?: string
}

export function referralQuoteFingerprint(quote: TeamQuote, token?: string) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        quote.grossAmountCents,
        quote.amountCents,
        quote.discountPercent,
        token ?? '',
      ]),
    )
    .digest('hex')
}

export function createAppmaxReferralService(db: Database.Database) {
  function linkByToken(token: string) {
    const row = db
      .prepare(
        `SELECT id, owner_tenant_id as ownerTenantId, invitee_discount_percent as inviteePercent,
      referrer_reward_percent as rewardPercent, label FROM referral_links
      WHERE token = ? AND active = 1 AND redemptions_count < max_redemptions AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(token, new Date().toISOString()) as Link | undefined
    if (!row)
      throw badRequest(
        'Link de indicação inválido, esgotado ou expirado.',
        'REFERRAL_INVALID',
      )
    return row
  }
  function rejectSelf(
    link: Link,
    identity: { tenantId?: string; email?: string; phone?: string },
  ) {
    if (!link.ownerTenantId) return
    if (link.ownerTenantId === identity.tenantId)
      throw badRequest('Autoindicação não é permitida.', 'SELF_REFERRAL')
    const owners = db
      .prepare(
        "SELECT email, phone FROM users WHERE tenant_id = ? AND role = 'ADMIN'",
      )
      .all(link.ownerTenantId) as Array<{ email: string; phone: string | null }>
    const phone = identity.phone?.replace(/\D/g, '')
    if (
      owners.some(
        (owner) =>
          (identity.email &&
            owner.email.toLowerCase() === identity.email.toLowerCase()) ||
          (phone && owner.phone?.replace(/\D/g, '') === phone),
      )
    )
      throw badRequest('Autoindicação não é permitida.', 'SELF_REFERRAL')
  }
  function validateReferral(
    token: string,
    identity: { tenantId?: string; email?: string; phone?: string } = {},
  ) {
    const link = linkByToken(token)
    rejectSelf(link, identity)
    return link
  }
  function firstPurchase(tenantId: string) {
    return (
      !db
        .prepare(
          "SELECT 1 FROM appmax_checkout_intents WHERE tenant_id = ? AND status IN ('PAID','REFUNDED') LIMIT 1",
        )
        .get(tenantId) &&
      !db
        .prepare('SELECT 1 FROM subscriptions WHERE tenant_id = ? LIMIT 1')
        .get(tenantId) &&
      !db
        .prepare(
          "SELECT 1 FROM infinitepay_orders WHERE tenant_id = ? AND status = 'PAID' LIMIT 1",
        )
        .get(tenantId)
    )
  }
  function chooseCredits(tenantId: string) {
    const credits = db
      .prepare(
        "SELECT id, discount_percent as percent FROM referral_credits WHERE owner_tenant_id = ? AND status = 'AVAILABLE' ORDER BY created_at, id",
      )
      .all(tenantId) as Credit[]
    const debts = db
      .prepare(
        'SELECT credit_id as creditId, discount_percent - recovered_percent as percent FROM appmax_referral_debts WHERE tenant_id = ? AND discount_percent > recovered_percent ORDER BY credit_id',
      )
      .all(tenantId) as Debt[]
    const owed = debts.reduce((sum, debt) => sum + debt.percent, 0)
    let total = 0
    const selected: Credit[] = []
    for (const credit of credits) {
      if (
        Math.max(0, total + credit.percent - owed) >
        MAX_REFERRER_RENEWAL_DISCOUNT_PERCENT
      )
        continue
      selected.push(credit)
      total += credit.percent
    }
    let recover = Math.min(owed, total)
    const allocations = debts
      .map((debt) => {
        const percent = Math.min(recover, debt.percent)
        recover -= percent
        return { ...debt, percent }
      })
      .filter((debt) => debt.percent > 0)
    return {
      credits: selected,
      debts: allocations,
      discountPercent: Math.max(0, total - owed),
    }
  }
  function quote(
    tenantId: string | null,
    grossAmountCents: number,
    token?: string,
  ) {
    let link: Link | undefined
    if (token) {
      link = validateReferral(token, { tenantId: tenantId ?? undefined })
      if (tenantId && !firstPurchase(tenantId))
        throw badRequest(
          'Indicação vale apenas na primeira assinatura.',
          'REFERRAL_FIRST_PURCHASE_ONLY',
        )
    } else if (tenantId && firstPurchase(tenantId)) {
      link = db
        .prepare(
          `SELECT rl.id, rl.owner_tenant_id as ownerTenantId, rl.invitee_discount_percent as inviteePercent,
        rl.referrer_reward_percent as rewardPercent, rl.label FROM appmax_referral_memberships m JOIN referral_links rl ON rl.id = m.link_id
        WHERE m.tenant_id = ? AND rl.active = 1 AND rl.redemptions_count < rl.max_redemptions AND (rl.expires_at IS NULL OR rl.expires_at > ?)`,
        )
        .get(tenantId, new Date().toISOString()) as Link | undefined
    }
    const selection =
      tenantId && !link
        ? chooseCredits(tenantId)
        : { credits: [], debts: [], discountPercent: 0 }
    const quoted = discountQuote(
      grossAmountCents,
      link?.inviteePercent ?? selection.discountPercent,
    )
    if (quoted.amountCents < 500)
      throw badRequest(
        'Este desconto deixa o valor abaixo do mínimo de R$ 5,00 da Appmax. Solicite revisão do link ao suporte.',
        'REFERRAL_GATEWAY_MINIMUM',
      )
    const result: TeamQuote = {
      ...quoted,
      debtRecoveryPercent: selection.debts.reduce(
        (sum, debt) => sum + debt.percent,
        0,
      ),
      source: link ? 'REFERRAL' : selection.credits.length ? 'CREDITS' : 'NONE',
      ...(link ? { referralLabel: link.label } : {}),
    }
    return { result, link, selection }
  }
  function reserve(
    tenantId: string,
    intentId: string,
    grossAmountCents: number,
    token?: string,
    fingerprint?: string,
  ) {
    if (token) {
      const user = db
        .prepare(
          "SELECT email, phone FROM users WHERE tenant_id = ? AND role = 'ADMIN' LIMIT 1",
        )
        .get(tenantId) as { email: string; phone: string | null } | undefined
      const link = validateReferral(token, {
        tenantId,
        email: user?.email,
        phone: user?.phone ?? undefined,
      })
      const member = db
        .prepare(
          'SELECT link_id as linkId FROM appmax_referral_memberships WHERE tenant_id = ?',
        )
        .get(tenantId) as { linkId: string } | undefined
      if (member && member.linkId !== link.id)
        throw badRequest(
          'Este estúdio já está vinculado a outra indicação.',
          'REFERRAL_ALREADY_BOUND',
        )
      db.prepare(
        'INSERT OR IGNORE INTO appmax_referral_memberships (tenant_id,link_id,created_at) VALUES (?,?,?)',
      ).run(tenantId, link.id, new Date().toISOString())
    }
    const { result, link, selection } = quote(tenantId, grossAmountCents, token)
    if (fingerprint && fingerprint !== referralQuoteFingerprint(result, token))
      throw badRequest(
        'O benefício mudou. Revise o valor antes de continuar.',
        'REFERRAL_QUOTE_CHANGED',
      )
    const now = new Date().toISOString()
    let redemptionId: string | null = null
    if (link) {
      const consumed = db
        .prepare(
          'UPDATE referral_links SET redemptions_count = redemptions_count + 1 WHERE id = ? AND active = 1 AND redemptions_count < max_redemptions AND (expires_at IS NULL OR expires_at > ?)',
        )
        .run(link.id, now)
      if (consumed.changes !== 1)
        throw badRequest('Link esgotado ou expirado.', 'REFERRAL_INVALID')
      const previous = db
        .prepare(
          'SELECT id,status FROM referral_redemptions WHERE invited_tenant_id = ?',
        )
        .get(tenantId) as { id: string; status: string } | undefined
      if (previous && previous.status !== 'CANCELLED')
        throw badRequest(
          'Este estúdio já possui uma indicação em andamento.',
          'REFERRAL_ALREADY_BOUND',
        )
      redemptionId = previous?.id ?? randomUUID()
      if (previous)
        db.prepare(
          "UPDATE referral_redemptions SET order_nsu = ?, status = 'PENDING', gross_amount_cents = ?, discount_amount_cents = ?, referrer_reward_percent = ?, created_at = ?, paid_at = NULL WHERE id = ?",
        ).run(
          intentId,
          grossAmountCents,
          result.discountAmountCents,
          link.rewardPercent,
          now,
          redemptionId,
        )
      else
        db.prepare(
          "INSERT INTO referral_redemptions (id,link_id,invited_tenant_id,order_nsu,status,gross_amount_cents,discount_amount_cents,referrer_reward_percent,created_at) VALUES (?,?,?,?,'PENDING',?,?,?,?)",
        ).run(
          redemptionId,
          link.id,
          tenantId,
          intentId,
          grossAmountCents,
          result.discountAmountCents,
          link.rewardPercent,
          now,
        )
    }
    for (const credit of selection.credits)
      db.prepare(
        "UPDATE referral_credits SET status = 'RESERVED', applied_order_nsu = ?, reserved_at = ? WHERE id = ? AND owner_tenant_id = ? AND status = 'AVAILABLE'",
      ).run(intentId, now, credit.id, tenantId)
    return { quote: result, redemptionId, debts: selection.debts }
  }
  function reserveDebts(intentId: string, debts: Debt[]) {
    for (const debt of debts)
      db.prepare(
        'INSERT INTO appmax_referral_debt_allocations (intent_id,credit_id,discount_percent) VALUES (?,?,?)',
      ).run(intentId, debt.creditId, debt.percent)
  }
  function debtForCredit(credit: {
    id: string
    tenantId: string
    percent: number
  }) {
    db.prepare(
      'INSERT OR IGNORE INTO appmax_referral_debts (credit_id,tenant_id,discount_percent) VALUES (?,?,?)',
    ).run(credit.id, credit.tenantId, credit.percent)
  }
  function paid(tenantId: string, intentId: string) {
    const now = new Date().toISOString()
    const revoked = db
      .prepare(
        "SELECT id, owner_tenant_id as tenantId, discount_percent as percent FROM referral_credits WHERE owner_tenant_id = ? AND applied_order_nsu = ? AND status = 'REVOKED'",
      )
      .all(tenantId, intentId) as Array<{
      id: string
      tenantId: string
      percent: number
    }>
    for (const credit of revoked) debtForCredit(credit)
    db.prepare(
      "UPDATE referral_credits SET status = 'APPLIED', applied_at = ?, reserved_at = NULL WHERE owner_tenant_id = ? AND applied_order_nsu = ? AND status = 'RESERVED'",
    ).run(now, tenantId, intentId)
    const allocations = db
      .prepare(
        'SELECT credit_id as creditId,discount_percent as percent FROM appmax_referral_debt_allocations WHERE intent_id = ? AND applied = 0',
      )
      .all(intentId) as Debt[]
    for (const debt of allocations)
      db.prepare(
        'UPDATE appmax_referral_debts SET recovered_percent = recovered_percent + ? WHERE credit_id = ?',
      ).run(debt.percent, debt.creditId)
    db.prepare(
      'UPDATE appmax_referral_debt_allocations SET applied = 1 WHERE intent_id = ?',
    ).run(intentId)
    const redemption = db
      .prepare(
        `SELECT rr.id,rr.referrer_reward_percent as percent,rl.owner_tenant_id as ownerTenantId FROM referral_redemptions rr JOIN referral_links rl ON rl.id = rr.link_id WHERE rr.order_nsu = ? AND rr.invited_tenant_id = ? AND rr.status = 'PENDING'`,
      )
      .get(intentId, tenantId) as
      | { id: string; percent: number; ownerTenantId: string | null }
      | undefined
    if (!redemption) return
    db.prepare(
      "UPDATE referral_redemptions SET status = 'PAID', paid_at = ? WHERE id = ?",
    ).run(now, redemption.id)
    if (
      redemption.ownerTenantId &&
      redemption.ownerTenantId !== tenantId &&
      redemption.percent > 0
    )
      db.prepare(
        "INSERT OR IGNORE INTO referral_credits (id,owner_tenant_id,redemption_id,discount_percent,status,created_at) VALUES (?,?,?,?,'AVAILABLE',?)",
      ).run(
        randomUUID(),
        redemption.ownerTenantId,
        redemption.id,
        redemption.percent,
        now,
      )
  }
  function failed(tenantId: string, intentId: string) {
    db.prepare(
      "UPDATE referral_credits SET status = 'AVAILABLE', applied_order_nsu = NULL, reserved_at = NULL WHERE owner_tenant_id = ? AND applied_order_nsu = ? AND status = 'RESERVED'",
    ).run(tenantId, intentId)
    const redemption = db
      .prepare(
        "SELECT id,link_id as linkId FROM referral_redemptions WHERE order_nsu = ? AND invited_tenant_id = ? AND status = 'PENDING'",
      )
      .get(intentId, tenantId) as { id: string; linkId: string } | undefined
    if (redemption) {
      db.prepare(
        "UPDATE referral_redemptions SET status = 'CANCELLED' WHERE id = ?",
      ).run(redemption.id)
      db.prepare(
        'UPDATE referral_links SET redemptions_count = MAX(0,redemptions_count - 1) WHERE id = ?',
      ).run(redemption.linkId)
    }
  }
  function reversed(tenantId: string, intentId: string) {
    const credit = db
      .prepare(
        `SELECT rc.id,rc.owner_tenant_id as tenantId,rc.discount_percent as percent,rc.status FROM referral_credits rc JOIN referral_redemptions rr ON rr.id = rc.redemption_id WHERE rr.order_nsu = ? AND rr.invited_tenant_id = ?`,
      )
      .get(intentId, tenantId) as
      | { id: string; tenantId: string; percent: number; status: string }
      | undefined
    if (credit) {
      if (credit.status === 'APPLIED') debtForCredit(credit)
      db.prepare(
        "UPDATE referral_credits SET status = 'REVOKED' WHERE id = ?",
      ).run(credit.id)
    }
    db.prepare(
      "UPDATE referral_redemptions SET status = 'REVOKED' WHERE order_nsu = ? AND invited_tenant_id = ? AND status IN ('PENDING','PAID')",
    ).run(intentId, tenantId)
    // Return consumed credits only if their source remains valid.
    const used = db
      .prepare(
        'SELECT id,status FROM referral_credits WHERE owner_tenant_id = ? AND applied_order_nsu = ?',
      )
      .all(tenantId, intentId) as Array<{ id: string; status: string }>
    for (const item of used) {
      if (item.status === 'REVOKED')
        db.prepare(
          'DELETE FROM appmax_referral_debts WHERE credit_id = ? AND recovered_percent = 0 AND NOT EXISTS (SELECT 1 FROM appmax_referral_debt_allocations WHERE credit_id = ?)',
        ).run(item.id, item.id)
      else
        db.prepare(
          "UPDATE referral_credits SET status = 'AVAILABLE', applied_order_nsu = NULL, reserved_at = NULL, applied_at = NULL WHERE id = ?",
        ).run(item.id)
    }
    const allocations = db
      .prepare(
        'SELECT credit_id as creditId,discount_percent as percent FROM appmax_referral_debt_allocations WHERE intent_id = ? AND applied = 1',
      )
      .all(intentId) as Debt[]
    for (const debt of allocations)
      db.prepare(
        'UPDATE appmax_referral_debts SET recovered_percent = recovered_percent - ? WHERE credit_id = ?',
      ).run(debt.percent, debt.creditId)
    db.prepare(
      'UPDATE appmax_referral_debt_allocations SET applied = 0 WHERE intent_id = ?',
    ).run(intentId)
  }
  return {
    creditPreview: chooseCredits,
    quote,
    reserve,
    reserveDebts,
    paid,
    failed,
    reversed,
    validateReferral,
  }
}
