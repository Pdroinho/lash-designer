import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest, notFound } from '../http.js'

type AdminServicesRouterOptions = {
  db: Database.Database
}

const serviceFields = `
  SELECT id, name, duration_minutes as durationMinutes, price_cents as priceCents, cover_url as coverUrl
  FROM services
`

export function createAdminServicesRouter({ db }: AdminServicesRouterOptions) {
  const router = Router()

  router.get('/services', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const services = db.prepare(`
        ${serviceFields}
        WHERE tenant_id = ? AND active = 1
        ORDER BY created_at DESC
      `).all(tenantId)
      res.json({ services })
    } catch (err) {
      next(err)
    }
  })

  router.post('/services', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        name: z.string().min(2),
        durationMinutes: z.number().int().positive(),
        priceCents: z.number().int().nonnegative(),
        coverUrl: z.string().max(350_000).optional(),
      }).parse(req.body)

      const id = randomUUID()
      db.prepare(`
        INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, cover_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, body.name, body.durationMinutes, body.priceCents, body.coverUrl ?? null, new Date().toISOString())

      const service = db.prepare(`${serviceFields} WHERE id = ? AND tenant_id = ?`).get(id, tenantId)
      res.json({ service })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/services/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const body = z.object({
        name: z.string().min(2).optional(),
        durationMinutes: z.number().int().positive().optional(),
        priceCents: z.number().int().nonnegative().optional(),
        coverUrl: z.string().max(350_000).nullable().optional(),
      }).parse(req.body)

      const row = db.prepare('SELECT id FROM services WHERE id = ? AND tenant_id = ? AND active = 1')
        .get(id, tenantId) as { id: string } | undefined
      if (!row) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))

      const updates: Array<{ sql: string; params: unknown[] }> = []
      if (typeof body.name === 'string') updates.push({ sql: 'name = ?', params: [body.name] })
      if (typeof body.durationMinutes === 'number') updates.push({ sql: 'duration_minutes = ?', params: [body.durationMinutes] })
      if (typeof body.priceCents === 'number') updates.push({ sql: 'price_cents = ?', params: [body.priceCents] })
      if ('coverUrl' in body) {
        const nextCover = body.coverUrl === null ? null : (body.coverUrl ?? '').trim()
        updates.push({ sql: 'cover_url = ?', params: [nextCover || null] })
      }
      if (updates.length === 0) return next(badRequest('Nada para atualizar', 'NO_UPDATES'))

      const setSql = updates.map(update => update.sql).join(', ')
      const params = updates.flatMap(update => update.params)
      db.prepare(`UPDATE services SET ${setSql} WHERE id = ? AND tenant_id = ?`).run(...params, id, tenantId)

      const service = db.prepare(`${serviceFields} WHERE id = ? AND tenant_id = ?`).get(id, tenantId)
      res.json({ service })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/services/:id', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const id = z.string().uuid().parse(req.params.id)
      const result = db.prepare('UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ? AND active = 1')
        .run(id, tenantId)
      if (result.changes === 0) return next(notFound('Serviço não encontrado', 'SERVICE_NOT_FOUND'))
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
