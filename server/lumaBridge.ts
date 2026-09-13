import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from './db.js'
import { dayBoundsUtc, getZonedDateTimeParts, monthBoundsUtc, shiftYearMonth } from './dateTime.js'
import { financeExpenseCategories, financeMonthSnapshot, tenantFinanceTimeZone } from './finance.js'

export type LumaPendingAction = {
  id: string
  type: 'CREATE_SERVICE' | 'CONFIRM_APPOINTMENT'
  title: string
  description: string
  confirmLabel: string
  expiresAt: string
  payload: Record<string, unknown>
}

export type LumaToolContext = {
  tenantId: string
  userId: string
  attachment?: {
    type: 'image'
    dataUrl: string
    mime: 'image/png' | 'image/jpeg' | 'image/webp'
    name?: string
  } | null
}

export type LumaToolExecution = {
  toolResult: Record<string, unknown>
  pendingAction?: LumaPendingAction
}

const db = getDb()

const priceLabel = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`

const tenantTimezone = (tenantId: string) => {
  const row = db.prepare(`SELECT timezone FROM tenant_settings WHERE tenant_id = ?`).get(tenantId) as { timezone?: string } | undefined
  return row?.timezone || 'America/Sao_Paulo'
}

const normalizeSearch = (value: string) => `%${value.trim().toLowerCase().replace(/[%_]/g, '')}%`

const pendingActionSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().min(1),
  user_id: z.string().min(1),
  action_type: z.enum(['CREATE_SERVICE', 'CONFIRM_APPOINTMENT']),
  payload_json: z.string(),
  status: z.enum(['PENDING', 'EXECUTED', 'EXPIRED', 'CANCELLED']),
  expires_at: z.string(),
  created_at: z.string(),
})

function storePendingAction(context: LumaToolContext, input: {
  type: LumaPendingAction['type']
  payload: Record<string, unknown>
  title: string
  description: string
  confirmLabel: string
}): LumaPendingAction {
  const payloadJson = JSON.stringify(input.payload)
  const existing = db.prepare(`
    SELECT id, expires_at as expiresAt
    FROM assistant_pending_actions
    WHERE tenant_id = ? AND user_id = ? AND action_type = ? AND payload_json = ?
      AND status = 'PENDING' AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(context.tenantId, context.userId, input.type, payloadJson, new Date().toISOString()) as { id: string; expiresAt: string } | undefined

  if (existing) {
    return {
      id: existing.id,
      type: input.type,
      title: input.title,
      description: input.description,
      confirmLabel: input.confirmLabel,
      expiresAt: existing.expiresAt,
      payload: input.payload,
    }
  }

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
  db.prepare(`
    INSERT INTO assistant_pending_actions (
      id, tenant_id, user_id, action_type, payload_json, status, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `).run(id, context.tenantId, context.userId, input.type, payloadJson, expiresAt, createdAt)

  return {
    id,
    type: input.type,
    title: input.title,
    description: input.description,
    confirmLabel: input.confirmLabel,
    expiresAt,
    payload: input.payload,
  }
}

export const lumaToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_business_snapshot',
      description: 'Obtém um resumo pequeno e atual do negócio: agendamentos confirmados do mês, entradas e saídas registradas, clientes e serviços ativos. Use quando a pergunta precisar desses indicadores gerais.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_finance_overview',
      description: 'Obtém uma visão financeira confiável do mês atual e do mês anterior, usando o fuso do espaço. Retorna entradas registradas, saídas, saldo, origem das entradas e principais categorias de despesa. Use sempre que a usuária perguntar sobre faturamento, despesas, saldo, evolução financeira ou comparação mensal.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_services',
      description: 'Lista os serviços ativos do espaço com nome, duração e preço. Use para responder sobre catálogo ou antes de preparar alterações.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Trecho opcional do nome do serviço.' },
          limit: { type: 'integer', minimum: 1, maximum: 30 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_appointments',
      description: 'Busca agendamentos do tenant atual. O campo status representa o estado do horário; confirmation_status representa a confirmação de presença da cliente. Use quando a usuária perguntar por agenda ou presença. Nunca invente IDs.',
      parameters: {
        type: 'object',
        properties: {
          client_name: { type: 'string', description: 'Nome ou trecho do nome da cliente.' },
          date: { type: 'string', description: 'Data local no formato YYYY-MM-DD.' },
          status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'CANCELLED'] },
          confirmation_status: { type: 'string', enum: ['NOT_REQUESTED', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'DECLINED', 'NO_RESPONSE', 'DELIVERY_FAILED', 'MANUALLY_CONFIRMED'] },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_clients',
      description: 'Busca clientes pelo nome dentro do tenant atual. Retorna somente dados mínimos necessários para identificar a pessoa.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2 },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_create_service',
      description: 'Prepara a criação de um novo serviço, mas NÃO grava ainda. Só use quando nome, duração em minutos e preço em centavos estiverem claros. Se houver uma imagem anexada pela usuária, ela deve ser usada como capa do serviço salvo. A usuária verá um card de confirmação antes da gravação.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 120 },
          duration_minutes: { type: 'integer', minimum: 5, maximum: 720 },
          price_cents: { type: 'integer', minimum: 0, maximum: 10000000 },
        },
        required: ['name', 'duration_minutes', 'price_cents'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_confirm_appointment',
      description: 'Prepara uma confirmação MANUAL DE PRESENÇA de um agendamento existente, quando a profissional disser que confirmou a cliente por outro canal. Não confunda com status bruto do horário. Só use um appointment_id retornado por find_appointments.',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', format: 'uuid' },
        },
        required: ['appointment_id'],
        additionalProperties: false,
      },
    },
  },
] as const

