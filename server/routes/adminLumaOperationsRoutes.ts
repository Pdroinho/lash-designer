import { Router, type RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { executeOperationalTool, lumaCalendar } from '../lumaOperations.js'
import { getZonedDateTimeParts } from '../dateTime.js'
const prepareNames = [
  'prepare_support_ticket',
  'prepare_support_reply',
  'prepare_finance_entry',
  'prepare_finance_correction',
  'prepare_finance_goals',
  'prepare_attendance',
  'prepare_whatsapp_reminder',
  'prepare_cancel_reminder',
  'prepare_luma_preferences',
] as const
export function createAdminLumaOperationsRouter(
  db: Database.Database,
  limiter: RequestHandler,
) {
  const router = Router()
  router.use('/assistant', requireRole('ADMIN'))
  router.get('/assistant/calendar', (req, res, next) => {
    try {
      res.json(
        lumaCalendar(db, req.sessionUser!.tenantId!, {
          start_date: req.query.start,
          end_date: req.query.end,
          page: Number(req.query.page || 1),
        }),
      )
    } catch (error) {
      next(error)
    }
  })
  router.get('/assistant/preferences', (req, res, next) => {
    try {
      const { id, tenantId } = req.sessionUser!
      const preferences = db
        .prepare(
          'SELECT tone,focus,instructions FROM assistant_preferences WHERE tenant_id=? AND user_id=?',
        )
        .get(tenantId, id) ?? {
        tone: 'FRIENDLY',
        focus: 'GENERAL',
        instructions: '',
      }
      const zone = db
        .prepare('SELECT timezone FROM tenant_settings WHERE tenant_id=?')
        .get(tenantId) as { timezone: string } | undefined
      const timezone = zone?.timezone ?? 'America/Sao_Paulo'
      res.json({
        preferences,
        timezone,
        localDate: getZonedDateTimeParts(new Date(), timezone)?.ymd,
      })
    } catch (error) {
      next(error)
    }
  })
  router.get('/assistant/reminders', (req, res, next) => {
    try {
      res.json(
        executeOperationalTool(
          { tenantId: req.sessionUser!.tenantId!, userId: req.sessionUser!.id },
          'get_personal_reminders',
          {},
        )!.toolResult,
      )
    } catch (error) {
      next(error)
    }
  })
  router.get('/assistant/support', (req, res, next) => {
    try {
      res.json(
        executeOperationalTool(
          { tenantId: req.sessionUser!.tenantId!, userId: req.sessionUser!.id },
          'get_support_requests',
          { page: Number(req.query.page || 1) },
        )!.toolResult,
      )
    } catch (error) {
      next(error)
    }
  })
  router.post('/assistant/operations/prepare', limiter, (req, res, next) => {
    try {
      const body = z
        .object({ name: z.enum(prepareNames), args: z.record(z.unknown()) })
        .strict()
        .parse(req.body)
      res.status(201).json(
        executeOperationalTool(
          {
            tenantId: req.sessionUser!.tenantId!,
            userId: req.sessionUser!.id,
          },
          body.name,
          body.args,
        ),
      )
    } catch (error) {
      next(error)
    }
  })
  return router
}
