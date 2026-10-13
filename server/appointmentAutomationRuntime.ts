import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export type AppointmentConfirmationStatus =
  | 'NOT_REQUESTED'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'NO_RESPONSE'
  | 'DELIVERY_FAILED'
  | 'MANUALLY_CONFIRMED'

export type AppointmentAutomationKind =
  | 'CONFIRMATION_REQUEST'
  | 'CONFIRMATION_RETRY'
  | 'NO_RESPONSE_CUTOFF'
  | 'APPOINTMENT_REMINDER'

export type ConfirmationAppointmentRow = {
  id: string
  tenantId: string
  startsAt: string
  status: string
  confirmationStatus: AppointmentConfirmationStatus
  confirmationCode: string | null
  confirmationSentAt: string | null
  clientName: string | null
  clientPhone: string | null
  clientPhoneNormalized: string | null
  serviceName: string
  professionalName?: string | null
  tenantName: string
  timeZone: string
}

type AppointmentAutomationSettings = {
  confirmationsEnabled: boolean
  confirmationOffsetHours: number
  confirmationRetryHours: number
  noResponseCutoffHours: number
  confirmationMessage: string
  remindersEnabled: boolean
  reminderOffsetHours: number
  reminderMessage: string
}

type TimerHandle = { unref: () => unknown }

type RuntimeScheduler = {
  setInterval: (callback: () => void, delayMs: number) => TimerHandle
  setTimeout: (callback: () => void, delayMs: number) => TimerHandle
  clearInterval: (handle: TimerHandle) => void
  clearTimeout: (handle: TimerHandle) => void
}

type AppointmentAutomationRuntimeOptions = {
  db: Database.Database
  getSettings: (tenantId: string) => AppointmentAutomationSettings
  configureWebhook: (tenantId: string) => Promise<boolean>
  sendWhatsappText: (
    tenantId: string,
    phone: string,
    text: string,
    options?: {
      purpose?: 'MARKETING' | 'APPOINTMENT_AUTOMATION' | 'MANUAL' | 'SYSTEM'
      onProviderMessageId?: (id: string | null) => void
    },
  ) => Promise<boolean>
  now?: () => Date
  randomId?: () => string
  batchLimit?: number
  startupDelayMs?: number
  scheduler?: RuntimeScheduler
  logger?: Pick<Console, 'error'>
}

type AutomationJob = {
  id: string
  tenantId: string
  appointmentId: string
  kind: AppointmentAutomationKind
  attempts: number
}

