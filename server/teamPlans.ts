// Current monthly offer. Catalog visibility does not depend on Appmax readiness.
export const TEAM_PLANS = [
  { code: 'TEAM_3', seats: 3, minProfessionals: 1, amountCents: 7_490, label: '1 a 3 profissionais' },
  { code: 'TEAM_6', seats: 6, minProfessionals: 4, amountCents: 9_990, label: '4 a 6 profissionais' },
  { code: 'TEAM_15', seats: 15, minProfessionals: 7, amountCents: 14_900, label: '7 a 15 profissionais' },
] as const

export type TeamPlanCode = (typeof TEAM_PLANS)[number]['code']

export const teamPlanByCode = (code: string | null | undefined) => TEAM_PLANS.find(plan => plan.code === code)

export const teamPlanForCount = (activeProfessionals: number) =>
  TEAM_PLANS.find(plan => activeProfessionals <= plan.seats) ?? null
