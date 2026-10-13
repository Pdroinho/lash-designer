import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from './db.js'
import { dayBoundsUtc, parseYmd, utcForLocalTime } from './dateTime.js'
import { createSupportService } from './support/service.js'
import type {
  LumaPendingAction,
  LumaToolContext,
  LumaToolExecution,
} from './lumaBridge.js'
import { badRequest, notFound } from './http.js'
import { lumaCalendar } from './lumaCalendar.js'
import {
  operationTypes,
  operations,
  cashSchema,
  goalsSchema,
  attendanceSchema,
  reminderSchema,
  preferencesSchema,
  ticketSchema,
  replySchema,
  type OperationType,
} from './lumaOperationContracts.js'
export { lumaCalendar } from './lumaCalendar.js'
export { operationalToolDefinitions } from './lumaOperationContracts.js'
export type { OperationType } from './lumaOperationContracts.js'
const db = getDb()
function owner(context: LumaToolContext) {
  return {
    id: context.userId,
    tenantId: context.tenantId,
    role: 'ADMIN' as const,
  }
}
function timezone(context: LumaToolContext) {
  return (
    (
      db
        .prepare('SELECT timezone FROM tenant_settings WHERE tenant_id=?')
        .get(context.tenantId) as { timezone: string } | undefined
    )?.timezone ?? 'America/Sao_Paulo'
  )
}
function parsePayload(
  type: OperationType,
  input: unknown,
  context: LumaToolContext,
): Record<string, unknown> {
  if (type === 'CREATE_SUPPORT_TICKET') return ticketSchema.parse(input)
  if (type === 'REPLY_SUPPORT_TICKET') {
    const args = replySchema.parse(input)
    const ticket = createSupportService(db).detail(
      owner(context),
      args.ticket_id,
    ).ticket
    return { ...args, version: ticket.version }
  }
  if (type === 'UPDATE_FINANCE_ENTRY') {
    const args = cashSchema
      .extend({ transaction_id: z.string().uuid() })
      .parse(input)
    if (!parseYmd(args.date)) throw badRequest('Confira a data.')
    const previous = db
      .prepare('SELECT * FROM cash_transactions WHERE id=? AND tenant_id=?')
      .get(args.transaction_id, context.tenantId)
    if (!previous) throw notFound('Lançamento não encontrado.')
    return { ...args, previous: JSON.stringify(previous) }
  }
  if (type === 'REGISTER_FINANCE') {
    const args = cashSchema.parse(input)
    if (!parseYmd(args.date)) throw badRequest('Confira a data do lançamento.')
    return args
  }
  if (type === 'UPDATE_FINANCE_GOALS') return goalsSchema.parse(input)
  if (type === 'RECORD_ATTENDANCE') {
    const args = attendanceSchema.parse(input)
    const a = db
      .prepare(
        `SELECT a.attendance_status as expectedAttendance,a.status,a.starts_at as startsAt,COALESCE(c.name,u.email) as clientName FROM appointments a JOIN users u ON u.id=a.client_user_id LEFT JOIN clients c ON c.tenant_id=a.tenant_id AND c.user_id=u.id WHERE a.id=? AND a.tenant_id=?`,
      )
      .get(args.appointment_id, context.tenantId) as
      | {
          expectedAttendance: string
          status: string
          startsAt: string
          clientName: string
        }
      | undefined
    if (!a) throw notFound('Atendimento não encontrado.')
    if (a.status === 'CANCELLED' || a.startsAt > new Date().toISOString())
      throw badRequest(
        'Só registre comparecimento de atendimento iniciado e não cancelado.',
      )
    return {
      ...args,
      expectedAttendance: a.expectedAttendance,
      clientName: a.clientName,
      startsAt: a.startsAt,
    }
  }
  if (type === 'CREATE_REMINDER') {
    const args = reminderSchema.parse(input)
    if (!parseYmd(args.date)) throw badRequest('Confira a data do lembrete.')
    const time = args.time.split(':').map(Number)
    if (time[0] > 23 || time[1] > 59) throw badRequest('Confira o horário.')
    const due = utcForLocalTime({
      ...parseYmd(args.date)!,
      hour: time[0],
      minute: time[1],
      timeZone: timezone(context),
    })
    if (due <= new Date() || due.getTime() > Date.now() + 366 * 86400000)
      throw badRequest('Agende para um período futuro de até um ano.')
    return { ...args, due_at: due.toISOString() }
  }
  if (type === 'CANCEL_REMINDER')
    return z.object({ reminder_id: z.string().uuid() }).strict().parse(input)
  return preferencesSchema.parse(input)
}
export function executeOperationalTool(
  context: LumaToolContext,
  name: string,
  args: unknown,
): LumaToolExecution | null {
  if (name === 'get_finance_entries') {
    const p = z
      .object({
        query: z.string().trim().max(120).default(''),
        page: z.number().int().min(1).default(1),
        after: z.number().int().min(0).default(0),
      })
      .strict()
      .parse(args ?? {})
    const rows = db
      .prepare(
        `SELECT id,type,amount_cents as amountCents,method,note,created_at as createdAt FROM cash_transactions WHERE tenant_id=? AND COALESCE(note,'') LIKE ? ORDER BY created_at DESC,id LIMIT 51 OFFSET ?`,
      )
      .all(context.tenantId, `%${p.query}%`, (p.page - 1) * 50)
    return {
      toolResult: {
        ok: true,
        entries: rows.slice(0, 50),
        nextPage: rows.length > 50 ? p.page + 1 : null,
      },
    }
  }
  if (name === 'get_calendar_period')
    return { toolResult: lumaCalendar(db, context.tenantId, args) }
  if (name === 'get_support_requests') {
    const input = z
      .object({
        ticket_id: z.number().int().positive().optional(),
        page: z.number().int().min(1).default(1),
        after: z.number().int().min(0).default(0),
      })
      .strict()
      .parse(args ?? {})
    const support = createSupportService(db)
    return {
      toolResult: {
        ok: true,
        ...(input.ticket_id
          ? support.detail(owner(context), input.ticket_id, input.after)
          : support.list(owner(context), '', '', input.page)),
      },
    }
  }
  if (name === 'get_personal_reminders')
    return {
      toolResult: {
        ok: true,
        reminders: db
          .prepare(
            'SELECT id,body,due_at as dueAt,status FROM assistant_reminders WHERE tenant_id=? AND user_id=? ORDER BY due_at DESC LIMIT 50',
          )
          .all(context.tenantId, context.userId),
      },
    }
  const type = operationTypes.find((type) => operations[type].name === name)
  if (!type) return null
  const payload = parsePayload(type, args, context),
    now = new Date().toISOString()
  const prior = db
    .prepare(
      "SELECT id,expires_at as expiresAt FROM assistant_operation_actions WHERE tenant_id=? AND user_id=? AND action_type=? AND payload_json=? AND status='PENDING' AND expires_at>? ORDER BY created_at DESC LIMIT 1",
    )
    .get(
      context.tenantId,
      context.userId,
      type,
      JSON.stringify(payload),
      now,
    ) as { id: string; expiresAt: string } | undefined
  const id = prior?.id ?? randomUUID(),
    expiresAt =
      prior?.expiresAt ?? new Date(Date.now() + 10 * 60000).toISOString()
  const description =
    type === 'REGISTER_FINANCE' || type === 'UPDATE_FINANCE_ENTRY'
      ? `${payload.type === 'INCOME' ? 'Entrada' : 'Despesa'} · ${(Number(payload.amount_cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${payload.date} · ${payload.note}`
      : type === 'CREATE_SUPPORT_TICKET'
        ? String(payload.subject)
        : type === 'CREATE_REMINDER'
          ? `${payload.date} às ${payload.time} · ${payload.message}`
          : type === 'UPDATE_FINANCE_GOALS'
            ? `Meta de entradas: ${(Number(payload.revenue_goal_cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · Novas clientes: ${payload.new_clients_goal}`
            : type === 'REPLY_SUPPORT_TICKET'
              ? String(payload.body)
              : type === 'RECORD_ATTENDANCE'
                ? `${payload.attendance === 'ATTENDED' ? `Registrar que ${payload.clientName} veio` : payload.attendance === 'NO_SHOW' ? `Registrar que ${payload.clientName} faltou` : `Retirar a marcação de comparecimento de ${payload.clientName}`}. Esta ação não muda a confirmação antecipada nem cancela o agendamento.`
                : type === 'UPDATE_LUMA_PREFERENCES'
                  ? `Tom: ${payload.tone === 'FRIENDLY' ? 'acolhedor e prático' : payload.tone === 'DIRECT' ? 'direto e resumido' : 'com mais explicações'}
Foco: ${payload.focus === 'FINANCE' ? 'financeiro' : payload.focus === 'AGENDA' ? 'agenda' : payload.focus === 'CLIENTS' ? 'clientes' : 'rotina geral'}
${payload.instructions || 'Sem orientações adicionais.'}`
                  : 'Cancelar o lembrete selecionado. Nenhuma nova mensagem será enviada por este lembrete.'
  if (!prior)
    db.prepare(
      'INSERT INTO assistant_operation_actions(id,tenant_id,user_id,action_type,payload_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?)',
    ).run(
      id,
      context.tenantId,
      context.userId,
      type,
      JSON.stringify(payload),
      expiresAt,
      new Date().toISOString(),
    )
  const action: LumaPendingAction = {
    id,
    type,
    title: operations[type].label,
    description,
    confirmLabel: operations[type].label,
    expiresAt,
    payload,
  }
  return {
    toolResult: {
      ok: true,
      requires_confirmation: true,
      action_id: id,
      summary: description,
    },
    pendingAction: action,
  }
}
export function confirmOperationalAction(context: LumaToolContext, id: string) {
  const row = db
    .prepare(
      'SELECT * FROM assistant_operation_actions WHERE id=? AND tenant_id=? AND user_id=?',
    )
    .get(id, context.tenantId, context.userId) as
    | {
        action_type: OperationType
        status: string
        expires_at: string
        payload_json: string
      }
    | undefined
  if (!row) return null
  return db
    .transaction(() => {
      const current = db
        .prepare('SELECT status FROM assistant_operation_actions WHERE id=?')
        .get(id) as { status: string }
      if (current.status === 'EXECUTED')
        return {
          ok: true as const,
          alreadyExecuted: true,
          message: 'Esta ação já foi concluída.',
        }
      if (
        current.status !== 'PENDING' ||
        new Date(row.expires_at) <= new Date()
      ) {
        db.prepare(
          "UPDATE assistant_operation_actions SET status='EXPIRED' WHERE id=? AND status='PENDING'",
        ).run(id)
        return {
          ok: false as const,
          code: 'ACTION_EXPIRED',
          message: 'Esta ação expirou. Peça à Luma para preparar novamente.',
        }
      }
      const payload = JSON.parse(row.payload_json),
        now = new Date().toISOString()
      let result: Record<string, unknown>
      if (row.action_type === 'CREATE_SUPPORT_TICKET') {
        const t = createSupportService(db).create(owner(context), {
          ...ticketSchema.parse(payload),
          key: id,
          priority: 'NORMAL',
          attachments: [],
        })
        result = { ticketId: t }
      } else if (row.action_type === 'REPLY_SUPPORT_TICKET') {
        createSupportService(db).reply(owner(context), payload.ticket_id, {
          key: id,
          version: payload.version,
          body: payload.body,
          internal: false,
          attachments: [],
        })
        result = { ticketId: payload.ticket_id }
      } else if (row.action_type === 'UPDATE_FINANCE_ENTRY') {
        const { previous, ...values } = payload
        const p = cashSchema
          .extend({ transaction_id: z.string().uuid() })
          .parse(values)
        const current = db
          .prepare('SELECT * FROM cash_transactions WHERE id=? AND tenant_id=?')
          .get(p.transaction_id, context.tenantId)
        if (!current) throw notFound('Lançamento não encontrado.')
        if (JSON.stringify(current) !== previous)
          throw badRequest(
            'Este lançamento mudou. Consulte novamente antes de confirmar.',
            'FINANCE_ENTRY_CHANGED',
          )
        const date = dayBoundsUtc({
          timeZone: timezone(context),
          ymd: p.date,
        }).start
        db.prepare(
          'UPDATE cash_transactions SET type=?,amount_cents=?,method=?,note=?,created_at=? WHERE id=? AND tenant_id=?',
        ).run(
          p.type,
          p.amount_cents,
          p.method,
          p.note,
          date.toISOString(),
          p.transaction_id,
          context.tenantId,
        )
        result = { transactionId: p.transaction_id }
      } else if (row.action_type === 'REGISTER_FINANCE') {
        const p = cashSchema.parse(payload),
          date = dayBoundsUtc({
            timeZone: timezone(context),
            ymd: p.date,
          }).start
        const entry = randomUUID()
        db.prepare(
          'INSERT INTO cash_transactions(id,tenant_id,type,amount_cents,method,note,created_at) VALUES (?,?,?,?,?,?,?)',
        ).run(
          entry,
          context.tenantId,
          p.type,
          p.amount_cents,
          p.method,
          p.note,
          date.toISOString(),
        )
        result = { transactionId: entry }
      } else if (row.action_type === 'UPDATE_FINANCE_GOALS') {
        const p = goalsSchema.parse(payload)
        const changed = db
          .prepare(
            'UPDATE tenant_settings SET monthly_revenue_goal_cents=?,monthly_new_clients_goal=?,updated_at=? WHERE tenant_id=?',
          )
          .run(p.revenue_goal_cents, p.new_clients_goal, now, context.tenantId)
        if (!changed.changes)
          throw notFound('Configurações do estúdio não encontradas.')
        result = { saved: true }
      } else if (row.action_type === 'RECORD_ATTENDANCE') {
        const p = attendanceSchema.parse({
          appointment_id: payload.appointment_id,
          attendance: payload.attendance,
        })
        const a = db
          .prepare(
            'SELECT status,starts_at,attendance_status FROM appointments WHERE id=? AND tenant_id=?',
          )
          .get(p.appointment_id, context.tenantId) as
          | { status: string; starts_at: string; attendance_status: string }
          | undefined
        if (!a) throw notFound('Atendimento não encontrado.')
        if (a.attendance_status !== payload.expectedAttendance)
          throw badRequest(
            'A marcação deste atendimento mudou. Atualize a agenda antes de confirmar.',
            'ATTENDANCE_CHANGED',
          )
        if (a.status === 'CANCELLED' || a.starts_at > now)
          throw badRequest(
            'Só registre comparecimento de um atendimento iniciado e não cancelado.',
          )
        db.prepare(
          'UPDATE appointments SET attendance_status=?,attendance_recorded_at=?,attendance_recorded_by=? WHERE id=? AND tenant_id=?',
        ).run(
          p.attendance,
          now,
          context.userId,
          p.appointment_id,
          context.tenantId,
        )
        result = { appointmentId: p.appointment_id, attendance: p.attendance }
      } else if (row.action_type === 'CREATE_REMINDER') {
        const account = db
          .prepare(
            "SELECT phone FROM users WHERE id=? AND tenant_id=? AND role='ADMIN'",
          )
          .get(context.userId, context.tenantId) as
          | { phone: string }
          | undefined
        if (!account?.phone)
          throw badRequest(
            'Cadastre seu WhatsApp nas configurações antes de criar lembretes.',
          )
        const p = parsePayload(
          'CREATE_REMINDER',
          { date: payload.date, time: payload.time, message: payload.message },
          context,
        )
        const total = db
          .prepare(
            "SELECT COUNT(*) as n FROM assistant_reminders WHERE tenant_id=? AND user_id=? AND status IN ('SCHEDULED','SENDING')",
          )
          .get(context.tenantId, context.userId) as { n: number }
        if (total.n >= 20)
          throw badRequest(
            'Você já tem 20 lembretes agendados. Conclua ou cancele algum primeiro.',
          )
        db.prepare(
          'INSERT INTO assistant_reminders(id,tenant_id,user_id,body,due_at,created_at) VALUES (?,?,?,?,?,?)',
        ).run(id, context.tenantId, context.userId, p.message, p.due_at, now)
        result = { reminderId: id, dueAt: p.due_at }
      } else if (row.action_type === 'CANCEL_REMINDER') {
        const changed = db
          .prepare(
            "UPDATE assistant_reminders SET status='CANCELLED',processed_at=? WHERE id=? AND tenant_id=? AND user_id=? AND status='SCHEDULED'",
          )
          .run(now, payload.reminder_id, context.tenantId, context.userId)
        if (!changed.changes)
          throw badRequest(
            'Este lembrete não está disponível para cancelamento.',
          )
        result = { cancelled: true }
      } else {
        const p = preferencesSchema.parse(payload)
        db.prepare(
          'INSERT INTO assistant_preferences(tenant_id,user_id,tone,focus,instructions,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET tone=excluded.tone,focus=excluded.focus,instructions=excluded.instructions,updated_at=excluded.updated_at',
        ).run(
          context.tenantId,
          context.userId,
          p.tone,
          p.focus,
          p.instructions,
          now,
        )
        result = { saved: true }
      }
      db.prepare(
        "UPDATE assistant_operation_actions SET status='EXECUTED',result_json=?,executed_at=? WHERE id=? AND status='PENDING'",
      ).run(JSON.stringify(result), now, id)
      return { ok: true as const, actionType: row.action_type, result }
    })
    .immediate()
}
