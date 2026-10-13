import assert from 'node:assert/strict'
import test from 'node:test'
import { TEAM_PLANS, teamPlanByCode, teamPlanForCount } from './teamPlans.js'

test('faixas mensais mantêm centavos e capacidade sem ativar checkout legado', () => {
  assert.deepEqual(TEAM_PLANS.map(({ code, amountCents, seats }) => [code, amountCents, seats]), [
    ['TEAM_3', 7490, 3], ['TEAM_6', 9990, 6], ['TEAM_15', 14900, 15],
  ])
  for (const [count, code] of [[1, 'TEAM_3'], [3, 'TEAM_3'], [4, 'TEAM_6'], [6, 'TEAM_6'], [7, 'TEAM_15'], [15, 'TEAM_15']] as const) {
    assert.equal(teamPlanForCount(count)?.code, code)
  }
  assert.equal(teamPlanForCount(16), null)
  assert.equal(teamPlanByCode('PRO'), undefined)
})
