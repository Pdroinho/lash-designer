import express, { type Request, type RequestHandler } from 'express'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth.js'
import type { createAuthSessionRuntime } from '../authSessionRuntime.js'
import { badRequest, notFound, unauthorized } from '../http.js'
import {
  createTrustedDevice,
  createWhatsappOtpChallenge,
  listSecurityState,
  logSecurityEvent,
  refreshWhatsappOtpChallenge,
  resolveAuthChallenge,
  resolveTrustedDevice,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
  verifyAndConsumeWhatsappOtpChallenge,
} from '../mfa.js'
import { PLATFORM_MARKETING_WHATSAPP_TEXT, PRIVACY_VERSION, TERMS_VERSION, currentLegalBundleHash, legalPublicConfig } from '../legal.js'
import { hashPassword, verifyPassword } from '../security.js'
import { revokeSession, revokeSessionsForUser } from '../session.js'

type AuthRouterOptions = {
  db: Database.Database
  nodeEnv: string
  isDevHost: (hostname: string) => boolean
  authLoginLimiter: RequestHandler
  authLoginUserLimiter: RequestHandler
  authWhatsappOtpSendLimiter: RequestHandler
  authPasswordLimiter: RequestHandler
  authSessionRuntime: ReturnType<typeof createAuthSessionRuntime>
  sendPlatformWhatsappText: (phone: string, text: string) => Promise<boolean>
  normalizeUserE164Phone: (raw: string) => string
  maskE164Phone: (raw: string) => string
  recordLegalAcceptance: (input: { userId: string; tenantId: string | null; source: string; req: Request }) => void
  recordPlatformMarketingChoice: (input: { userId: string; tenantId: string | null; granted: boolean; source: string }) => { whatsappPromotions: boolean; changed: boolean }
}

