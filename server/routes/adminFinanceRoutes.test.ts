import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import type { FinanceMonthSnapshot } from '../finance.js'
import { createAdminFinanceRouter } from './adminFinanceRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const fixedNow = new Date('2030-02-15T18:30:00.000Z')

type TransactionPayload = { id: string; method: string; note: string | null; createdAt: string }
type ExtractPayload = { start: string; endExclusive: string; transactions: Array<{ id: string }> }
type OverviewPayload = {
  timeZone: string
  todayYmd: string
  totals: { entriesCents: number; expensesCents: number; profitCents: number }
  goals: { revenueCents: number; newClients: number; currentRevenueCents: number; currentNewClients: number }
  lastEntries: Array<{ id: string }>
  lastCashTransactions: Array<{ id: string }>
}

const snapshot = (year: number, month: number, entriesCents: number): FinanceMonthSnapshot => ({
  ym: `${year}-${String(month).padStart(2, '0')}`,
  serviceEntriesCents: entriesCents,
  manualIncomeCents: 0,
  entriesCents,
  expensesCents: 1200,
  balanceCents: entriesCents - 1200,
  confirmedAppointments: 2,
})

test('financeiro ADMIN preserva contratos, datas civis e isolamento por tenant', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenant_settings (
      tenant_id TEXT PRIMARY KEY, timezone TEXT,
      monthly_revenue_goal_cents INTEGER, monthly_new_clients_goal INTEGER
    );
    CREATE TABLE users (id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT);
    CREATE TABLE clients (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, name TEXT, created_at TEXT
    );
    CREATE TABLE services (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, price_cents INTEGER);
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, tenant_id TEXT, service_id TEXT, client_user_id TEXT,
      starts_at TEXT, status TEXT, confirmation_status TEXT
    );
    CREATE TABLE cash_transactions (
      id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT, amount_cents INTEGER,
      method TEXT, note TEXT, created_at TEXT
    );

    INSERT INTO tenant_settings VALUES
      ('${tenantOne}', 'UTC', 50000, 5),
      ('${tenantTwo}', 'UTC', 999999, 99);
    INSERT INTO users VALUES
      ('user-ana', '${tenantOne}', 'ana@example.com'),
      ('user-other', '${tenantTwo}', 'other@example.com');
    INSERT INTO clients VALUES
      ('client-ana', '${tenantOne}', 'user-ana', 'Ana', '2030-02-02T10:00:00.000Z'),
      ('client-other', '${tenantTwo}', 'user-other', 'Externa', '2030-02-03T10:00:00.000Z');
    INSERT INTO services VALUES
      ('service-100', '${tenantOne}', 'Fio a fio', 10000),
      ('service-200', '${tenantOne}', 'Volume', 20000),
      ('service-300', '${tenantOne}', 'Excluído', 30000),
      ('service-other', '${tenantTwo}', 'Externo', 999999);
    INSERT INTO appointments VALUES
      ('appt-confirmed', '${tenantOne}', 'service-100', 'user-ana', '2030-02-10T10:00:00.000Z', 'CONFIRMED', 'NOT_REQUESTED'),
      ('appt-presence', '${tenantOne}', 'service-200', 'user-ana', '2030-02-12T10:00:00.000Z', 'PENDING', 'MANUALLY_CONFIRMED'),
      ('appt-pending', '${tenantOne}', 'service-300', 'user-ana', '2030-02-13T10:00:00.000Z', 'PENDING', 'NO_RESPONSE'),
      ('appt-cancelled', '${tenantOne}', 'service-300', 'user-ana', '2030-02-14T10:00:00.000Z', 'CANCELLED', 'CONFIRMED'),
      ('appt-other', '${tenantTwo}', 'service-other', 'user-other', '2030-02-10T10:00:00.000Z', 'CONFIRMED', 'CONFIRMED');
    INSERT INTO cash_transactions VALUES
      ('income-one', '${tenantOne}', 'INCOME', 3000, 'PIX', 'Entrada', '2030-02-10T09:00:00.000Z'),
      ('expense-one', '${tenantOne}', 'EXPENSE', 1200, 'Material', 'Cola', '2030-02-11T09:00:00.000Z'),
      ('foreign-expense', '${tenantTwo}', 'EXPENSE', 999999, 'Outro', 'Isolado', '2030-02-11T09:00:00.000Z');
  `)

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = {
        id: 'admin-1', role: 'ADMIN', tenantId: tenantOne,
        sessionId: 'session-admin', persistent: false, trustedDeviceId: null,
      }
    }
    next()
  })
  app.use('/api/admin', createAdminFinanceRouter({
    db,
    tenantFinanceTimeZone: (tenantId) => {
      const row = db.prepare('SELECT timezone FROM tenant_settings WHERE tenant_id = ?').get(tenantId) as { timezone: string }
      return row.timezone
    },
    financeMonthSnapshot: ({ year, month }) => snapshot(year, month, month === 2 ? 33000 : 15000),
    financeRecentMonths: () => [snapshot(2030, 1, 15000), snapshot(2030, 2, 33000)],
    financeExpenseCategories: () => [{ label: 'Material', amountCents: 1200, transactions: 1 }],
    now: () => fixedNow,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const adminHeaders = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/finance`)).status, 401)

    const overviewResponse = await fetch(`${baseUrl}/api/admin/finance`, { headers: adminHeaders })
    assert.equal(overviewResponse.status, 200)
    const overview = await overviewResponse.json() as OverviewPayload
    assert.equal(overview.timeZone, 'UTC')
    assert.equal(overview.todayYmd, '2030-02-15')
    assert.deepEqual(overview.totals, { entriesCents: 33000, expensesCents: 1200, profitCents: 31800 })
    assert.deepEqual(overview.goals, {
      revenueCents: 50000, newClients: 5, currentRevenueCents: 33000, currentNewClients: 1,
    })
    assert.deepEqual(overview.lastEntries.map((entry: { id: string }) => entry.id), ['appt-presence', 'appt-confirmed'])
    assert.ok(overview.lastCashTransactions.every((entry: { id: string }) => entry.id !== 'foreign-expense'))

    const goalsResponse = await fetch(`${baseUrl}/api/admin/finance/goals`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ revenueGoalCents: 75000, newClientsGoal: 8 }),
    })
    assert.equal(goalsResponse.status, 200)
    assert.deepEqual(db.prepare(`SELECT monthly_revenue_goal_cents, monthly_new_clients_goal FROM tenant_settings WHERE tenant_id = ?`).get(tenantOne), {
      monthly_revenue_goal_cents: 75000,
      monthly_new_clients_goal: 8,
    })
    const foreignGoals = db.prepare('SELECT monthly_revenue_goal_cents FROM tenant_settings WHERE tenant_id = ?').get(tenantTwo) as { monthly_revenue_goal_cents: number }
    assert.equal(foreignGoals.monthly_revenue_goal_cents, 999999)

    const expenseResponse = await fetch(`${baseUrl}/api/admin/finance/expenses`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify({ amountCents: 2500, method: '  Insumos  ', note: '  Pinças  ' }),
    })
    assert.equal(expenseResponse.status, 201)
    const expense = (await expenseResponse.json() as { transaction: TransactionPayload }).transaction
    assert.equal(expense.method, 'Insumos')
    assert.equal(expense.note, 'Pinças')
    assert.equal(expense.createdAt, fixedNow.toISOString())

    const transactionResponse = await fetch(`${baseUrl}/api/admin/finance/transactions`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ type: 'INCOME', amountCents: 4500, method: ' PIX ', note: ' Extra ', date: '2030-02-10' }),
    })
    assert.equal(transactionResponse.status, 200)
    const transaction = (await transactionResponse.json() as { transaction: TransactionPayload }).transaction
    assert.equal(transaction.createdAt, '2030-02-10T12:00:00.000Z')
    assert.equal(transaction.method, 'PIX')
    assert.equal(transaction.note, 'Extra')

    const ambiguousDateResponse = await fetch(`${baseUrl}/api/admin/finance/transactions`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ type: 'INCOME', amountCents: 1, date: '2030-02-10', createdAt: fixedNow.toISOString() }),
    })
    assert.equal(ambiguousDateResponse.status, 400)

    const incomeExtractResponse = await fetch(`${baseUrl}/api/admin/finance/extract?startDate=2030-02-10&endDate=2030-02-10&type=income`, { headers: adminHeaders })
    assert.equal(incomeExtractResponse.status, 200)
    const incomeExtract = await incomeExtractResponse.json() as ExtractPayload
    assert.equal(incomeExtract.start, '2030-02-10T00:00:00.000Z')
    assert.equal(incomeExtract.endExclusive, '2030-02-11T00:00:00.000Z')
    assert.deepEqual(incomeExtract.transactions.map((entry: { id: string }) => entry.id), [
      `transaction_${transaction.id}`, 'appointment_appt-confirmed', 'transaction_income-one',
    ])

    const expenseExtractResponse = await fetch(`${baseUrl}/api/admin/finance/extract?startDate=2030-02-11&endDate=2030-02-15&type=expense`, { headers: adminHeaders })
    const expenseExtract = await expenseExtractResponse.json() as ExtractPayload
    assert.deepEqual(expenseExtract.transactions.map((entry: { id: string }) => entry.id), [
      `transaction_${expense.id}`, 'transaction_expense-one',
    ])

    assert.equal((await fetch(`${baseUrl}/api/admin/finance/extract?startDate=2030-02-12&endDate=2030-02-10`, { headers: adminHeaders })).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/admin/finance/transactions/foreign-expense`, { method: 'DELETE', headers: adminHeaders })).status, 404)
    assert.equal((await fetch(`${baseUrl}/api/admin/finance/transactions/${expense.id}`, { method: 'DELETE', headers: adminHeaders })).status, 200)
    const deletedCount = db.prepare('SELECT COUNT(*) AS count FROM cash_transactions WHERE id = ?').get(expense.id) as { count: number }
    assert.equal(deletedCount.count, 0)
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
