import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import type Database from 'better-sqlite3'
import { badRequest, notFound, unauthorized } from './http.js'

type WhatsappConfig = {
  baseUrl?: string | null
  apiKey?: string | null
  instanceName?: string | null
}

type ClientAccessServiceOptions = {
  db: Database.Database
  normalizePhone: (raw: string) => string
  requireWhatsappConfig: (tenantId: string) => WhatsappConfig | undefined
  hashCode: (tenantId: string, userId: string, code: string) => string
  sendWhatsappText: (
    tenantId: string,
    phone: string,
    text: string,
    options?: { source?: 'SYSTEM'; persist?: boolean },
  ) => Promise<boolean>
  now?: () => Date
  randomId?: () => string
  randomCode?: () => string
  logger?: Pick<Console, 'warn'>
}

export type ClientAccessInput = {
  tenantSlug: string
  phone: string
}

export type VerifyClientAccessInput = ClientAccessInput & {
  code: string
  onVerified: (userId: string) => unknown
}

export function createClientAccessService({
  db,
  normalizePhone,
  requireWhatsappConfig,
  hashCode,
  sendWhatsappText,
  now = () => new Date(),
  randomId = randomUUID,
  randomCode = () => String(randomInt(100000, 1000000)),
  logger = console,
}: ClientAccessServiceOptions) {
  const requestClientAccess = async (input: ClientAccessInput) => {
    const slug = input.tenantSlug.trim().toLowerCase()
    const tenant = db.prepare(`
      SELECT id, name FROM tenants WHERE slug = ? AND status = 'ACTIVE'
    `).get(slug) as { id: string; name: string } | undefined
    if (!tenant) throw notFound('Espaço não encontrado', 'TENANT_NOT_FOUND')

    const phone = normalizePhone(input.phone)
    const whatsapp = requireWhatsappConfig(tenant.id)
    if (!whatsapp?.baseUrl || !whatsapp.apiKey || !whatsapp.instanceName) {
      throw badRequest(
        'O WhatsApp deste espaço ainda não está disponível para confirmar seu acesso.',
        'CLIENT_ACCESS_DELIVERY_UNAVAILABLE',
      )
    }

    const client = db.prepare(`
      SELECT u.id as userId
      FROM clients c
      JOIN users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
      WHERE c.tenant_id = ? AND c.phone_normalized = ?
      LIMIT 1
    `).get(tenant.id, phone) as { userId: string } | undefined

    // A mesma resposta evita enumeração de telefones cadastrados.
    if (!client) return { sent: true as const }

    const currentTime = now()
    const createdAt = currentTime.toISOString()
    const expiresAt = new Date(currentTime.getTime() + 5 * 60_000).toISOString()
    const code = randomCode()
    db.transaction(() => {
      db.prepare(`
        UPDATE client_login_codes
        SET consumed_at = ?
        WHERE tenant_id = ? AND user_id = ? AND consumed_at IS NULL
      `).run(createdAt, tenant.id, client.userId)
      db.prepare(`
        INSERT INTO client_login_codes
          (id, tenant_id, user_id, code_hash, expires_at, attempts, consumed_at, created_at)
        VALUES (?, ?, ?, ?, ?, 0, NULL, ?)
      `).run(
        randomId(),
        tenant.id,
        client.userId,
        hashCode(tenant.id, client.userId, code),
        expiresAt,
        createdAt,
      )
    })()

    const delivered = await sendWhatsappText(
      tenant.id,
      phone,
      `${code} é seu código de acesso ao ${tenant.name}. Ele expira em 5 minutos. Não compartilhe este código.`,
      { source: 'SYSTEM', persist: false },
    )
    if (!delivered) logger.warn(`[ClientAccess] falha de entrega para tenant ${tenant.id}`)
    return { sent: true as const }
  }

  const verifyClientAccess = (input: VerifyClientAccessInput) => {
    const slug = input.tenantSlug.trim().toLowerCase()
    const tenant = db.prepare(`
      SELECT id, slug FROM tenants WHERE slug = ? AND status = 'ACTIVE'
    `).get(slug) as { id: string; slug: string } | undefined
    if (!tenant) throw notFound('Espaço não encontrado', 'TENANT_NOT_FOUND')

    const phone = normalizePhone(input.phone)
    const client = db.prepare(`
      SELECT u.id as userId, c.name
      FROM clients c
      JOIN users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
      WHERE c.tenant_id = ? AND c.phone_normalized = ?
      LIMIT 1
    `).get(tenant.id, phone) as { userId: string; name: string } | undefined
    if (!client) throw unauthorized('Código inválido ou expirado', 'INVALID_CLIENT_CODE')

    const row = db.prepare(`
      SELECT id, code_hash as codeHash, expires_at as expiresAt, attempts
      FROM client_login_codes
      WHERE tenant_id = ? AND user_id = ? AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get(tenant.id, client.userId) as {
      id: string
      codeHash: string
      expiresAt: string
      attempts: number
    } | undefined
    if (!row || new Date(row.expiresAt).getTime() < now().getTime() || row.attempts >= 5) {
      throw unauthorized('Código inválido ou expirado', 'INVALID_CLIENT_CODE')
    }

    db.prepare(`UPDATE client_login_codes SET attempts = attempts + 1 WHERE id = ?`).run(row.id)
    const expected = Buffer.from(row.codeHash, 'hex')
    const provided = Buffer.from(hashCode(tenant.id, client.userId, input.code), 'hex')
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw unauthorized('Código inválido ou expirado', 'INVALID_CLIENT_CODE')
    }

    db.prepare(`UPDATE client_login_codes SET consumed_at = ? WHERE id = ?`).run(now().toISOString(), row.id)
    input.onVerified(client.userId)
    const user = db.prepare(`SELECT email FROM users WHERE id = ?`).get(client.userId) as { email: string }
    return {
      id: client.userId,
      email: user.email,
      role: 'CLIENT' as const,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      name: client.name,
    }
  }

  return { requestClientAccess, verifyClientAccess }
}
