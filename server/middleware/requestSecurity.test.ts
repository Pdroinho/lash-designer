import assert from 'node:assert/strict'
import test from 'node:test'
import type { NextFunction, Request, Response } from 'express'
import { createSameOriginMiddleware, isLoopbackAddress, requireWebhookSecret, safeTimingEqual } from './requestSecurity.js'

function responseRecorder() {
  const record = { status: 200, body: null as unknown }
  const response = {
    status(code: number) { record.status = code; return this },
    json(body: unknown) { record.body = body; return this },
  } as unknown as Response
  return { record, response }
}

function request(input: Partial<Request>) {
  return {
    method: 'POST', path: '/api/change', protocol: 'https', headers: {}, socket: {},
    get(name: string) { return name.toLowerCase() === 'host' ? 'app.example.com' : undefined },
    ...input,
  } as unknown as Request
}

test('same-origin permite mutação da própria origem', () => {
  const middleware = createSameOriginMiddleware('production')
  const { response } = responseRecorder()
  let passed = false
  middleware(request({ headers: { origin: 'https://app.example.com' } }), response, (() => { passed = true }) as NextFunction)
  assert.equal(passed, true)
})

test('same-origin bloqueia origem cruzada em produção', () => {
  const middleware = createSameOriginMiddleware('production')
  const { record, response } = responseRecorder()
  middleware(request({ headers: { origin: 'https://evil.example' } }), response, (() => assert.fail('não deveria avançar')) as NextFunction)
  assert.equal(record.status, 403)
  assert.deepEqual(record.body, { message: 'Origem inválida', code: 'ORIGIN_MISMATCH' })
})

test('webhook exige e compara segredo sem diferença de tempo por conteúdo', () => {
  const middleware = requireWebhookSecret('correct-secret')
  const denied = responseRecorder()
  middleware(request({ headers: { 'x-webhook-secret': 'wrong-secret' } }), denied.response, (() => assert.fail('não deveria avançar')) as NextFunction)
  assert.equal(denied.record.status, 401)

  const accepted = responseRecorder()
  let passed = false
  middleware(request({ headers: { authorization: 'Bearer correct-secret' } }), accepted.response, (() => { passed = true }) as NextFunction)
  assert.equal(passed, true)
  assert.equal(safeTimingEqual('same', 'same'), true)
  assert.equal(safeTimingEqual('short', 'longer'), false)
})

test('loopback reconhece IPv4, IPv6 e IPv4 mapeado', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('10.0.0.1'), false)
})
