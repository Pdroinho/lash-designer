import { z } from 'zod'

export class AppmaxRequestError extends Error {
  constructor(public readonly status: number) { super(`Appmax respondeu HTTP ${status}`) }
}

export type AppmaxEnvironment = 'sandbox' | 'production'

const endpoints = {
  sandbox: { auth: 'https://auth.sandboxappmax.com.br', api: 'https://api.sandboxappmax.com.br' },
  production: { auth: 'https://auth.appmax.com.br', api: 'https://api.appmax.com.br' },
} as const

const tokenSchema = z.object({ access_token: z.string().min(20), expires_in: z.number().int().positive() })
const linkSchema = z.object({ data: z.object({ id: z.number().int().positive(), checkout_url: z.string().url() }) })
const linkOrdersSchema = z.object({
  data: z.array(z.object({ order: z.object({ id: z.number().int().positive(), status: z.string(), total: z.number().int().nonnegative() }) })),
  meta: z.object({ total_pages: z.number().int().min(1).max(1000) }),
})
const orderSchema = z.object({ data: z.object({ order: z.object({ id: z.number().int().positive(), status: z.string(), total_paid: z.number().int().nonnegative() }) }) })

export function createAppmaxClient(input: {
  environment: AppmaxEnvironment
  merchantClientId: string
  merchantClientSecret: string
  fetchFn?: typeof fetch
}) {
  if (!input.merchantClientId || !input.merchantClientSecret) throw new Error('Credenciais merchant Appmax ausentes.')
  const base = endpoints[input.environment]
  const fetchFn = input.fetchFn ?? fetch
  let token: { value: string; expiresAt: number } | null = null

  async function json(response: Response) {
    if (!response.ok) throw new AppmaxRequestError(response.status)
    return response.json() as Promise<unknown>
  }

  async function authenticate() {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value
    const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: input.merchantClientId, client_secret: input.merchantClientSecret })
    const response = await fetchFn(`${base.auth}/oauth2/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
      redirect: 'error', signal: AbortSignal.timeout(8_000),
    })
    const parsed = tokenSchema.parse(await json(response))
    token = { value: parsed.access_token, expiresAt: Date.now() + parsed.expires_in * 1000 }
    return token.value
  }

  async function authorized(path: string, init?: RequestInit) {
    const bearer = await authenticate()
    const response = await fetchFn(`${base.api}${path}`, {
      ...init, headers: { Authorization: `Bearer ${bearer}`, ...init?.headers },
      redirect: 'error', signal: AbortSignal.timeout(8_000),
    })
    return json(response)
  }

  async function createPaymentLink(inputLink: { name: string; amountCents: number; description: string }) {
    if (!Number.isInteger(inputLink.amountCents) || inputLink.amountCents < 500) throw new Error('Valor do link Appmax inválido.')
    const raw = await authorized('/v1/payment-link', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: inputLink.name, value: inputLink.amountCents, description: inputLink.description,
        product_type: 'digital', payments: ['creditcard', 'pix'],
        max_installments: 1, fee_transfer_from_installment: 0, allow_multiple_sales: false,
      }),
    })
    const { data } = linkSchema.parse(raw)
    const url = new URL(data.checkout_url)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Checkout Appmax sem HTTPS válido.')
    return { linkId: data.id, checkoutUrl: url.toString() }
  }

  // A link may appear in an unauthenticated webhook payload. Confirm both the
  // link-to-order relationship and the paid order through merchant API calls.
  async function inspectPaymentLinkOrder(inputOrder: { linkId: number; orderId: number; expectedAmountCents: number }): Promise<'PAID' | 'REVERSED' | 'UNKNOWN'> {
    const { linkId, orderId, expectedAmountCents } = inputOrder
    if (![linkId, orderId, expectedAmountCents].every(value => Number.isSafeInteger(value) && value > 0)) return 'UNKNOWN'
    let found = false
    for (let page = 1; page <= 20; page++) {
      const parsed = linkOrdersSchema.parse(await authorized(`/v1/payment-link/${linkId}/orders?page=${page}`))
      if (parsed.data.some(item => item.order.id === orderId)) { found = true; break }
      if (page >= parsed.meta.total_pages) break
    }
    if (!found) return 'UNKNOWN'
    const verified = orderSchema.parse(await authorized(`/v1/orders/${orderId}`)).data.order
    if (verified.id !== orderId) return 'UNKNOWN'
    const status = verified.status.toLowerCase()
    if (['estornado', 'recusado_por_risco', 'chargeback_em_tratativa', 'chargeback_em_disputa', 'chargeback_perdido'].includes(status)) return 'REVERSED'
    if (['aprovado', 'integrado'].includes(status) && verified.total_paid === expectedAmountCents) return 'PAID'
    return 'UNKNOWN'
  }

  async function verifyPaymentLinkOrder(inputOrder: { linkId: number; orderId: number; expectedAmountCents: number }) {
    return await inspectPaymentLinkOrder(inputOrder) === 'PAID'
  }

  async function listPaymentLinkOrders(linkId: number) {
    if (!Number.isSafeInteger(linkId) || linkId <= 0) return []
    const orders: Array<{ id: number; status: string }> = []
    for (let page = 1; page <= 20; page++) {
      const parsed = linkOrdersSchema.parse(await authorized(`/v1/payment-link/${linkId}/orders?page=${page}`))
      orders.push(...parsed.data.map(item => ({ id: item.order.id, status: item.order.status })))
      if (page >= parsed.meta.total_pages) break
    }
    return orders
  }

  return { createPaymentLink, verifyPaymentLinkOrder, inspectPaymentLinkOrder, listPaymentLinkOrders }
}
