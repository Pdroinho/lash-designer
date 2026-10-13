import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express, { type RequestHandler } from 'express'
import { ASSISTANT_DAILY_LIMIT } from '../assistant.js'
import { getZonedDateTimeParts } from '../dateTime.js'
import { handleError } from '../http.js'
import { createAdminLumaAssistantRouter } from './adminLumaAssistantRoutes.js'

test('router da Luma preserva uso, mensagem, confirmação e estorno de crédito', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenant_settings (tenant_id TEXT PRIMARY KEY, timezone TEXT);
    CREATE TABLE assistant_usage (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, request_day TEXT,
      input_chars INTEGER, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0, cost_usd REAL DEFAULT 0, tool_calls INTEGER DEFAULT 0,
      vision_inputs INTEGER DEFAULT 0, agent_steps INTEGER DEFAULT 1, status TEXT, model TEXT, created_at TEXT
    );
    CREATE TABLE assistant_message_credit_ledger (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, delta_messages INTEGER,
      source TEXT, note TEXT, reference_order_nsu TEXT, created_at TEXT
    );
    INSERT INTO tenant_settings VALUES ('tenant-1', 'America/Sao_Paulo');
    INSERT INTO assistant_message_credit_ledger VALUES
      ('credit-1', 'tenant-1', 'admin-1', 10, 'PURCHASE', NULL, NULL, '2026-01-01T00:00:00.000Z'),
      ('usage-old', 'tenant-1', 'admin-1', -3, 'CONSUMED', NULL, NULL, '2026-01-02T00:00:00.000Z'),
      ('other-tenant', 'tenant-2', 'admin-2', 100, 'PURCHASE', NULL, NULL, '2026-01-01T00:00:00.000Z');
  `)
  const now = new Date()
  const day = getZonedDateTimeParts(now, 'America/Sao_Paulo')?.ymd
  assert.ok(day)
  db.prepare(`
    INSERT INTO assistant_usage (
      id, tenant_id, user_id, request_day, input_chars, input_tokens, output_tokens,
      reasoning_tokens, cost_usd, tool_calls, vision_inputs, agent_steps, status, model, created_at
    ) VALUES ('usage-existing', 'tenant-1', 'admin-1', ?, 20, 2, 3, 0, 0.005, 0, 0, 1, 'COMPLETED', 'model-test', ?)
  `).run(day, now.toISOString())

  const generatedInputs: Array<{ message: string; context: { tenantId: string; userId: string; timezone: string; localDate: string } }> = []
  const confirmed: Array<{ tenantId: string; userId: string; actionId: string }> = []
  let limiterCalls = 0
  const limiter: RequestHandler = (_req, _res, next) => { limiterCalls += 1; next() }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = { id: 'admin-1', role: 'ADMIN', tenantId: 'tenant-1', sessionId: 'session-admin', persistent: false, trustedDeviceId: null }
    }
    next()
  })
  app.use('/api/admin', createAdminLumaAssistantRouter({
    db,
    lumaAssistantLimiter: limiter,
    assistantEnabled: true,
    assistantProvider: { apiKey: 'test-key', model: 'model-test', name: 'TEST_PROVIDER' },
    generateAssistantAnswer: async input => {
      generatedInputs.push(input)
      if (input.message === 'falhar agora') throw new Error('falha simulada da IA')
      return {
        text: 'Resposta segura', inputTokens: 11, outputTokens: 7, reasoningTokens: 2,
        costUsd: 0.004, model: 'model-response', steps: 2, toolCalls: 1, visionInputs: 0,
        pendingActions: [],
      }
    },
    confirmLumaAction: (context, actionId) => {
      confirmed.push({ ...context, actionId })
      return { ok: true, actionType: 'CREATE_SERVICE', result: { serviceId: 'service-1' } }
    },
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    const unauthorized = await fetch(`${baseUrl}/api/admin/assistant/usage`)
    assert.equal(unauthorized.status, 401)

    const usage = await fetch(`${baseUrl}/api/admin/assistant/usage`, { headers }).then(response => response.json()) as {
      enabled: boolean; used: number; monthlyUsed: number; extraCreditBalance: number;
      model: string; provider: string; creditPacks: Array<{ id: string }>
    }
    assert.equal(usage.enabled, true)
    assert.equal(usage.used, 1)
    assert.equal(usage.monthlyUsed, 1)
    assert.equal(usage.extraCreditBalance, 7)
    assert.equal(usage.model, 'model-test')
    assert.equal(usage.provider, 'TEST_PROVIDER')
    assert.deepEqual(usage.creditPacks.map(pack => pack.id), ['starter', 'growth', 'power'])

    const message = await fetch(`${baseUrl}/api/admin/assistant/message`, {
      method: 'POST', headers,
      body: JSON.stringify({ message: 'analise meu negócio', history: [{ role: 'user', text: 'contexto anterior' }] }),
    })
    assert.equal(message.status, 200)
    const messageBody = await message.json() as { answer: string; actions: unknown[]; usage: { used: number; extraCreditBalance: number } }
    assert.equal(messageBody.answer, 'Resposta segura')
    assert.deepEqual(messageBody.actions, [])
    assert.equal(messageBody.usage.used, 2)
    assert.equal(messageBody.usage.extraCreditBalance, 7)
    assert.equal(limiterCalls, 1)
    assert.deepEqual(generatedInputs[0]?.context, {
      tenantId: 'tenant-1', userId: 'admin-1', timezone: 'America/Sao_Paulo', localDate: day,
    })
    const completed = db.prepare(`
      SELECT status, input_tokens AS inputTokens, output_tokens AS outputTokens,
             reasoning_tokens AS reasoningTokens, cost_usd AS costUsd, tool_calls AS toolCalls,
             agent_steps AS agentSteps, model
      FROM assistant_usage WHERE id != 'usage-existing' ORDER BY created_at DESC LIMIT 1
    `).get()
    assert.deepEqual(completed, {
      status: 'COMPLETED', inputTokens: 11, outputTokens: 7, reasoningTokens: 2,
      costUsd: 0.004, toolCalls: 1, agentSteps: 2, model: 'model-response',
    })

    const actionId = '11111111-1111-4111-8111-111111111111'
    const confirmation = await fetch(`${baseUrl}/api/admin/assistant/actions/${actionId}/confirm`, { method: 'POST', headers, body: '{}' })
    assert.equal(confirmation.status, 200)
    assert.deepEqual(await confirmation.json(), { ok: true, actionType: 'CREATE_SERVICE', result: { serviceId: 'service-1' } })
    assert.deepEqual(confirmed, [{ tenantId: 'tenant-1', userId: 'admin-1', actionId }])

    const insertUsage = db.prepare(`
      INSERT INTO assistant_usage (
        id, tenant_id, user_id, request_day, input_chars, input_tokens, output_tokens,
        reasoning_tokens, cost_usd, tool_calls, vision_inputs, agent_steps, status, model, created_at
      ) VALUES (?, 'tenant-1', 'admin-1', ?, 1, 0, 0, 0, 0, 0, 0, 1, 'COMPLETED', 'fixture', ?)
    `)
    const currentCount = (db.prepare(`SELECT COUNT(*) AS total FROM assistant_usage WHERE tenant_id = 'tenant-1' AND request_day = ? AND status != 'ERROR'`).get(day) as { total: number }).total
    for (let index = currentCount; index < ASSISTANT_DAILY_LIMIT; index += 1) {
      insertUsage.run(`usage-limit-${index}`, day, new Date(now.getTime() + index).toISOString())
    }

    const failed = await fetch(`${baseUrl}/api/admin/assistant/message`, {
      method: 'POST', headers, body: JSON.stringify({ message: 'falhar agora' }),
    })
    assert.equal(failed.status, 500)
    assert.equal(limiterCalls, 2)
    const failedUsage = db.prepare(`SELECT status FROM assistant_usage WHERE input_chars = 12 ORDER BY created_at DESC LIMIT 1`).get()
    assert.deepEqual(failedUsage, { status: 'ERROR' })
    const creditEvents = db.prepare(`SELECT source, delta_messages AS delta FROM assistant_message_credit_ledger WHERE source IN ('CONSUMED', 'REFUND') ORDER BY created_at`).all()
    assert.deepEqual(creditEvents.slice(-2), [{ source: 'CONSUMED', delta: -1 }, { source: 'REFUND', delta: 1 }])
    const balance = db.prepare(`SELECT SUM(delta_messages) AS total FROM assistant_message_credit_ledger WHERE tenant_id = 'tenant-1'`).get() as { total: number }
    assert.equal(balance.total, 7)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
  }
})
