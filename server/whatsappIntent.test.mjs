import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmationReplyIntent, marketingWhatsappOptOutIntent } from './whatsappIntent.ts'

const confirm = ['1', '1 A7F2', 'sim', 'Sim, confirmo!', 'confirmado', 'pode confirmar', 'vou sim', 'estarei aí']
for (const text of confirm) test(`confirma: ${text}`, () => assert.equal(confirmationReplyIntent(text).intent, 'CONFIRM'))

const decline = ['2', '2 A7F2', 'não', 'nao vou', 'não consigo ir', 'não posso comparecer', 'quero cancelar', 'preciso remarcar', 'infelizmente não', 'não vou conseguir confirmar agora']
for (const text of decline) test(`recusa: ${text}`, () => assert.equal(confirmationReplyIntent(text).intent, 'DECLINE'))

const neutral = ['oi', 'qual o horário?', 'obrigada', 'confirmar como?', 'talvez eu consiga']
for (const text of neutral) test(`neutro: ${text}`, () => assert.equal(confirmationReplyIntent(text).intent, null))

test('extrai identificador legado sem depender dele', () => assert.equal(confirmationReplyIntent('1 a7f2').code, 'A7F2'))

test('opt-out explícito', () => {
  for (const text of ['PARE', 'stop', 'não quero', 'não quero receber', 'remover meu número']) assert.equal(marketingWhatsappOptOutIntent(text), true)
  for (const text of ['não quero cancelar meu horário', 'parece bom', 'quero confirmar']) assert.equal(marketingWhatsappOptOutIntent(text), false)
})
