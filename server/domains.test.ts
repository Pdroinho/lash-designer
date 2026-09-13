import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from './http.js'
import {
  assertDomainIsNotReserved,
  domainVerificationRecord,
  domainVerificationValue,
  normalizeCustomDomain,
} from './domains.js'

const config = {
  appBaseUrl: 'https://app.exemplo.com.br',
  devHost: 'dev.exemplo.com.br',
  cnameTarget: 'domains.exemplo.com.br',
  expectedIpv4: [],
  expectedIpv6: [],
}

test('normaliza hostname internacional para ASCII e minúsculas', () => {
  assert.equal(normalizeCustomDomain('  Agenda.Exemplo.com.br  '), 'agenda.exemplo.com.br')
  assert.equal(normalizeCustomDomain('agéndá.exemplo.com.br'), 'xn--agnd-8na9b.exemplo.com.br')
})

test('rejeita URLs, IPs, portas e labels inválidas', () => {
  for (const input of ['https://agenda.exemplo.com.br', '127.0.0.1', 'agenda.exemplo.com.br:443', '*.exemplo.com.br', 'localhost']) {
    assert.throws(() => normalizeCustomDomain(input), HttpError)
  }
})

test('gera o desafio TXT esperado', () => {
  assert.equal(domainVerificationRecord('agenda.exemplo.com.br'), '_lashdesigner-verification.agenda.exemplo.com.br')
  assert.equal(domainVerificationValue('abc123'), 'lashdesigner=abc123')
})

test('impede uso de domínios reservados pela plataforma', () => {
  for (const domain of ['app.exemplo.com.br', 'cliente.app.exemplo.com.br', 'dev.exemplo.com.br', 'domains.exemplo.com.br']) {
    assert.throws(() => assertDomainIsNotReserved(domain, config), HttpError)
  }
  assert.doesNotThrow(() => assertDomainIsNotReserved('agenda.cliente.com.br', config))
})
