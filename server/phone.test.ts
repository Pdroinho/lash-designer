import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBrazilPhone } from './phone.js'

test('normaliza telefone brasileiro local com DDD', () => {
  assert.equal(normalizeBrazilPhone('(35) 99916-7985'), '5535999167985')
})

test('preserva telefone com DDI 55 sem duplicar o país', () => {
  assert.equal(normalizeBrazilPhone('5535999167985'), '5535999167985')
})

test('aceita telefone em E.164 com +55', () => {
  assert.equal(normalizeBrazilPhone('+55 35 99916-7985'), '5535999167985')
})

test('remove zero de tronco quando digitado antes do DDD', () => {
  assert.equal(normalizeBrazilPhone('035999167985'), '5535999167985')
})

test('rejeita telefone incompleto ou país diferente', () => {
  assert.equal(normalizeBrazilPhone('3599916'), null)
  assert.equal(normalizeBrazilPhone('+1 415 555 2671'), null)
})
