import assert from 'node:assert/strict'
import { request } from 'node:http'
import test from 'node:test'
import express from 'express'
import { configureProductionClientDelivery } from './productionClientDelivery.js'

const get = (port: number, path: string, host: string) => new Promise<{
  status: number | undefined
  headers: Record<string, string | string[] | undefined>
  body: string
}>((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port, path, headers: { host } }, response => {
    let body = ''
    response.setEncoding('utf8')
    response.on('data', chunk => { body += chunk })
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }))
  })
  req.on('error', reject)
  req.end()
})

test('não registra entrega de frontend fora de produção', () => {
  const app = express()
  let reads = 0
  assert.equal(configureProductionClientDelivery(app, {
    nodeEnv: 'development',
    platformHostname: 'app.example.com',
    readTemplate: () => { reads += 1; return '' },
  }), false)
  assert.equal(reads, 0)
})

test('entrega HTML com SEO por host e preserva cache e vary', async t => {
  const app = express()
  configureProductionClientDelivery(app, {
    nodeEnv: 'production',
    platformHostname: 'app.example.com',
    canonicalBaseUrl: 'https://app.example.com',
    clientDir: '/virtual/dist/client',
    readTemplate: () => '<head><meta name="robots" content="noindex,nofollow" /></head>',
  })
  const server = app.listen(0, '127.0.0.1')
  t.after(() => server.close())
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')

  const response = await get(address.port, '/', 'app.example.com')
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'no-cache')
  assert.equal(response.headers.vary, 'Host')
  assert.match(response.body, /index,follow/)
  assert.match(response.body, /rel="canonical"/)

  const tenantResponse = await get(address.port, '/agendar', 'tenant.app.example.com')
  assert.match(tenantResponse.body, /noindex,nofollow/)
})
