import Database from 'better-sqlite3'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { requireRole } from '../auth.js'
import { resolveExternalHttpsBaseUrl } from '../externalUrl.js'
import { badRequest } from '../http.js'
import { normalizeEvolutionConnectionState } from '../whatsappWebhook.js'

type PlatformEvolutionConfig = {
  baseUrl: string | null
  apiKey: string | null
  instanceName: string
}

type DevEvolutionRouterOptions = {
  db: Database.Database
  requireDevHost: RequestHandler
  platformEvolutionConfig: () => PlatformEvolutionConfig
  platformEvolutionDefaultInstanceName: string
  encryptPlatformApiKey: (apiKey: string) => string
}

export const extractQrCode = (value: unknown): string | null => {
  if (!value) return null
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    if (normalized.startsWith('data:image/')) return normalized
    if (/^[A-Za-z0-9+/=]+$/.test(normalized) && normalized.length > 100) return `data:image/png;base64,${normalized}`
    return null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractQrCode(item)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['qrCode', 'qrcode', 'qr', 'base64', 'code']) {
      const found = extractQrCode(record[key])
      if (found) return found
    }
    for (const key of Object.keys(record)) {
      const found = extractQrCode(record[key])
      if (found) return found
    }
  }
  return null
}

export function createDevEvolutionRouter(options: DevEvolutionRouterOptions) {
  const {
    db,
    requireDevHost,
    platformEvolutionConfig,
    platformEvolutionDefaultInstanceName,
    encryptPlatformApiKey,
  } = options
  const router = Router()

  router.get('/evolution/config', requireDevHost, requireRole('DEV'), (_req, res, next) => {
    try {
      const config = platformEvolutionConfig()
      res.json({
        config: {
          url: config.baseUrl ?? '',
          instanceName: config.instanceName,
          hasApiKey: Boolean(config.apiKey),
        },
      })
    } catch (err) {
      next(err)
    }
  })

  router.put('/evolution/config', requireDevHost, requireRole('DEV'), async (req, res, next) => {
    try {
      const body = z.object({
        url: z.string().trim().min(1).max(500).optional(),
        apiKey: z.string().trim().min(16).max(500).optional(),
      }).strict().parse(req.body ?? {})
      if (!body.url && !body.apiKey) throw badRequest('Nada para atualizar', 'NO_UPDATES')

      const normalizedUrl = body.url ? await resolveExternalHttpsBaseUrl(body.url) : null
      const now = new Date().toISOString()
      const stmt = db.prepare(`
        INSERT INTO platform_settings (key, value, encrypted, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, encrypted = excluded.encrypted, updated_at = excluded.updated_at
      `)
      db.transaction(() => {
        if (normalizedUrl) stmt.run('evolution_api_url', normalizedUrl, 0, now)
        if (body.apiKey) stmt.run('evolution_api_key', encryptPlatformApiKey(body.apiKey), 1, now)
        stmt.run('evolution_instance_name', platformEvolutionDefaultInstanceName, 0, now)
      })()
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  router.get('/evolution/status', requireDevHost, requireRole('DEV'), async (_req, res, next) => {
    try {
      const config = platformEvolutionConfig()
      if (!config.baseUrl || !config.apiKey) {
        res.json({ state: 'NOT_CONFIGURED', instanceName: config.instanceName })
        return
      }
      const response = await fetch(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/instance/connectionState/${encodeURIComponent(config.instanceName)}`, {
        headers: { apikey: config.apiKey },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null)
      if (!response) {
        res.json({ state: 'OFFLINE', instanceName: config.instanceName })
        return
      }
      const raw = await response.json().catch(() => null)
      const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
      const instance = root.instance && typeof root.instance === 'object' ? root.instance as Record<string, unknown> : {}
      const state = normalizeEvolutionConnectionState(instance.state ?? root.state) ?? (response.ok ? 'UNKNOWN' : 'OFFLINE')
      res.json({ state, instanceName: config.instanceName })
    } catch (err) {
      next(err)
    }
  })

  router.post('/evolution/connect', requireDevHost, requireRole('DEV'), async (_req, res, next) => {
    try {
      const config = platformEvolutionConfig()
      if (!config.baseUrl || !config.apiKey) throw badRequest('Configure URL e API Key da Evolution primeiro.', 'EVOLUTION_GLOBAL_NOT_CONFIGURED')
      const baseUrl = await resolveExternalHttpsBaseUrl(config.baseUrl)
      const headers = { apikey: config.apiKey, 'Content-Type': 'application/json' }
      const encodedInstance = encodeURIComponent(config.instanceName)
      const connectUrl = `${baseUrl}/instance/connect/${encodedInstance}`

      const stateResponse = await fetch(`${baseUrl}/instance/connectionState/${encodedInstance}`, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null)
      const stateRaw = stateResponse ? await stateResponse.json().catch(() => null) : null
      const stateRoot = stateRaw && typeof stateRaw === 'object' ? stateRaw as Record<string, unknown> : {}
      const stateInstance = stateRoot.instance && typeof stateRoot.instance === 'object' ? stateRoot.instance as Record<string, unknown> : {}
      const currentState = normalizeEvolutionConnectionState(stateInstance.state ?? stateRoot.state)

      if (currentState === 'CONNECTED') {
        const restartResponse = await fetch(`${baseUrl}/instance/restart/${encodedInstance}`, {
          method: 'POST',
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(12_000),
        }).catch(() => null)
        if (!restartResponse?.ok) throw badRequest('Não foi possível reconectar a instância global.', 'EVOLUTION_GLOBAL_RECONNECT_FAILED')
        const restartRaw = await restartResponse.json().catch(() => null)
        const restartRoot = restartRaw && typeof restartRaw === 'object' ? restartRaw as Record<string, unknown> : {}
        const restartInstance = restartRoot.instance && typeof restartRoot.instance === 'object' ? restartRoot.instance as Record<string, unknown> : {}
        const restartState = normalizeEvolutionConnectionState(restartInstance.status ?? restartInstance.state ?? restartRoot.state) ?? 'CONNECTING'
        res.json({ state: restartState, qrCode: null, instanceName: config.instanceName })
        return
      }

      let response = await fetch(connectUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(12_000) }).catch(() => null)
      let raw = response ? await response.json().catch(() => null) : null
      let qrCode = extractQrCode(raw)

      if (!response?.ok || !qrCode) {
        const createResponse = await fetch(`${baseUrl}/instance/create`, {
          method: 'POST',
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({ instanceName: config.instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
        }).catch(() => null)
        const createRaw = createResponse ? await createResponse.json().catch(() => null) : null
        qrCode = extractQrCode(createRaw)

        if (!createResponse?.ok && !response?.ok) {
          throw badRequest('Não foi possível criar ou conectar a instância global.', 'EVOLUTION_GLOBAL_CONNECT_FAILED')
        }
        if (!qrCode) {
          response = await fetch(connectUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(12_000) }).catch(() => null)
          raw = response ? await response.json().catch(() => null) : null
          qrCode = extractQrCode(raw)
        }
      }

      res.json({ state: qrCode ? 'QR_SCAN' : 'CONNECTING', qrCode, instanceName: config.instanceName })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/evolution/disconnect', requireDevHost, requireRole('DEV'), async (_req, res, next) => {
    try {
      const config = platformEvolutionConfig()
      if (!config.baseUrl || !config.apiKey) throw badRequest('Evolution API Global não configurada.', 'EVOLUTION_GLOBAL_NOT_CONFIGURED')
      const response = await fetch(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/instance/logout/${encodeURIComponent(config.instanceName)}`, {
        method: 'DELETE',
        headers: { apikey: config.apiKey },
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      }).catch(() => null)
      if (!response?.ok) throw badRequest('Não foi possível desconectar a instância global.', 'EVOLUTION_GLOBAL_DISCONNECT_FAILED')
      res.json({ ok: true, state: 'DISCONNECTED' })
    } catch (err) {
      next(err)
    }
  })

  return router
}