const defaultScheduler: RuntimeScheduler = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
  clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createAppointmentAutomationRuntime({
  db,
  getSettings,
  configureWebhook,
  sendWhatsappText,
  now = () => new Date(),
  randomId = randomUUID,
  batchLimit = 30,
  startupDelayMs = 12_000,
  scheduler = defaultScheduler,
  logger = console,
}: AppointmentAutomationRuntimeOptions) {
  let running = false
  let intervalTimer: TimerHandle | null = null
  let startupTimer: TimerHandle | null = null

  const confirmationEvent = (input: {
    tenantId: string
    appointmentId: string
    eventType: string
    channel?: string
    providerMessageId?: string | null
    details?: unknown
  }) => {
    db.prepare(`
      INSERT OR IGNORE INTO appointment_confirmation_events
        (id, tenant_id, appointment_id, event_type, channel, provider_message_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomId(),
      input.tenantId,
      input.appointmentId,
      input.eventType,
      input.channel ?? 'WHATSAPP',
      input.providerMessageId ?? null,
      typeof input.details === 'undefined' ? null : JSON.stringify(input.details),
      now().toISOString(),
    )
  }

  const confirmationAppointmentById = (tenantId: string, appointmentId: string) => db.prepare(`
    SELECT a.id,
           a.tenant_id as tenantId,
           a.starts_at as startsAt,
           a.status,
           a.confirmation_status as confirmationStatus,
           a.confirmation_code as confirmationCode,
           a.confirmation_sent_at as confirmationSentAt,
           c.name as clientName,
           c.phone as clientPhone,
           c.phone_normalized as clientPhoneNormalized,
           s.name as serviceName,
           p.name as professionalName,
           t.name as tenantName,
           COALESCE(ts.timezone, 'America/Sao_Paulo') as timeZone
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN tenants t ON t.id = a.tenant_id
    LEFT JOIN professionals p ON p.id = a.professional_id AND p.tenant_id = a.tenant_id
    LEFT JOIN tenant_settings ts ON ts.tenant_id = a.tenant_id
    LEFT JOIN clients c ON c.user_id = a.client_user_id AND c.tenant_id = a.tenant_id
    WHERE a.id = ? AND a.tenant_id = ?
    LIMIT 1
  `).get(appointmentId, tenantId) as ConfirmationAppointmentRow | undefined

  const formatAppointmentLocal = (iso: string, timeZone: string) => {
    const date = new Date(iso)
    const dateText = new Intl.DateTimeFormat('pt-BR', { timeZone, day: '2-digit', month: '2-digit' }).format(date)
    const timeText = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
    return { dateText, timeText }
  }

  const renderAppointmentTemplate = (template: string, appointment: ConfirmationAppointmentRow) => {
    const local = formatAppointmentLocal(appointment.startsAt, appointment.timeZone)
    const text = template
      .replaceAll('{{nome}}', appointment.clientName || 'cliente')
      .replaceAll('{{servico}}', appointment.serviceName)
      .replaceAll('{{profissional}}', appointment.professionalName || 'equipe do estúdio')
      .replaceAll('{{data}}', local.dateText)
      .replaceAll('{{hora}}', local.timeText)
      .replaceAll('{{espaco}}', appointment.tenantName)
      .replaceAll('{{codigo}}', '')
    return appointment.professionalName && !template.includes('{{profissional}}') ? `${text}\nProfissional: ${appointment.professionalName}.` : text
  }

  const sendAppointmentConfirmation = async (appointment: ConfirmationAppointmentRow, eventType: 'REQUEST_SENT' | 'RESENT') => {
    if (!appointment.clientPhone) return { ok: false as const, code: 'NO_CLIENT_PHONE' }
    const settings = getSettings(appointment.tenantId)
    if (!settings.confirmationsEnabled) return { ok: false as const, code: 'CONFIRMATIONS_DISABLED' }
    if (!(await configureWebhook(appointment.tenantId))) {
      confirmationEvent({ tenantId: appointment.tenantId, appointmentId: appointment.id, eventType: 'WEBHOOK_CONFIG_FAILED', details: { eventType } })
      return { ok: false as const, code: 'WHATSAPP_WEBHOOK_NOT_READY' }
    }

    const legacyCode = appointment.confirmationCode || null
    const text = renderAppointmentTemplate(settings.confirmationMessage, appointment)
    let outboundProviderMessageId: string | null = null
    const delivered = await sendWhatsappText(appointment.tenantId, appointment.clientPhone, text, {
      purpose: 'APPOINTMENT_AUTOMATION',
      onProviderMessageId: id => { outboundProviderMessageId = id },
    })
    if (!delivered) return { ok: false as const, code: 'WHATSAPP_DELIVERY_FAILED' }

    const currentTime = now().toISOString()
    if (eventType === 'REQUEST_SENT') {
      db.prepare(`
        UPDATE appointments
        SET confirmation_status = 'AWAITING_CONFIRMATION', confirmation_code = ?, confirmation_sent_at = ?, confirmation_reminder_sent_at = NULL
        WHERE id = ? AND tenant_id = ?
      `).run(legacyCode, currentTime, appointment.id, appointment.tenantId)
    } else if (!appointment.confirmationSentAt) {
      db.prepare(`
        UPDATE appointments
        SET confirmation_status = 'AWAITING_CONFIRMATION', confirmation_code = ?, confirmation_sent_at = ?, confirmation_reminder_sent_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(legacyCode, currentTime, currentTime, appointment.id, appointment.tenantId)
    } else {
      db.prepare(`
        UPDATE appointments
        SET confirmation_status = 'AWAITING_CONFIRMATION', confirmation_code = ?, confirmation_reminder_sent_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(legacyCode, currentTime, appointment.id, appointment.tenantId)
    }
    confirmationEvent({ tenantId: appointment.tenantId, appointmentId: appointment.id, eventType, providerMessageId: outboundProviderMessageId })
    return { ok: true as const }
  }

  const sendAppointmentReminder = async (appointment: ConfirmationAppointmentRow) => {
    if (!appointment.clientPhone) return { ok: false as const, code: 'NO_CLIENT_PHONE' }
    const settings = getSettings(appointment.tenantId)
    if (!settings.remindersEnabled) return { ok: false as const, code: 'REMINDERS_DISABLED' }
    const text = renderAppointmentTemplate(settings.reminderMessage, appointment)
    const delivered = await sendWhatsappText(appointment.tenantId, appointment.clientPhone, text, { purpose: 'APPOINTMENT_AUTOMATION' })
    if (!delivered) return { ok: false as const, code: 'WHATSAPP_DELIVERY_FAILED' }
    const currentTime = now().toISOString()
    db.prepare(`UPDATE appointments SET appointment_reminder_sent_at = ? WHERE id = ? AND tenant_id = ?`).run(currentTime, appointment.id, appointment.tenantId)
    confirmationEvent({ tenantId: appointment.tenantId, appointmentId: appointment.id, eventType: 'APPOINTMENT_REMINDER_SENT' })
    return { ok: true as const }
  }

  const upsertAutomationJob = (tenantId: string, appointmentId: string, kind: AppointmentAutomationKind, scheduledAt: Date) => {
    const currentTime = now().toISOString()
    const key = `${appointmentId}:${kind}`
    db.prepare(`
      INSERT INTO appointment_automation_jobs
        (id, tenant_id, appointment_id, kind, idempotency_key, scheduled_at, status, attempts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
      ON CONFLICT(idempotency_key) DO UPDATE SET
        scheduled_at = CASE WHEN appointment_automation_jobs.status IN ('PENDING','CANCELLED') THEN excluded.scheduled_at ELSE appointment_automation_jobs.scheduled_at END,
        status = CASE WHEN appointment_automation_jobs.status IN ('PENDING','CANCELLED') THEN 'PENDING' ELSE appointment_automation_jobs.status END,
        attempts = CASE WHEN appointment_automation_jobs.status = 'CANCELLED' THEN 0 ELSE appointment_automation_jobs.attempts END,
        claimed_at = CASE WHEN appointment_automation_jobs.status IN ('PENDING','CANCELLED') THEN NULL ELSE appointment_automation_jobs.claimed_at END,
        last_error = CASE WHEN appointment_automation_jobs.status IN ('PENDING','CANCELLED') THEN NULL ELSE appointment_automation_jobs.last_error END,
        updated_at = excluded.updated_at
    `).run(randomId(), tenantId, appointmentId, kind, key, scheduledAt.toISOString(), currentTime, currentTime)
  }

  const cancelAppointmentJobs = (tenantId: string, appointmentId: string, kinds?: AppointmentAutomationKind[]) => {
    const currentTime = now().toISOString()
    if (!kinds?.length) {
      db.prepare(`UPDATE appointment_automation_jobs SET status = 'CANCELLED', claimed_at = NULL, updated_at = ? WHERE tenant_id = ? AND appointment_id = ? AND status IN ('PENDING','FAILED','PROCESSING')`).run(currentTime, tenantId, appointmentId)
      return
    }
    const placeholders = kinds.map(() => '?').join(',')
    db.prepare(`UPDATE appointment_automation_jobs SET status = 'CANCELLED', claimed_at = NULL, updated_at = ? WHERE tenant_id = ? AND appointment_id = ? AND kind IN (${placeholders}) AND status IN ('PENDING','FAILED','PROCESSING')`)
      .run(currentTime, tenantId, appointmentId, ...kinds)
  }

  const scheduleAppointmentAutomationJobs = (tenantId: string, appointmentId: string) => {
    const appointment = confirmationAppointmentById(tenantId, appointmentId)
    if (!appointment || appointment.status === 'CANCELLED') {
      cancelAppointmentJobs(tenantId, appointmentId)
      return
    }
    const settings = getSettings(tenantId)
    const referenceTime = now()
    const startMs = new Date(appointment.startsAt).getTime()
    if (!Number.isFinite(startMs) || startMs <= referenceTime.getTime()) {
      cancelAppointmentJobs(tenantId, appointmentId)
      return
    }

    if (settings.confirmationsEnabled && !['CONFIRMED','MANUALLY_CONFIRMED','DECLINED'].includes(appointment.confirmationStatus)) {
      if (!appointment.clientPhoneNormalized) {
        if (appointment.confirmationStatus !== 'DELIVERY_FAILED') {
          db.prepare(`UPDATE appointments SET confirmation_status = 'DELIVERY_FAILED' WHERE id = ? AND tenant_id = ? AND confirmation_status NOT IN ('CONFIRMED','MANUALLY_CONFIRMED','DECLINED')`).run(appointmentId, tenantId)
          confirmationEvent({ tenantId, appointmentId, eventType: 'NO_CLIENT_PHONE' })
        }
        cancelAppointmentJobs(tenantId, appointmentId, ['CONFIRMATION_REQUEST','CONFIRMATION_RETRY','NO_RESPONSE_CUTOFF'])
      } else {
        const nowMs = referenceTime.getTime()
        const requestMs = Math.max(nowMs, startMs - settings.confirmationOffsetHours * 60 * 60_000)
        const retryMs = requestMs + settings.confirmationRetryHours * 60 * 60_000
        const cutoffMs = startMs - settings.noResponseCutoffHours * 60 * 60_000
        upsertAutomationJob(tenantId, appointmentId, 'CONFIRMATION_REQUEST', new Date(requestMs))
        if (retryMs < cutoffMs && retryMs > nowMs + 15 * 60_000) upsertAutomationJob(tenantId, appointmentId, 'CONFIRMATION_RETRY', new Date(retryMs))
        else cancelAppointmentJobs(tenantId, appointmentId, ['CONFIRMATION_RETRY'])
        if (cutoffMs > nowMs + 15 * 60_000) upsertAutomationJob(tenantId, appointmentId, 'NO_RESPONSE_CUTOFF', new Date(cutoffMs))
        else cancelAppointmentJobs(tenantId, appointmentId, ['NO_RESPONSE_CUTOFF'])
      }
    } else {
      cancelAppointmentJobs(tenantId, appointmentId, ['CONFIRMATION_REQUEST','CONFIRMATION_RETRY','NO_RESPONSE_CUTOFF'])
    }

    if (settings.remindersEnabled) {
      const reminderMs = startMs - settings.reminderOffsetHours * 60 * 60_000
      if (reminderMs > referenceTime.getTime()) upsertAutomationJob(tenantId, appointmentId, 'APPOINTMENT_REMINDER', new Date(reminderMs))
      else cancelAppointmentJobs(tenantId, appointmentId, ['APPOINTMENT_REMINDER'])
    } else {
      cancelAppointmentJobs(tenantId, appointmentId, ['APPOINTMENT_REMINDER'])
    }
  }

  const scheduleAppointmentAutomationJobsForTenant = (tenantId: string) => {
    const rows = db.prepare(`SELECT id FROM appointments WHERE tenant_id = ? AND status != 'CANCELLED' AND starts_at > ? ORDER BY starts_at ASC LIMIT 1000`).all(tenantId, now().toISOString()) as Array<{ id: string }>
    for (const row of rows) scheduleAppointmentAutomationJobs(tenantId, row.id)
  }

  const ensureUpcomingAppointmentAutomationJobs = () => {
    const referenceTime = now()
    const horizon = new Date(referenceTime.getTime() + 8 * 24 * 60 * 60_000).toISOString()
    const rows = db.prepare(`
      SELECT a.id, a.tenant_id as tenantId
      FROM appointments a
      WHERE a.status != 'CANCELLED'
        AND a.starts_at > ? AND a.starts_at <= ?
        AND NOT EXISTS (
          SELECT 1 FROM appointment_automation_jobs j
          WHERE j.tenant_id = a.tenant_id
            AND j.appointment_id = a.id
            AND j.status IN ('PENDING','PROCESSING','FAILED')
        )
      ORDER BY a.starts_at ASC
      LIMIT 300
    `).all(referenceTime.toISOString(), horizon) as Array<{ id: string; tenantId: string }>
    for (const row of rows) scheduleAppointmentAutomationJobs(row.tenantId, row.id)
  }

  const claimNextAutomationJob = () => {
    const referenceTime = now()
    const currentTime = referenceTime.toISOString()
    const stale = new Date(referenceTime.getTime() - 10 * 60_000).toISOString()
    return db.transaction(() => {
      db.prepare(`UPDATE appointment_automation_jobs SET status = 'FAILED', claimed_at = NULL, scheduled_at = ?, last_error = 'Lease expirou antes de concluir', updated_at = ? WHERE status = 'PROCESSING' AND claimed_at < ? AND attempts < 5`).run(currentTime, currentTime, stale)
      const row = db.prepare(`
        SELECT id, tenant_id as tenantId, appointment_id as appointmentId, kind, attempts
        FROM appointment_automation_jobs
        WHERE status IN ('PENDING','FAILED') AND scheduled_at <= ? AND attempts < 5
        ORDER BY scheduled_at ASC
        LIMIT 1
      `).get(currentTime) as AutomationJob | undefined
      if (!row) return undefined
      const changed = db.prepare(`UPDATE appointment_automation_jobs SET status = 'PROCESSING', attempts = attempts + 1, claimed_at = ?, updated_at = ? WHERE id = ? AND status IN ('PENDING','FAILED')`).run(currentTime, currentTime, row.id)
      return changed.changes === 1 ? { ...row, attempts: row.attempts + 1 } : undefined
    }).immediate()
  }

  const finishAutomationJob = (id: string, status: 'DONE' | 'CANCELLED' = 'DONE') => {
    db.prepare(`UPDATE appointment_automation_jobs SET status = ?, claimed_at = NULL, last_error = NULL, updated_at = ? WHERE id = ?`).run(status, now().toISOString(), id)
  }

  const failAutomationJob = (job: AutomationJob, error: unknown) => {
    const message = error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400)
    const terminal = job.attempts >= 5
    const referenceTime = now()
    const retryAt = new Date(referenceTime.getTime() + Math.min(60, 2 ** Math.max(0, job.attempts - 1) * 5) * 60_000).toISOString()
    db.prepare(`UPDATE appointment_automation_jobs SET status = 'FAILED', scheduled_at = ?, claimed_at = NULL, last_error = ?, updated_at = ? WHERE id = ?`).run(retryAt, message, referenceTime.toISOString(), job.id)
    if (terminal && job.kind === 'CONFIRMATION_REQUEST') {
      db.prepare(`UPDATE appointments SET confirmation_status = 'DELIVERY_FAILED' WHERE id = ? AND tenant_id = ? AND confirmation_status = 'NOT_REQUESTED'`).run(job.appointmentId, job.tenantId)
      confirmationEvent({ tenantId: job.tenantId, appointmentId: job.appointmentId, eventType: 'DELIVERY_FAILED', details: { reason: message } })
    }
  }

  const processAutomationJob = async (job: AutomationJob) => {
    const appointment = confirmationAppointmentById(job.tenantId, job.appointmentId)
    if (!appointment || appointment.status === 'CANCELLED' || new Date(appointment.startsAt).getTime() <= now().getTime()) {
      finishAutomationJob(job.id, 'CANCELLED')
      return
    }
    if (job.kind === 'CONFIRMATION_REQUEST') {
      if (!['NOT_REQUESTED','DELIVERY_FAILED'].includes(appointment.confirmationStatus)) return finishAutomationJob(job.id, 'CANCELLED')
      const result = await sendAppointmentConfirmation(appointment, 'REQUEST_SENT')
      if (!result.ok) throw new Error(result.code)
      return finishAutomationJob(job.id)
    }
    if (job.kind === 'CONFIRMATION_RETRY') {
      if (appointment.confirmationStatus !== 'AWAITING_CONFIRMATION') return finishAutomationJob(job.id, 'CANCELLED')
      const result = await sendAppointmentConfirmation(appointment, 'RESENT')
      if (!result.ok) throw new Error(result.code)
      return finishAutomationJob(job.id)
    }
    if (job.kind === 'NO_RESPONSE_CUTOFF') {
      const changed = db.prepare(`UPDATE appointments SET confirmation_status = 'NO_RESPONSE' WHERE id = ? AND tenant_id = ? AND confirmation_status = 'AWAITING_CONFIRMATION'`).run(appointment.id, appointment.tenantId)
      if (changed.changes) confirmationEvent({ tenantId: appointment.tenantId, appointmentId: appointment.id, eventType: 'NO_RESPONSE' })
      return finishAutomationJob(job.id)
    }
    if (job.kind === 'APPOINTMENT_REMINDER') {
      if (!['CONFIRMED','MANUALLY_CONFIRMED'].includes(appointment.confirmationStatus)) return finishAutomationJob(job.id, 'CANCELLED')
      const result = await sendAppointmentReminder(appointment)
      if (!result.ok) throw new Error(result.code)
      return finishAutomationJob(job.id)
    }
  }

  const processQueue = async () => {
    if (running) return
    running = true
    try {
      ensureUpcomingAppointmentAutomationJobs()
      for (let index = 0; index < batchLimit; index += 1) {
        const job = claimNextAutomationJob()
        if (!job) break
        try {
          await processAutomationJob(job)
        } catch (error) {
          failAutomationJob(job, error)
        }
      }
    } finally {
      running = false
    }
  }

  const runSafely = (label: string) => {
    void processQueue().catch(error => logger.error(label, error))
  }

  const start = () => {
    if (intervalTimer || startupTimer) return
    intervalTimer = scheduler.setInterval(() => runSafely('[Appointments] falha no worker de confirmações'), 60_000)
    intervalTimer.unref()
    startupTimer = scheduler.setTimeout(() => {
      startupTimer = null
      runSafely('[Appointments] falha no bootstrap do worker de confirmações')
    }, startupDelayMs)
    startupTimer.unref()
  }

  const stop = () => {
    if (intervalTimer) scheduler.clearInterval(intervalTimer)
    if (startupTimer) scheduler.clearTimeout(startupTimer)
    intervalTimer = null
    startupTimer = null
  }

  return {
    confirmationEvent,
    confirmationAppointmentById,
    formatAppointmentLocal,
    renderAppointmentTemplate,
    sendAppointmentConfirmation,
    sendAppointmentReminder,
    cancelAppointmentJobs,
    scheduleAppointmentAutomationJobs,
    scheduleAppointmentAutomationJobsForTenant,
    ensureUpcomingAppointmentAutomationJobs,
    claimNextAutomationJob,
    processAutomationJob,
    processQueue,
    start,
    stop,
  }
}
