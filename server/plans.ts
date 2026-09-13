export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'

export type BillingPlan = {
  cycle: BillingCycle
  months: number
  label: string
  amountCents: number
  monthlyEquivalentCents: number
  savingsPercent: number
  featured: boolean
}

export const buildBillingPlans = (prices: Record<BillingCycle, number>): BillingPlan[] => {
  const monthly = prices.MONTHLY
  const definitions: Array<[BillingCycle, number, string, boolean]> = [
    ['MONTHLY', 1, 'Mensal', false],
    ['QUARTERLY', 3, 'Trimestral', false],
    ['SEMIANNUAL', 6, 'Semestral', false],
    ['ANNUAL', 12, 'Anual', true],
  ]
  return definitions.map(([cycle, months, label, featured]) => {
    const amountCents = prices[cycle]
    const monthlyEquivalentCents = Math.round(amountCents / months)
    const fullPrice = monthly * months
    const savingsPercent = fullPrice > 0 ? Math.max(0, Math.round((1 - amountCents / fullPrice) * 1000) / 10) : 0
    return { cycle, months, label, amountCents, monthlyEquivalentCents, savingsPercent, featured }
  })
}

export const addBillingMonths = (from: Date, months: number) => {
  const end = new Date(from)
  const day = end.getUTCDate()
  end.setUTCDate(1)
  end.setUTCMonth(end.getUTCMonth() + months)
  const finalDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  end.setUTCDate(Math.min(day, finalDay))
  return end.toISOString()
}

export const nextBillingPeriodEnd = (
  currentPeriodEnd: string | null | undefined,
  months: number,
  now = new Date(),
) => {
  const parsed = currentPeriodEnd ? new Date(currentPeriodEnd) : null
  const base = parsed && Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime() ? parsed : now
  return addBillingMonths(base, months)
}
