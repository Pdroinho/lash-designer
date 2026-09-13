export const DEFAULT_INVITEE_DISCOUNT_PERCENT = 15
export const DEFAULT_REFERRER_REWARD_PERCENT = 10
export const MAX_REFERRER_RENEWAL_DISCOUNT_PERCENT = 30

export function clampPercent(value: number, max = 100) {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.trunc(value)))
}

export function discountQuote(grossAmountCents: number, percent: number) {
  const gross = Math.max(0, Math.trunc(grossAmountCents))
  const safePercent = clampPercent(percent)
  const discountAmountCents = Math.min(gross, Math.round((gross * safePercent) / 100))
  return {
    grossAmountCents: gross,
    discountPercent: safePercent,
    discountAmountCents,
    amountCents: gross - discountAmountCents,
  }
}

export function renewalRewardPercent(credits: number[]) {
  const sum = credits.reduce((total, value) => total + clampPercent(value, MAX_REFERRER_RENEWAL_DISCOUNT_PERCENT), 0)
  return Math.min(MAX_REFERRER_RENEWAL_DISCOUNT_PERCENT, sum)
}

export function highValueLinkPolicy(input: {
  inviteeDiscountPercent: number
  maxRedemptions: number
  expiresAt: string | null
  now?: Date
}) {
  const percent = clampPercent(input.inviteeDiscountPercent)
  const maxRedemptions = Math.max(1, Math.trunc(input.maxRedemptions))
  if (percent < 100) return { percent, maxRedemptions, expiresAt: input.expiresAt }

  const now = input.now ?? new Date()
  const hardExpiry = new Date(now.getTime() + 7 * 86400000)
  const requestedExpiry = input.expiresAt ? new Date(input.expiresAt) : null
  const expiresAt = requestedExpiry && Number.isFinite(requestedExpiry.getTime()) && requestedExpiry < hardExpiry
    ? requestedExpiry.toISOString()
    : hardExpiry.toISOString()
  return { percent: 100, maxRedemptions: 1, expiresAt }
}
