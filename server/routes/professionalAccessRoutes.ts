import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { Router, type Request, type RequestHandler } from 'express'
import { z } from 'zod'
import { requireActiveSubscription, requireRole } from '../auth.js'
import { badRequest, notFound } from '../http.js'
import { currentLegalBundleHash, PRIVACY_VERSION, TERMS_VERSION } from '../legal.js'
import { hashPassword } from '../security.js'

type Options = {
  db: Database.Database
  publicLimiter: RequestHandler
  subscriptionGate?: RequestHandler
  normalizeUserE164Phone: (raw: string) => string
  recordLegalAcceptance: (input: { userId: string; tenantId: string | null; source: string; req: Request }) => unknown
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export function createProfessionalAccessRouter({ db, publicLimiter, subscriptionGate = requireActiveSubscription, normalizeUserE164Phone, recordLegalAcceptance }: Options) {
  const router = Router()

  router.post('/admin/professionals/:id/invitation', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser!.tenantId!
      const professionalId = z.string().uuid().parse(req.params.id)
      const { email, phone } = z.object({ email: z.string().email().transform(value => value.trim().toLowerCase()), phone: z.string().min(8).max(40) }).strict().parse(req.body)
      const normalizedPhone = normalizeUserE164Phone(phone)
      const token = randomBytes(32).toString('base64url')
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString()
      db.transaction(() => {
        const person = db.prepare('SELECT user_id as userId FROM professionals WHERE tenant_id = ? AND id = ? AND active = 1 AND bookable = 1')
          .get(tenantId, professionalId) as { userId: string | null } | undefined
        if (!person) throw notFound('Profissional ativa não encontrada.', 'PROFESSIONAL_NOT_FOUND')
        if (person.userId) throw badRequest('Essa profissional já tem acesso. Para protegê-la, não gere outra senha.', 'PROFESSIONAL_ACCESS_EXISTS')
        if (db.prepare('SELECT 1 FROM users WHERE tenant_id = ? AND email = ?').get(tenantId, email)) {
          throw badRequest('Esse e-mail já está em uso no estúdio.', 'PROFESSIONAL_EMAIL_TAKEN')
        }
        db.prepare('UPDATE professional_invitations SET consumed_at = ? WHERE tenant_id = ? AND professional_id = ? AND consumed_at IS NULL')
          .run(now.toISOString(), tenantId, professionalId)
        db.prepare(`INSERT INTO professional_invitations (id, tenant_id, professional_id, token_hash, email, phone, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), tenantId, professionalId, tokenHash(token), email, normalizedPhone, expiresAt, now.toISOString())
      }).immediate()
      res.status(201).json({ path: `/convite/${token}`, expiresAt })
    } catch (error) { next(error) }
  })

  const resolve = (req: Request) => {
    const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(req.params.token)
    const invitation = db.prepare(`SELECT i.id, i.tenant_id as tenantId, i.professional_id as professionalId,
      i.email, i.phone, i.expires_at as expiresAt, p.name as professionalName, t.name as studioName
      FROM professional_invitations i JOIN professionals p ON p.tenant_id = i.tenant_id AND p.id = i.professional_id
      JOIN tenants t ON t.id = i.tenant_id
      WHERE i.token_hash = ? AND i.consumed_at IS NULL AND i.expires_at > ? AND p.active = 1 AND p.bookable = 1
        AND p.user_id IS NULL AND t.status = 'ACTIVE' LIMIT 1`)
      .get(tokenHash(token), new Date().toISOString()) as { id: string; tenantId: string; professionalId: string; email: string; phone: string; expiresAt: string; professionalName: string; studioName: string } | undefined
    if (!invitation || req.resolvedTenant?.id !== invitation.tenantId) throw notFound('Convite inválido ou expirado.', 'INVITATION_NOT_FOUND')
    return invitation
  }

  router.get('/public/professional-invitations/:token', publicLimiter, (req, res, next) => {
    try {
      const invitation = resolve(req)
      res.json({ invitation: { professionalName: invitation.professionalName, studioName: invitation.studioName,
        email: invitation.email, expiresAt: invitation.expiresAt } })
    } catch (error) { next(error) }
  })

  router.post('/public/professional-invitations/:token/accept', publicLimiter, async (req, res, next) => {
    try {
      const invitation = resolve(req)
      const body = z.object({
        password: z.string().min(8).max(128),
        legal: z.object({ accepted: z.literal(true), termsVersion: z.string(), privacyVersion: z.string(), bundleHash: z.string() }).strict(),
      }).strict().parse(req.body)
      if (body.legal.termsVersion !== TERMS_VERSION || body.legal.privacyVersion !== PRIVACY_VERSION || body.legal.bundleHash !== currentLegalBundleHash()) {
        throw badRequest('Os documentos legais foram atualizados. Revise os Termos antes de continuar.', 'LEGAL_VERSION_STALE')
      }
      const hashed = await hashPassword(body.password)
      db.transaction(() => {
        const current = resolve(req)
        if (current.id !== invitation.id) throw notFound('Convite inválido ou expirado.', 'INVITATION_NOT_FOUND')
        const now = new Date().toISOString()
        const consumed = db.prepare('UPDATE professional_invitations SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ?')
          .run(now, current.id, now)
        if (!consumed.changes) throw notFound('Convite inválido ou expirado.', 'INVITATION_NOT_FOUND')
        const userId = randomUUID()
        db.prepare("INSERT INTO users (id, tenant_id, email, password_hash, phone, role, created_at) VALUES (?, ?, ?, ?, ?, 'STAFF', ?)")
          .run(userId, current.tenantId, current.email, hashed, current.phone, now)
        const bound = db.prepare('UPDATE professionals SET user_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND user_id IS NULL AND active = 1')
          .run(userId, now, current.tenantId, current.professionalId)
        if (!bound.changes) throw notFound('Convite inválido ou expirado.', 'INVITATION_NOT_FOUND')
        recordLegalAcceptance({ userId, tenantId: current.tenantId, source: 'STAFF_INVITATION', req })
      }).immediate()
      res.json({ accepted: true, loginPath: '/login' })
    } catch (error) { next(error) }
  })

  router.get('/staff/appointments', requireRole('STAFF'), subscriptionGate, (req, res, next) => {
    try {
      const tenantId = req.sessionUser!.tenantId!
      const userId = req.sessionUser!.id
      if (req.resolvedTenant?.id !== tenantId) throw notFound('Estúdio não encontrado.', 'TENANT_HOST_MISMATCH')
      const query = z.object({ start: z.string().datetime(), end: z.string().datetime() }).parse(req.query)
      if (Date.parse(query.end) <= Date.parse(query.start) || Date.parse(query.end) - Date.parse(query.start) > 32 * 86400_000) {
        throw badRequest('Selecione até 31 dias de agenda.', 'INVALID_STAFF_RANGE')
      }
      const person = db.prepare(`SELECT p.id, p.name FROM professionals p JOIN users u ON u.id = p.user_id
        WHERE p.tenant_id = ? AND p.user_id = ? AND p.active = 1 AND u.staff_access_disabled_at IS NULL`)
        .get(tenantId, userId) as { id: string; name: string } | undefined
      if (!person) throw notFound('Acesso da profissional indisponível.', 'STAFF_ACCESS_REVOKED')
      const appointments = db.prepare(`SELECT a.id, a.starts_at as startsAt, a.ends_at as endsAt, a.status,
        s.name as serviceName, c.name as clientName
        FROM appointments a JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
        LEFT JOIN clients c ON c.tenant_id = a.tenant_id AND c.user_id = a.client_user_id
        WHERE a.tenant_id = ? AND a.professional_id = ? AND a.starts_at >= ? AND a.starts_at < ?
        ORDER BY a.starts_at LIMIT 300`).all(tenantId, person.id, query.start, query.end)
      res.json({ professional: person, appointments })
    } catch (error) { next(error) }
  })
  return router
}
