import assert from 'node:assert/strict'
import test from 'node:test'
import { annualPeriodEnd, nextAnnualPeriodEnd } from './billing.js'

test('annualPeriodEnd preserva data e horário ao acrescentar um ano', () => {
  assert.equal(annualPeriodEnd(new Date('2026-08-05T12:30:00.000Z')), '2027-08-05T12:30:00.000Z')
})

test('nextAnnualPeriodEnd parte de agora quando não há período futuro', () => {
  const now = new Date('2026-08-05T12:00:00.000Z')
  assert.equal(nextAnnualPeriodEnd(null, now), '2027-08-05T12:00:00.000Z')
  assert.equal(nextAnnualPeriodEnd('2026-07-01T00:00:00.000Z', now), '2027-08-05T12:00:00.000Z')
})

test('nextAnnualPeriodEnd preserva dias pagos restantes', () => {
  const now = new Date('2026-08-05T12:00:00.000Z')
  assert.equal(nextAnnualPeriodEnd('2026-12-20T15:45:00.000Z', now), '2027-12-20T15:45:00.000Z')
})

test('nextAnnualPeriodEnd ignora data inválida', () => {
  const now = new Date('2026-08-05T12:00:00.000Z')
  assert.equal(nextAnnualPeriodEnd('data-invalida', now), '2027-08-05T12:00:00.000Z')
})
