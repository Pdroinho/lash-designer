export type TeamPlan = { code: 'TEAM_3' | 'TEAM_6' | 'TEAM_15'; seats: number; minProfessionals: number; amountCents: number; label: string }
// Current commercial offer, used before the catalog loads and when the network fails.
// It must never depend on payment-provider readiness.
export const PUBLIC_TEAM_PLANS: readonly TeamPlan[] = [
  {code:'TEAM_3',seats:3,minProfessionals:1,amountCents:7490,label:'1 a 3 profissionais'},
  {code:'TEAM_6',seats:6,minProfessionals:4,amountCents:9990,label:'4 a 6 profissionais'},
  {code:'TEAM_15',seats:15,minProfessionals:7,amountCents:14900,label:'7 a 15 profissionais'},
]
export function validTeamPlans(value:unknown): value is TeamPlan[] {
  return Array.isArray(value) && value.length===3 && PUBLIC_TEAM_PLANS.every(expected => value.filter(plan=>plan && plan.code===expected.code && plan.seats===expected.seats && plan.minProfessionals===expected.minProfessionals && typeof plan.label==='string' && plan.label.length>0 && Number.isSafeInteger(plan.amountCents) && plan.amountCents>0).length===1)
}
export function orderedTeamPlans(plans:TeamPlan[]) { return PUBLIC_TEAM_PLANS.map(expected=>plans.find(plan=>plan.code===expected.code)!) }
