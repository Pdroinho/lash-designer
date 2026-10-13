import Database from 'better-sqlite3'
import { Router } from 'express'
import { requireRole } from '../auth.js'
import { badRequest } from '../http.js'

type AdminClientsRouterOptions = {
  db: Database.Database
}

export function createAdminClientsRouter({ db }: AdminClientsRouterOptions) {
  const router = Router()

  router.get('/clients', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const clients = db.prepare(`
        SELECT
          c.id,
          c.name,
          c.phone,
          c.marketing_whatsapp_opt_in as marketingWhatsappOptIn,
          u.email as email,
          COALESCE(SUM(CASE WHEN a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED')) THEN s.price_cents ELSE 0 END), 0) as totalSpentCents,
          MAX(CASE WHEN a.status != 'CANCELLED' AND (a.status = 'CONFIRMED' OR a.confirmation_status IN ('CONFIRMED','MANUALLY_CONFIRMED')) THEN a.starts_at ELSE NULL END) as lastVisitAt
        FROM clients c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN appointments a ON a.tenant_id = c.tenant_id AND a.client_user_id = c.user_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE c.tenant_id = ?
        GROUP BY c.id
        ORDER BY (lastVisitAt IS NULL) ASC, lastVisitAt DESC, totalSpentCents DESC
        LIMIT 500
      `).all(tenantId) as Array<{
        id: string
        name: string
        phone: string | null
        marketingWhatsappOptIn: number
        email: string
        totalSpentCents: number
        lastVisitAt: string | null
      }>

      res.json({ clients })
    } catch (err) {
      next(err)
    }
  })

  return router
}
