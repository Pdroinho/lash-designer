import { prepareLogoImage } from '../logoImageProcessing.js'
import { logoSuggestionSchema } from '../brandPresentation.js'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import {
  ASSISTANT_DAILY_LIMIT,
  ASSISTANT_MAX_IMAGE_BYTES,
  ASSISTANT_MAX_INPUT_CHARS,
  ASSISTANT_MONTHLY_LIMIT,
  type LumaAgentResult,
  type LumaAttachment,
  type generateBrandSetupSuggestions,
} from '../assistant.js'
import { requireRole } from '../auth.js'
import { getZonedDateTimeParts, monthBoundsUtc } from '../dateTime.js'
import { env } from '../env.js'
import { badRequest, forbidden, HttpError } from '../http.js'
import {
  LUMA_CREDIT_PACKS,
  lumaExtraCreditBalance,
} from './adminLumaBillingRoutes.js'

type AssistantProvider = {
  apiKey?: string
  model: string
  name: string
}

type GenerateAssistantAnswer = (input: {
  message: string
  context: {
    tenantId: string
    userId: string
    timezone: string
    localDate: string
  }
  history?: Array<{ role: 'assistant' | 'user'; text: string }>
  attachment?: LumaAttachment
}) => Promise<LumaAgentResult>

type ConfirmLumaAction = (
  context: { tenantId: string; userId: string },
  actionId: string,
) =>
  | { ok: true; [key: string]: unknown }
  | { ok: false; message: string; code?: string }

type AdminLumaAssistantRouterOptions = {
  db: Database.Database
  lumaAssistantLimiter: RequestHandler
  creditCheckoutAvailable?: boolean
  assistantEnabled: boolean
  assistantProvider: AssistantProvider
  generateBrandSetupSuggestions?: typeof generateBrandSetupSuggestions
  generateAssistantAnswer: GenerateAssistantAnswer
  confirmLumaAction: ConfirmLumaAction
}

