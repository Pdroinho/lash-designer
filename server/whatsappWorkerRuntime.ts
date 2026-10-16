import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { renderMarketingCampaignMessage } from './marketingCampaign.js'
import { normalizeWhatsappMediaPayload, resolvePrivateWhatsappMediaPath, safeWhatsappMediaRelativePath } from './whatsappMedia.js'
import { normalizeEvolutionConnectionState } from './whatsappWebhook.js'
import type { MarketingCampaignRow } from './routes/adminWhatsappCampaignRoutes.js'

type TimerHandle = { unref: () => unknown }

type WorkerScheduler = {
  setInterval: (callback: () => void, delayMs: number) => TimerHandle
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle
  clearInterval: (handle: TimerHandle) => void
  clearTimeout: (handle: TimerHandle) => void
}

type WhatsappWorkerConfig = {
  baseUrl: string | null
  apiKey: string | null
  instanceName: string | null
}

type SendWhatsappText = (
  tenantId: string,
  phone: string,
  text: string,
  options?: {
    mediaDataUrl?: string | null
    source?: 'AUTOMATION' | 'MANUAL' | 'SYSTEM'
    purpose?: 'MARKETING' | 'APPOINTMENT_AUTOMATION' | 'MANUAL' | 'SYSTEM'
    displayName?: string | null
    onProviderMessageId?: (id: string | null) => void
  },
) => Promise<boolean>

type WhatsappWorkerRuntimeOptions = {
  db: Database.Database
  mediaDir: string
  campaignsEnabled: boolean
  campaignSendIntervalSeconds: number
  requireWhatsappConfig: (tenantId: string) => WhatsappWorkerConfig | undefined
  resolveExternalHttpsBaseUrl: (rawUrl: string) => Promise<string>
  sendWhatsappTextForTenant: SendWhatsappText
  now?: () => Date
  fetchFn?: typeof fetch
  scheduler?: WorkerScheduler
  logger?: Pick<Console, 'error'>
}

