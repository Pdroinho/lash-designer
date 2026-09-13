export const annualPeriodEnd = (from = new Date()) => {
  const end = new Date(from)
  end.setUTCFullYear(end.getUTCFullYear() + 1)
  return end.toISOString()
}

export const nextAnnualPeriodEnd = (currentPeriodEnd: string | null | undefined, now = new Date()) => {
  const parsed = currentPeriodEnd ? new Date(currentPeriodEnd) : null
  const base = parsed && Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime() ? parsed : now
  return annualPeriodEnd(base)
}