export function createAdminLumaAssistantRouter(
  options: AdminLumaAssistantRouterOptions,
) {
  const {
    db,
    lumaAssistantLimiter,
    assistantEnabled,
    assistantProvider,
    generateAssistantAnswer,
    confirmLumaAction,
  } = options
  const router = Router()
  const splitCreditUsage = (
    db.prepare('PRAGMA table_info(assistant_usage)').all() as Array<{
      name: string
    }>
  ).some((row) => row.name === 'credit_source')

  const lumaRequestDay = (tenantId: string, now = new Date()) => {
    const timezoneRow = db
      .prepare(`SELECT timezone FROM tenant_settings WHERE tenant_id = ?`)
      .get(tenantId) as { timezone?: string } | undefined
    const timezone = timezoneRow?.timezone || 'America/Sao_Paulo'
    const parts = getZonedDateTimeParts(now, timezone)
    if (!parts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
    return { timezone, day: parts.ymd }
  }

  const lumaUsageWindow = (tenantId: string) => {
    const now = new Date()
    const { day, timezone } = lumaRequestDay(tenantId, now)
    const nowParts = getZonedDateTimeParts(now, timezone)
    if (!nowParts) throw badRequest('Fuso horário inválido', 'INVALID_TIMEZONE')
    const monthStart = monthBoundsUtc({
      timeZone: timezone,
      year: nowParts.year,
      month: nowParts.month,
    }).start.toISOString()
    const daily = db
      .prepare(
        `
      SELECT COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS costUsd
      FROM assistant_usage
      WHERE tenant_id = ? AND request_day = ? AND status != 'ERROR' ${splitCreditUsage ? "AND credit_source = 'INCLUDED'" : ''}
    `,
      )
      .get(tenantId, day) as { requests: number; costUsd: number }
    const monthly = db
      .prepare(
        `
      SELECT COUNT(*) AS requests, COALESCE(SUM(cost_usd), 0) AS costUsd
      FROM assistant_usage
      WHERE tenant_id = ? AND created_at >= ? AND status != 'ERROR' ${splitCreditUsage ? "AND credit_source = 'INCLUDED'" : ''}
    `,
      )
      .get(tenantId, monthStart) as { requests: number; costUsd: number }
    return {
      day,
      monthStart,
      daily: {
        requests: Number(daily?.requests ?? 0),
        costUsd: Number(daily?.costUsd ?? 0),
      },
      monthly: {
        requests: Number(monthly?.requests ?? 0),
        costUsd: Number(monthly?.costUsd ?? 0),
      },
    }
  }

  const consumeLumaExtraCredit = (
    tenantId: string,
    userId: string,
    usageId: string,
  ) => {
    db.prepare(
      `INSERT INTO assistant_message_credit_ledger (id, tenant_id, user_id, delta_messages, source, note, created_at) VALUES (?, ?, ?, -1, 'CONSUMED', ?, ?)`,
    ).run(
      randomUUID(),
      tenantId,
      userId,
      `Reserva de mensagem extra da Luma · ${usageId}`,
      new Date().toISOString(),
    )
  }

  const refundLumaExtraCredit = (
    tenantId: string,
    userId: string,
    usageId: string,
  ) => {
    db.prepare(
      `INSERT INTO assistant_message_credit_ledger (id, tenant_id, user_id, delta_messages, source, note, created_at) VALUES (?, ?, ?, 1, 'REFUND', ?, ?)`,
    ).run(
      randomUUID(),
      tenantId,
      userId,
      `Estorno automático de mensagem extra · ${usageId}`,
      new Date().toISOString(),
    )
  }

  const lumaBudgetState = (tenantId: string) => {
    const usage = lumaUsageWindow(tenantId)
    const blocked =
      usage.daily.requests >= ASSISTANT_DAILY_LIMIT ||
      usage.monthly.requests >= ASSISTANT_MONTHLY_LIMIT ||
      usage.daily.costUsd >= env.LUMA_DAILY_COST_CAP_USD ||
      usage.monthly.costUsd >= env.LUMA_MONTHLY_COST_CAP_USD
    return {
      usage,
      blocked,
      extraCreditBalance: lumaExtraCreditBalance(db, tenantId),
    }
  }

  // Chat and visual identity share one atomic admission and credit policy.
  function reserveUsage({tenantId,userId,usageId,inputChars,visionInputs,model}: {tenantId:string;userId:string;usageId:string;inputChars:number;visionInputs:number;model:string}) {
    return db
          .transaction(() => {
            const budget = lumaBudgetState(tenantId)
            const needsExtraCredit =
              budget.usage.daily.requests >= ASSISTANT_DAILY_LIMIT ||
              budget.usage.monthly.requests >= ASSISTANT_MONTHLY_LIMIT ||
              (splitCreditUsage &&
                (budget.usage.daily.costUsd + env.LUMA_MAX_REQUEST_COST_USD >
                  env.LUMA_DAILY_COST_CAP_USD ||
                  budget.usage.monthly.costUsd + env.LUMA_MAX_REQUEST_COST_USD >
                    env.LUMA_MONTHLY_COST_CAP_USD))
            if (
              splitCreditUsage &&
              needsExtraCredit &&
              budget.extraCreditBalance <= 0
            )
              return {
                ok: false as const,
                code: 'ASSISTANT_INCLUDED_LIMIT',
                message:
                  'O uso incluído acabou por enquanto. Você pode continuar com créditos extras.',
              }
            if (
              !splitCreditUsage &&
              budget.usage.daily.costUsd + env.LUMA_MAX_REQUEST_COST_USD >
                env.LUMA_DAILY_COST_CAP_USD
            )
              return {
                ok: false as const,
                code: 'ASSISTANT_DAILY_BUDGET',
                message:
                  'Limite de uso inteligente de hoje atingido. A Luma volta a ficar disponível amanhã.',
              }
            if (
              !splitCreditUsage &&
              budget.usage.monthly.costUsd + env.LUMA_MAX_REQUEST_COST_USD >
                env.LUMA_MONTHLY_COST_CAP_USD
            )
              return {
                ok: false as const,
                code: 'ASSISTANT_MONTHLY_BUDGET',
                message: 'Limite inteligente deste mês atingido.',
              }
            if (
              budget.usage.daily.requests >= ASSISTANT_DAILY_LIMIT &&
              budget.extraCreditBalance <= 0
            )
              return {
                ok: false as const,
                code: 'ASSISTANT_DAILY_LIMIT',
                message:
                  'O limite diário da Luma acabou. Você pode continuar com créditos extras quando quiser.',
              }
            if (
              budget.usage.monthly.requests >= ASSISTANT_MONTHLY_LIMIT &&
              budget.extraCreditBalance <= 0
            )
              return {
                ok: false as const,
                code: 'ASSISTANT_MONTHLY_LIMIT',
                message:
                  'O limite mensal da Luma acabou. Você pode continuar com créditos extras quando quiser.',
              }

            db.prepare(
              `
          INSERT INTO assistant_usage (
            id, tenant_id, user_id, request_day, input_chars, input_tokens, output_tokens,
            reasoning_tokens, cost_usd, tool_calls, vision_inputs, agent_steps, status, model, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, 1, 'RESERVED', ?, ?)
        `,
            ).run(
              usageId,
              tenantId,
              userId,
              budget.usage.day,
              inputChars,
              env.LUMA_MAX_REQUEST_COST_USD,
              visionInputs,
              model,
              new Date().toISOString(),
            )
            if (splitCreditUsage)
              db.prepare(
                'UPDATE assistant_usage SET credit_source=? WHERE id=?',
              ).run(needsExtraCredit ? 'EXTRA' : 'INCLUDED', usageId)
            if (needsExtraCredit)
              consumeLumaExtraCredit(tenantId, userId, usageId)
            return {
              ok: true as const,
              day: budget.usage.day,
              usedExtraCredit: needsExtraCredit,
            }
          })
          .immediate()
  }

  router.get('/assistant/usage', requireRole('ADMIN'), (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId)
        return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const state = lumaBudgetState(tenantId)
      res.json({
        enabled: Boolean(assistantEnabled && assistantProvider.apiKey),
        used: state.usage.daily.requests,
        limit: ASSISTANT_DAILY_LIMIT,
        monthlyUsed: state.usage.monthly.requests,
        monthlyLimit: ASSISTANT_MONTHLY_LIMIT,
        dailyCostUsd: state.usage.daily.costUsd,
        dailyCostCapUsd: env.LUMA_DAILY_COST_CAP_USD,
        monthlyCostUsd: state.usage.monthly.costUsd,
        monthlyCostCapUsd: env.LUMA_MONTHLY_COST_CAP_USD,
        extraCreditBalance: state.extraCreditBalance,
        creditPacks: LUMA_CREDIT_PACKS,
        creditCheckoutAvailable: options.creditCheckoutAvailable ?? true,
        includedAvailable:
          state.usage.daily.requests < ASSISTANT_DAILY_LIMIT &&
          state.usage.monthly.requests < ASSISTANT_MONTHLY_LIMIT &&
          state.usage.daily.costUsd + env.LUMA_MAX_REQUEST_COST_USD <=
            env.LUMA_DAILY_COST_CAP_USD &&
          state.usage.monthly.costUsd + env.LUMA_MAX_REQUEST_COST_USD <=
            env.LUMA_MONTHLY_COST_CAP_USD,
        storageScope: `${req.sessionUser!.tenantId}:${req.sessionUser!.id}`,
        model: assistantProvider.model,
        provider: assistantProvider.name,
      })
    } catch (err) {
      next(err)
    }
  })

  router.post(
    '/assistant/message',
    lumaAssistantLimiter,
    requireRole('ADMIN'),
    async (req, res, next) => {
      const usageId = randomUUID()
      let usageInserted = false
      let extraCreditReserved = false
      try {
        if (!assistantEnabled || !assistantProvider.apiKey)
          return next(
            forbidden(
              'A assistente Luma ainda não está habilitada para este ambiente.',
              'ASSISTANT_DISABLED',
            ),
          )
        const tenantId = req.sessionUser?.tenantId
        const userId = req.sessionUser?.id
        if (!tenantId || !userId)
          return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

        const attachmentSchema = z
          .object({
            type: z.literal('image'),
            name: z.string().trim().min(1).max(120).optional(),
            mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
            dataUrl: z
              .string()
              .min(32)
              .max(Math.ceil(ASSISTANT_MAX_IMAGE_BYTES * 1.45) + 100),
          })
          .superRefine((attachment, ctx) => {
            const prefix = `data:${attachment.mime};base64,`
            if (!attachment.dataUrl.startsWith(prefix)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Imagem inválida.',
              })
              return
            }
            const encoded = attachment.dataUrl.slice(prefix.length)
            const estimatedBytes = Math.floor(encoded.length * 0.75)
            if (estimatedBytes > ASSISTANT_MAX_IMAGE_BYTES)
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Imagem muito grande.',
              })
          })

        const { message, history, attachment } = z
          .object({
            message: z.string().trim().min(2).max(ASSISTANT_MAX_INPUT_CHARS),
            history: z
              .array(
                z.object({
                  role: z.enum(['assistant', 'user']),
                  text: z.string().trim().min(1).max(ASSISTANT_MAX_INPUT_CHARS),
                }),
              )
              .max(8)
              .default([]),
            attachment: attachmentSchema.optional(),
          })
          .parse(req.body)

        const boundedHistory = history.reduce<
          { role: 'assistant' | 'user'; text: string }[]
        >((items, item) => {
          const total = items.reduce(
            (sum, current) => sum + current.text.length,
            0,
          )
          if (total + item.text.length > 5_000) return items
          items.push(item)
          return items
        }, [])

        const reservation = reserveUsage({tenantId,userId,usageId,inputChars:message.length,visionInputs:attachment?1:0,model:assistantProvider.model})
        if (!reservation.ok)
          return next(forbidden(reservation.message, reservation.code))
        usageInserted = true
        extraCreditReserved = reservation.usedExtraCredit

        const { timezone, day: localDate } = lumaRequestDay(tenantId)
        const answer = await generateAssistantAnswer({
          message,
          context: { tenantId, userId, timezone, localDate },
          history: boundedHistory,
          attachment,
        })

        db.transaction(() => {
          db.prepare(
            `
          UPDATE assistant_usage
          SET input_tokens = ?, output_tokens = ?, reasoning_tokens = ?, cost_usd = ?, tool_calls = ?, vision_inputs = ?, agent_steps = ?, status = 'COMPLETED', model = ?
          WHERE id = ?
        `,
          ).run(
            answer.inputTokens,
            answer.outputTokens,
            answer.reasoningTokens,
            answer.costUsd,
            answer.toolCalls,
            answer.visionInputs,
            answer.steps,
            answer.model,
            usageId,
          )
        })()

        const nextUsage = lumaUsageWindow(tenantId)
        res.json({
          answer: answer.text,
          actions: answer.pendingActions,
          usage: {
            used: nextUsage.daily.requests,
            limit: ASSISTANT_DAILY_LIMIT,
            monthlyUsed: nextUsage.monthly.requests,
            monthlyLimit: ASSISTANT_MONTHLY_LIMIT,
            extraCreditBalance: lumaExtraCreditBalance(db, tenantId),
            creditPacks: LUMA_CREDIT_PACKS,
            includedAvailable:
              nextUsage.daily.requests < ASSISTANT_DAILY_LIMIT &&
              nextUsage.monthly.requests < ASSISTANT_MONTHLY_LIMIT &&
              nextUsage.daily.costUsd + env.LUMA_MAX_REQUEST_COST_USD <=
                env.LUMA_DAILY_COST_CAP_USD &&
              nextUsage.monthly.costUsd + env.LUMA_MAX_REQUEST_COST_USD <=
                env.LUMA_MONTHLY_COST_CAP_USD,
            creditCheckoutAvailable: options.creditCheckoutAvailable ?? true,
            storageScope: `${req.sessionUser!.tenantId}:${req.sessionUser!.id}`,
          },
        })
      } catch (error) {
        if (usageInserted) {
          db.transaction(() => {
            const reverted = db
              .prepare(
                `UPDATE assistant_usage SET status = 'ERROR' WHERE id = ? AND status = 'RESERVED'`,
              )
              .run(usageId)
            if (reverted.changes === 1 && extraCreditReserved)
              refundLumaExtraCredit(
                req.sessionUser?.tenantId || '',
                req.sessionUser?.id || '',
                usageId,
              )
          })()
        }
        next(error)
      }
    },
  )

  // Local logo processing is available without an LLM key or paid message credits.
  router.post('/brand/prepare-image', lumaAssistantLimiter, requireRole('ADMIN'), async (req, res, next) => {
    try {
      if (!req.sessionUser?.tenantId) throw badRequest('Espaço inválido', 'INVALID_TENANT')
      const body = z.object({ imageDataUrl: z.string().max(450_000), mode: z.enum(['REMOVE_BACKGROUND_AND_TRIM', 'TRIM']) }).strict().parse(req.body)
      let prepared
      try { prepared = await prepareLogoImage(body.imageDataUrl, body.mode) }
      catch (error) { throw badRequest(error instanceof Error ? error.message : 'Não foi possível preparar a logo.', 'LOGO_PREPARATION_FAILED') }
      res.json(prepared)
    } catch (error) { next(error) }
  })

  router.post('/assistant/brand-suggestions', lumaAssistantLimiter, requireRole('ADMIN'), async (req,res,next)=>{
    const usageId=randomUUID()
    let usageInserted=false, extraCreditReserved=false
    try {
      if(!assistantEnabled || !assistantProvider.apiKey || !options.generateBrandSetupSuggestions) throw forbidden('A análise da Luma não está disponível. Você pode ajustar a marca manualmente.','ASSISTANT_DISABLED')
      const tenantId=req.sessionUser?.tenantId, userId=req.sessionUser?.id
      if(!tenantId || !userId) throw badRequest('Tenant inválido','INVALID_TENANT')
      const body=z.object({businessName:z.string().trim().min(2).max(120),preferences:z.string().trim().max(280).default(''),logoDataUrl:z.string().max(450_000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/)}).strict().parse(req.body)
      const reservation=reserveUsage({tenantId,userId,usageId,inputChars:body.businessName.length+body.preferences.length,visionInputs:1,model:assistantProvider.model})
      if(!reservation.ok) throw forbidden(reservation.message,reservation.code)
      usageInserted=true;extraCreditReserved=reservation.usedExtraCredit
      const answer=await options.generateBrandSetupSuggestions(body).catch(()=>{throw new HttpError(502,'Não foi possível analisar a logo agora. Você pode ajustar a marca manualmente.','ASSISTANT_BRAND_FAILED')})
      const logoResult=logoSuggestionSchema.safeParse(answer.logoPresentation)
      if(!logoResult.success) throw new HttpError(502,'A Luma não retornou uma apresentação válida. Você pode ajustar manualmente.','ASSISTANT_BRAND_FAILED')
      const logoPresentation=logoResult.data
      const palettes=z.array(z.object({name:z.string().max(40),primary:z.string().regex(/^#[0-9a-f]{6}$/i),secondary:z.string().regex(/^#[0-9a-f]{6}$/i),background:z.string().regex(/^#[0-9a-f]{6}$/i),rationale:z.string().max(140)})).length(3).safeParse(answer.palettes)
      if(!palettes.success) throw new HttpError(502,'A Luma não retornou uma paleta válida. Você pode ajustar manualmente.','ASSISTANT_BRAND_FAILED')
      db.prepare("UPDATE assistant_usage SET input_tokens=?,output_tokens=?,cost_usd=?,model=?,status='COMPLETED' WHERE id=? AND status='RESERVED'").run(answer.inputTokens,answer.outputTokens,answer.costUsd,answer.model,usageId)
      const usage=lumaUsageWindow(tenantId)
      res.json({palettes:palettes.data,logoPresentation,source:'VISION',usage:{used:usage.daily.requests,limit:ASSISTANT_DAILY_LIMIT,monthlyUsed:usage.monthly.requests,monthlyLimit:ASSISTANT_MONTHLY_LIMIT,extraCreditBalance:lumaExtraCreditBalance(db,tenantId)}})
    } catch(error) {
      if(usageInserted) db.transaction(()=>{
        const reverted=db.prepare("UPDATE assistant_usage SET status='ERROR' WHERE id=? AND status='RESERVED'").run(usageId)
        if(reverted.changes===1 && extraCreditReserved) refundLumaExtraCredit(req.sessionUser!.tenantId!,req.sessionUser!.id,usageId)
      }).immediate()
      next(error)
    }
  })

  router.post(
    '/assistant/actions/:id/confirm',
    requireRole('ADMIN'),
    (req, res, next) => {
      try {
        const tenantId = req.sessionUser?.tenantId
        const userId = req.sessionUser?.id
        if (!tenantId || !userId)
          return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
        const actionId = z.string().uuid().parse(req.params.id)
        const result = confirmLumaAction({ tenantId, userId }, actionId)
        if (!result.ok) return next(badRequest(result.message, result.code))
        res.json(result)
      } catch (err) {
        next(err)
      }
    },
  )

  return router
}
