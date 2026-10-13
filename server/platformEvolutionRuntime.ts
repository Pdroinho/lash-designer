import Database from 'better-sqlite3'
import { resolveExternalHttpsBaseUrl as resolveSafeBaseUrl } from './externalUrl.js'
import { normalizeBrazilPhone } from './phone.js'
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secretCrypto.js'
import { badRequest } from './http.js'

const evolutionPlatformSecretPurpose = 'evolution:platform:api-key'
const evolutionTenantSecretPurpose = (tenantId: string) => `evolution:tenant:${tenantId}:api-key`

type PlatformEvolutionRuntimeOptions = {
  db: Database.Database
  environmentBaseUrl?: string
  environmentApiKey?: string
  environmentInstanceName?: string
  resolveExternalHttpsBaseUrl?: (raw: string) => Promise<string>
  fetchFn?: typeof fetch
  now?: () => Date
  encryptSecretFn?: (value: string, purpose: string) => string
  decryptSecretFn?: (value: string, purpose: string) => string
  isEncryptedSecretFn?: (value: string) => boolean
}

export function createPlatformEvolutionRuntime({
  db,
  environmentBaseUrl,
  environmentApiKey,
  environmentInstanceName,
  resolveExternalHttpsBaseUrl = resolveSafeBaseUrl,
  fetchFn = fetch,
  now = () => new Date(),
  encryptSecretFn = encryptSecret,
  decryptSecretFn = decryptSecret,
  isEncryptedSecretFn = isEncryptedSecret,
}: PlatformEvolutionRuntimeOptions) {
  const platformEvolutionDefaultInstanceName = environmentInstanceName || 'lashdesigner-global'

  const storedSecretPlaintext = (value: string | null | undefined, purpose: string) => {
    if (!value) return null
    return isEncryptedSecretFn(value) ? decryptSecretFn(value, purpose) : value
  }

  const decryptPlatformApiKey = (value: string | null | undefined) =>
    storedSecretPlaintext(value, evolutionPlatformSecretPurpose)

  const decryptTenantApiKey = (value: string | null | undefined, tenantId: string) =>
    storedSecretPlaintext(value, evolutionTenantSecretPurpose(tenantId))

  const encryptPlatformApiKey = (value: string) =>
    encryptSecretFn(value, evolutionPlatformSecretPurpose)

  const encryptTenantApiKey = (value: string, tenantId: string) =>
    encryptSecretFn(value, evolutionTenantSecretPurpose(tenantId))

  const migrateEvolutionSecretsAtRest = () => {
    db.transaction(() => {
      const timestamp = now().toISOString()
      const platform = db.prepare(`SELECT value FROM platform_settings WHERE key = 'evolution_api_key' LIMIT 1`).get() as { value: string } | undefined
      if (platform?.value && !isEncryptedSecretFn(platform.value)) {
        db.prepare(`UPDATE platform_settings SET value = ?, encrypted = 1, updated_at = ? WHERE key = 'evolution_api_key'`)
          .run(encryptPlatformApiKey(platform.value), timestamp)
      }

      const tenantRows = db.prepare(`
        SELECT id, tenant_id as tenantId, api_key as apiKey
        FROM whatsapp_instances WHERE api_key IS NOT NULL AND api_key <> ''
      `).all() as Array<{ id: string; tenantId: string; apiKey: string }>
      const updateTenant = db.prepare(`UPDATE whatsapp_instances SET api_key = ?, updated_at = ? WHERE id = ?`)
      for (const row of tenantRows) {
        if (isEncryptedSecretFn(row.apiKey)) {
          // Startup must fail if the root key or context is wrong; replacing a valid ciphertext would lose access.
          decryptTenantApiKey(row.apiKey, row.tenantId)
          continue
        }
        updateTenant.run(encryptTenantApiKey(row.apiKey, row.tenantId), timestamp, row.id)
      }

      const encryptedPlatform = db.prepare(`SELECT value FROM platform_settings WHERE key = 'evolution_api_key' LIMIT 1`).get() as { value: string } | undefined
      if (encryptedPlatform?.value) {
        decryptPlatformApiKey(encryptedPlatform.value)
        db.prepare(`UPDATE platform_settings SET encrypted = 1 WHERE key = 'evolution_api_key'`).run()
      }
    })()
  }

  const platformEvolutionConfig = () => {
    const rows = db.prepare(`
      SELECT key, value FROM platform_settings
      WHERE key IN ('evolution_api_url', 'evolution_api_key', 'evolution_instance_name')
    `).all() as Array<{ key: string; value: string }>
    const values = Object.fromEntries(rows.map(row => [row.key, row.value])) as Record<string, string>
    return {
      baseUrl: values.evolution_api_url || environmentBaseUrl || null,
      apiKey: decryptPlatformApiKey(values.evolution_api_key) || environmentApiKey || null,
      instanceName: (values.evolution_instance_name || environmentInstanceName || platformEvolutionDefaultInstanceName).trim() || platformEvolutionDefaultInstanceName,
    }
  }

  const normalizeUserE164Phone = (raw: string) => {
    const phone = normalizeBrazilPhone(raw)
    if (!phone) throw badRequest('WhatsApp inválido. Use um número brasileiro com DDD.', 'INVALID_PHONE')
    return `+${phone}`
  }

  const maskE164Phone = (raw: string) => {
    const digits = String(raw ?? '').replace(/\D/g, '')
    if (digits.length < 6) return 'WhatsApp cadastrado'
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} *****-${digits.slice(-4)}`
  }

  const sendPlatformWhatsappText = async (phone: string, text: string) => {
    const config = platformEvolutionConfig()
    if (!config.baseUrl || !config.apiKey || !config.instanceName) return false
    const normalized = normalizeBrazilPhone(phone)
    if (!normalized) return false
    const response = await fetchFn(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/message/sendText/${encodeURIComponent(config.instanceName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ number: normalized, text, textMessage: text }),
    }).catch(() => null)
    return Boolean(response?.ok)
  }

  return {
    platformEvolutionDefaultInstanceName,
    platformEvolutionConfig,
    migrateEvolutionSecretsAtRest,
    decryptPlatformApiKey,
    decryptTenantApiKey,
    encryptPlatformApiKey,
    encryptTenantApiKey,
    normalizeUserE164Phone,
    maskE164Phone,
    sendPlatformWhatsappText,
  }
}
