import express, { type RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { env } from '../env.js'
import { forbidden } from '../http.js'

type DevOperationsRouterOptions = {
  db: Database.Database
  requireDevHost: RequestHandler
  devBackupExportLimiter: RequestHandler
}

export function createDevOperationsRouter(options: DevOperationsRouterOptions) {
  const { db, requireDevHost, devBackupExportLimiter } = options
  const router = express.Router()

  router.get('/platform-overview', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const totals = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status = 'DISABLED' THEN 1 ELSE 0 END) AS disabled FROM tenants`).get() as { total: number; active: number; disabled: number }
      const subscriptions = db.prepare(`SELECT COUNT(*) AS active FROM subscriptions WHERE status = 'ACTIVE' AND current_period_end > ?`).get(new Date().toISOString()) as { active: number }
      const pendingOrders = db.prepare(`SELECT COUNT(*) AS count FROM infinitepay_orders WHERE status = 'PENDING'`).get() as { count: number }
      const ai = db.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens FROM assistant_usage WHERE request_day >= ?`).get(new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10)) as { requests: number; tokens: number }
      res.json({ totals, activeSubscriptions: subscriptions.active, pendingOrders: pendingOrders.count, ai30d: ai })
    } catch (err) { next(err) }
  })

  router.post('/test-mode', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      if (env.NODE_ENV === 'production') {
        throw forbidden('Modo de teste é bloqueado em produção.', 'TEST_MODE_DISABLED')
      }
      const body = z.object({ enabled: z.boolean() }).parse(req.body)
      const now = new Date().toISOString()
      
      db.prepare(`
        INSERT INTO platform_settings (key, value, updated_at)
        VALUES ('test_mode', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(String(body.enabled), now)

      res.json({ ok: true, enabled: body.enabled })
    } catch (err) {
      next(err)
    }
  })

  router.get('/notifications', requireDevHost, requireRole('DEV'), (req, res, next) => {
    try {
      const limit = 20
      const events = db.prepare(`
        SELECT id, event_type as eventType, payload_json as payload, received_at as receivedAt
        FROM payment_events
        WHERE event_type IN ('payment_approved', 'order_created', 'OrderCreated', 'PaymentApproved')
        ORDER BY received_at DESC
        LIMIT ?
      `).all(limit) as Array<{ id: string; eventType: string; payload: string; receivedAt: string }>

      const notifications = events.map((e) => {
        const data: Record<string, unknown> = (() => {
          try {
            const parsed: unknown = JSON.parse(e.payload)
            if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
            return {}
          } catch {
            return {}
          }
        })()

        const customerRaw = data.customer
        const customer =
          customerRaw && typeof customerRaw === 'object' ? (customerRaw as Record<string, unknown>) : null
        const firstName = customer && typeof customer.firstname === 'string' ? customer.firstname : ''
        const lastName = customer && typeof customer.lastname === 'string' ? customer.lastname : ''
        const customerName = firstName ? `${firstName} ${lastName}`.trim() : 'Cliente'

        const totalRaw = data.total
        let totalNumber: number | null = null
        if (typeof totalRaw === 'number' && Number.isFinite(totalRaw)) totalNumber = totalRaw
        if (typeof totalRaw === 'string') {
          const n = Number(totalRaw)
          if (Number.isFinite(n)) totalNumber = n
        }
        const total = totalNumber !== null ? (totalNumber / 100).toFixed(2) : '0.00'

        return {
          id: e.id,
          title:
            e.eventType === 'payment_approved' || e.eventType === 'PaymentApproved'
              ? 'Pagamento Aprovado'
              : 'Novo Pedido',
          desc: `${customerName} - R$ ${total}`,
          time: e.receivedAt,
          type: e.eventType,
        }
      })

      res.json({ notifications })
    } catch (err) {
      next(err)
    }
  })

  router.get('/backup/export', requireDevHost, devBackupExportLimiter, requireRole('DEV'), async (_req, res, next) => {
    const exportPath = path.join(tmpdir(), `lashdesigner-export-${randomUUID()}.db`)
    try {
      await db.backup(exportPath)
      res.download(exportPath, `lashdesigner-backup-${new Date().toISOString().slice(0, 10)}.db`, (err) => {
        try {
          if (existsSync(exportPath)) unlinkSync(exportPath)
        } catch (cleanupError) {
          console.error('[Backup] Temporary export cleanup failed:', cleanupError)
        }
        if (err && !res.headersSent) next(err)
      })
    } catch (err) {
      try {
        if (existsSync(exportPath)) unlinkSync(exportPath)
      } catch {
        // Best-effort cleanup; the original export error is more relevant.
      }
      next(err)
    }
  })

  return router
}

