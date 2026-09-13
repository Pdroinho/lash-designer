import assert from 'node:assert/strict'
import test from 'node:test'
import { discountQuote, highValueLinkPolicy, renewalRewardPercent } from './referrals.js'

test('discountQuote nunca produz valor negativo', () => {
  assert.deepEqual(discountQuote(14_700, 100), {
    grossAmountCents: 14_700,
    discountPercent: 100,
    discountAmountCents: 14_700,
    amountCents: 0,
  })
})

test('créditos de indicação são limitados a 30% por renovação', () => {
  assert.equal(renewalRewardPercent([10, 10, 15]), 30)
})

test('link de 100% é sempre uso único e expira em até sete dias', () => {
  const now = new Date('2026-08-06T00:00:00.000Z')
  const policy = highValueLinkPolicy({ inviteeDiscountPercent: 100, maxRedemptions: 50, expiresAt: null, now })
  assert.equal(policy.maxRedemptions, 1)
  assert.equal(policy.expiresAt, '2026-08-13T00:00:00.000Z')
})
