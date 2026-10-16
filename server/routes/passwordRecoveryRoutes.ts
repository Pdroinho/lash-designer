import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import express, { type Request } from 'express'
import { z } from 'zod'
import type { AuthRouterOptions } from './authRoutes.js'
import { badRequest, unauthorized, HttpError } from '../http.js'
import { secretHmac } from '../secretCrypto.js'
import { hashPassword } from '../security.js'
import { createSession, revokeSessionsForUser } from '../session.js'
import { logSecurityEvent, revokeAllTrustedDevices } from '../mfa.js'

type RecoveryOptions = Pick<AuthRouterOptions, 'db' | 'nodeEnv' | 'isDevHost' | 'authLoginLimiter' | 'authLoginUserLimiter' | 'authPasswordLimiter' | 'authSessionRuntime' | 'sendPlatformWhatsappText' | 'platformWhatsappConfigured' | 'normalizeUserE164Phone'>
type RecoveryUser = { id: string; tenant_id: string | null; email: string; phone: string | null; password_hash: string; role: string }
type Challenge = { id: string; user_id: string; tenant_id: string | null; token_hash: string; code_hash: string; phone_snapshot: string; password_snapshot: string; attempts: number; expires_at: string; consumed_at: string | null }
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const codeHash = (id: string, code: string) => secretHmac(`${id}:${code}`, 'password-recovery-code')
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function createPasswordRecoveryRouter(options: RecoveryOptions) {
  const { db, authSessionRuntime: sessions } = options
  const router = express.Router()
  const secure = options.nodeEnv === 'production'
  const cookieName = secure ? '__Host-password-reset' : 'password-reset'
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' }
  const scope = (req: Request) => options.isDevHost(req.hostname) ? null : req.resolvedTenant?.id
  function eligible(req: Request, user: RecoveryUser | undefined): user is RecoveryUser {
    if (!user?.phone || scope(req) === undefined || user.tenant_id !== scope(req)) return false
    if (options.isDevHost(req.hostname)) return user.role === 'DEV' && user.tenant_id === null
    if (user.role !== 'ADMIN' && user.role !== 'STAFF') return false
    if (req.resolvedTenant?.billingRecovery && user.role !== 'ADMIN') return false
    return user.role !== 'STAFF' || Boolean(db.prepare(`SELECT 1 FROM professionals p JOIN users u ON u.id=p.user_id
      WHERE p.tenant_id=? AND p.user_id=? AND p.active=1 AND p.removed_at IS NULL AND u.staff_access_disabled_at IS NULL`).get(user.tenant_id, user.id))
  }
  function failure(challengeId: string, user: RecoveryUser) {
    try {
      db.prepare('UPDATE password_reset_challenges SET consumed_at=? WHERE id=? AND consumed_at IS NULL').run(new Date().toISOString(), challengeId)
      logSecurityEvent(db, { userId: user.id, tenantId: user.tenant_id, eventType: 'PASSWORD_RECOVERY_DELIVERY_FAILED' })
    } catch { /* A process shutdown must not cause an unhandled delivery rejection. */ }
  }

  router.post('/password-reset/request', options.authLoginLimiter, (req, res, next) => {
    try {
      if (options.platformWhatsappConfigured && !options.platformWhatsappConfigured()) throw new HttpError(503, 'A recuperação por WhatsApp está temporariamente indisponível. Tente novamente em instantes ou fale com o suporte.', 'RECOVERY_UNAVAILABLE')
      const { email } = z.object({ email: z.string().trim().email().max(254) }).strict().parse(req.body)
      const tenantId = scope(req)
      const user = tenantId === undefined ? undefined : db.prepare('SELECT id,tenant_id,email,phone,password_hash,role FROM users WHERE lower(email)=? AND tenant_id IS ? LIMIT 1').get(email.toLowerCase(), tenantId) as RecoveryUser | undefined
      let token = randomBytes(32).toString('base64url')
      const code = String(randomInt(100000, 1000000)), id = randomUUID(), now = Date.now()
      let delivery: { user: RecoveryUser; phone: string } | undefined
      db.transaction(() => {
        db.prepare('DELETE FROM password_reset_challenges WHERE expires_at < ?').run(new Date(now - 24 * 3600_000).toISOString())
        if (!eligible(req, user)) return
        let phone: string
        try { phone = options.normalizeUserE164Phone(user.phone!) } catch { return }
        if (!phone) return
        const recent = db.prepare('SELECT COUNT(*) AS total,MAX(created_at) AS latest FROM password_reset_challenges WHERE user_id=? AND created_at > ?').get(user.id, new Date(now - 15 * 60_000).toISOString()) as { total: number; latest: string | null }
        if (recent.total >= 3 || (recent.latest && now - Date.parse(recent.latest) < 60_000)) {
          const existing = req.cookies?.[cookieName]
          if (typeof existing === 'string' && existing.length <= 128 && db.prepare('SELECT 1 FROM password_reset_challenges WHERE user_id=? AND token_hash=? AND consumed_at IS NULL AND expires_at>?').get(user.id, digest(existing), new Date(now).toISOString())) token = existing
          return
        }
        db.prepare('UPDATE password_reset_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL').run(new Date(now).toISOString(), user.id)
        db.prepare('INSERT INTO password_reset_challenges(id,user_id,tenant_id,token_hash,code_hash,phone_snapshot,password_snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, user.id, user.tenant_id, digest(token), codeHash(id, code), user.phone, digest(user.password_hash), new Date(now).toISOString(), new Date(now + 5 * 60_000).toISOString())
        delivery = { user, phone }
      }).immediate()
      res.cookie(cookieName, token, { ...cookieOptions, maxAge: 5 * 60_000 })
      res.status(202).json({ sent: true, retryAfterSeconds: 60, message: 'Se o e-mail estiver cadastrado com um WhatsApp, você receberá um código nesse número.' })
      // Do not let provider latency or account existence alter the public response.
      if (delivery) {
        const target = delivery
        void Promise.resolve().then(() => options.sendPlatformWhatsappText(target.phone, `Lash Designer: seu código para criar uma nova senha é ${code}. Válido por 5 minutos. Não compartilhe. Se não foi você, ignore esta mensagem.`))
          .then(delivered => { if (!delivered) failure(id, target.user) })
          .catch(() => failure(id, target.user))
      }
    } catch (error) { next(error) }
  })

  router.post('/password-reset/confirm', options.authLoginLimiter, options.authPasswordLimiter, async (req, res, next) => {
    try {
      const body = z.object({ code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(128), keepSigned: z.boolean().optional().default(false) }).strict().parse(req.body)
      const token = req.cookies?.[cookieName]
      const invalid = () => unauthorized('Código inválido ou expirado. Peça um novo código e tente novamente.', 'INVALID_RECOVERY_CODE')
      if (typeof token !== 'string' || token.length < 32 || token.length > 128) throw invalid()
      const resolve = () => {
        const challenge = db.prepare('SELECT * FROM password_reset_challenges WHERE token_hash=?').get(digest(token)) as Challenge | undefined
        if (!challenge || challenge.consumed_at || challenge.attempts >= 5 || Date.parse(challenge.expires_at) <= Date.now() || scope(req) === undefined || challenge.tenant_id !== scope(req)) return null
        const user = db.prepare('SELECT id,tenant_id,email,phone,password_hash,role FROM users WHERE id=?').get(challenge.user_id) as RecoveryUser | undefined
        if (!eligible(req, user) || user.phone !== challenge.phone_snapshot || digest(user.password_hash) !== challenge.password_snapshot) return null
        return { challenge, user }
      }
      const verified = db.transaction(() => {
        const current = resolve()
        if (!current) return null
        const matches = equal(current.challenge.code_hash, codeHash(current.challenge.id, body.code))
        if (!matches) { db.prepare('UPDATE password_reset_challenges SET attempts=attempts+1 WHERE id=?').run(current.challenge.id); return null }
        return current
      }).immediate()
      if (!verified) throw invalid()
      const passwordHash = await hashPassword(body.password)
      const result = db.transaction(() => {
        // Recheck after bcrypt, so concurrent resets, password/phone changes and expiry cannot race.
        const current = resolve()
        if (!current || current.challenge.id !== verified.challenge.id || !equal(current.challenge.code_hash, codeHash(current.challenge.id, body.code))) throw invalid()
        db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, current.user.id)
        db.prepare('UPDATE password_reset_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL').run(new Date().toISOString(), current.user.id)
        db.prepare('UPDATE auth_challenges SET consumed_at=? WHERE user_id=? AND consumed_at IS NULL').run(new Date().toISOString(), current.user.id)
        revokeSessionsForUser(db, current.user.id)
        revokeAllTrustedDevices(db, current.user.id)
        const session = createSession(db, { userId: current.user.id, persistent: body.keepSigned, ...sessions.requestSecurityMetadata(req) })
        logSecurityEvent(db, { userId: current.user.id, tenantId: current.user.tenant_id, eventType: 'PASSWORD_RECOVERED', ...sessions.requestSecurityMetadata(req) })
        const tenantSlug = current.user.tenant_id ? (db.prepare('SELECT slug FROM tenants WHERE id=?').get(current.user.tenant_id) as { slug: string }).slug : null
        return { session, user: { id: current.user.id, email: current.user.email, role: current.user.role, tenantId: current.user.tenant_id, tenantSlug }, phone: current.user.phone! }
      }).immediate()
      sessions.setSessionCookie(res, result.session.token, body.keepSigned)
      sessions.clearPreauthCookie(res); sessions.clearTrustedDeviceCookie(res)
      res.clearCookie(cookieName, cookieOptions)
      res.json({ user: result.user })
      void Promise.resolve().then(() => options.sendPlatformWhatsappText(result.phone, 'Lash Designer: a senha da sua conta foi alterada. Se não foi você, entre em contato com o suporte imediatamente.')).catch(() => undefined)
    } catch (error) { next(error instanceof z.ZodError ? badRequest('Informe o código de 6 dígitos e uma senha de 8 a 128 caracteres.', 'INVALID_RECOVERY_INPUT') : error) }
  })
  return router
}
