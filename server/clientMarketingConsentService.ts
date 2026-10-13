import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { notFound } from './http.js'

export const MARKETING_WHATSAPP_CONSENT_VERSION = 'whatsapp-promos-v1'
export const MARKETING_WHATSAPP_CONSENT_TEXT = 'Quero receber novidades e ofertas no WhatsApp.'

export type ClientMarketingConsentInput = {
  tenantId: string
  userId: string
  granted: boolean
  source: string
}

type ClientMarketingConsentServiceOptions = {
  db: Database.Database
  now?: () => Date
  randomId?: () => string
}

export function createClientMarketingConsentService({
  db,
  now = () => new Date(),
  randomId = randomUUID,
}: ClientMarketingConsentServiceOptions) {
  const setClientWhatsappMarketingConsent = (input: ClientMarketingConsentInput) => {
    const current = db.prepare(`
      SELECT marketing_whatsapp_opt_in as optedIn
      FROM clients
      WHERE tenant_id = ? AND user_id = ?
      LIMIT 1
    `).get(input.tenantId, input.userId) as { optedIn: number } | undefined
    if (!current) throw notFound('Cliente não encontrado', 'CLIENT_NOT_FOUND')

    const alreadyGranted = Boolean(current.optedIn)
    if (alreadyGranted === input.granted) {
      return { changed: false, optedIn: alreadyGranted }
    }

    const timestamp = now().toISOString()
    const action = input.granted ? 'GRANTED' : 'WITHDRAWN'
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE clients
        SET marketing_whatsapp_opt_in = ?,
            marketing_whatsapp_opt_in_at = CASE WHEN ? = 1 THEN ? ELSE marketing_whatsapp_opt_in_at END,
            marketing_whatsapp_opt_out_at = CASE WHEN ? = 0 THEN ? ELSE NULL END,
            marketing_consent_version = ?,
            marketing_consent_source = ?
        WHERE tenant_id = ? AND user_id = ?
      `).run(
        input.granted ? 1 : 0,
        input.granted ? 1 : 0,
        timestamp,
        input.granted ? 1 : 0,
        timestamp,
        MARKETING_WHATSAPP_CONSENT_VERSION,
        input.source,
        input.tenantId,
        input.userId,
      )
      db.prepare(`
        INSERT INTO client_marketing_consent_events
          (id, tenant_id, client_user_id, channel, action, policy_version, consent_text, source, created_at)
        VALUES (?, ?, ?, 'WHATSAPP', ?, ?, ?, ?, ?)
      `).run(
        randomId(),
        input.tenantId,
        input.userId,
        action,
        MARKETING_WHATSAPP_CONSENT_VERSION,
        MARKETING_WHATSAPP_CONSENT_TEXT,
        input.source,
        timestamp,
      )
    })
    transaction.immediate()
    return { changed: true, optedIn: input.granted }
  }

  return { setClientWhatsappMarketingConsent }
}
