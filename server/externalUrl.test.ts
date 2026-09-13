import assert from 'node:assert/strict'
import test from 'node:test'
import { assertResolvedAddressesPublic, isPublicExternalIp, normalizeExternalHttpsBaseUrl } from './externalUrl.js'

test('normaliza URL HTTPS pública', () => {
  assert.equal(normalizeExternalHttpsBaseUrl('https://api.example.com///'), 'https://api.example.com')
})

test('bloqueia HTTP, credenciais e hosts locais', () => {
  for (const value of [
    'http://api.example.com',
    'https://user:pass@example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.0.5',
    'https://[::1]',
    'https://service.internal',
  ]) {
    assert.throws(() => normalizeExternalHttpsBaseUrl(value), value)
  }
})

test('rejeita qualquer endereço privado retornado por DNS', () => {
  assert.throws(() => assertResolvedAddressesPublic(['93.184.216.34', '10.1.2.3']))
  assert.throws(() => assertResolvedAddressesPublic(['::1']))
  assert.throws(() => assertResolvedAddressesPublic([]))
})

test('aceita somente endereços públicos resolvidos', () => {
  assert.equal(isPublicExternalIp('93.184.216.34'), true)
  assert.equal(isPublicExternalIp('2606:2800:220:1:248:1893:25c8:1946'), true)
  assert.doesNotThrow(() => assertResolvedAddressesPublic(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']))
})
