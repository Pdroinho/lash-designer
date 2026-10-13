import express, { type RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { forbidden } from '../http.js'
import { createRateLimiter } from '../middleware/rateLimit.js'
import { type Actor, statuses, priorities } from '../support/contracts.js'
import { createSupportService } from '../support/service.js'

export function createSupportRouter({
  db,
  requireDevHost,
}: {
  db: Database.Database
  requireDevHost: RequestHandler
}) {
  const router = express.Router(),
    service = createSupportService(db)
  router.use(requireRole('DEV', 'ADMIN', 'STAFF'))
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store')
    if (req.sessionUser!.role === 'DEV') return requireDevHost(req, res, next)
    if (
      !req.resolvedTenant ||
      req.resolvedTenant.id !== req.sessionUser!.tenantId
    )
      return next(forbidden())
    next()
  })
  const actor = (req: express.Request) => req.sessionUser! as Actor
  const id = (value: unknown) =>
    z.coerce.number().int().positive().safe().parse(value)
  const mutate = createRateLimiter(db, {
    windowMs: 60000,
    max: 30,
    keyPrefix: 'support-mutation',
    persistent: true,
    keyFn: (req) => req.sessionUser!.id,
  })
  router.get('/tickets', (req, res, next) => {
    try {
      const query = z
        .object({
          search: z.string().trim().max(160).default(''),
          status: z.union([z.enum(statuses), z.literal('')]).default(''),
          priority: z.union([z.enum(priorities), z.literal('')]).default(''),
          assigned: z
            .union([z.string().uuid(), z.literal('unassigned'), z.literal('')])
            .default(''),
          page: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .parse(req.query)
      res.json(
        service.list(
          actor(req),
          query.search,
          query.status,
          query.page,
          query.priority,
          query.assigned,
        ),
      )
    } catch (err) {
      next(err)
    }
  })
  router.get('/agents', requireRole('DEV'), (_req, res) =>
    res.json({ agents: service.agents() }),
  )
  router.get('/notifications', (req, res, next) => {
    try {
      res.json(service.notifications(actor(req)))
    } catch (err) {
      next(err)
    }
  })
  router.patch('/notifications', mutate, (req, res, next) => {
    try {
      service.markNotifications(actor(req), req.body)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })
  router.post('/tickets', mutate, (req, res, next) => {
    try {
      res.status(201).json({ id: service.create(actor(req), req.body) })
    } catch (err) {
      next(err)
    }
  })
  router.get('/tickets/:id', (req, res, next) => {
    try {
      res.json(
        service.detail(
          actor(req),
          id(req.params.id),
          z.coerce.number().int().min(0).default(0).parse(req.query.after),
        ),
      )
    } catch (err) {
      next(err)
    }
  })
  router.post('/tickets/:id/replies', mutate, (req, res, next) => {
    try {
      res.json({ id: service.reply(actor(req), id(req.params.id), req.body) })
    } catch (err) {
      next(err)
    }
  })
  router.patch('/tickets/:id', mutate, (req, res, next) => {
    try {
      res.json({ id: service.update(actor(req), id(req.params.id), req.body) })
    } catch (err) {
      next(err)
    }
  })
  router.post('/tickets/:id/read', (req, res, next) => {
    try {
      const body = z
        .object({ sequence: z.number().int().nonnegative() })
        .strict()
        .parse(req.body)
      service.read(actor(req), id(req.params.id), body.sequence)
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })
  router.get('/attachments/:id', (req, res, next) => {
    try {
      const file = service.attachment(
        actor(req),
        z.string().uuid().parse(req.params.id),
      )
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'")
      res.setHeader('Content-Type', file.mime_type)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="image"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      )
      res.send(file.data)
    } catch (err) {
      next(err)
    }
  })
  return router
}
