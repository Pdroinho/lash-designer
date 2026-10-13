import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminLumaBillingRouter } from './adminLumaBillingRoutes.js'

test('billing de créditos da Luma preserva autorização, pedido, saldo e falha da operadora', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT);
    CREATE TABLE assistant_credit_orders (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, order_nsu TEXT UNIQUE,
      pack_id TEXT, credits INTEGER, amount_cents INTEGER, status TEXT,
      checkout_url TEXT, created_at TEXT, paid_at TEXT
    );
    CREATE TABLE assistant_message_credit_ledger (
      id TEXT PRIMARY KEY, tenant_id TEXT, delta_messages INTEGER
    );
    INSERT INTO users VALUES ('admin-1', 'ana@example.com');
    INSERT INTO assistant_message_credit_ledger VALUES
      ('credit-1', 'tenant-1', 35), ('usage-1', 'tenant-1', -5), ('other-1', 'tenant-2', 100);
  `)

  const checkoutInputs: Array<{ orderNsu: string; amountCents: number; customerEmail: string; redirectUrl: string; itemDescription?: string }> = []
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: 'tenant-1', sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
      req.resolvedTenant = { id: 'tenant-1', slug: 'ana' }
    }
    next()
  })
  app.use('/api/admin', createAdminLumaBillingRouter({
    db,
    createInfinitePayLink: async input => {
      checkoutInputs.push(input)
      if (input.amountCents === 2_490) throw new Error('provedor indisponível')
      return `https://checkout.example/${input.orderNsu}`
    },
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const adminHeaders = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/admin/assistant/credits/order-status?orderNsu=qualquer`)
    assert.equal(unauthorized.status, 401)

    const checkout = await fetch(`${baseUrl}/api/admin/assistant/credits/checkout-url`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ packId: 'growth' }),
    })
    assert.equal(checkout.status, 200)
    const body = await checkout.json() as { url: string; orderNsu: string; pack: { id: string; credits: number; amountCents: number; featured: boolean } }
    assert.equal(body.url, `https://checkout.example/${body.orderNsu}`)
    assert.deepEqual(body.pack, { id: 'growth', label: '100 créditos', credits: 100, amountCents: 1290, featured: true })
    assert.match(body.orderNsu, /^ld-luma-growth-/)
    assert.equal(checkoutInputs[0]?.customerEmail, 'ana@example.com')
    assert.equal(checkoutInputs[0]?.redirectUrl, `${baseUrl}/admin?lumaCredits=return`)
    assert.match(checkoutInputs[0]?.itemDescription ?? '', /100 créditos extras/)

    const persisted = db.prepare(`
      SELECT tenant_id AS tenantId, user_id AS userId, pack_id AS packId, credits,
             amount_cents AS amountCents, status, checkout_url AS checkoutUrl
      FROM assistant_credit_orders WHERE order_nsu = ?
    `).get(body.orderNsu)
    assert.deepEqual(persisted, {
      tenantId: 'tenant-1', userId: 'admin-1', packId: 'growth', credits: 100,
      amountCents: 1290, status: 'PENDING', checkoutUrl: body.url,
    })

    const status = await fetch(`${baseUrl}/api/admin/assistant/credits/order-status?orderNsu=${encodeURIComponent(body.orderNsu)}`, { headers: adminHeaders })
    assert.equal(status.status, 200)
    assert.deepEqual(await status.json(), {
      order: { status: 'PENDING', credits: 100, amountCents: 1290, paidAt: null },
      balance: 30,
    })

    const missing = await fetch(`${baseUrl}/api/admin/assistant/credits/order-status?orderNsu=inexistente`, { headers: adminHeaders })
    assert.equal(missing.status, 404)

    const failed = await fetch(`${baseUrl}/api/admin/assistant/credits/checkout-url`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ packId: 'power' }),
    })
    assert.equal(failed.status, 500)
    assert.equal((db.prepare("SELECT status FROM assistant_credit_orders WHERE pack_id = 'power'").get() as { status: string }).status, 'FAILED')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
