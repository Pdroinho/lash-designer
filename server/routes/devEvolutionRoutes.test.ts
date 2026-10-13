import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { handleError } from '../http.js'
import { createDevEvolutionRouter } from './devEvolutionRoutes.js'

test('Evolution Global DEV preserva autorização, configuração segura e estado desconectado', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      encrypted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `)
  const passThrough: RequestHandler = (_req, _res, next) => next()
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-dev'] === 'true') {
      req.sessionUser = { id: 'dev-1', role: 'DEV', tenantId: null, sessionId: 'session-dev', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/dev', createDevEvolutionRouter({
    db,
    requireDevHost: passThrough,
    platformEvolutionConfig: () => ({ baseUrl: null, apiKey: null, instanceName: 'lashdesigner-global-test' }),
    platformEvolutionDefaultInstanceName: 'lashdesigner-global-test',
    encryptPlatformApiKey: apiKey => `enc:v1:${apiKey}`,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const devHeaders = { 'content-type': 'application/json', 'x-test-dev': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/dev/evolution/config`)
    assert.equal(unauthorized.status, 401)

    const config = await fetch(`${baseUrl}/api/dev/evolution/config`, { headers: devHeaders }).then(response => response.json())
    assert.deepEqual(config, { config: { url: '', instanceName: 'lashdesigner-global-test', hasApiKey: false } })

    const emptyUpdate = await fetch(`${baseUrl}/api/dev/evolution/config`, {
      method: 'PUT', headers: devHeaders, body: '{}',
    })
    assert.equal(emptyUpdate.status, 400)
    assert.equal((await emptyUpdate.json() as { code: string }).code, 'NO_UPDATES')

    const apiKey = 'api-key-global-com-mais-de-16-caracteres'
    const updated = await fetch(`${baseUrl}/api/dev/evolution/config`, {
      method: 'PUT', headers: devHeaders, body: JSON.stringify({ apiKey }),
    })
    assert.deepEqual(await updated.json(), { ok: true })
    const stored = db.prepare("SELECT value, encrypted FROM platform_settings WHERE key = 'evolution_api_key'").get() as { value: string; encrypted: number }
    assert.equal(stored.encrypted, 1)
    assert.notEqual(stored.value, apiKey)
    assert.match(stored.value, /^enc:v1:/)
    assert.equal((db.prepare("SELECT value FROM platform_settings WHERE key = 'evolution_instance_name'").get() as { value: string }).value, 'lashdesigner-global-test')

    const status = await fetch(`${baseUrl}/api/dev/evolution/status`, { headers: devHeaders })
    assert.deepEqual(await status.json(), { state: 'NOT_CONFIGURED', instanceName: 'lashdesigner-global-test' })

    for (const [method, path] of [['POST', 'connect'], ['DELETE', 'disconnect']] as const) {
      const response = await fetch(`${baseUrl}/api/dev/evolution/${path}`, { method, headers: devHeaders })
      assert.equal(response.status, 400)
      assert.equal((await response.json() as { code: string }).code, 'EVOLUTION_GLOBAL_NOT_CONFIGURED')
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