const defaultScheduler: WorkerScheduler = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createWhatsappWorkerRuntime({
  db,
  mediaDir,
  campaignsEnabled,
  campaignSendIntervalSeconds,
  requireWhatsappConfig,
  resolveExternalHttpsBaseUrl,
  sendWhatsappTextForTenant,
  now = () => new Date(),
  fetchFn = fetch,
  scheduler = defaultScheduler,
  logger = console,
}: WhatsappWorkerRuntimeOptions) {
  let healthRunning = false
  let mediaRunning = false
  let marketingRunning = false
  let healthInterval: TimerHandle | null = null
  let healthStartup: TimerHandle | null = null
  let mediaInterval: TimerHandle | null = null
  let mediaStartup: TimerHandle | null = null
  let marketingInterval: TimerHandle | null = null
  let marketingStartup: TimerHandle | null = null

  const fetchEvolutionConnectionState = async (tenantId: string) => {
    const config = requireWhatsappConfig(tenantId)
    if (!config?.baseUrl || !config.apiKey || !config.instanceName) return { state: null, config: null }
    const response = await fetchFn(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/instance/connectionState/${encodeURIComponent(config.instanceName)}`, {
      headers: { apikey: config.apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null)
    if (!response?.ok) return { state: null, config }
    const raw = await response.json().catch(() => null)
    const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const instance = root.instance && typeof root.instance === 'object' ? root.instance as Record<string, unknown> : {}
    return { state: normalizeEvolutionConnectionState(instance.state ?? root.state), config }
  }

  const processConnectionHealth = async () => {
    if (healthRunning) return
    healthRunning = true
    try {
      const referenceTime = now()
      const staleClaim = new Date(referenceTime.getTime() - 5 * 60_000).toISOString()
      const rows = db.prepare(`
        SELECT tenant_id as tenantId, instance_name as instanceName, reconnect_attempts as reconnectAttempts,
               reconnect_after as reconnectAfter, reconnect_claimed_at as reconnectClaimedAt
        FROM whatsapp_instances
        WHERE instance_name IS NOT NULL AND instance_name <> ''
        ORDER BY COALESCE(last_health_check_at, created_at) ASC
        LIMIT 60
      `).all() as Array<{ tenantId: string; instanceName: string; reconnectAttempts: number; reconnectAfter: string | null; reconnectClaimedAt: string | null }>

      for (const row of rows) {
        const checkedAt = now().toISOString()
        const health = await fetchEvolutionConnectionState(row.tenantId)
        if (health.state === 'CONNECTED') {
          db.prepare(`
            UPDATE whatsapp_instances
            SET connection_state = 'CONNECTED', last_health_check_at = ?, last_connected_at = ?, last_connection_error = NULL,
                reconnect_attempts = 0, reconnect_after = NULL, reconnect_claimed_at = NULL, updated_at = ?
            WHERE tenant_id = ? AND instance_name = ?
          `).run(checkedAt, checkedAt, checkedAt, row.tenantId, row.instanceName)
          continue
        }

        if (health.state === 'CONNECTING') {
          db.prepare(`UPDATE whatsapp_instances SET connection_state = 'CONNECTING', last_health_check_at = ?, reconnect_claimed_at = NULL, updated_at = ? WHERE tenant_id = ? AND instance_name = ?`)
            .run(checkedAt, checkedAt, row.tenantId, row.instanceName)
          continue
        }

        const nextAttempts = Math.min(12, Number(row.reconnectAttempts || 0) + 1)
        const retryAllowed = !row.reconnectAfter || new Date(row.reconnectAfter).getTime() <= referenceTime.getTime()
        const cooldownMinutes = Math.min(60, 2 ** Math.min(5, Math.max(0, nextAttempts - 1)) * 2)
        const retryAt = new Date(referenceTime.getTime() + cooldownMinutes * 60_000).toISOString()
        const healthError = health.state === 'DISCONNECTED' ? 'Provider informou conexão fechada' : 'Falha ao consultar estado da conexão'
        db.prepare(`
          UPDATE whatsapp_instances
          SET connection_state = ?, last_health_check_at = ?, last_connection_error = ?, reconnect_attempts = ?,
              reconnect_after = COALESCE(reconnect_after, ?), reconnect_claimed_at = NULL, updated_at = ?
          WHERE tenant_id = ? AND instance_name = ?
        `).run(health.state ?? 'UNKNOWN', checkedAt, healthError, nextAttempts, retryAt, checkedAt, row.tenantId, row.instanceName)

        if (!retryAllowed || nextAttempts < 2 || !health.config?.baseUrl || !health.config.apiKey) continue
        const claimed = db.prepare(`
          UPDATE whatsapp_instances
          SET reconnect_claimed_at = ?, reconnect_after = ?, updated_at = ?
          WHERE tenant_id = ? AND instance_name = ?
            AND (reconnect_claimed_at IS NULL OR reconnect_claimed_at < ?)
            AND (reconnect_after IS NULL OR reconnect_after <= ?)
        `).run(checkedAt, retryAt, checkedAt, row.tenantId, row.instanceName, staleClaim, checkedAt)
        if (!claimed.changes) continue

        try {
          const response = await fetchFn(`${await resolveExternalHttpsBaseUrl(health.config.baseUrl)}/instance/connect/${encodeURIComponent(row.instanceName)}`, {
            headers: { apikey: health.config.apiKey },
            redirect: 'error',
            signal: AbortSignal.timeout(12_000),
          })
          if (!response.ok) throw new Error(`Evolution connect HTTP ${response.status}`)
          db.prepare(`UPDATE whatsapp_instances SET connection_state = 'CONNECTING', reconnect_claimed_at = NULL, last_connection_error = NULL, updated_at = ? WHERE tenant_id = ? AND instance_name = ?`)
            .run(now().toISOString(), row.tenantId, row.instanceName)
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
          db.prepare(`UPDATE whatsapp_instances SET reconnect_claimed_at = NULL, last_connection_error = ?, reconnect_after = ?, updated_at = ? WHERE tenant_id = ? AND instance_name = ?`)
            .run(message, retryAt, now().toISOString(), row.tenantId, row.instanceName)
        }
      }
    } finally {
      healthRunning = false
    }
  }

  const processMediaQueue = async () => {
    if (mediaRunning) return
    mediaRunning = true
    try {
      const referenceTime = now()
      const rows = db.prepare(`
        SELECT id, tenant_id as tenantId, provider_message_id as providerMessageId,
               media_remote_jid as remoteJid, media_attempts as attempts
        FROM whatsapp_messages
        WHERE direction = 'INBOUND'
          AND media_status IN ('PENDING','FAILED')
          AND provider_message_id IS NOT NULL
          AND media_remote_jid IS NOT NULL
          AND media_attempts < 5
          AND (media_next_attempt_at IS NULL OR media_next_attempt_at <= ?)
        ORDER BY sent_at ASC
        LIMIT 12
      `).all(referenceTime.toISOString()) as Array<{ id: string; tenantId: string; providerMessageId: string; remoteJid: string; attempts: number }>

      for (const row of rows) {
        const config = requireWhatsappConfig(row.tenantId)
        if (!config?.baseUrl || !config.apiKey || !config.instanceName) {
          db.prepare(`UPDATE whatsapp_messages SET media_status = 'FAILED', media_attempts = media_attempts + 1, media_last_error = ?, media_next_attempt_at = ?, status_updated_at = ? WHERE id = ? AND tenant_id = ?`)
            .run('Integração Evolution indisponível', new Date(referenceTime.getTime() + 30 * 60_000).toISOString(), now().toISOString(), row.id, row.tenantId)
          continue
        }
        try {
          const response = await fetchFn(`${await resolveExternalHttpsBaseUrl(config.baseUrl)}/chat/getBase64FromMediaMessage/${encodeURIComponent(config.instanceName)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
            redirect: 'error',
            signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({ message: { key: { id: row.providerMessageId, remoteJid: row.remoteJid, fromMe: false } }, convertToMp4: false }),
          })
          if (!response.ok) throw new Error(`Evolution media HTTP ${response.status}`)
          const raw = await response.json().catch(() => null)
          const media = normalizeWhatsappMediaPayload(raw)
          if (!media) throw new Error('Mídia vazia, inválida ou acima de 8 MB')
          const relativePath = safeWhatsappMediaRelativePath(row.tenantId, row.id, media.extension)
          const absolutePath = resolvePrivateWhatsappMediaPath(mediaDir, relativePath)
          await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o750 })
          await writeFile(absolutePath, media.buffer, { mode: 0o640 })
          db.prepare(`
            UPDATE whatsapp_messages
            SET media_status = 'READY', media_mime_type = ?, media_file_name = ?, media_size_bytes = ?, media_storage_path = ?,
                media_last_error = NULL, media_next_attempt_at = NULL, status_updated_at = ?
            WHERE id = ? AND tenant_id = ?
          `).run(media.mime, media.fileName, media.buffer.length, relativePath, now().toISOString(), row.id, row.tenantId)
        } catch (error) {
          const attempts = Number(row.attempts || 0) + 1
          const retryMinutes = Math.min(120, 2 ** Math.max(0, attempts - 1) * 5)
          const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
          db.prepare(`
            UPDATE whatsapp_messages
            SET media_status = 'FAILED', media_attempts = ?, media_last_error = ?, media_next_attempt_at = ?, status_updated_at = ?
            WHERE id = ? AND tenant_id = ?
          `).run(attempts, message, attempts >= 5 ? null : new Date(referenceTime.getTime() + retryMinutes * 60_000).toISOString(), now().toISOString(), row.id, row.tenantId)
        }
      }
    } finally {
      mediaRunning = false
    }
  }

  // Fail closed: an unconfirmed send must never be automatically repeated.
  const stopCampaign = (campaignId: string, recipientId: string, message: string) => {
    db.transaction(() => {
      const changed = db.prepare("UPDATE whatsapp_marketing_recipients SET status='FAILED',last_error=?,claimed_at=NULL,next_attempt_at=NULL WHERE id=? AND status='SENDING'").run(message, recipientId).changes
      const skipped = db.prepare("UPDATE whatsapp_marketing_recipients SET status='SKIPPED',last_error='Campanha interrompida',next_attempt_at=NULL WHERE campaign_id=? AND status='PENDING'").run(campaignId).changes
      db.prepare("UPDATE whatsapp_marketing_campaigns SET status=CASE WHEN status='CANCELLED' THEN status ELSE 'FAILED' END,failed_count=failed_count+?,skipped_count=skipped_count+?,last_error=?,completed_at=COALESCE(completed_at,?) WHERE id=?").run(changed, skipped, message, now().toISOString(), campaignId)
    }).immediate()
  }

  const processMarketingCampaignQueue = async () => {
    if (!campaignsEnabled || marketingRunning) return
    marketingRunning = true
    try {
      const referenceTime = now(), currentTime = referenceTime.toISOString()
      const stale = db.prepare("SELECT id,campaign_id as campaignId FROM whatsapp_marketing_recipients WHERE status='SENDING' AND (claimed_at IS NULL OR claimed_at<?)").all(new Date(referenceTime.getTime()-5*60000).toISOString()) as Array<{id:string;campaignId:string}>
      for (const row of stale) stopCampaign(row.campaignId,row.id,'Envio anterior não confirmado. A campanha foi interrompida para evitar mensagens repetidas. Confira o WhatsApp antes de tentar novamente.')
      const expired = db.prepare("SELECT id FROM whatsapp_marketing_campaigns c WHERE status IN ('QUEUED','RUNNING') AND created_at<? AND NOT EXISTS(SELECT 1 FROM whatsapp_marketing_recipients r WHERE r.campaign_id=c.id AND r.status='SENDING')").all(new Date(referenceTime.getTime()-86400000).toISOString()) as Array<{id:string}>
      for (const row of expired) db.transaction(()=>{const skipped=db.prepare("UPDATE whatsapp_marketing_recipients SET status='SKIPPED',last_error='Campanha expirada' WHERE campaign_id=? AND status='PENDING'").run(row.id).changes;db.prepare("UPDATE whatsapp_marketing_campaigns SET status='FAILED',skipped_count=skipped_count+?,completed_at=?,last_error='Esta campanha expirou. Confira a mensagem antes de preparar uma nova.' WHERE id=? AND status IN ('QUEUED','RUNNING')").run(skipped,currentTime,row.id)})()
      const campaign = db.prepare(`
        SELECT c.id,c.tenant_id as tenantId,c.name,c.message_text as messageText,c.image_data_url as imageDataUrl,c.status
        FROM whatsapp_marketing_campaigns c
        WHERE c.status IN ('QUEUED','RUNNING')
          AND EXISTS (SELECT 1 FROM tenants t JOIN subscriptions s ON s.tenant_id=t.id WHERE t.id=c.tenant_id AND t.status='ACTIVE' AND s.status='ACTIVE' AND (s.current_period_end IS NULL OR s.current_period_end>?))
          AND EXISTS (SELECT 1 FROM whatsapp_settings w WHERE w.tenant_id=c.tenant_id AND w.promo_enabled=1)
        ORDER BY COALESCE((SELECT next_allowed_at FROM whatsapp_campaign_delivery_guard g WHERE g.tenant_id=c.tenant_id),c.created_at) ASC LIMIT 1
      `).get(currentTime) as MarketingCampaignRow | undefined
      if (!campaign) return
      const recipient = db.prepare(`SELECT r.id,r.client_user_id as clientUserId,r.phone_normalized as phone,r.client_name as clientName,t.name as tenantName FROM whatsapp_marketing_recipients r JOIN tenants t ON t.id=r.tenant_id WHERE r.campaign_id=? AND r.tenant_id=? AND r.status='PENDING' ORDER BY r.created_at LIMIT 1`).get(campaign.id,campaign.tenantId) as {id:string;clientUserId:string;phone:string;clientName:string;tenantName:string} | undefined
      if (!recipient) {
        if (!(db.prepare("SELECT id FROM whatsapp_marketing_recipients WHERE campaign_id=? AND status='SENDING'").get(campaign.id))) db.prepare("UPDATE whatsapp_marketing_campaigns SET status='COMPLETED',completed_at=? WHERE id=? AND status IN ('QUEUED','RUNNING')").run(currentTime,campaign.id)
        return
      }
      const acquired = db.transaction(() => {
        db.prepare("INSERT OR IGNORE INTO whatsapp_campaign_delivery_guard(tenant_id,next_allowed_at) VALUES(?,?)").run(campaign.tenantId,currentTime)
        const guard = db.prepare("UPDATE whatsapp_campaign_delivery_guard SET next_allowed_at=? WHERE tenant_id=? AND next_allowed_at<=? AND NOT EXISTS(SELECT 1 FROM whatsapp_marketing_recipients WHERE tenant_id=? AND status='SENDING')").run(new Date(referenceTime.getTime()+Math.max(60,campaignSendIntervalSeconds)*1000).toISOString(),campaign.tenantId,currentTime,campaign.tenantId)
        if (!guard.changes) return false
        const claim = db.prepare("UPDATE whatsapp_marketing_recipients SET status='SENDING',claimed_at=? WHERE id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM whatsapp_marketing_campaigns WHERE id=? AND status IN ('QUEUED','RUNNING'))").run(currentTime,recipient.id,campaign.id)
        if (!claim.changes) return false
        db.prepare("UPDATE whatsapp_marketing_campaigns SET status='RUNNING',started_at=COALESCE(started_at,?) WHERE id=? AND status='QUEUED'").run(currentTime,campaign.id)
        return true
      }).immediate()
      if (!acquired) return
      const consent = db.prepare('SELECT marketing_whatsapp_opt_in as optedIn,phone_normalized as phone FROM clients WHERE tenant_id=? AND user_id=?').get(campaign.tenantId,recipient.clientUserId) as {optedIn:number;phone:string}|undefined
      const recent = db.prepare('SELECT id FROM whatsapp_marketing_recipients WHERE tenant_id=? AND phone_normalized=? AND id<>? AND dispatch_started_at>=?').get(campaign.tenantId,recipient.phone,recipient.id,new Date(referenceTime.getTime()-7*86400000).toISOString())
      if (!consent?.optedIn || consent.phone !== recipient.phone || recent) {
        db.transaction(()=>{ db.prepare("UPDATE whatsapp_marketing_recipients SET status='SKIPPED',claimed_at=NULL,last_error='Autorização ausente, contato alterado ou campanha recente' WHERE id=?").run(recipient.id);db.prepare('UPDATE whatsapp_marketing_campaigns SET skipped_count=skipped_count+1 WHERE id=?').run(campaign.id) })()
        return
      }
      const daily = db.prepare('SELECT COUNT(*) as n FROM whatsapp_marketing_recipients WHERE tenant_id=? AND dispatch_started_at>=?').get(campaign.tenantId,new Date(referenceTime.getTime()-86400000).toISOString()) as {n:number}
      if (daily.n >= 50) { db.prepare("UPDATE whatsapp_marketing_recipients SET status='PENDING',claimed_at=NULL WHERE id=? AND status='SENDING'").run(recipient.id);return }
      const text = renderMarketingCampaignMessage(campaign.messageText,{clientName:recipient.clientName,tenantName:recipient.tenantName})
      if (text.length > (campaign.imageDataUrl ? 1024 : 4096)) { stopCampaign(campaign.id,recipient.id,'A mensagem ficou longa após incluir os nomes. Encurte o texto antes de preparar outra campanha.');return }
      const health = await fetchEvolutionConnectionState(campaign.tenantId)
      if (health.state !== 'CONNECTED') {
        const cancelled = db.prepare("SELECT id FROM whatsapp_marketing_campaigns WHERE id=? AND status='CANCELLED'").get(campaign.id)
        if (cancelled) { db.transaction(()=>{const changed=db.prepare("UPDATE whatsapp_marketing_recipients SET status='SKIPPED',claimed_at=NULL WHERE id=? AND status='SENDING'").run(recipient.id).changes;db.prepare('UPDATE whatsapp_marketing_campaigns SET skipped_count=skipped_count+? WHERE id=?').run(changed,campaign.id)})();return }
        db.prepare("UPDATE whatsapp_marketing_recipients SET status='PENDING',claimed_at=NULL WHERE id=? AND status='SENDING'").run(recipient.id)
        db.prepare("UPDATE whatsapp_marketing_campaigns SET last_error='Aguardando a conexão do WhatsApp para continuar.' WHERE id=? AND status IN ('QUEUED','RUNNING')").run(campaign.id)
        return
      }
      // Re-check cancellation and opt-out after the provider health request.
      if (!db.prepare("SELECT r.id FROM whatsapp_marketing_recipients r JOIN whatsapp_marketing_campaigns c ON c.id=r.campaign_id JOIN clients cl ON cl.tenant_id=r.tenant_id AND cl.user_id=r.client_user_id WHERE r.id=? AND r.status='SENDING' AND c.status IN ('QUEUED','RUNNING') AND cl.marketing_whatsapp_opt_in=1 AND cl.phone_normalized=r.phone_normalized").get(recipient.id)) {
        db.transaction(()=>{const changed=db.prepare("UPDATE whatsapp_marketing_recipients SET status='SKIPPED',claimed_at=NULL WHERE id=? AND status='SENDING'").run(recipient.id).changes;db.prepare('UPDATE whatsapp_marketing_campaigns SET skipped_count=skipped_count+? WHERE id=?').run(changed,campaign.id)})();return
      }
      db.prepare('UPDATE whatsapp_marketing_recipients SET attempts=attempts+1,dispatch_started_at=? WHERE id=?').run(currentTime,recipient.id)
      let providerMessageId: string | null = null, delivered = false
      try { delivered = await sendWhatsappTextForTenant(campaign.tenantId,recipient.phone,text,{source:'AUTOMATION',purpose: 'MARKETING',mediaDataUrl:campaign.imageDataUrl,displayName:recipient.clientName,onProviderMessageId:id=>{providerMessageId=id}}) } catch { /* Uncertain acceptance: stop, never replay. */ }
      if (!delivered) { stopCampaign(campaign.id,recipient.id,'O WhatsApp não confirmou o envio. A campanha foi interrompida e esta mensagem não será repetida automaticamente. Confira a conexão e o celular.');return }
      db.transaction(()=>{
        const changed = db.prepare("UPDATE whatsapp_marketing_recipients SET status='SENT',provider_message_id=?,sent_at=?,claimed_at=NULL,last_error=NULL WHERE id=? AND status='SENDING'").run(providerMessageId,now().toISOString(),recipient.id).changes
        db.prepare('UPDATE whatsapp_marketing_campaigns SET sent_count=sent_count+?,last_error=NULL WHERE id=?').run(changed,campaign.id)
      }).immediate()
    } catch (error) { logger.error('[WhatsAppCampaignWorker]',error) }
    finally { marketingRunning=false }
  }

  const runSafely = (label: string, worker: () => Promise<void>) => {
    void worker().catch(error => logger.error(label, error))
  }

  const start = () => {
    if (healthInterval || healthStartup || mediaInterval || mediaStartup || marketingInterval || marketingStartup) return
    healthInterval = scheduler.setInterval(() => runSafely('[WhatsApp] falha no health worker', processConnectionHealth), 2 * 60_000)
    healthInterval.unref()
    healthStartup = scheduler.setTimeout(() => {
      healthStartup = null
      runSafely('[WhatsApp] falha no bootstrap de health', processConnectionHealth)
    }, 18_000)
    healthStartup.unref()
    mediaInterval = scheduler.setInterval(() => runSafely('[WhatsApp] falha no worker de mídia', processMediaQueue), 30_000)
    mediaInterval.unref()
    mediaStartup = scheduler.setTimeout(() => {
      mediaStartup = null
      runSafely('[WhatsApp] falha no bootstrap de mídia', processMediaQueue)
    }, 20_000)
    mediaStartup.unref()
    marketingInterval = scheduler.setInterval(() => runSafely('[WhatsApp] falha no worker de campanhas', processMarketingCampaignQueue), Math.max(60,campaignSendIntervalSeconds) * 1000)
    marketingInterval.unref()
    marketingStartup = scheduler.setTimeout(() => {
      marketingStartup = null
      runSafely('[WhatsApp] falha no bootstrap de campanhas', processMarketingCampaignQueue)
    }, 22_000)
    marketingStartup.unref()
  }

  const stop = () => {
    if (healthInterval) scheduler.clearInterval(healthInterval)
    if (healthStartup) scheduler.clearTimeout(healthStartup)
    if (mediaInterval) scheduler.clearInterval(mediaInterval)
    if (mediaStartup) scheduler.clearTimeout(mediaStartup)
    if (marketingInterval) scheduler.clearInterval(marketingInterval)
    if (marketingStartup) scheduler.clearTimeout(marketingStartup)
    healthInterval = null
    healthStartup = null
    mediaInterval = null
    mediaStartup = null
    marketingInterval = null
    marketingStartup = null
  }

  return {
    fetchEvolutionConnectionState,
    processConnectionHealth,
    processMediaQueue,
    processMarketingCampaignQueue,
    start,
    stop,
  }
}
