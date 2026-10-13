import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import type Database from 'better-sqlite3'
import { notFound } from './http.js'
import {
  LEGAL_BUNDLE_VERSION,
  PLATFORM_MARKETING_WHATSAPP_TEXT,
  PLATFORM_MARKETING_WHATSAPP_VERSION,
  PRIVACY_VERSION,
  TERMS_VERSION,
  currentLegalBundleHash,
  legalAcceptanceSnapshot,
  legalEvidenceFingerprint,
} from './legal.js'

export type PlatformMarketingChoiceInput = {
  userId: string
  tenantId: string | null
  granted: boolean
  source: string
}

export type LegalAcceptanceInput = {
  userId: string
  tenantId: string | null
  source: string
  req: Request
}

type LegalEvidence = { ipHash: string | null; userAgentHash: string | null }

type ProfessionalConsentServiceOptions = {
  db: Database.Database
  now?: () => Date
  randomId?: () => string
  evidenceFingerprint?: (req: Request) => LegalEvidence
}

export function createProfessionalConsentService({
  db,
  now = () => new Date(),
  randomId = randomUUID,
  evidenceFingerprint = legalEvidenceFingerprint,
}: ProfessionalConsentServiceOptions) {
  const recordPlatformMarketingChoice = (input: PlatformMarketingChoiceInput) => {
    const current = db.prepare(`
      SELECT platform_marketing_whatsapp_opt_in as optedIn
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(input.userId) as { optedIn: number } | undefined
    if (!current) throw notFound('Usuário não encontrado', 'USER_NOT_FOUND')

    const alreadyGranted = Boolean(current.optedIn)
    const action = input.granted ? 'GRANTED' : (alreadyGranted ? 'WITHDRAWN' : 'DECLINED')
    const timestamp = now().toISOString()
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET platform_marketing_whatsapp_opt_in = ?,
            platform_marketing_whatsapp_opt_in_at = CASE WHEN ? = 1 THEN ? ELSE platform_marketing_whatsapp_opt_in_at END,
            platform_marketing_whatsapp_opt_out_at = CASE WHEN ? = 0 THEN ? ELSE NULL END
        WHERE id = ?
      `).run(input.granted ? 1 : 0, input.granted ? 1 : 0, timestamp, input.granted ? 1 : 0, timestamp, input.userId)
      db.prepare(`
        INSERT INTO platform_marketing_consent_events
          (id, user_id, tenant_id, channel, action, policy_version, consent_text, source, created_at)
        VALUES (?, ?, ?, 'WHATSAPP', ?, ?, ?, ?, ?)
      `).run(
        randomId(),
        input.userId,
        input.tenantId,
        action,
        PLATFORM_MARKETING_WHATSAPP_VERSION,
        PLATFORM_MARKETING_WHATSAPP_TEXT,
        input.source,
        timestamp,
      )
    })
    transaction.immediate()
    return { whatsappPromotions: input.granted, changed: alreadyGranted !== input.granted }
  }

  const recordLegalAcceptance = (input: LegalAcceptanceInput) => {
    const timestamp = now().toISOString()
    const evidence = evidenceFingerprint(input.req)
    db.prepare(`
      INSERT INTO user_legal_acceptances
        (id, user_id, tenant_id, bundle_version, bundle_hash, terms_version, privacy_version, source, ip_hash, user_agent_hash, snapshot_json, accepted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomId(),
      input.userId,
      input.tenantId,
      LEGAL_BUNDLE_VERSION,
      currentLegalBundleHash(),
      TERMS_VERSION,
      PRIVACY_VERSION,
      input.source,
      evidence.ipHash,
      evidence.userAgentHash,
      legalAcceptanceSnapshot(),
      timestamp,
    )
  }

  return { recordPlatformMarketingChoice, recordLegalAcceptance }
}
