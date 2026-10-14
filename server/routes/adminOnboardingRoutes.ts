import { brandColumns, logoLayoutSchema, logoSizeSchema, saveBrandPresentation, logoSuggestionSchema } from '../brandPresentation.js'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { badRequest } from '../http.js'

type BrandSuggestionInput = {
  businessName: string
  preferences: string
  logoDataUrl?: string | null
}

type BrandPalette = {
  name: string
  primary: string
  secondary: string
  background: string
  rationale: string
}

type BrandSuggestionResult = {
  palettes: BrandPalette[]
  logoPresentation?: {layout: 'SYMBOL_NAME' | 'FULL'; size: 'S' | 'M' | 'L'; rationale: string}
  inputTokens: number
  outputTokens: number
  costUsd: number
  model: string
}

type AdminOnboardingRouterOptions = {
  db: Database.Database
  onboardingAssistantLimiter: RequestHandler
  assistantEnabled: boolean
  assistantProvider: { apiKey: string | undefined; visionModel: string; setupModel?: string }
  generateBrandSetupSuggestions: (input: BrandSuggestionInput) => Promise<BrandSuggestionResult>
  now?: () => Date
}

const curatedBrandPalettes = (preferences: string): BrandPalette[] => {
  const warm = /quente|terracota|dourad|marrom|bege/i.test(preferences)
  const bold = /forte|marcante|colorid|vibrante/i.test(preferences)
  return warm ? [
    { name: 'Terracota editorial', primary: '#9A493C', secondary: '#3A2825', background: '#FBF5F0', rationale: 'Acolhedora, sofisticada e com presença sem pesar.' },
    { name: 'Cacau rosé', primary: '#8C4055', secondary: '#36272D', background: '#FAF4F5', rationale: 'Une beleza e confiança com contraste confortável.' },
    { name: 'Oliva dourado', primary: '#6C6844', secondary: '#302F26', background: '#F8F5EA', rationale: 'Natural, madura e diferente do rosa convencional.' },
  ] : bold ? [
    { name: 'Vinho assinatura', primary: '#8B1747', secondary: '#2D2028', background: '#FFF8FA', rationale: 'Marcante, feminina e muito legível na interface.' },
    { name: 'Ameixa moderna', primary: '#70405F', secondary: '#29222A', background: '#F9F5F8', rationale: 'Autoral e contemporânea sem perder delicadeza.' },
    { name: 'Azul petróleo', primary: '#28636A', secondary: '#203235', background: '#F2F8F7', rationale: 'Profissional e memorável fora do óbvio.' },
  ] : [
    { name: 'Rosé essencial', primary: '#9B4266', secondary: '#33272D', background: '#FCF7F9', rationale: 'Delicada, profissional e fácil de aplicar.' },
    { name: 'Nude sofisticado', primary: '#82605B', secondary: '#312927', background: '#FAF7F3', rationale: 'Minimalista e acolhedora para uma marca premium.' },
    { name: 'Grafite lavanda', primary: '#66566E', secondary: '#29252C', background: '#F8F6FA', rationale: 'Elegante, atual e com personalidade discreta.' },
  ]
}

