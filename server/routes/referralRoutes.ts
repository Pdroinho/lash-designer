import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, notFound } from '../http.js'
import {
  DEFAULT_INVITEE_DISCOUNT_PERCENT,
  DEFAULT_REFERRER_REWARD_PERCENT,
} from '../referrals.js'

type PublicReferralRouterOptions = {
  db: Database.Database
  now?: () => Date
}

type AdminReferralRouterOptions = {
  db: Database.Database
  referralMutationLimiter: RequestHandler
  referralToken: () => string
  publicReferralUrl: (token: string) => string
  teamDiscountsAvailable?: boolean
  creditPreview?: (tenantId:string) => {discountPercent:number; debts:Array<{percent:number}>}
  now?: () => Date
}

export function createPublicReferralRouter({ db, now = () => new Date() }: PublicReferralRouterOptions) {
  const router = Router()

  router.get('/referrals/:token', (req, res, next) => {
    try {
      const token = z.string().min(20).max(80).parse(req.params.token)
      const timestamp = now().toISOString()
      const link = db.prepare(`
        SELECT label, invitee_discount_percent as inviteeDiscountPercent, expires_at as expiresAt,
               max_redemptions as maxRedemptions, redemptions_count as redemptionsCount
        FROM referral_links
        WHERE token = ? AND active = 1 AND redemptions_count < max_redemptions
          AND (expires_at IS NULL OR expires_at > ?)
        LIMIT 1
      `).get(token, timestamp) as { label: string; inviteeDiscountPercent: number; expiresAt: string | null; maxRedemptions: number; redemptionsCount: number } | undefined
      if (!link) return next(notFound('Link de indicação inválido ou expirado.', 'REFERRAL_NOT_FOUND'))
      res.json({ referral: { label: link.label, inviteeDiscountPercent: link.inviteeDiscountPercent, expiresAt: link.expiresAt } })
    } catch (err) {
      next(err)
    }
  })

  return router
}

export function createAdminReferralRouter({
  db,
  referralMutationLimiter,
  referralToken,
  publicReferralUrl,
  teamDiscountsAvailable = false,
  creditPreview,
  now = () => new Date(),
}: AdminReferralRouterOptions) {
  const router = Router()

  router.get('/referrals/overview', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) throw badRequest('Tenant inválido.', 'INVALID_TENANT')
      const link = db.prepare(`
        SELECT id, token, invitee_discount_percent as inviteeDiscountPercent,
               referrer_reward_percent as referrerRewardPercent, redemptions_count as redemptionsCount,
               max_redemptions as maxRedemptions, CASE WHEN active = 1 AND redemptions_count < max_redemptions AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END as active, created_at as createdAt
        FROM referral_links
        WHERE owner_tenant_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(now().toISOString(),tenantId) as { id: string; token: string; inviteeDiscountPercent: number; referrerRewardPercent: number; redemptionsCount: number; maxRedemptions: number; active: number; createdAt: string } | undefined
      const metrics = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN rr.status = 'PAID' THEN 1 ELSE 0 END) as paid,
               COALESCE(SUM(CASE WHEN rr.status = 'PAID' THEN rr.discount_amount_cents ELSE 0 END), 0) as customerSavingsCents
        FROM referral_redemptions rr
        JOIN referral_links rl ON rl.id = rr.link_id
        WHERE rl.owner_tenant_id = ?
      `).get(tenantId) as { total: number; paid: number | null; customerSavingsCents: number }
      const credits = db.prepare(`
        SELECT discount_percent as discountPercent, status, created_at as createdAt
        FROM referral_credits
        WHERE owner_tenant_id = ?
        ORDER BY created_at DESC LIMIT 30
      `).all(tenantId) as Array<{ discountPercent: number; status: string; createdAt: string }>
      const preview = creditPreview?.(tenantId)
      res.json({
        ...(preview ? {availableRenewalDiscountPercent:preview.discountPercent,debtRecoveryPercent:preview.debts.reduce((sum,debt)=>sum+debt.percent,0)} : {}),
        teamDiscountsAvailable,
        link: link ? { ...link, active: Boolean(link.active), url: publicReferralUrl(link.token) } : null,
        metrics: { total: metrics.total, paid: metrics.paid ?? 0, customerSavingsCents: metrics.customerSavingsCents },
        credits,
        rules: {
          inviteeDiscountPercent: DEFAULT_INVITEE_DISCOUNT_PERCENT,
          referrerRewardPercent: DEFAULT_REFERRER_REWARD_PERCENT,
          renewalCapPercent: 30,
        },
      })
    } catch (err) {
      next(err)
    }
  })

  // Preserve the original order: mutation limiting happens before authentication.
  router.post('/referrals/link', referralMutationLimiter, requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      const userId = req.sessionUser?.id
      if (!tenantId || !userId) throw badRequest('Tenant inválido.', 'INVALID_TENANT')
      const existing = db.prepare(`
        SELECT id, token FROM referral_links
        WHERE owner_tenant_id = ? AND active = 1 AND redemptions_count < max_redemptions AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC LIMIT 1
      `).get(tenantId,now().toISOString()) as { id: string; token: string } | undefined
      if (existing) return res.json({ id: existing.id, url: publicReferralUrl(existing.token), reused: true })
      const tenant = db.prepare(`SELECT name FROM tenants WHERE id = ?`).get(tenantId) as { name: string } | undefined
      const id = randomUUID()
      const token = referralToken()
      const timestamp = now().toISOString()
      db.prepare(`
        INSERT INTO referral_links
          (id, owner_tenant_id, created_by_user_id, label, token, invitee_discount_percent,
           referrer_reward_percent, max_redemptions, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 100000, ?)
      `).run(
        id,
        tenantId,
        userId,
        `Indicação de ${tenant?.name || 'uma cliente Lash Designer'}`,
        token,
        DEFAULT_INVITEE_DISCOUNT_PERCENT,
        DEFAULT_REFERRER_REWARD_PERCENT,
        timestamp,
      )
      res.json({ id, url: publicReferralUrl(token), reused: false })
    } catch (err) {
      next(err)
    }
  })

  return router
}
