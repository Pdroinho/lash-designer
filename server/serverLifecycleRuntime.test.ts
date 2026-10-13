import assert from 'node:assert/strict'
import test from 'node:test'
import type { Server } from 'node:http'
import { createServerLifecycleRuntime } from './serverLifecycleRuntime.js'

type FixtureOptions = { graceful?: boolean }

function createFixture({ graceful = true }: FixtureOptions = {}) {
  const events: string[] = []
  const signals = new Map<string, () => void>()
  let forceShutdown: (() => void) | undefined
  let closeCallback: (() => void) | undefined
  const server = {
    closeIdleConnections: () => { events.push('close-idle') },
    closeAllConnections: () => { events.push('close-all') },
    close: (callback: () => void) => {
      events.push('close-server')
      closeCallback = callback
      if (graceful) callback()
      return server
    },
  } as unknown as Server
  const worker = (name: string) => ({
    start: () => { events.push(`start-${name}`) },
    stop: () => { events.push(`stop-${name}`) },
  })
  const runtime = createServerLifecycleRuntime({
    listen: callback => { events.push('listen'); callback(); return server },
    listeningAddress: '127.0.0.1:3001',
    managedRuntimes: [worker('domains'), worker('appointments'), worker('whatsapp')],
    securityStateMaintenance: worker('security'),
    closeDatabase: () => { events.push('close-db') },
    registerSignal: (signal, listener) => { signals.set(signal, listener) },
    scheduleForceShutdown: ((callback: () => void, ms: number) => {
      events.push(`force-timer-${ms}`)
      forceShutdown = callback
      return { unref: () => events.push('force-unref') } as unknown as NodeJS.Timeout
    }) as typeof setTimeout,
    clearForceShutdown: (() => { events.push('clear-force') }) as typeof clearTimeout,
    exit: code => { events.push(`exit-${code}`) },
    log: message => { events.push(message) },
    logError: message => { events.push(message) },
  })
  return { runtime, events, signals, runForceShutdown: () => forceShutdown?.(), runCloseCallback: () => closeCallback?.() }
}

test('start liga servidor, workers e manutenção uma vez e registra os dois sinais', () => {
  const fixture = createFixture()
  fixture.runtime.start()
  fixture.runtime.start()

  assert.deepEqual(fixture.events, [
    'listen', 'server listening on 127.0.0.1:3001',
    'start-domains', 'start-appointments', 'start-whatsapp', 'start-security',
  ])
  assert.deepEqual([...fixture.signals.keys()], ['SIGTERM', 'SIGINT'])
})

test('shutdown gracioso respeita ordem, cancela timeout e ignora repetição', () => {
  const fixture = createFixture()
  fixture.runtime.start()
  assert.equal(fixture.runtime.shutdown('TEST'), true)
  assert.equal(fixture.runtime.shutdown('AGAIN'), false)

  assert.deepEqual(fixture.events.slice(6), [
    '[Shutdown] TEST', 'stop-domains', 'stop-appointments', 'stop-whatsapp', 'stop-security',
    'close-idle', 'force-timer-10000', 'force-unref', 'close-server', 'clear-force', 'close-db', 'exit-0',
  ])
})

test('timeout forçado encerra conexões e banco quando o servidor não fecha', () => {
  const fixture = createFixture({ graceful: false })
  fixture.runtime.start()
  fixture.signals.get('SIGTERM')?.()
  fixture.runForceShutdown()
  fixture.runCloseCallback()

  assert.ok(fixture.events.includes('[Shutdown] SIGTERM'))
  assert.ok(fixture.events.includes('[Shutdown] encerramento forçado após timeout'))
  assert.ok(fixture.events.includes('close-all'))
  assert.equal(fixture.events.filter(event => event === 'close-db').length, 1)
  assert.equal(fixture.events.filter(event => event.startsWith('exit-')).join(','), 'exit-1')
})