const serviceArgs = z.object({
  name: z.string().trim().min(2).max(120),
  duration_minutes: z.number().int().min(5).max(720),
  price_cents: z.number().int().min(0).max(10_000_000),
}).strict()

const appointmentIdArgs = z.object({ appointment_id: z.string().uuid() }).strict()

export function executeLumaTool(context: LumaToolContext, name: string, rawArgs: unknown): LumaToolExecution {
  if (name === 'get_business_snapshot') {
    z.object({}).strict().parse(rawArgs ?? {})
    const timeZone = tenantFinanceTimeZone(context.tenantId)
    const nowParts = getZonedDateTimeParts(new Date(), timeZone)
    if (!nowParts) return { toolResult: { ok: false, code: 'INVALID_TIMEZONE', message: 'Não foi possível interpretar o fuso do espaço.' } }
    const finance = financeMonthSnapshot({ tenantId: context.tenantId, timeZone, year: nowParts.year, month: nowParts.month })
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM clients WHERE tenant_id = ?) AS clients,
        (SELECT COUNT(*) FROM services WHERE tenant_id = ? AND active = 1) AS services
    `).get(context.tenantId, context.tenantId) as { clients: number; services: number }
    return {
      toolResult: {
        ok: true,
        snapshot: {
          month: finance.ym,
          appointments: finance.confirmedAppointments,
          clients: Number(stats?.clients ?? 0),
          services: Number(stats?.services ?? 0),
          entriesCents: finance.entriesCents,
          expensesCents: finance.expensesCents,
          balanceCents: finance.balanceCents,
          entries: priceLabel(finance.entriesCents),
          expenses: priceLabel(finance.expensesCents),
          balance: priceLabel(finance.balanceCents),
        },
      },
    }
  }

  if (name === 'get_finance_overview') {
    z.object({}).strict().parse(rawArgs ?? {})
    const timeZone = tenantFinanceTimeZone(context.tenantId)
    const nowParts = getZonedDateTimeParts(new Date(), timeZone)
    if (!nowParts) return { toolResult: { ok: false, code: 'INVALID_TIMEZONE', message: 'Não foi possível interpretar o fuso do espaço.' } }
    const current = financeMonthSnapshot({ tenantId: context.tenantId, timeZone, year: nowParts.year, month: nowParts.month })
    const previousYm = shiftYearMonth({ year: nowParts.year, month: nowParts.month }, -1)
    const previous = financeMonthSnapshot({ tenantId: context.tenantId, timeZone, ...previousYm })
    const expenseCategories = financeExpenseCategories({ tenantId: context.tenantId, timeZone, year: nowParts.year, month: nowParts.month, limit: 5 })
    const monthBounds = monthBoundsUtc({ timeZone, year: nowParts.year, month: nowParts.month })
    const goalsRow = db.prepare(`
      SELECT monthly_revenue_goal_cents as revenueGoalCents,
             monthly_new_clients_goal as newClientsGoal
      FROM tenant_settings
      WHERE tenant_id = ?
    `).get(context.tenantId) as { revenueGoalCents?: number; newClientsGoal?: number } | undefined
    const newClientsRow = db.prepare(`
      SELECT COUNT(*) as currentNewClients
      FROM clients
      WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
    `).get(context.tenantId, monthBounds.start.toISOString(), monthBounds.endExclusive.toISOString()) as { currentNewClients?: number } | undefined
    const revenueGoalCents = Number(goalsRow?.revenueGoalCents ?? 1000000)
    const newClientsGoal = Number(goalsRow?.newClientsGoal ?? 10)
    const currentNewClients = Number(newClientsRow?.currentNewClients ?? 0)
    const revenueChangePercent = previous.entriesCents > 0
      ? Number((((current.entriesCents - previous.entriesCents) / previous.entriesCents) * 100).toFixed(1))
      : current.entriesCents > 0 ? 100 : 0
    return {
      toolResult: {
        ok: true,
        timeZone,
        current: {
          ...current,
          entries: priceLabel(current.entriesCents),
          expenses: priceLabel(current.expensesCents),
          balance: priceLabel(current.balanceCents),
        },
        previous: {
          ...previous,
          entries: priceLabel(previous.entriesCents),
          expenses: priceLabel(previous.expensesCents),
          balance: priceLabel(previous.balanceCents),
        },
        revenueChangePercent,
        expenseCategories,
        goals: {
          revenueGoalCents,
          currentRevenueCents: current.entriesCents,
          revenueProgressPercent: Math.min(100, Number(((current.entriesCents / Math.max(1, revenueGoalCents)) * 100).toFixed(1))),
          newClientsGoal,
          currentNewClients,
          newClientsProgressPercent: Math.min(100, Number(((currentNewClients / Math.max(1, newClientsGoal)) * 100).toFixed(1))),
        },
        semantics: {
          entries: 'Agendamentos confirmados no período + entradas manuais.',
          expenses: 'Saídas registradas manualmente no período.',
          balance: 'Entradas registradas menos saídas registradas. Não é lucro contábil.',
        },
      },
    }
  }

  if (name === 'list_services') {
    const args = z.object({ query: z.string().trim().max(120).optional(), limit: z.number().int().min(1).max(30).optional() }).strict().parse(rawArgs ?? {})
    const limit = args.limit ?? 20
    const rows = args.query
      ? db.prepare(`SELECT name, duration_minutes as durationMinutes, price_cents as priceCents FROM services WHERE tenant_id = ? AND active = 1 AND lower(name) LIKE ? ORDER BY name LIMIT ?`).all(context.tenantId, normalizeSearch(args.query), limit)
      : db.prepare(`SELECT name, duration_minutes as durationMinutes, price_cents as priceCents FROM services WHERE tenant_id = ? AND active = 1 ORDER BY name LIMIT ?`).all(context.tenantId, limit)
    return { toolResult: { ok: true, services: rows } }
  }

  if (name === 'find_clients') {
    const args = z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(20).optional() }).strict().parse(rawArgs ?? {})
    const rows = db.prepare(`
      SELECT c.name, c.created_at as createdAt
      FROM clients c
      WHERE c.tenant_id = ? AND lower(c.name) LIKE ?
      ORDER BY c.name
      LIMIT ?
    `).all(context.tenantId, normalizeSearch(args.query), args.limit ?? 10)
    return { toolResult: { ok: true, clients: rows } }
  }

  if (name === 'find_appointments') {
    const args = z.object({
      client_name: z.string().trim().max(120).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED']).optional(),
      confirmation_status: z.enum(['NOT_REQUESTED', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'DECLINED', 'NO_RESPONSE', 'DELIVERY_FAILED', 'MANUALLY_CONFIRMED']).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }).strict().parse(rawArgs ?? {})

    const where = ['a.tenant_id = ?']
    const params: unknown[] = [context.tenantId]
    if (args.client_name) {
      where.push('lower(COALESCE(c.name, u.email)) LIKE ?')
      params.push(normalizeSearch(args.client_name))
    }
    if (args.status) {
      where.push('a.status = ?')
      params.push(args.status)
    }
    if (args.confirmation_status) {
      where.push('a.confirmation_status = ?')
      params.push(args.confirmation_status)
    }
    if (args.date) {
      const bounds = dayBoundsUtc({ timeZone: tenantTimezone(context.tenantId), ymd: args.date })
      where.push('a.starts_at >= ? AND a.starts_at < ?')
      params.push(bounds.start.toISOString(), bounds.endExclusive.toISOString())
    }
    params.push(args.limit ?? 12)

    const rows = db.prepare(`
      SELECT a.id,
             a.starts_at as startsAt,
             a.ends_at as endsAt,
             a.status,
             a.confirmation_status as confirmationStatus,
             a.confirmation_sent_at as confirmationSentAt,
             a.confirmation_responded_at as confirmationRespondedAt,
             COALESCE(c.name, u.email) as clientName,
             s.name as serviceName,
             s.price_cents as priceCents
      FROM appointments a
      JOIN users u ON u.id = a.client_user_id
      LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
      JOIN services s ON s.id = a.service_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.starts_at ASC
      LIMIT ?
    `).all(...params)
    return { toolResult: { ok: true, timezone: tenantTimezone(context.tenantId), appointments: rows } }
  }

  if (name === 'prepare_create_service') {
    const args = serviceArgs.parse(rawArgs)
    const duplicate = db.prepare(`SELECT id, name FROM services WHERE tenant_id = ? AND active = 1 AND lower(name) = lower(?) LIMIT 1`).get(context.tenantId, args.name) as { id: string; name: string } | undefined
    if (duplicate) return { toolResult: { ok: false, code: 'SERVICE_ALREADY_EXISTS', message: `Já existe um serviço ativo chamado ${duplicate.name}.` } }

    const action = storePendingAction(context, {
      type: 'CREATE_SERVICE',
      payload: { name: args.name, durationMinutes: args.duration_minutes, priceCents: args.price_cents, ...(context.attachment ? { coverUrl: context.attachment.dataUrl } : {}) },
      title: `Adicionar ${args.name}`,
      description: `${args.duration_minutes} min · ${priceLabel(args.price_cents)}`,
      confirmLabel: 'Adicionar serviço',
    })
    return { toolResult: { ok: true, requires_confirmation: true, action_id: action.id, summary: action.description }, pendingAction: action }
  }

  if (name === 'prepare_confirm_appointment') {
    const args = appointmentIdArgs.parse(rawArgs)
    const row = db.prepare(`
      SELECT a.id, a.status, a.confirmation_status as confirmationStatus, a.starts_at as startsAt, COALESCE(c.name, u.email) as clientName, s.name as serviceName
      FROM appointments a
      JOIN users u ON u.id = a.client_user_id
      LEFT JOIN clients c ON c.user_id = u.id AND c.tenant_id = a.tenant_id
      JOIN services s ON s.id = a.service_id
      WHERE a.id = ? AND a.tenant_id = ?
    `).get(args.appointment_id, context.tenantId) as { id: string; status: string; confirmationStatus: string; startsAt: string; clientName: string; serviceName: string } | undefined
    if (!row) return { toolResult: { ok: false, code: 'APPOINTMENT_NOT_FOUND', message: 'Agendamento não encontrado.' } }
    if (row.confirmationStatus === 'CONFIRMED' || row.confirmationStatus === 'MANUALLY_CONFIRMED') return { toolResult: { ok: true, already_confirmed: true, appointment: row } }
    if (row.status === 'CANCELLED') return { toolResult: { ok: false, code: 'APPOINTMENT_CANCELLED', message: 'Esse agendamento está cancelado e não pode ser confirmado por esta ação.' } }

    const local = new Intl.DateTimeFormat('pt-BR', { timeZone: tenantTimezone(context.tenantId), dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.startsAt))
    const action = storePendingAction(context, {
      type: 'CONFIRM_APPOINTMENT',
      payload: { appointmentId: row.id },
      title: `Confirmar presença de ${row.clientName}`,
      description: `${row.serviceName} · ${local}`,
      confirmLabel: 'Confirmar presença',
    })
    return { toolResult: { ok: true, requires_confirmation: true, action_id: action.id, summary: action.description }, pendingAction: action }
  }

  return { toolResult: { ok: false, code: 'UNKNOWN_TOOL', message: 'Ferramenta não disponível.' } }
}

export function confirmLumaAction(context: LumaToolContext, actionId: string) {
  const tx = db.transaction(() => {
    const raw = db.prepare(`SELECT * FROM assistant_pending_actions WHERE id = ? AND tenant_id = ? AND user_id = ?`).get(actionId, context.tenantId, context.userId)
    const action = pendingActionSchema.safeParse(raw)
    if (!action.success) return { ok: false as const, code: 'ACTION_NOT_FOUND', message: 'Ação não encontrada.' }
    if (action.data.status === 'EXECUTED') return { ok: true as const, alreadyExecuted: true, message: 'Essa ação já foi concluída.' }
    if (action.data.status !== 'PENDING') return { ok: false as const, code: 'ACTION_NOT_PENDING', message: 'Essa ação não está mais disponível.' }
    if (new Date(action.data.expires_at).getTime() <= Date.now()) {
      db.prepare(`UPDATE assistant_pending_actions SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'`).run(actionId)
      return { ok: false as const, code: 'ACTION_EXPIRED', message: 'Essa confirmação expirou. Peça à Luma para preparar novamente.' }
    }

    const payload = JSON.parse(action.data.payload_json) as Record<string, unknown>
    let result: Record<string, unknown>

    if (action.data.action_type === 'CREATE_SERVICE') {
      const parsed = z.object({ name: z.string().min(2).max(120), durationMinutes: z.number().int().min(5).max(720), priceCents: z.number().int().min(0).max(10_000_000), coverUrl: z.string().min(32).optional() }).parse(payload)
      const duplicate = db.prepare(`SELECT id FROM services WHERE tenant_id = ? AND active = 1 AND lower(name) = lower(?) LIMIT 1`).get(context.tenantId, parsed.name)
      if (duplicate) return { ok: false as const, code: 'SERVICE_ALREADY_EXISTS', message: 'Esse serviço já existe.' }
      const id = randomUUID()
      db.prepare(`INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, cover_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, context.tenantId, parsed.name.trim(), parsed.durationMinutes, parsed.priceCents, parsed.coverUrl || null, new Date().toISOString())
      result = { serviceId: id, name: parsed.name, durationMinutes: parsed.durationMinutes, priceCents: parsed.priceCents, coverUrl: parsed.coverUrl || null }
    } else {
      const parsed = z.object({ appointmentId: z.string().uuid() }).parse(payload)
      const appointment = db.prepare(`SELECT id, status, confirmation_status as confirmationStatus FROM appointments WHERE id = ? AND tenant_id = ?`).get(parsed.appointmentId, context.tenantId) as { id: string; status: string; confirmationStatus: string } | undefined
      if (!appointment) return { ok: false as const, code: 'APPOINTMENT_NOT_FOUND', message: 'Agendamento não encontrado.' }
      if (appointment.status === 'CANCELLED') return { ok: false as const, code: 'APPOINTMENT_CANCELLED', message: 'Agendamento cancelado não pode ter presença confirmada.' }
      const now = new Date().toISOString()
      db.prepare(`UPDATE appointments SET confirmation_status = 'MANUALLY_CONFIRMED', confirmation_responded_at = ? WHERE id = ? AND tenant_id = ?`).run(now, parsed.appointmentId, context.tenantId)
      db.prepare(`UPDATE appointment_automation_jobs SET status = CASE WHEN kind = 'APPOINTMENT_REMINDER' THEN status ELSE 'CANCELLED' END, updated_at = ? WHERE tenant_id = ? AND appointment_id = ? AND status IN ('PENDING','FAILED')`).run(now, context.tenantId, parsed.appointmentId)
      db.prepare(`INSERT INTO appointment_confirmation_events (id, tenant_id, appointment_id, event_type, channel, created_at) VALUES (?, ?, ?, 'MANUALLY_CONFIRMED', 'LUMA', ?)`).run(randomUUID(), context.tenantId, parsed.appointmentId, now)
      result = { appointmentId: parsed.appointmentId, confirmationStatus: 'MANUALLY_CONFIRMED' }
    }

    const executedAt = new Date().toISOString()
    const changed = db.prepare(`UPDATE assistant_pending_actions SET status = 'EXECUTED', executed_at = ? WHERE id = ? AND status = 'PENDING'`).run(executedAt, actionId)
    if (changed.changes !== 1) return { ok: false as const, code: 'ACTION_RACE', message: 'Essa ação já foi processada.' }
    db.prepare(`INSERT INTO assistant_action_audit (id, tenant_id, user_id, action_id, action_type, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), context.tenantId, context.userId, actionId, action.data.action_type, JSON.stringify(result), executedAt)
    return { ok: true as const, actionType: action.data.action_type, result }
  })
  return tx.immediate()
}
