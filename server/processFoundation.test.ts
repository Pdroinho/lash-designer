import assert from 'node:assert/strict'
import test from 'node:test'
import { initializeProcessFoundation, readApplicationVersion } from './processFoundation.js'

test('lê e normaliza a versão do manifesto com fallback seguro', () => {
  assert.equal(readApplicationVersion('/virtual/package.json', () => '{"version":" 5.11.0 "}'), '5.11.0')
  assert.equal(readApplicationVersion('/virtual/package.json', () => '{"name":"app"}'), 'unknown')
  assert.equal(readApplicationVersion('/virtual/package.json', () => { throw new Error('missing') }), 'unknown')
})

test('registra handlers fatais, logs de startup e encerra com falha', () => {
  const handlers = new Map<string, (error: unknown) => void>()
  const events: string[] = []
  const errors: Array<[string, unknown]> = []
  const result = initializeProcessFoundation({
    nodeEnv: 'test',
    port: 4321,
    manifestPath: '/virtual/package.json',
    readManifest: () => '{"version":"5.11.0-test"}',
    registerFatalHandler: (event, listener) => { handlers.set(event, listener) },
    exit: code => { events.push(`exit-${code}`) },
    log: message => { events.push(message) },
    logError: (message, error) => { errors.push([message, error]) },
  })

  const uncaught = new Error('boom')
  handlers.get('uncaughtException')?.(uncaught)
  handlers.get('unhandledRejection')?.('rejected')

  assert.deepEqual(result, { appVersion: '5.11.0-test' })
  assert.deepEqual([...handlers.keys()], ['uncaughtException', 'unhandledRejection'])
  assert.deepEqual(events, [
    '[Startup] NODE_ENV: test', '[Startup] PORT: 4321', '[Startup] Database configured',
    'exit-1', 'exit-1',
  ])
  assert.deepEqual(errors, [
    ['[Fatal] uncaughtException', uncaught],
    ['[Fatal] unhandledRejection', 'rejected'],
  ])
})
