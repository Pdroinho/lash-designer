import assert from 'node:assert/strict'
import test from 'node:test'
import { infinitePayWebhookHash, infinitePayWebhookPayloadSchema, safeInfinitePayReceiptUrl } from './infinitePay.js'

test('receipt aceita somente HTTPS sem credenciais', () => {
  assert.equal(safeInfinitePayReceiptUrl('https://payments.example/receipt/123'), 'https://payments.example/receipt/123')
  assert.equal(safeInfinitePayReceiptUrl('http://payments.example/receipt/123'), '')
  assert.equal(safeInfinitePayReceiptUrl('https://user:secret@payments.example/receipt/123'), '')
})

test('hash do webhook é determinístico e sensível ao payload', () => {
  assert.equal(infinitePayWebhookHash({ order: 'a' }), infinitePayWebhookHash({ order: 'a' }))
  assert.notEqual(infinitePayWebhookHash({ order: 'a' }), infinitePayWebhookHash({ order: 'b' }))
})

test('webhook exige identificadores e uma slug de fatura', () => {
  const valid = infinitePayWebhookPayloadSchema.safeParse({
    order_nsu: 'order-1',
    transaction_nsu: 'transaction-1',
    amount: 5990,
    invoice_slug: 'invoice-1',
  })
  assert.equal(valid.success, true)

  const missingSlug = infinitePayWebhookPayloadSchema.safeParse({
    order_nsu: 'order-1',
    transaction_nsu: 'transaction-1',
    amount: 5990,
  })
  assert.equal(missingSlug.success, false)
})
