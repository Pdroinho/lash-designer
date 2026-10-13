import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLumaAppmaxCredits } from './lumaAppmaxCredits.js'
import { createAppmaxWebhookRuntime } from './appmaxWebhookRuntime.js'
import { once } from 'node:events'
import express from 'express'
import { handleError } from './http.js'

test('Appmax Luma credit lifecycle verifies amount/link, isolates orders and reverses exactly once', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'luma-credits-'))
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_PATH = path.join(dir, 'test.db')
  const { migrate } = await import('./migrate.js')
  migrate()
  const {createAdminLumaAssistantRouter}=await import('./routes/adminLumaAssistantRoutes.js')
  const { getDb, closeDb } = await import('./db.js'),
    db = getDb()
  const tenantId = randomUUID(),
    userId = randomUUID(),
    otherTenant = randomUUID(),
    now = new Date().toISOString()
  for (const [id, slug] of [
    [tenantId, 'luma-a'],
    [otherTenant, 'luma-b'],
  ])
    db.prepare(
      'INSERT INTO tenants(id,slug,name,primary_color,status,created_at) VALUES (?,?,?,?,?,?)',
    ).run(id, slug, 'Studio QA', '#972d57', 'ACTIVE', now)
  db.prepare(
    'INSERT INTO users(id,tenant_id,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',
  ).run(userId, tenantId, 'owner@example.com', 'test', 'ADMIN', now)
  db.prepare(
    'INSERT INTO tenant_settings(tenant_id,secondary_color,timezone,currency,created_at,updated_at) VALUES (?,?,?,?,?,?)',
  ).run(tenantId, '#fff', 'America/Sao_Paulo', 'BRL', now, now)
  let nextLink = 10,
    fail = false,
    state: 'PAID' | 'REVERSED' | 'UNKNOWN' = 'UNKNOWN',
    wrongAmount = false
  const calls: Array<{
    linkId: number
    orderId: number
    expectedAmountCents: number
  }> = []
  const service = createLumaAppmaxCredits(db, {
    createPaymentLink: async () => {
      if (fail) throw Error('provider offline')
      const linkId = nextLink++
      return { linkId, checkoutUrl: `https://checkout.example/${linkId}` }
    },
    inspectPaymentLinkOrder: async (args) => {
      calls.push(args)
      return wrongAmount || args.orderId !== 42 ? 'UNKNOWN' : state
    },
    listPaymentLinkOrders: async () => [{ id: 42, status: 'paid' }],
  })
  const pack = { id: 'starter', credits: 25, amountCents: 500 },
    balance = () =>
      Number(
        (
          db
            .prepare(
              'SELECT COALESCE(SUM(delta_messages),0) as n FROM assistant_message_credit_ledger WHERE tenant_id=?',
            )
            .get(tenantId) as { n: number }
        ).n,
      )
  let nsu = '',
    id = '',
    link = 0
  try {
    await t.test(
      'checkout creates a pending order but no credits, and reuses a fresh pending link',
      async () => {
        const first = await service.checkout({ tenantId, userId, pack })
        nsu = first.orderNsu
        assert.equal(balance(), 0)
        assert.deepEqual(
          await service.checkout({ tenantId, userId, pack }),
          first,
        )
        const row = db
          .prepare(
            'SELECT o.id,a.payment_link_id as link FROM assistant_credit_orders o JOIN assistant_appmax_orders a ON a.id=o.id WHERE o.order_nsu=?',
          )
          .get(nsu) as { id: string; link: number }
        id = row.id
        link = row.link
        assert.equal(nextLink, 11)
      },
    )
    await t.test(
      'provider error preserves a failed order and never grants credits',
      async () => {
        fail = true
        await assert.rejects(() =>
          service.checkout({
            tenantId,
            userId,
            pack: { id: 'power', credits: 250, amountCents: 2490 },
          }),
        )
        fail = false
        assert.equal(balance(), 0)
        assert.equal(
          (
            db
              .prepare(
                "SELECT COUNT(*) as n FROM assistant_appmax_orders WHERE status='FAILED'",
              )
              .get() as { n: number }
          ).n,
          1,
        )
      },
    )
    await t.test(
      'untrusted webhook cannot grant credits before provider verification',
      async () => {
        const runtime = createAppmaxWebhookRuntime(
          db,
          { confirmOrder: async () => false },
          service,
        )
        assert.equal(
          runtime.receive({
            event: 'order_paid',
            event_type: 'order',
            data: { order_id: 42, payment_link_id: 99999 },
          }),
          false,
        )
        assert.equal(
          runtime.receive({
            event: 'order_paid',
            event_type: 'order',
            data: { order_id: 42, payment_link_id: link },
          }),
          true,
        )
        await runtime.processPending()
        assert.equal(balance(), 0)
      },
    )
    await t.test(
      'wrong amount or owner is rejected even if payload says paid',
      async () => {
        state = 'PAID'
        wrongAmount = true
        assert.equal(
          await service.reconcile({ tenantId, intentId: id, orderId: 42 }),
          false,
        )
        wrongAmount = false
        assert.equal(
          await service.reconcile({
            tenantId: otherTenant,
            intentId: id,
            orderId: 42,
          }),
          false,
        )
        assert.equal(balance(), 0)
      },
    )
    await t.test(
      'verified payment grants exactly one pack, including concurrent/replayed confirmations',
      async () => {
        assert.deepEqual(
          await Promise.all([
            service.reconcile({ tenantId, intentId: id, orderId: 42 }),
            service.reconcile({ tenantId, intentId: id, orderId: 42 }),
          ]),
          [true, true],
        )
        assert.equal(balance(), 25)
        assert.equal(
          (
            db
              .prepare(
                "SELECT COUNT(*) as n FROM assistant_message_credit_ledger WHERE source='PURCHASE'",
              )
              .get() as { n: number }
          ).n,
          1,
        )
        assert.equal(calls.at(-1)?.expectedAmountCents, 500)
        assert.equal(calls.at(-1)?.linkId, link)
        assert.equal(
          await service.reconcile({ tenantId, intentId: id, orderId: 43 }),
          false,
        )
      },
    )
    await t.test(
      'refund deducts original credits once and cannot resurrect a reversed order',
      async () => {
        db.prepare(
          "INSERT INTO assistant_message_credit_ledger(id,tenant_id,user_id,delta_messages,source,created_at) VALUES (?,?,?,-10,'CONSUMED',?)",
        ).run(randomUUID(), tenantId, userId, now)
        assert.equal(balance(), 15)
        state = 'REVERSED'
        await service.reconcile({ tenantId, intentId: id, orderId: 42 })
        await service.reconcile({ tenantId, intentId: id, orderId: 42 })
        assert.equal(balance(), -10)
        assert.equal(
          (
            db
              .prepare(
                "SELECT COUNT(*) as n FROM assistant_message_credit_ledger WHERE source='APPMAX_REVERSAL'",
              )
              .get() as { n: number }
          ).n,
          1,
        )
        state = 'PAID'
        assert.equal(
          await service.reconcile({ tenantId, intentId: id, orderId: 42 }),
          false,
        )
        assert.equal(balance(), -10)
      },
    )
    await t.test(
      'credit return lookup never accesses another tenant provider order',
      async () => {
        const before = calls.length
        await service.refreshOrder(otherTenant, nsu)
        assert.equal(calls.length, before)
      },
    )
    await t.test(
      'paid credits work beyond included cost budget and refund a failed generation',
      async () => {
        db.prepare('DELETE FROM assistant_message_credit_ledger').run()
        db.prepare(
          "INSERT INTO assistant_message_credit_ledger(id,tenant_id,user_id,delta_messages,source,created_at) VALUES (?,?,?,2,'PURCHASE',?)",
        ).run(randomUUID(), tenantId, userId, now)
        const day = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date())
        db.prepare(
          "INSERT INTO assistant_usage(id,tenant_id,user_id,request_day,input_chars,input_tokens,output_tokens,cost_usd,status,model,created_at) VALUES (?,?,?,?,1,0,0,1,'COMPLETED','test',?)",
        ).run(randomUUID(), tenantId, userId, day, now)
        const app = express()
        app.use(express.json())
        app.use((req, _res, next) => {
          req.sessionUser = {
            id: userId,
            tenantId,
            role: 'ADMIN',
            sessionId: 'test',
            persistent: false,
            trustedDeviceId: null,
          }
          next()
        })
        let providerFails = false
        app.use(
          '/api/admin',
          createAdminLumaAssistantRouter({
            db,
            lumaAssistantLimiter: (_req, _res, next) => next(),
            assistantEnabled: true,
            assistantProvider: { apiKey: 'test', model: 'test', name: 'test' },
            confirmLumaAction: () => ({ ok: true }),
            generateAssistantAnswer: async () => {
              if (providerFails) throw Error('simulated failure')
              return {
                text: 'Resumo QA',
                inputTokens: 1,
                outputTokens: 1,
                reasoningTokens: 0,
                costUsd: 0.001,
                model: 'test',
                steps: 1,
                toolCalls: 0,
                visionInputs: 0,
                pendingActions: [],
              }
            },
          }),
        )
        app.use(handleError)
        const server = app.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const port = (server.address() as { port: number }).port
        try {
          const request = () =>
            fetch(`http://127.0.0.1:${port}/api/admin/assistant/message`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: 'Resumo da agenda' }),
            })
          assert.equal((await request()).status, 200)
          assert.equal(balance(), 1)
          assert.equal(
            (
              db
                .prepare(
                  "SELECT COUNT(*) as n FROM assistant_usage WHERE credit_source='EXTRA' AND status='COMPLETED'",
                )
                .get() as { n: number }
            ).n,
            1,
          )
          providerFails = true
          assert.equal((await request()).status, 500)
          assert.equal(balance(), 1)
          assert.equal(
            (
              db
                .prepare(
                  "SELECT COUNT(*) as n FROM assistant_message_credit_ledger WHERE source='REFUND'",
                )
                .get() as { n: number }
            ).n,
            1,
          )
        } finally {
          await new Promise<void>((resolve) => server.close(() => resolve()))
        }
      },
    )
    await t.test(
      'migrated credit database has no foreign key violations',
      () => {
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
      },
    )
  } finally {
    closeDb()
    rmSync(dir, { recursive: true, force: true })
  }
})
