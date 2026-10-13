import assert from 'node:assert/strict'
import test from 'node:test'
import { whatsappConnectionState } from './whatsappConnectionState.js'

test('only confirmed provider states unlock the WhatsApp inbox', () => {
  for (const state of ['open', 'connected', ' CONNECTED ']) assert.equal(whatsappConnectionState(state), 'connected')
  for (const state of [null, '', 'disconnected', 'not_connected', 'closed', 'close', 'reconnecting', 'unknown', 'error']) assert.equal(whatsappConnectionState(state), 'disconnected')
  for (const state of ['connecting', 'qrcode', 'pairing', 'qr_scan']) assert.equal(whatsappConnectionState(state), 'qr_scan')
})
