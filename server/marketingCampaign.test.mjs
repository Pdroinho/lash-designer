import test from 'node:test'
import assert from 'node:assert/strict'
import { campaignMessageWithOptOut, renderMarketingCampaignMessage } from './marketingCampaign.ts'

test('campaign footer always provides an explicit opt-out instruction', () => {
  const message = campaignMessageWithOptOut('Temos horários especiais esta semana.')
  assert.match(message, /responda SAIR\.$/)
})

test('ordinary use of the word pare does not suppress the opt-out footer', () => {
  const message = campaignMessageWithOptOut('Não pare agora: veja os horários especiais.')
  assert.match(message, /Para não receber mais novidades e ofertas, responda SAIR\.$/)
})

test('an existing explicit reply instruction is not duplicated', () => {
  const input = 'Oferta válida hoje. Para sair da lista, responda PARE.'
  assert.equal(campaignMessageWithOptOut(input), input)
})

test('campaign variables are rendered only from the intended placeholders', () => {
  assert.equal(
    renderMarketingCampaignMessage('Oi {{nome}}! Novidade do {{espaco}}.', { clientName: 'Marina', tenantName: 'Studio Bela' }),
    'Oi Marina! Novidade do Studio Bela.',
  )
})
