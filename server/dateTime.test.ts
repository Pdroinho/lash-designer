import assert from 'node:assert/strict'
import test from 'node:test'
import { dayBoundsUtc, monthBoundsUtc, shiftYearMonth } from './dateTime.js'

test('dayBoundsUtc respeita o início do dia em America/Bahia', () => {
  const bounds = dayBoundsUtc({ timeZone: 'America/Bahia', ymd: '2026-08-05' })
  assert.equal(bounds.start.toISOString(), '2026-08-05T03:00:00.000Z')
  assert.equal(bounds.endExclusive.toISOString(), '2026-08-06T03:00:00.000Z')
})

test('monthBoundsUtc não agrupa bordas pelo mês UTC', () => {
  const bounds = monthBoundsUtc({ timeZone: 'America/Bahia', year: 2026, month: 8 })
  assert.equal(bounds.start.toISOString(), '2026-08-01T03:00:00.000Z')
  assert.equal(bounds.endExclusive.toISOString(), '2026-09-01T03:00:00.000Z')
})

test('shiftYearMonth atravessa ano sem depender do fuso do servidor', () => {
  assert.deepEqual(shiftYearMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 })
  assert.deepEqual(shiftYearMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 })
})
