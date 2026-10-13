import assert from 'node:assert/strict'
import test from 'node:test'
import { createAppmaxClient } from './appmax.js'

const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature'

function setup(options: { linked?: boolean; status?: string; paid?: number; checkoutUrl?: string } = {}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const payload = url.includes('/oauth2/token') ? { access_token: fakeToken, expires_in: 3600 }
      : url.endsWith('/v1/payment-link') ? { data: { id: 71, checkout_url: options.checkoutUrl ?? 'https://checkout.appmax.com.br/pl/71' } }
      : url.includes('/payment-link/71/orders') ? { data: options.linked === false ? [] : [{ order: { id: 42, status: 'aprovado', total: 7490 } }], meta: { total_pages: 1 } }
      : { data: { order: { id: 42, status: options.status ?? 'aprovado', total_paid: options.paid ?? 7490 } } }
    return Response.json(payload)
  }) as typeof fetch
  return { client: createAppmaxClient({ environment: 'sandbox', merchantClientId: 'merchant-id', merchantClientSecret: 'merchant-secret', fetchFn }), calls }
}

test('link hospedado usa credenciais merchant, centavos e apenas uma venda', async () => {
  const { client, calls } = setup()
  assert.deepEqual(await client.createPaymentLink({ name: 'Studio', amountCents: 7490, description: 'Equipe até 3' }), {
    linkId: 71, checkoutUrl: 'https://checkout.appmax.com.br/pl/71',
  })
  assert.match(calls[0].url, /^https:\/\/auth\.sandboxappmax\.com\.br\/oauth2\/token$/)
  assert.equal(new URLSearchParams(calls[0].init?.body as string).get('client_id'), 'merchant-id')
  assert.equal(calls[1].url, 'https://api.sandboxappmax.com.br/v1/payment-link')
  assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, `Bearer ${fakeToken}`)
  assert.deepEqual(JSON.parse(calls[1].init?.body as string), {
    name: 'Studio', value: 7490, description: 'Equipe até 3', product_type: 'digital',
    payments: [['creditcard', 'pix']], max_installments: 1, fee_transfer_from_installment: 0, allow_multiple_sales: false,
  })
  assert.equal(await client.verifyPaymentLinkOrder({ linkId: 71, orderId: 42, expectedAmountCents: 7490 }), true)
  assert.deepEqual(await client.listPaymentLinkOrders(71), [{ id: 42, status: 'aprovado' }])
  assert.equal(calls.filter(call => call.url.includes('/oauth2/token')).length, 1)
})

test('rejeita link de outro pedido, pagamento pendente e valor divergente', async () => {
  for (const options of [{ linked: false }, { status: 'pendente' }, { paid: 7400 }]) {
    const { client } = setup(options)
    assert.equal(await client.verifyPaymentLinkOrder({ linkId: 71, orderId: 42, expectedAmountCents: 7490 }), false)
  }
})

test('consulta autenticada distingue estorno e chargeback sem confiar no webhook', async () => {
  for (const status of ['estornado', 'chargeback_em_tratativa', 'chargeback_em_disputa', 'chargeback_perdido']) {
    const { client } = setup({ status })
    assert.equal(await client.inspectPaymentLinkOrder({ linkId: 71, orderId: 42, expectedAmountCents: 7490 }), 'REVERSED')
  }
  const { client } = setup({ status: 'pendente' })
  assert.equal(await client.inspectPaymentLinkOrder({ linkId: 71, orderId: 42, expectedAmountCents: 7490 }), 'UNKNOWN')
  assert.equal(await client.inspectPaymentLinkOrder({ linkId: 71, orderId: 43, expectedAmountCents: 7490 }), 'UNKNOWN')
})

test('rejeita URL sem HTTPS e preços abaixo do mínimo do gateway', async () => {
  const { client } = setup({ checkoutUrl: 'http://example.com/checkout' })
  await assert.rejects(() => client.createPaymentLink({ name: 'Studio', amountCents: 7490, description: 'Equipe' }), /HTTPS/)
  await assert.rejects(() => client.createPaymentLink({ name: 'Studio', amountCents: 499, description: 'Equipe' }), /Valor/)
})