export function createAuthRouter(options: AuthRouterOptions) {
  const {
    db,
    nodeEnv,
    isDevHost,
    authLoginLimiter,
    authLoginUserLimiter,
    authWhatsappOtpSendLimiter,
    authPasswordLimiter,
    authSessionRuntime,
    sendPlatformWhatsappText,
    normalizeUserE164Phone,
    maskE164Phone,
    recordLegalAcceptance,
    recordPlatformMarketingChoice,
  } = options
  const {
    clearPreauthCookie,
    clearTrustedDeviceCookie,
    createAndSetSession,
    preauthCookieName,
    requestSecurityMetadata,
    sessionCookieName,
    setPreauthCookie,
    setTrustedDeviceCookie,
    trustedDeviceCookieName,
  } = authSessionRuntime
  const router = express.Router()

  router.get('/me', (req, res, next) => {
    try {
      const allowDevBootstrap =
        isDevHost(req.hostname) &&
        (db.prepare(`SELECT COUNT(1) as n FROM users WHERE role = 'DEV'`).get() as { n: number }).n === 0

      if (!req.sessionUser) {
        res.json({ user: null, allowDevBootstrap, bootstrapRequiresSecret: nodeEnv === 'production' })
        return
      }

      const u = db
        .prepare(
          `
            SELECT u.id, u.email, u.role, u.tenant_id as tenantId,
                   t.slug as tenantSlug,
                   (
                     SELECT status
                     FROM subscriptions
                     WHERE tenant_id = u.tenant_id
                     ORDER BY updated_at DESC LIMIT 1
                   ) as subscriptionStatus,
                   (
                     SELECT current_period_end
                     FROM subscriptions
                     WHERE tenant_id = u.tenant_id
                     ORDER BY updated_at DESC LIMIT 1
                   ) as subscriptionPeriodEnd
            FROM users u
            LEFT JOIN tenants t ON t.id = u.tenant_id
            WHERE u.id = ?
          `,
        )
        .get(req.sessionUser.id)

      const testMode = nodeEnv !== 'production' && (db.prepare(`SELECT value FROM platform_settings WHERE key = 'test_mode'`).get() as { value: string } | undefined)?.value === 'true'
      const user = u as
        | (Record<string, unknown> & { subscriptionStatus?: string | null; subscriptionPeriodEnd?: string | null })
        | undefined
      if (
        user?.subscriptionStatus === 'ACTIVE' &&
        user.subscriptionPeriodEnd &&
        Date.parse(user.subscriptionPeriodEnd) <= Date.now()
      ) {
        user.subscriptionStatus = 'EXPIRED'
      }

      if (user && req.sessionUser.billingRecovery) {
        user.billingRecovery = true
        user.subscriptionStatus = 'PAYMENT_REQUIRED'
      }
      res.json({ user: user ?? null, allowDevBootstrap, bootstrapRequiresSecret: nodeEnv === 'production', isTestMode: testMode })
    } catch (err) {
      next(err)
    }
  })

  router.post('/login', authLoginLimiter, authLoginUserLimiter, async (req, res, next) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          password: z.string().min(8),
          keepSigned: z.boolean().optional().default(false),
        })
        .parse(req.body)

      const email = body.email.toLowerCase()
      const isDev = isDevHost(req.hostname)
      const tenantId = req.resolvedTenant?.id ?? null

      const row = (():
        | {
            id: string
            tenantId: string | null
            email: string
            passwordHash: string
            phone: string | null
            role: 'DEV' | 'ADMIN' | 'CLIENT' | 'STAFF'
          }
        | undefined => {
        if (isDev) {
          return db
            .prepare(
              `
                SELECT id, tenant_id as tenantId, email, password_hash as passwordHash, phone, role
                FROM users
                WHERE email = ?
                  AND tenant_id IS NULL
                LIMIT 1
              `,
            )
            .get(email) as
            | {
                id: string
                tenantId: string | null
                email: string
                passwordHash: string
                phone: string | null
                role: 'DEV' | 'ADMIN' | 'CLIENT' | 'STAFF'
              }
            | undefined
        }

        if (!tenantId) throw unauthorized('Use o subdomínio do seu espaço para entrar.', 'TENANT_REQUIRED')

        return db
          .prepare(
            `
              SELECT id, tenant_id as tenantId, email, password_hash as passwordHash, phone, role
              FROM users
              WHERE email = ?
                AND tenant_id = ?
              LIMIT 1
            `,
          )
          .get(email, tenantId) as
          | {
              id: string
              tenantId: string | null
              email: string
              passwordHash: string
              phone: string | null
              role: 'DEV' | 'ADMIN' | 'CLIENT' | 'STAFF'
            }
          | undefined
      })()

      if (!row) throw unauthorized('E-mail ou senha inválidos', 'INVALID_CREDENTIALS')
      const ok = await verifyPassword(body.password, row.passwordHash)
      if (!ok) {
        logSecurityEvent(db, { eventType: 'LOGIN_FAILED', userId: row.id, tenantId: row.tenantId, ...requestSecurityMetadata(req) })
        throw unauthorized('E-mail ou senha inválidos', 'INVALID_CREDENTIALS')
      }

      if (row.role === 'CLIENT') {
        throw unauthorized('Clientes entram pelo código enviado ao WhatsApp.', 'CLIENT_OTP_REQUIRED')
      }
      if (req.resolvedTenant?.billingRecovery && row.role !== 'ADMIN') {
        throw unauthorized('O estúdio aguarda regularização do pagamento.', 'SUBSCRIPTION_REQUIRED')
      }
      if (row.role === 'STAFF' && !db.prepare(`SELECT 1 FROM professionals p JOIN users u ON u.id = p.user_id
        WHERE p.tenant_id = ? AND p.user_id = ? AND p.active = 1 AND u.staff_access_disabled_at IS NULL LIMIT 1`)
        .get(row.tenantId, row.id)) throw unauthorized('Acesso da equipe indisponível. Fale com a administração.', 'STAFF_ACCESS_DISABLED')
      if (row.role === 'DEV' && !isDevHost(req.hostname)) {
        throw unauthorized('Acesso DEV somente no subdomínio dev.', 'DEV_SUBDOMAIN_ONLY')
      }
      if (row.role !== 'DEV' && tenantId && row.tenantId && tenantId !== row.tenantId) {
        throw unauthorized('Use o subdomínio da sua loja para entrar.', 'TENANT_HOST_MISMATCH')
      }

      const trustedToken = req.cookies?.[trustedDeviceCookieName]
      const trustedDevice = typeof trustedToken === 'string' ? resolveTrustedDevice(db, row.id, trustedToken) : null
      if (trustedToken && !trustedDevice) clearTrustedDeviceCookie(res)

      const tenantSlug =
        row.tenantId && row.role !== 'DEV'
          ? ((db.prepare('SELECT slug FROM tenants WHERE id = ?').get(row.tenantId) as { slug: string } | undefined)?.slug ?? null)
          : null

      if (trustedDevice) {
        createAndSetSession(req, res, row.id, body.keepSigned, trustedDevice.id)
        logSecurityEvent(db, {
          eventType: 'LOGIN_SUCCESS_TRUSTED_DEVICE',
          userId: row.id,
          tenantId: row.tenantId,
          ...requestSecurityMetadata(req),
          details: { trustedDeviceId: trustedDevice.id },
        })
        res.json({ user: { id: row.id, email: row.email, role: row.role, tenantId: row.tenantId, tenantSlug } })
        return
      }

      const challenge = createWhatsappOtpChallenge(db, {
        userId: row.id,
        keepSigned: body.keepSigned,
        phone: row.phone ?? '',
      })
      setPreauthCookie(res, challenge.token)

      if (!row.phone) {
        logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_PHONE_REQUIRED', userId: row.id, tenantId: row.tenantId, ...requestSecurityMetadata(req) })
        res.status(202).json({ whatsappOtpRequired: true, phoneEnrollmentRequired: true })
        return
      }

      const delivered = await sendPlatformWhatsappText(
        row.phone,
        `Seu código de verificação Lash Designer: ${challenge.code}. Ele expira em 5 minutos. Não compartilhe este código.`,
      )
      if (!delivered) {
        logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_DELIVERY_FAILED', userId: row.id, tenantId: row.tenantId, ...requestSecurityMetadata(req) })
        throw badRequest('Não foi possível enviar o código pelo WhatsApp. Verifique a Evolution API Global.', 'WHATSAPP_MFA_DELIVERY_FAILED')
      }

      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_OTP_SENT', userId: row.id, tenantId: row.tenantId, ...requestSecurityMetadata(req) })
      res.status(202).json({ whatsappOtpRequired: true, phoneMasked: maskE164Phone(row.phone) })
    } catch (err) {
      next(err)
    }
  })

  router.post('/whatsapp-otp/send', authLoginLimiter, authWhatsappOtpSendLimiter, async (req, res, next) => {
    try {
      const token = req.cookies?.[preauthCookieName]
      if (typeof token !== 'string') throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_REQUIRED')
      const challenge = resolveAuthChallenge(db, token)
      if (!challenge) throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_INVALID')

      const body = z.object({ phone: z.string().min(8).max(40).optional() }).parse(req.body ?? {})
      const user = db.prepare(`SELECT phone FROM users WHERE id = ? LIMIT 1`).get(challenge.userId) as { phone: string | null } | undefined
      if (!user) throw unauthorized()

      let phone = user.phone
      if (!phone) {
        if (!body.phone) throw badRequest('Informe seu WhatsApp para ativar a verificação em duas etapas.', 'MFA_PHONE_REQUIRED')
        phone = normalizeUserE164Phone(body.phone)
      } else if (body.phone && normalizeUserE164Phone(body.phone) !== phone) {
        throw badRequest('O WhatsApp desta conta deve ser alterado na área Segurança após o login.', 'MFA_PHONE_MISMATCH')
      }

      const refreshed = refreshWhatsappOtpChallenge(db, challenge.id, challenge.userId, phone)
      if (!refreshed) throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_INVALID')
      const delivered = await sendPlatformWhatsappText(
        phone,
        `Seu código de verificação Lash Designer: ${refreshed.code}. Ele expira em 5 minutos. Não compartilhe este código.`,
      )
      if (!delivered) {
        logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_DELIVERY_FAILED', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req) })
        throw badRequest('Não foi possível enviar o código pelo WhatsApp. Verifique a Evolution API Global.', 'WHATSAPP_MFA_DELIVERY_FAILED')
      }

      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_OTP_SENT', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req), details: { resend: true } })
      res.json({ sent: true, phoneMasked: maskE164Phone(phone) })
    } catch (err) {
      next(err)
    }
  })

  router.post('/whatsapp-otp/verify', authLoginLimiter, (req, res, next) => {
    try {
      const token = req.cookies?.[preauthCookieName]
      if (typeof token !== 'string') throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_REQUIRED')
      const challenge = resolveAuthChallenge(db, token)
      if (!challenge || !challenge.phone) throw unauthorized('Desafio de autenticação expirado.', 'AUTH_CHALLENGE_INVALID')
      const body = z.object({ code: z.string().regex(/^\d{6}$/), trustDevice: z.boolean().optional().default(false) }).parse(req.body)

      const currentUser = db.prepare(`SELECT phone FROM users WHERE id = ? LIMIT 1`).get(challenge.userId) as { phone: string | null } | undefined
      if (!currentUser) throw unauthorized()
      if (currentUser.phone && currentUser.phone !== challenge.phone) {
        throw unauthorized('O WhatsApp da conta foi alterado. Entre novamente.', 'MFA_PHONE_CHANGED')
      }

      if (!verifyAndConsumeWhatsappOtpChallenge(db, challenge.id, challenge.userId, body.code)) {
        logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_FAILED', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req) })
        throw unauthorized('Código inválido ou expirado.', 'INVALID_MFA_CODE')
      }

      if (!currentUser.phone) {
        db.prepare(`UPDATE users SET phone = ? WHERE id = ? AND phone IS NULL`).run(challenge.phone, challenge.userId)
        logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_PHONE_ENROLLED', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req) })
      }

      let trustedDeviceId: string | null = null
      if (body.trustDevice) {
        const device = createTrustedDevice(db, challenge.userId, req.get('user-agent'))
        trustedDeviceId = device.id
        setTrustedDeviceCookie(res, device.token)
        logSecurityEvent(db, { eventType: 'TRUSTED_DEVICE_CREATED', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req), details: { trustedDeviceId: device.id } })
      }

      createAndSetSession(req, res, challenge.userId, challenge.keepSigned, trustedDeviceId)
      clearPreauthCookie(res)
      logSecurityEvent(db, { eventType: 'LOGIN_SUCCESS_WHATSAPP_MFA', userId: challenge.userId, tenantId: challenge.tenantId, ...requestSecurityMetadata(req) })

      const tenantSlug = challenge.tenantId
        ? ((db.prepare('SELECT slug FROM tenants WHERE id = ?').get(challenge.tenantId) as { slug: string } | undefined)?.slug ?? null)
        : null
      res.json({ user: { id: challenge.userId, email: challenge.email, role: challenge.role, tenantId: challenge.tenantId, tenantSlug } })
    } catch (err) {
      next(err)
    }
  })


  router.get('/legal-preferences', requireRole('ADMIN', 'DEV'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const row = db.prepare(`
        SELECT platform_marketing_whatsapp_opt_in as whatsappPromotions
        FROM users WHERE id = ? LIMIT 1
      `).get(sessionUser.id) as { whatsappPromotions: number } | undefined
      const acceptance = db.prepare(`
        SELECT terms_version as termsVersion, privacy_version as privacyVersion, bundle_hash as bundleHash, accepted_at as acceptedAt
        FROM user_legal_acceptances
        WHERE user_id = ?
        ORDER BY accepted_at DESC LIMIT 1
      `).get(sessionUser.id) as { termsVersion: string; privacyVersion: string; bundleHash: string; acceptedAt: string } | undefined
      res.json({
        whatsappPromotions: Boolean(row?.whatsappPromotions),
        marketingConsentText: PLATFORM_MARKETING_WHATSAPP_TEXT,
        currentDocuments: { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, bundleHash: currentLegalBundleHash() },
        latestAcceptance: acceptance ?? null,
      })
    } catch (err) { next(err) }
  })

  router.get('/legal-acceptance/:bundleHash', requireRole('ADMIN', 'DEV'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const bundleHash = z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.bundleHash)
      const row = db.prepare(`
        SELECT bundle_hash as bundleHash, terms_version as termsVersion, privacy_version as privacyVersion,
               source, snapshot_json as snapshotJson, accepted_at as acceptedAt
        FROM user_legal_acceptances
        WHERE user_id = ? AND bundle_hash = ?
        ORDER BY accepted_at DESC LIMIT 1
      `).get(sessionUser.id, bundleHash) as { bundleHash: string; termsVersion: string; privacyVersion: string; source: string; snapshotJson: string; acceptedAt: string } | undefined
      if (!row) return next(notFound('Versão legal aceita não encontrada para esta conta.', 'LEGAL_ACCEPTANCE_NOT_FOUND'))
      let legal: ReturnType<typeof legalPublicConfig>
      try { legal = JSON.parse(row.snapshotJson) as ReturnType<typeof legalPublicConfig> }
      catch { throw new Error('LEGAL_SNAPSHOT_INVALID') }
      res.json({
        legal,
        acceptance: { bundleHash: row.bundleHash, termsVersion: row.termsVersion, privacyVersion: row.privacyVersion, source: row.source, acceptedAt: row.acceptedAt },
      })
    } catch (err) { next(err) }
  })

  router.post('/legal-acceptance', requireRole('ADMIN', 'DEV'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const body = z.object({
        accepted: z.literal(true),
        termsVersion: z.string().max(80),
        privacyVersion: z.string().max(80),
        bundleHash: z.string().regex(/^[a-f0-9]{64}$/),
      }).strict().parse(req.body)
      if (body.termsVersion !== TERMS_VERSION || body.privacyVersion !== PRIVACY_VERSION || body.bundleHash !== currentLegalBundleHash()) {
        return next(badRequest('Os documentos legais foram atualizados. Recarregue a página e revise a versão vigente.', 'LEGAL_VERSION_STALE'))
      }
      recordLegalAcceptance({ userId: sessionUser.id, tenantId: sessionUser.tenantId, source: 'ACCOUNT_REACCEPTANCE', req })
      res.json({ ok: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, bundleHash: currentLegalBundleHash(), acceptedAt: new Date().toISOString() })
    } catch (err) { next(err) }
  })

  router.put('/legal-preferences', requireRole('ADMIN', 'DEV'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const body = z.object({ whatsappPromotions: z.boolean() }).strict().parse(req.body)
      const result = db.transaction(() => recordPlatformMarketingChoice({ userId: sessionUser.id, tenantId: sessionUser.tenantId, granted: body.whatsappPromotions, source: 'ACCOUNT_SETTINGS' }))()
      res.json({ ...result, ok: true })
    } catch (err) { next(err) }
  })

  router.put('/security/phone', requireRole('ADMIN', 'DEV'), authPasswordLimiter, async (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const body = z.object({ currentPassword: z.string().min(8).max(128), phone: z.string().min(8).max(40) }).parse(req.body)
      const row = db.prepare(`SELECT password_hash as passwordHash FROM users WHERE id = ? LIMIT 1`).get(sessionUser.id) as { passwordHash: string } | undefined
      if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
        logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_PHONE_CHANGE_FAILED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
        throw unauthorized('Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD')
      }
      const phone = normalizeUserE164Phone(body.phone)
      db.prepare(`UPDATE users SET phone = ? WHERE id = ?`).run(phone, sessionUser.id)
      logSecurityEvent(db, { eventType: 'WHATSAPP_MFA_PHONE_CHANGED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
      res.json({ ok: true, phone })
    } catch (err) {
      next(err)
    }
  })

  router.get('/security', requireRole('ADMIN', 'DEV'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const state = listSecurityState(db, sessionUser.id)
      res.json({
        ...state,
        devices: (state.devices as Array<Record<string, unknown> & { id: string }>).map((device) => ({ ...device, current: device.id === sessionUser.trustedDeviceId })),
        sessions: (state.sessions as Array<Record<string, unknown> & { id: string }>).map((session) => ({ ...session, current: session.id === sessionUser.sessionId })),
      })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/security/devices/:deviceId', requireRole('ADMIN', 'DEV'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const deviceId = z.string().uuid().parse(req.params.deviceId)
      const currentSessionRevoked = sessionUser.trustedDeviceId === deviceId
      revokeTrustedDevice(db, sessionUser.id, deviceId)
      if (currentSessionRevoked) {
        clearTrustedDeviceCookie(res)
        res.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax', secure: nodeEnv === 'production' })
      }
      logSecurityEvent(db, { eventType: 'TRUSTED_DEVICE_REVOKED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req), details: { trustedDeviceId: deviceId } })
      res.json({ ok: true, currentSessionRevoked })
    } catch (err) {
      next(err)
    }
  })

  router.post('/security/devices/revoke-all', requireRole('ADMIN', 'DEV'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      revokeAllTrustedDevices(db, sessionUser.id)
      clearTrustedDeviceCookie(res)
      logSecurityEvent(db, { eventType: 'TRUSTED_DEVICES_REVOKED_ALL', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/security/sessions/:sessionId', requireRole('ADMIN', 'DEV'), (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())
      const sessionId = z.string().uuid().parse(req.params.sessionId)
      const now = new Date().toISOString()
      const result = db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).run(now, sessionId, sessionUser.id)
      if (result.changes !== 1) return next(notFound('Sessão não encontrada', 'SESSION_NOT_FOUND'))
      const currentSessionRevoked = sessionUser.sessionId === sessionId
      if (currentSessionRevoked) {
        res.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax', secure: nodeEnv === 'production' })
      }
      logSecurityEvent(db, { eventType: 'SESSION_REVOKED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req), details: { sessionId, currentSessionRevoked } })
      res.json({ ok: true, currentSessionRevoked })
    } catch (err) {
      next(err)
    }
  })

  router.post('/logout', (req, res) => {
    if (req.sessionUser) {
      revokeSession(db, req.sessionUser.sessionId)
      logSecurityEvent(db, { eventType: 'LOGOUT', userId: req.sessionUser.id, tenantId: req.sessionUser.tenantId, ...requestSecurityMetadata(req) })
    }
    res.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax', secure: nodeEnv === 'production' })
    res.json({ ok: true })
  })

  router.post('/logout-all', requireAuth, (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())

      revokeSessionsForUser(db, sessionUser.id)
      logSecurityEvent(db, { eventType: 'LOGOUT_ALL', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
      res.clearCookie(sessionCookieName, { path: '/', sameSite: 'lax', secure: nodeEnv === 'production' })
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.post('/change-password', requireAuth, authPasswordLimiter, async (req, res, next) => {
    try {
      const sessionUser = req.sessionUser
      if (!sessionUser) return next(unauthorized())

      const body = z
        .object({
          currentPassword: z.string().min(8).max(128),
          newPassword: z.string().min(8).max(128),
        })
        .parse(req.body)

      if (body.currentPassword === body.newPassword) {
        throw badRequest('A nova senha deve ser diferente da senha atual.', 'PASSWORD_UNCHANGED')
      }

      const row = db
        .prepare('SELECT password_hash as passwordHash FROM users WHERE id = ? LIMIT 1')
        .get(sessionUser.id) as { passwordHash: string } | undefined
      if (!row) throw unauthorized()

      const valid = await verifyPassword(body.currentPassword, row.passwordHash)
      if (!valid) throw unauthorized('Senha atual incorreta.', 'INVALID_CURRENT_PASSWORD')

      const passwordHash = await hashPassword(body.newPassword)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, sessionUser.id)
      revokeSessionsForUser(db, sessionUser.id)
      createAndSetSession(req, res, sessionUser.id, sessionUser.persistent, sessionUser.trustedDeviceId)
      logSecurityEvent(db, { eventType: 'PASSWORD_CHANGED', userId: sessionUser.id, tenantId: sessionUser.tenantId, ...requestSecurityMetadata(req) })
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
