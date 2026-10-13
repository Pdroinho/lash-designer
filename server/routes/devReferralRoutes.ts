import express, { type RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, notFound, unauthorized } from '../http.js'
import { highValueLinkPolicy } from '../referrals.js'

type DevReferralRouterOptions = {
  db: Database.Database
  requireDevHost: RequestHandler
  referralMutationLimiter: RequestHandler
  referralToken: () => string
  publicReferralUrl: (token: string) => string
}

export function createDevReferralRouter(options: DevReferralRouterOptions) {
  const { db, requireDevHost, referralMutationLimiter, referralToken, publicReferralUrl } = options
  const router = express.Router()

  router.get('/referrals', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const metrics = db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM referral_links WHERE active = 1) as activeLinks,
          (SELECT COUNT(*) FROM referral_redemptions) as totalRedemptions,
          (SELECT COUNT(*) FROM referral_redemptions WHERE status = 'PAID') as paidRedemptions,
          (SELECT COALESCE(SUM(discount_amount_cents), 0) FROM referral_redemptions WHERE status = 'PAID') as grantedDiscountCents,
          (SELECT COUNT(*) FROM referral_credits WHERE status = 'AVAILABLE') as availableCredits
      `).get() as { activeLinks: number; totalRedemptions: number; paidRedemptions: number; grantedDiscountCents: number; availableCredits: number }
      const links = db.prepare(`
        SELECT rl.id, rl.label, rl.token, rl.invitee_discount_percent as inviteeDiscountPercent,
               rl.referrer_reward_percent as referrerRewardPercent, rl.max_redemptions as maxRedemptions,
               rl.redemptions_count as redemptionsCount, rl.expires_at as expiresAt, rl.active,
               rl.created_at as createdAt, t.name as ownerName
        FROM referral_links rl
        LEFT JOIN tenants t ON t.id = rl.owner_tenant_id
        ORDER BY rl.created_at DESC LIMIT 100
      `).all() as Array<{ id: string; label: string; token: string; inviteeDiscountPercent: number; referrerRewardPercent: number; maxRedemptions: number; redemptionsCount: number; expiresAt: string | null; active: number; createdAt: string; ownerName: string | null }>
      const recent = db.prepare(`
        SELECT rr.id, rr.status, rr.gross_amount_cents as grossAmountCents,
               rr.discount_amount_cents as discountAmountCents, rr.created_at as createdAt,
               rr.paid_at as paidAt, invited.name as invitedName, owner.name as ownerName
        FROM referral_redemptions rr
        JOIN referral_links rl ON rl.id = rr.link_id
        JOIN tenants invited ON invited.id = rr.invited_tenant_id
        LEFT JOIN tenants owner ON owner.id = rl.owner_tenant_id
        ORDER BY rr.created_at DESC LIMIT 100
      `).all()
      res.json({ metrics, links: links.map((link) => ({ ...link, active: Boolean(link.active), url: publicReferralUrl(link.token) })), recent })
    } catch (err) { next(err) }
  })

  router.post('/referrals/links', requireDevHost, referralMutationLimiter, requireRole('DEV'), (req, res, next) => {
    try {
      const userId = req.sessionUser?.id
      if (!userId) throw unauthorized()
      const body = z.object({
        label: z.string().trim().min(2).max(120),
        inviteeDiscountPercent: z.number().int().min(0).max(100),
        referrerRewardPercent: z.number().int().min(0).max(30).default(0),
        maxRedemptions: z.number().int().min(1).max(100000).default(1),
        expiresAt: z.string().datetime().nullable().optional().default(null),
        confirmation: z.string().optional(),
      }).parse(req.body ?? {})
      if (body.inviteeDiscountPercent === 100 && body.confirmation !== 'GERAR 100%') {
        throw badRequest('Confirme exatamente “GERAR 100%”.', 'HIGH_DISCOUNT_CONFIRMATION_REQUIRED')
      }
      const policy = highValueLinkPolicy(body)
      if (policy.expiresAt && Date.parse(policy.expiresAt) <= Date.now()) throw badRequest('A validade precisa estar no futuro.', 'INVALID_EXPIRY')
      const id = randomUUID()
      const token = referralToken()
      const now = new Date().toISOString()
      db.prepare(`INSERT INTO referral_links (id, owner_tenant_id, created_by_user_id, label, token, invitee_discount_percent, referrer_reward_percent, max_redemptions, expires_at, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, body.label, token, policy.percent, body.referrerRewardPercent, policy.maxRedemptions, policy.expiresAt, now)
      res.json({ link: { id, label: body.label, url: publicReferralUrl(token), inviteeDiscountPercent: policy.percent, referrerRewardPercent: body.referrerRewardPercent, maxRedemptions: policy.maxRedemptions, expiresAt: policy.expiresAt, active: true } })
    } catch (err) { next(err) }
  })

  router.patch('/referrals/links/:id', requireDevHost, referralMutationLimiter, requireRole('DEV'), (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id)
      const body = z.object({ active: z.boolean() }).parse(req.body ?? {})
      const result = db.prepare(`UPDATE referral_links SET active = ? WHERE id = ?`).run(body.active ? 1 : 0, id)
      if (result.changes !== 1) throw notFound('Link não encontrado.', 'REFERRAL_LINK_NOT_FOUND')
      res.json({ ok: true, active: body.active })
    } catch (err) { next(err) }
  })

  return router
}

