import test from 'node:test'
import assert from 'node:assert/strict'
import { extractEvolutionConnectionState, extractEvolutionMessageUpdates, nextWhatsappDeliveryStatus } from './whatsappWebhook.ts'

test('extracts delivery/read updates from Evolution payloads', () => {
  assert.deepEqual(extractEvolutionMessageUpdates({ event: 'messages.update', data: [{ key: { id: 'abc' }, update: { status: 'DELIVERY_ACK' } }] }), [{ providerMessageId: 'abc', status: 'DELIVERED' }])
  assert.deepEqual(extractEvolutionMessageUpdates({ event: 'MESSAGES_UPDATE', data: { key: { id: 'def' }, update: { status: 4 } } }), [{ providerMessageId: 'def', status: 'READ' }])
})

test('delivery status is monotonic and allows recovery from failed', () => {
  assert.equal(nextWhatsappDeliveryStatus('SENT', 'DELIVERY_ACK'), 'DELIVERED')
  assert.equal(nextWhatsappDeliveryStatus('READ', 'DELIVERY_ACK'), null)
  assert.equal(nextWhatsappDeliveryStatus('DELIVERED', 'ERROR'), null)
  assert.equal(nextWhatsappDeliveryStatus('FAILED', 'DELIVERY_ACK'), 'DELIVERED')
})

test('extracts connection state without trusting arbitrary event payloads', () => {
  assert.equal(extractEvolutionConnectionState({ event: 'connection.update', data: { state: 'open' } }), 'CONNECTED')
  assert.equal(extractEvolutionConnectionState({ event: 'CONNECTION_UPDATE', data: { status: 'close' } }), 'DISCONNECTED')
  assert.equal(extractEvolutionConnectionState({ event: 'MESSAGES_UPSERT', data: { state: 'open' } }), null)
})
