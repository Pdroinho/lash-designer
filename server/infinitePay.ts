import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { env } from './env.js'
import { badRequest } from './http.js'

export const infinitePayWebhookPayloadSchema = z.object({
  order_nsu: z.string().trim().min(1).max(200),
  transaction_nsu: z.string().trim().min(1).max(200),
  amount: z.coerce.number().int().positive(),
  invoice_slug: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().min(1).max(200).optional(),
  receipt_url: z.string().trim().max(2048).optional(),
  capture_method: z.string().trim().max(80).optional(),
}).passthrough().superRefine((value, ctx) => {
  if (!value.invoice_slug && !value.slug) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['invoice_slug'], message: 'invoice_slug obrigatório' })
})

const infinitePayPaymentCheckSchema = z.object({
  paid: z.boolean(),
  amount: z.coerce.number().int().positive(),
  capture_method: z.string().trim().max(80).optional(),
}).passthrough()

export const safeInfinitePayReceiptUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : ''
  } catch {
    return ''
  }
}

export const infinitePayWebhookHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex')

export function createInfinitePayRuntime(db: Database.Database) {
  const createInfinitePayLink = async (input: {
    orderNsu: string
    amountCents: number
    customerName: string
    customerEmail: string
    planLabel: string
    months: number
    redirectUrl: string
    itemDescription?: string
  }) => {
    if (!env.INFINITEPAY_HANDLE || !env.APP_BASE_URL) {
      throw badRequest('Configure INFINITEPAY_HANDLE e APP_BASE_URL no .env', 'PAYMENT_NOT_CONFIGURED')
    }
    const response = await fetch(`${env.INFINITEPAY_BASE_URL}/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        handle: env.INFINITEPAY_HANDLE,
        redirect_url: input.redirectUrl,
        webhook_url: `${env.APP_BASE_URL.replace(/\/$/, '')}/api/webhooks/infinitepay`,
        order_nsu: input.orderNsu,
        customer: { name: input.customerName, email: input.customerEmail },
        items: [{
          quantity: 1,
          price: input.amountCents,
          description: input.itemDescription || `Lash Designer Pro — plano ${input.planLabel.toLowerCase()} (${input.months} ${input.months === 1 ? 'mês' : 'meses'})`,
        }],
      }),
    })
    const payload = await response.json().catch(() => null) as { url?: string; message?: string } | null
    if (!response.ok || !payload?.url) throw badRequest(payload?.message || 'Não foi possível gerar o checkout', 'CHECKOUT_FAILED')
    try {
      const checkoutUrl = new URL(payload.url)
      if (checkoutUrl.protocol !== 'https:') throw new Error('Checkout sem HTTPS')
      return checkoutUrl.toString()
    } catch {
      throw badRequest('A operadora retornou um endereço de checkout inválido.', 'INVALID_CHECKOUT_URL')
    }
  }

  const logInfinitePayWebhookEvent = (input: { orderNsu?: string | null; eventHash: string; outcome: string; errorCode?: string | null }) => {
    db.prepare(`
      INSERT INTO infinitepay_webhook_events (id, order_nsu, event_hash, outcome, error_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), input.orderNsu || null, input.eventHash, input.outcome.slice(0, 80), input.errorCode?.slice(0, 120) || null, new Date().toISOString())
  }

  const verifyInfinitePayPayment = async (input: { orderNsu: string; transactionNsu: string; invoiceSlug: string; expectedAmountCents: number }) => {
    const response = await fetch(`${env.INFINITEPAY_BASE_URL}/payment_check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        handle: env.INFINITEPAY_HANDLE,
        order_nsu: input.orderNsu,
        transaction_nsu: input.transactionNsu,
        slug: input.invoiceSlug,
      }),
    })
    const raw = await response.json().catch(() => null)
    const parsed = infinitePayPaymentCheckSchema.safeParse(raw)
    if (!response.ok || !parsed.success || !parsed.data.paid || parsed.data.amount !== input.expectedAmountCents) {
      throw badRequest('Pagamento não confirmado', 'PAYMENT_NOT_CONFIRMED')
    }
    return parsed.data
  }

  return { createInfinitePayLink, logInfinitePayWebhookEvent, verifyInfinitePayPayment }
}
