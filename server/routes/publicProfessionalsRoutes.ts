import type Database from 'better-sqlite3'
import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { dayBoundsUtc } from '../dateTime.js'
import { forbidden, notFound } from '../http.js'

export function createPublicProfessionalsRouter(db: Database.Database) {
  const router = Router()

  function tenantId(req: Request, explicitSlug?: string) {
    if (explicitSlug && req.resolvedTenant && req.resolvedTenant.slug !== explicitSlug) throw forbidden('Use o endereço do espaço escolhido.', 'TENANT_HOST_MISMATCH')
    if (!explicitSlug) {
      if (!req.resolvedTenant) throw notFound('Tenant não encontrado.', 'TENANT_NOT_FOUND')
      return req.resolvedTenant.id
    }
    const row = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'ACTIVE'").get(explicitSlug) as { id: string } | undefined
    if (!row) throw notFound('Tenant não encontrado.', 'TENANT_NOT_FOUND')
    return row.id
  }

  const hasPhoto = (db.prepare('PRAGMA table_info(professionals)').all() as Array<{name:string}>).some(c=>c.name==='photo_url')
  const qualified = (id: string, serviceId: string) => db.prepare(`
    SELECT p.id, p.name, ${hasPhoto ? 'p.photo_url' : 'NULL'} as photoUrl, ${hasPhoto ? 'p.instagram' : 'NULL'} as instagram, ${hasPhoto ? 'p.tiktok' : 'NULL'} as tiktok FROM professionals p
    JOIN professional_services ps ON ps.tenant_id = p.tenant_id AND ps.professional_id = p.id
    JOIN services s ON s.tenant_id = ps.tenant_id AND s.id = ps.service_id
    WHERE p.tenant_id = ? AND p.active = 1 AND p.bookable = 1 AND s.active = 1 AND s.id = ?
    ORDER BY p.created_at, p.id
  `).all(id, serviceId) as Array<{ id: string; name: string; photoUrl: string | null }>

  const professionals = (req: Request, res: Response, explicitSlug?: string) => {
    const id = tenantId(req, explicitSlug)
    const serviceId = z.string().uuid().parse(req.query.serviceId)
    res.json({ professionals: qualified(id, serviceId) })
  }

  const availability = (req: Request, res: Response, explicitSlug?: string) => {
    const id = tenantId(req, explicitSlug)
    const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), serviceId: z.string().uuid(), professionalId: z.string().uuid().optional() })
      .parse(req.query)
    const settings = db.prepare('SELECT timezone FROM tenant_settings WHERE tenant_id = ?').get(id) as { timezone: string } | undefined
    const timeZone = settings?.timezone ?? 'America/Sao_Paulo'
    const { start, endExclusive } = dayBoundsUtc({ timeZone, ymd: query.date })
    const eligible = qualified(id, query.serviceId)
    if (query.professionalId && !eligible.some(person => person.id === query.professionalId)) {
      throw notFound('Profissional indisponível para este serviço.', 'PROFESSIONAL_UNAVAILABLE')
    }
    const globalHours = db.prepare('SELECT weekday, start_minute as startMinute, end_minute as endMinute FROM business_hours WHERE tenant_id = ? ORDER BY weekday, start_minute')
      .all(id) as Array<{ weekday: number; startMinute: number; endMinute: number }>
    const globalBlocks = db.prepare(`SELECT starts_at as startsAt, ends_at as endsAt, 'time_off' as kind
      FROM time_off WHERE tenant_id = ? AND starts_at < ? AND ends_at > ?`)
      .all(id, endExclusive.toISOString(), start.toISOString())
    const selected = query.professionalId ? eligible.filter(person => person.id === query.professionalId) : eligible
    res.json({ professionals: selected.map(person => {
      const personalHours = db.prepare('SELECT weekday, start_minute as startMinute, end_minute as endMinute FROM professional_hours WHERE tenant_id = ? AND professional_id = ? ORDER BY weekday, start_minute')
        .all(id, person.id) as Array<{ weekday: number; startMinute: number; endMinute: number }>
      const effectiveHours = personalHours.length ? globalHours.flatMap(base => personalHours
        .filter(hours => hours.weekday === base.weekday)
        .map(hours => ({ weekday: base.weekday, startMinute: Math.max(base.startMinute, hours.startMinute), endMinute: Math.min(base.endMinute, hours.endMinute) }))
        .filter(hours => hours.startMinute < hours.endMinute)) : globalHours
      const appointments = db.prepare(`SELECT starts_at as startsAt, ends_at as endsAt, 'appointment' as kind
        FROM appointments WHERE tenant_id = ? AND professional_id = ? AND status IN ('CONFIRMED','PENDING')
        AND starts_at < ? AND ends_at > ?`).all(id, person.id, endExclusive.toISOString(), start.toISOString())
      const timeOff = db.prepare(`SELECT starts_at as startsAt, ends_at as endsAt, 'time_off' as kind
        FROM professional_time_off WHERE tenant_id = ? AND professional_id = ? AND starts_at < ? AND ends_at > ?`)
        .all(id, person.id, endExclusive.toISOString(), start.toISOString())
      return { ...person, businessHours: effectiveHours, blocks: [...globalBlocks, ...timeOff, ...appointments] }
    }) })
  }

  router.get('/professionals', (req, res, next) => { try { professionals(req, res) } catch (error) { next(error) } })
  router.get('/tenant/:slug/professionals', (req, res, next) => { try { professionals(req, res, z.string().parse(req.params.slug).trim().toLowerCase()) } catch (error) { next(error) } })
  router.get('/staff-availability', (req, res, next) => { try { availability(req, res) } catch (error) { next(error) } })
  router.get('/tenant/:slug/staff-availability', (req, res, next) => { try { availability(req, res, z.string().parse(req.params.slug).trim().toLowerCase()) } catch (error) { next(error) } })

  return router
}