export function createAdminOnboardingRouter({
  db,
  onboardingAssistantLimiter,
  assistantEnabled,
  assistantProvider,
  generateBrandSetupSuggestions,
  now = () => new Date(),
}: AdminOnboardingRouterOptions) {
  const router = Router()

  router.get('/onboarding', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const onboarding = db.prepare(`
        SELECT status, mode, current_step as currentStep, answers_json as answersJson,
               ai_attempts as aiAttempts, completed_at as completedAt
        FROM tenant_onboarding WHERE tenant_id = ?
      `).get(tenantId) as { status: string; mode: string | null; currentStep: number; answersJson: string; aiAttempts: number; completedAt: string | null } | undefined
      res.json({
        onboarding: onboarding
          ? { ...onboarding, answers: JSON.parse(onboarding.answersJson || '{}'), answersJson: undefined }
          : { status: 'COMPLETED', mode: null, currentStep: 4, answers: {}, aiAttempts: 0, completedAt: null },
        assistantEnabled: Boolean(assistantEnabled && assistantProvider.apiKey),
        visionModel: assistantProvider.setupModel || assistantProvider.visionModel,
      })
    } catch (err) {
      next(err)
    }
  })

  // Preserve the original order: AI throttling happens before authentication.
  router.post('/onboarding/brand-suggestions', onboardingAssistantLimiter, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      const userId = req.sessionUser?.id
      if (!tenantId || !userId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const body = z.object({
        businessName: z.string().trim().min(2).max(120),
        preferences: z.string().trim().max(280).default(''),
        logoDataUrl: z.string().max(450_000).refine((value) => /^data:image\/(?:png|jpeg|webp);base64,/i.test(value), 'Logo inválida').nullable().optional(),
      }).parse(req.body ?? {})
      const fallback = curatedBrandPalettes(body.preferences)
      if (!assistantEnabled || !assistantProvider.apiKey) return res.json({ palettes: fallback, source: 'CURATED' })

      const timestamp = now().toISOString()
      const reserved = db.prepare(`
        UPDATE tenant_onboarding SET ai_attempts = ai_attempts + 1, updated_at = ?
        WHERE tenant_id = ? AND status = 'PENDING' AND ai_attempts < 3
      `).run(timestamp, tenantId)
      if (reserved.changes !== 1) return res.json({ palettes: fallback, source: 'CURATED', limitReached: true })
      try {
        const answer = await generateBrandSetupSuggestions(body)
        db.prepare(`
          INSERT INTO assistant_usage
            (id, tenant_id, user_id, request_day, input_chars, input_tokens, output_tokens,
             cost_usd, vision_inputs, status, model, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
        `).run(
          randomUUID(), tenantId, userId, timestamp.slice(0, 10), body.preferences.length,
          answer.inputTokens, answer.outputTokens, answer.costUsd, body.logoDataUrl ? 1 : 0,
          answer.model, timestamp,
        )
        const logo = logoSuggestionSchema.safeParse(answer.logoPresentation)
        return res.json({ palettes: answer.palettes, logoPresentation: logo.success ? logo.data : undefined, source: 'VISION' })
      } catch (error) {
        console.warn('[Onboarding visual]', error instanceof Error ? error.message : error)
        return res.json({ palettes: fallback, source: 'CURATED', fallback: true })
      }
    } catch (err) {
      next(err)
    }
  })

  router.post('/onboarding/complete', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const imageUrl = z.string().max(450_000).refine(
        (value) => /^data:image\/(?:png|jpeg|webp);base64,/i.test(value) || /^https:\/\//i.test(value),
        'Logo inválida',
      )
      const body = z.object({
        mode: z.enum(['ASSISTED', 'MANUAL']),
        businessName: z.string().trim().min(2).max(120),
        primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
        secondaryColor: z.string().regex(/^#[0-9a-f]{6}$/i),
        backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
        logoLayout: logoLayoutSchema.optional(),
        logoSize: logoSizeSchema.optional(),
        logoUrl: imageUrl.nullable().optional(),
        workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        startMinute: z.number().int().min(0).max(1380),
        endMinute: z.number().int().min(60).max(1440),
        services: z.array(z.object({
          name: z.string().trim().min(2).max(100),
          durationMinutes: z.number().int().min(15).max(480),
          priceCents: z.number().int().min(0).max(10_000_000),
        })).min(1).max(8),
        answers: z.record(z.string(), z.union([z.string().max(280), z.number(), z.boolean()])).default({}),
      }).refine((value) => value.endMinute > value.startMinute, {
        message: 'Horário final deve ser posterior ao inicial',
        path: ['endMinute'],
      }).parse(req.body ?? {})
      const timestamp = now().toISOString()
      db.transaction(() => {
        saveBrandPresentation(db, tenantId, body.logoLayout, body.logoSize, body.backgroundColor, body.backgroundColor ? body.secondaryColor : undefined)
        db.prepare(`UPDATE tenants SET name = ?, primary_color = ?, logo_url = ? WHERE id = ?`)
          .run(body.businessName, body.primaryColor.toUpperCase(), body.logoUrl || null, tenantId)
        db.prepare(`UPDATE tenant_settings SET secondary_color = ?, updated_at = ? WHERE tenant_id = ?`)
          .run(body.secondaryColor.toUpperCase(), timestamp, tenantId)
        db.prepare(`DELETE FROM business_hours WHERE tenant_id = ?`).run(tenantId)
        const insertHour = db.prepare(`
          INSERT INTO business_hours (id, tenant_id, weekday, start_minute, end_minute, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        for (const weekday of [...new Set(body.workingDays)].sort()) {
          insertHour.run(randomUUID(), tenantId, weekday, body.startMinute, body.endMinute, timestamp)
        }
        const activeServices = Number((db.prepare(`
          SELECT COUNT(*) AS count FROM services WHERE tenant_id = ? AND active = 1
        `).get(tenantId) as { count: number }).count)
        if (activeServices === 0) {
          const insertService = db.prepare(`
            INSERT INTO services
              (id, tenant_id, name, duration_minutes, price_cents, cover_url, active, created_at)
            VALUES (?, ?, ?, ?, ?, NULL, 1, ?)
          `)
          for (const service of body.services) {
            insertService.run(randomUUID(), tenantId, service.name, service.durationMinutes, service.priceCents, timestamp)
          }
        }
        db.prepare(`
          UPDATE tenant_onboarding
          SET status = 'COMPLETED', mode = ?, current_step = 4, answers_json = ?, completed_at = ?, updated_at = ?
          WHERE tenant_id = ?
        `).run(body.mode, JSON.stringify(body.answers), timestamp, timestamp, tenantId)
      })()
      const tenant = db.prepare(`
        SELECT id, slug, name, primary_color as primaryColor, logo_url as logoUrl${brandColumns(db)}
        FROM tenants WHERE id = ?
      `).get(tenantId)
      res.json({ onboarding: { status: 'COMPLETED' }, tenant })
    } catch (err) {
      next(err)
    }
  })

  router.post('/onboarding/skip', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const timestamp = now().toISOString()
      db.prepare(`
        UPDATE tenant_onboarding
        SET status = 'SKIPPED', current_step = 4, completed_at = ?, updated_at = ?
        WHERE tenant_id = ? AND status = 'PENDING'
      `).run(timestamp, timestamp, tenantId)
      res.json({ onboarding: { status: 'SKIPPED' } })
    } catch (err) {
      next(err)
    }
  })

  return router
}
