import Database from 'better-sqlite3'
import { Router } from 'express'
import { requireRole } from '../auth.js'
import { badRequest } from '../http.js'
import { normalizeEvolutionConnectionState } from '../whatsappWebhook.js'
import type { WhatsappConfig } from './adminWhatsappSettingsRoutes.js'
import { extractQrCode } from './devEvolutionRoutes.js'

type ConnectionState = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'UNKNOWN'

type AdminWhatsappConnectionRouterOptions = {
  db: Database.Database
  requireWhatsappConfig: (tenantId: string) => WhatsappConfig | undefined
  ensurePlatformWhatsappConfig: (tenantId: string) => WhatsappConfig | undefined
  resolveExternalHttpsBaseUrl: (raw: string) => Promise<string>
  configureEvolutionWebhookForTenant: (tenantId: string) => Promise<boolean>
  evolutionWebhookConfiguredForTenant: (tenantId: string) => Promise<boolean | null>
  updateEvolutionConnectionFromWebhook: (
    tenantId: string,
    instanceName: string,
    state: ConnectionState,
  ) => unknown
  fetchImpl?: typeof fetch
}

export function createAdminWhatsappConnectionRouter({
  db,
  requireWhatsappConfig,
  ensurePlatformWhatsappConfig,
  resolveExternalHttpsBaseUrl,
  configureEvolutionWebhookForTenant,
  evolutionWebhookConfiguredForTenant,
  updateEvolutionConnectionFromWebhook,
  fetchImpl = fetch,
}: AdminWhatsappConnectionRouterOptions) {
  const router = Router()

  router.get('/whatsapp/status', requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const row = requireWhatsappConfig(tenantId)
      if (!row?.baseUrl || !row.apiKey || !row.instanceName) {
        res.json({ state: 'NOT_CONFIGURED' })
        return
      }

      const baseUrl = await resolveExternalHttpsBaseUrl(row.baseUrl)
      const url = `${baseUrl}/instance/connectionState/${encodeURIComponent(row.instanceName)}`
      const response = await fetchImpl(url, {
        headers: { apikey: row.apiKey },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      const raw = await response.json().catch(() => null)
      const root = typeof raw === 'object' && raw ? raw as Record<string, unknown> : null
      const instance = root && typeof root.instance === 'object' && root.instance
        ? root.instance as Record<string, unknown>
        : null
      const state =
        (typeof instance?.state === 'string' && instance.state) ||
        (typeof root?.state === 'string' && root.state) ||
        (response.ok ? 'unknown' : 'error')

      const normalizedState = normalizeEvolutionConnectionState(state)
      if (normalizedState && row.instanceName) {
        updateEvolutionConnectionFromWebhook(tenantId, row.instanceName, normalizedState)
      }
      if (normalizedState === 'CONNECTED') {
        await configureEvolutionWebhookForTenant(tenantId).catch(() => false)
      }

      res.json({ state })
    } catch (err) {
      next(err)
    }
  })

  router.get('/whatsapp/qrcode', requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))
      const row = ensurePlatformWhatsappConfig(tenantId)
      if (!row?.baseUrl || !row.apiKey || !row.instanceName) {
        res.json({ qrCode: null, state: 'NOT_CONFIGURED' })
        return
      }

      const headers = { apikey: row.apiKey, 'Content-Type': 'application/json' }
      const baseUrl = await resolveExternalHttpsBaseUrl(row.baseUrl)
      const connectUrl = `${baseUrl}/instance/connect/${encodeURIComponent(row.instanceName)}`
      let response = await fetchImpl(connectUrl, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      let raw = await response.json().catch(() => null)
      let qrCode = extractQrCode(raw)

      if (!response.ok || !qrCode) {
        const createResponse = await fetchImpl(`${baseUrl}/instance/create`, {
          method: 'POST',
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({
            instanceName: row.instanceName,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
          }),
        })
        const createRaw = await createResponse.json().catch(() => null)
        qrCode = extractQrCode(createRaw)
        if (!createResponse.ok && !response.ok) {
          return next(badRequest('Não foi possível preparar a conexão do WhatsApp.', 'WHATSAPP_PROVISION_FAILED'))
        }
        if (!qrCode) {
          response = await fetchImpl(connectUrl, {
            headers,
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
          })
          raw = await response.json().catch(() => null)
          qrCode = extractQrCode(raw)
        }
      }

      await configureEvolutionWebhookForTenant(tenantId).catch(() => false)
      res.json({ qrCode, state: qrCode ? 'QR_SCAN' : 'CONNECTING' })
    } catch (err) {
      next(err)
    }
  })

  router.get('/whatsapp/diagnostics', requireRole('ADMIN'), async (req, res, next) => {
    try {
      const tenantId = req.sessionUser?.tenantId
      if (!tenantId) return next(badRequest('Tenant inválido', 'INVALID_TENANT'))

      const [providerWebhookConfigured, messageTimes, audience, health] = await Promise.all([
        evolutionWebhookConfiguredForTenant(tenantId),
        Promise.resolve(db.prepare(`
          SELECT
            MAX(CASE WHEN direction = 'INBOUND' THEN sent_at END) as lastInboundAt,
            MAX(CASE WHEN direction = 'OUTBOUND' THEN sent_at END) as lastOutboundAt
          FROM whatsapp_messages
          WHERE tenant_id = ?
        `).get(tenantId) as { lastInboundAt: string | null; lastOutboundAt: string | null } | undefined),
        Promise.resolve(db.prepare(`
          SELECT COUNT(*) as totalClients,
                 SUM(CASE WHEN marketing_whatsapp_opt_in = 1 THEN 1 ELSE 0 END) as optedInClients
          FROM clients
          WHERE tenant_id = ?
        `).get(tenantId) as { totalClients: number; optedInClients: number | null } | undefined),
        Promise.resolve(db.prepare(`
          SELECT connection_state as connectionState, last_health_check_at as lastHealthCheckAt,
                 last_connected_at as lastConnectedAt, last_connection_error as lastConnectionError,
                 reconnect_attempts as reconnectAttempts, reconnect_after as reconnectAfter,
                 webhook_last_at as webhookLastAt
          FROM whatsapp_instances WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1
        `).get(tenantId) as {
          connectionState: string | null
          lastHealthCheckAt: string | null
          lastConnectedAt: string | null
          lastConnectionError: string | null
          reconnectAttempts: number
          reconnectAfter: string | null
          webhookLastAt: string | null
        } | undefined),
      ])

      res.json({
        providerWebhookConfigured,
        lastInboundAt: messageTimes?.lastInboundAt ?? null,
        lastOutboundAt: messageTimes?.lastOutboundAt ?? null,
        totalClients: Number(audience?.totalClients ?? 0),
        optedInClients: Number(audience?.optedInClients ?? 0),
        connectionState: health?.connectionState ?? null,
        lastHealthCheckAt: health?.lastHealthCheckAt ?? null,
        lastConnectedAt: health?.lastConnectedAt ?? null,
        lastConnectionError: health?.lastConnectionError ?? null,
        reconnectAttempts: Number(health?.reconnectAttempts ?? 0),
        reconnectAfter: health?.reconnectAfter ?? null,
        webhookLastAt: health?.webhookLastAt ?? null,
      })
    } catch (err) {
      next(err)
    }
  })

  return router
}
