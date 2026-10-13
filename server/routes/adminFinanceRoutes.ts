import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { dayBoundsUtc, getZonedDateTimeParts, monthBoundsUtc, parseYmd, shiftYearMonth, utcForLocalTime } from '../dateTime.js'
import type { FinanceMonthSnapshot } from '../finance.js'
import { badRequest, notFound } from '../http.js'

type FinanceSnapshotInput = { tenantId: string; timeZone: string; year: number; month: number }
type FinanceRecentMonthsInput = { tenantId: string; timeZone: string; months?: number; now?: Date }
type FinanceExpenseCategoriesInput = FinanceSnapshotInput & { limit?: number }

type AdminFinanceRouterOptions = {
  db: Database.Database
  tenantFinanceTimeZone: (tenantId: string) => string
  financeMonthSnapshot: (input: FinanceSnapshotInput) => FinanceMonthSnapshot
  financeRecentMonths: (input: FinanceRecentMonthsInput) => FinanceMonthSnapshot[]
  financeExpenseCategories: (input: FinanceExpenseCategoriesInput) => Array<{
    label: string
    amountCents: number
    transactions: number
  }>
  now?: () => Date
}

export function createAdminFinanceRouter({
  db,
  tenantFinanceTimeZone,
  financeMonthSnapshot,
  financeRecentMonths,
  financeExpenseCategories,
  now = () => new Date(),
}: AdminFinanceRouterOptions) {
  const router = Router()

  router.get('/finance', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const currentTime = now()
      const timeZone = tenantFinanceTimeZone(tenantId)
      const nowParts = getZonedDateTimeParts(currentTime, timeZone)
      if (!nowParts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')

      const goals = db.prepare(`
        SELECT monthly_revenue_goal_cents as revenueGoalCents,
               monthly_new_clients_goal as newClientsGoal
        FROM tenant_settings
        WHERE tenant_id = ?
      `).get(tenantId) as { revenueGoalCents: number; newClientsGoal: number } | undefined

      const historicalEntries = db.prepare(`
        SELECT COALESCE(SUM(s.price_cents), 0) as entriesCents
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
          AND a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED'))
      `).get(tenantId) as { entriesCents: number } | undefined

      const historicalCash = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount_cents ELSE 0 END), 0) as expensesCents,
          COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount_cents ELSE 0 END), 0) as incomeCents
        FROM cash_transactions
        WHERE tenant_id = ?
      `).get(tenantId) as { expensesCents: number; incomeCents: number } | undefined

      const lastCashTransactions = db.prepare(`
        SELECT id,
               type,
               amount_cents as amountCents,
               method,
               note,
               created_at as createdAt
        FROM cash_transactions
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 100
      `).all(tenantId) as Array<{
        id: string
        type: 'INCOME' | 'EXPENSE'
        amountCents: number
        method: string
        note: string | null
        createdAt: string
      }>

      const lastEntries = db.prepare(`
        SELECT a.id,
               a.starts_at as startsAt,
               a.status,
               s.name as serviceName,
               s.price_cents as priceCents,
               u.email as clientEmail,
               c.name as clientName
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        JOIN users u ON u.id = a.client_user_id
        LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
        WHERE a.tenant_id = ?
          AND a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED'))
        ORDER BY a.starts_at DESC
        LIMIT 100
      `).all(tenantId) as Array<{
        id: string
        startsAt: string
        status: string
        serviceName: string
        priceCents: number
        clientEmail: string
        clientName: string | null
      }>

      const monthly = financeRecentMonths({ tenantId, timeZone, months: 6, now: currentTime })
      const currentMonth = financeMonthSnapshot({ tenantId, timeZone, year: nowParts.year, month: nowParts.month })
      const previousYm = shiftYearMonth({ year: nowParts.year, month: nowParts.month }, -1)
      const previousMonth = financeMonthSnapshot({ tenantId, timeZone, ...previousYm })
      const expenseCategories = financeExpenseCategories({ tenantId, timeZone, year: nowParts.year, month: nowParts.month, limit: 5 })

      const currentBounds = monthBoundsUtc({ timeZone, year: nowParts.year, month: nowParts.month })
      const currentMonthNewClients = db.prepare(`
        SELECT COUNT(1) as newClientsCount
        FROM clients
        WHERE tenant_id = ?
          AND created_at >= ?
          AND created_at < ?
      `).get(tenantId, currentBounds.start.toISOString(), currentBounds.endExclusive.toISOString()) as { newClientsCount: number } | undefined

      const historicalEntriesCents = Number(historicalEntries?.entriesCents ?? 0) + Number(historicalCash?.incomeCents ?? 0)
      const historicalExpensesCents = Number(historicalCash?.expensesCents ?? 0)
      const revenueGoalCents = goals?.revenueGoalCents ?? 1000000
      const newClientsGoal = goals?.newClientsGoal ?? 10

      res.json({
        timeZone,
        todayYmd: nowParts.ymd,
        currentMonthYm: currentMonth.ym,
        currentMonth,
        previousMonth,
        totals: {
          entriesCents: historicalEntriesCents,
          expensesCents: historicalExpensesCents,
          profitCents: historicalEntriesCents - historicalExpensesCents,
        },
        goals: {
          revenueCents: revenueGoalCents,
          newClients: newClientsGoal,
          currentRevenueCents: currentMonth.entriesCents,
          currentNewClients: currentMonthNewClients?.newClientsCount ?? 0,
        },
        expenseCategories,
        lastCashTransactions,
        lastEntries,
        monthly,
      })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/finance/goals', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const body = z.object({
        revenueGoalCents: z.number().int().nonnegative().optional(),
        newClientsGoal: z.number().int().nonnegative().optional(),
      }).parse(req.body)

      const updates: string[] = []
      const params: Array<string | number> = []
      if (body.revenueGoalCents !== undefined) {
        updates.push('monthly_revenue_goal_cents = ?')
        params.push(body.revenueGoalCents)
      }
      if (body.newClientsGoal !== undefined) {
        updates.push('monthly_new_clients_goal = ?')
        params.push(body.newClientsGoal)
      }
      if (updates.length > 0) {
        params.push(tenantId)
        db.prepare(`UPDATE tenant_settings SET ${updates.join(', ')} WHERE tenant_id = ?`).run(...params)
      }

      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.post('/finance/expenses', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const body = z.object({
        amountCents: z.number().int().positive(),
        method: z.string().min(1).optional(),
        note: z.string().optional(),
      }).parse(req.body)

      const createdAt = now().toISOString()
      const id = randomUUID()
      const method = body.method?.trim() || 'MANUAL'
      const note = body.note?.trim() || null
      db.prepare(`
        INSERT INTO cash_transactions (id, tenant_id, type, amount_cents, method, note, created_at)
        VALUES (?, ?, 'EXPENSE', ?, ?, ?, ?)
      `).run(id, tenantId, body.amountCents, method, note, createdAt)

      res.status(201).json({
        transaction: { id, type: 'EXPENSE', amountCents: body.amountCents, method, note, createdAt },
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/finance/transactions', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const body = z.object({
        type: z.enum(['INCOME', 'EXPENSE']),
        amountCents: z.number().int().positive(),
        method: z.string().min(1).optional(),
        note: z.string().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        createdAt: z.string().datetime().optional(),
      }).refine((value) => !(value.date && value.createdAt), { message: 'Envie date ou createdAt, não os dois.' }).parse(req.body)

      let createdAt = body.createdAt || now().toISOString()
      if (body.date) {
        const parsed = parseYmd(body.date)
        if (!parsed) return next(badRequest('Data inválida', 'INVALID_DATE'))
        const timeZone = tenantFinanceTimeZone(tenantId)
        createdAt = utcForLocalTime({ timeZone, ...parsed, hour: 12, minute: 0 }).toISOString()
      }
      const id = randomUUID()
      const method = body.method?.trim() || 'MANUAL'
      const note = body.note?.trim() || null

      db.prepare(`
        INSERT INTO cash_transactions (id, tenant_id, type, amount_cents, method, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, body.type, body.amountCents, method, note, createdAt)

      res.json({ transaction: { id, type: body.type, amountCents: body.amountCents, method, note, createdAt } })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/finance/transactions/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const result = db.prepare('DELETE FROM cash_transactions WHERE id = ? AND tenant_id = ?').run(req.params.id, tenantId)
      if (result.changes === 0) return next(notFound('Transação não encontrada', 'TRANSACTION_NOT_FOUND'))

      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.get('/finance/extract', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const q = z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        start: z.string().datetime().optional(),
        end: z.string().datetime().optional(),
        type: z.enum(['all', 'income', 'expense']).optional(),
      }).parse({
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        start: typeof req.query.start === 'string' ? req.query.start : undefined,
        end: typeof req.query.end === 'string' ? req.query.end : undefined,
        type: typeof req.query.type === 'string' ? req.query.type : undefined,
      })

      const type = q.type || 'all'
      if (q.startDate && q.endDate && q.startDate > q.endDate) {
        return next(badRequest('Período inválido: a data inicial deve vir antes da data final.', 'INVALID_DATE_RANGE'))
      }
      const timeZone = tenantFinanceTimeZone(tenantId)
      const currentTime = now()
      const nowParts = getZonedDateTimeParts(currentTime, timeZone)
      if (!nowParts) return next(badRequest('Fuso horário inválido', 'INVALID_TIMEZONE'))

      let start = q.start || new Date(0).toISOString()
      let endExclusive = q.end || new Date(currentTime.getTime() + 1).toISOString()
      if (q.startDate || q.endDate) {
        const startDate = q.startDate || `${nowParts.year}-${String(nowParts.month).padStart(2, '0')}-01`
        const endDate = q.endDate || nowParts.ymd
        const startBounds = dayBoundsUtc({ timeZone, ymd: startDate })
        const endBounds = dayBoundsUtc({ timeZone, ymd: endDate })
        start = startBounds.start.toISOString()
        endExclusive = endBounds.endExclusive.toISOString()
      }

      const transactions = db.prepare(`
        SELECT * FROM (
          SELECT
            'appointment_' || a.id as id,
            'INCOME' as type,
            s.price_cents as amountCents,
            'Serviço' as category,
            COALESCE(c.name, u.email) as description,
            a.starts_at as date,
            'CONFIRMED' as status
          FROM appointments a
          JOIN services s ON s.id = a.service_id
          JOIN users u ON u.id = a.client_user_id
          LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
          WHERE a.tenant_id = ?
            AND a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED'))
            AND a.starts_at >= ?
            AND a.starts_at < ?
            AND (? = 'all' OR ? = 'income')

          UNION ALL

          SELECT
            'transaction_' || t.id as id,
            t.type,
            t.amount_cents as amountCents,
            t.method as category,
            t.note as description,
            t.created_at as date,
            'COMPLETED' as status
          FROM cash_transactions t
          WHERE t.tenant_id = ?
            AND t.created_at >= ?
            AND t.created_at < ?
            AND (
              ? = 'all'
              OR (? = 'income' AND t.type = 'INCOME')
              OR (? = 'expense' AND t.type = 'EXPENSE')
            )
        )
        ORDER BY date DESC
      `).all(
        tenantId, start, endExclusive, type, type,
        tenantId, start, endExclusive, type, type, type,
      )

      res.json({ transactions, timeZone, start, endExclusive })
    } catch (err) {
      next(err)
    }
  })

  return router
}
