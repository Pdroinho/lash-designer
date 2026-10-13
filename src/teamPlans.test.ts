import assert from 'node:assert/strict'
import test from 'node:test'
import {TEAM_PLANS} from '../server/teamPlans.js'
import {PUBLIC_TEAM_PLANS,validTeamPlans,orderedTeamPlans} from './teamPlans'
test('public offer and server agree on all three monthly team plans',()=>assert.deepEqual(PUBLIC_TEAM_PLANS,TEAM_PLANS))
test('legacy, empty, duplicated or invalid catalogs never enable a different public offer',()=>{
  for(const value of [undefined,[],[{cycle:'ANNUAL',amountCents:59880}],[PUBLIC_TEAM_PLANS[0],PUBLIC_TEAM_PLANS[0],PUBLIC_TEAM_PLANS[2]],PUBLIC_TEAM_PLANS.map(plan=>({...plan,amountCents:NaN}))])assert.equal(validTeamPlans(value),false)
  const reversed=[...PUBLIC_TEAM_PLANS].reverse();assert.equal(validTeamPlans(reversed),true);assert.deepEqual(orderedTeamPlans(reversed),PUBLIC_TEAM_PLANS)
})
