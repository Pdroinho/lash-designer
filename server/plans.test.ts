import assert from 'node:assert/strict'
import test from 'node:test'
import { addBillingMonths, buildBillingPlans, nextBillingPeriodEnd } from './plans.js'

test('catálogo calcula equivalência mensal e economia', () => {
  const plans = buildBillingPlans({ MONTHLY: 5990, QUARTERLY: 16990, SEMIANNUAL: 32990, ANNUAL: 59880 })
  assert.equal(plans.length, 4)
  assert.equal(plans.find((plan) => plan.cycle === 'ANNUAL')?.monthlyEquivalentCents, 4990)
  assert.equal(plans.find((plan) => plan.cycle === 'QUARTERLY')?.savingsPercent, 5.5)
  assert.equal(plans.find((plan) => plan.cycle === 'SEMIANNUAL')?.savingsPercent, 8.2)
  assert.equal(plans.find((plan) => plan.cycle === 'ANNUAL')?.savingsPercent, 16.7)
  assert.equal(plans.find((plan) => plan.cycle === 'ANNUAL')?.featured, true)
})

test('período mensal preserva final de mês', () => {
  assert.equal(addBillingMonths(new Date('2026-01-31T12:00:00.000Z'), 1), '2026-02-28T12:00:00.000Z')
})

test('renovação soma ao período ainda vigente', () => {
  const end = nextBillingPeriodEnd('2026-12-01T00:00:00.000Z', 3, new Date('2026-08-01T00:00:00.000Z'))
  assert.equal(end, '2027-03-01T00:00:00.000Z')
})
