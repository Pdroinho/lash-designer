import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('Luma operations use real migrated SQLite, previews, ownership and durable reminders', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luma-operations-'))
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_PATH = path.join(directory, 'test.db')
  const { migrate } = await import('./migrate.js')
  migrate()
  const { getDb, closeDb } = await import('./db.js'),
    db = getDb()
  const {
    executeOperationalTool: execute,
    confirmOperationalAction: confirm,
    lumaCalendar,
  } = await import('./lumaOperations.js')
  const { createLumaReminderRuntime } = await import('./lumaReminderRuntime.js')
  const { createSupportService } = await import('./support/service.js')
  const now = new Date().toISOString(),
    a = { tenantId: randomUUID(), userId: randomUUID() },
    b = { tenantId: randomUUID(), userId: randomUUID() },
    devId = randomUUID()
  for (const [index, c] of [a, b].entries()) {
    db.prepare(
      'INSERT INTO tenants(id,slug,name,primary_color,status,created_at) VALUES (?,?,?,?,?,?)',
    ).run(c.tenantId, `luma-${index}`, 'Studio QA', '#972d57', 'ACTIVE', now)
    db.prepare(
      'INSERT INTO users(id,tenant_id,email,password_hash,role,phone,created_at) VALUES (?,?,?,?,?,?,?)',
    ).run(
      c.userId,
      c.tenantId,
      `admin-${index}@example.com`,
      'test',
      'ADMIN',
      '5571999991234',
      now,
    )
    db.prepare(
      'INSERT INTO tenant_settings(tenant_id,secondary_color,timezone,currency,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ).run(c.tenantId, '#fff', 'America/Manaus', 'BRL', now, now)
    db.prepare(
      'INSERT INTO subscriptions(id,tenant_id,status,current_period_end,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    ).run(
      randomUUID(),
      c.tenantId,
      'ACTIVE',
      '2099-01-01T00:00:00.000Z',
      now,
      now,
    )
  }
  db.prepare(
    'INSERT INTO users(id,email,password_hash,role,created_at) VALUES (?,?,?,?,?)',
  ).run(devId, 'dev@example.com', 'test', 'DEV', now)
  const clientId = randomUUID(),
    serviceId = randomUUID(),
    appointmentId = randomUUID(),
    futureId = randomUUID()
  db.prepare(
    'INSERT INTO users(id,tenant_id,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',
  ).run(clientId, a.tenantId, 'client@example.com', 'test', 'CLIENT', now)
  db.prepare(
    'INSERT INTO clients(id,tenant_id,user_id,name,phone,created_at) VALUES (?,?,?,?,?,?)',
  ).run(randomUUID(), a.tenantId, clientId, 'Mariana', '5571999991234', now)
  db.prepare(
    'INSERT INTO services(id,tenant_id,name,duration_minutes,price_cents,created_at) VALUES (?,?,?,?,?,?)',
  ).run(serviceId, a.tenantId, 'Cílios', 60, 10000, now)
  const remindDate = (offset: number) =>
    new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
  const past = new Date(Date.now() - 86400000).toISOString(),
    future = new Date(Date.now() + 86400000).toISOString()
  for (const [id, start] of [
    [appointmentId, past],
    [futureId, future],
  ])
    db.prepare(
      'INSERT INTO appointments(id,tenant_id,service_id,client_user_id,professional_id,starts_at,ends_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      id,
      a.tenantId,
      serviceId,
      clientId,
      a.tenantId,
      start,
      new Date(Date.parse(start) + 3600000).toISOString(),
      'CONFIRMED',
      now,
    )
  const action = (name: string, args: Record<string, unknown>, ctx = a) =>
    execute(ctx, name, args)!.pendingAction!
  let ticketId = 0,
    cashId = '',
    reminderId = ''
  try {
    await t.test(
      'period summary validates dates, timezones, pagination and tenant isolation',
      () => {
        const range = {
          start_date: new Date(Date.now() - 7 * 86400000)
            .toISOString()
            .slice(0, 10),
          end_date: new Date(Date.now() + 7 * 86400000)
            .toISOString()
            .slice(0, 10),
        }
        assert.equal(lumaCalendar(db, a.tenantId, range).totals.total, 2)
        assert.equal(lumaCalendar(db, b.tenantId, range).totals.total, 0)
        assert.throws(() =>
          lumaCalendar(db, a.tenantId, {
            start_date: '2026-02-30',
            end_date: '2026-03-01',
          }),
        )
        assert.throws(() =>
          lumaCalendar(db, a.tenantId, {
            start_date: '2026-01-01',
            end_date: '2027-01-01',
          }),
        )
      },
    )
    await t.test(
      'attendance cannot be fabricated for future or another tenant',
      () => {
        assert.throws(() =>
          action('prepare_attendance', {
            appointment_id: futureId,
            attendance: 'ATTENDED',
          }),
        )
        assert.throws(() =>
          action(
            'prepare_attendance',
            { appointment_id: appointmentId, attendance: 'ATTENDED' },
            b,
          ),
        )
      },
    )
    await t.test(
      'attendance needs confirmation, identifies the client, and runs once',
      () => {
        const p = action('prepare_attendance', {
          appointment_id: appointmentId,
          attendance: 'ATTENDED',
        })
        assert.ok(p.description.includes('Mariana'))
        assert.equal(
          (
            db
              .prepare(
                'SELECT attendance_status as s FROM appointments WHERE id=?',
              )
              .get(appointmentId) as { s: string }
          ).s,
          'NOT_RECORDED',
        )
        assert.equal(confirm(b, p.id), null)
        assert.ok(confirm(a, p.id)?.ok)
        assert.ok(confirm(a, p.id)?.ok)
        assert.equal(
          (
            db
              .prepare(
                'SELECT attendance_status as s FROM appointments WHERE id=?',
              )
              .get(appointmentId) as { s: string }
          ).s,
          'ATTENDED',
        )
      },
    )
    await t.test('concurrent attendance update cannot be overwritten', () => {
      const p = action('prepare_attendance', {
        appointment_id: appointmentId,
        attendance: 'NO_SHOW',
      })
      db.prepare(
        "UPDATE appointments SET attendance_status='NOT_RECORDED' WHERE id=?",
      ).run(appointmentId)
      assert.throws(() => confirm(a, p.id), /mudou/)
      assert.equal(
        (
          db
            .prepare(
              'SELECT attendance_status as s FROM appointments WHERE id=?',
            )
            .get(appointmentId) as { s: string }
        ).s,
        'NOT_RECORDED',
      )
    })
    await t.test(
      'financial preview deduplicates and stores exactly one scoped expense',
      () => {
        const args = {
            type: 'EXPENSE',
            amount_cents: 3500,
            note: 'Material QA',
            date: now.slice(0, 10),
            method: 'PIX',
          },
          p = action('prepare_finance_entry', args)
        assert.equal(action('prepare_finance_entry', args).id, p.id)
        assert.equal(
          (
            db.prepare('SELECT COUNT(*) as n FROM cash_transactions').get() as {
              n: number
            }
          ).n,
          0,
        )
        assert.ok(confirm(a, p.id)?.ok)
        assert.ok(confirm(a, p.id)?.ok)
        const row = db
          .prepare(
            'SELECT id,tenant_id as tenantId,amount_cents as amount FROM cash_transactions',
          )
          .get() as { id: string; tenantId: string; amount: number }
        cashId = row.id
        assert.equal(row.tenantId, a.tenantId)
        assert.equal(row.amount, 3500)
        assert.throws(() =>
          action('prepare_finance_entry', { ...args, amount_cents: -1 }),
        )
      },
    )
    await t.test(
      'financial corrections are version protected and isolated',
      () => {
        const args = {
          transaction_id: cashId,
          type: 'EXPENSE',
          amount_cents: 4000,
          note: 'Material QA',
          date: now.slice(0, 10),
          method: 'PIX',
        }
        assert.throws(() => action('prepare_finance_correction', args, b))
        const p = action('prepare_finance_correction', args)
        db.prepare(
          'UPDATE cash_transactions SET amount_cents=3600 WHERE id=?',
        ).run(cashId)
        assert.throws(() => confirm(a, p.id), /mudou/)
        const fresh = action('prepare_finance_correction', args)
        assert.ok(confirm(a, fresh.id)?.ok)
        assert.equal(
          (
            db
              .prepare(
                'SELECT amount_cents as n FROM cash_transactions WHERE id=?',
              )
              .get(cashId) as { n: number }
          ).n,
          4000,
        )
      },
    )
    await t.test(
      'financial goals update through review and keep zero meaningful',
      () => {
        const p = action('prepare_finance_goals', {
          revenue_goal_cents: 0,
          new_clients_goal: 0,
        })
        assert.ok(confirm(a, p.id)?.ok)
        assert.equal(
          (
            db
              .prepare(
                'SELECT monthly_revenue_goal_cents as n FROM tenant_settings WHERE tenant_id=?',
              )
              .get(a.tenantId) as { n: number }
          ).n,
          0,
        )
      },
    )
    await t.test(
      'Luma opens real support ticket, with notifications, only on approval',
      () => {
        const p = action('prepare_support_ticket', {
          subject: 'Ajuda com WhatsApp',
          body: 'Não consigo conectar meu WhatsApp ao estúdio.',
          category: 'WHATSAPP',
        })
        assert.equal(
          (
            db.prepare('SELECT COUNT(*) as n FROM support_tickets').get() as {
              n: number
            }
          ).n,
          0,
        )
        const r = confirm(a, p.id)!
        assert.ok(r.ok)
        if (r.ok) ticketId = Number(r.result?.ticketId)
        assert.ok(ticketId)
        assert.ok(confirm(a, p.id)?.ok)
        assert.equal(
          (
            db.prepare('SELECT COUNT(*) as n FROM support_tickets').get() as {
              n: number
            }
          ).n,
          1,
        )
        assert.ok(
          (
            db
              .prepare('SELECT COUNT(*) as n FROM support_notifications')
              .get() as { n: number }
          ).n > 0,
        )
      },
    )
    await t.test(
      'ticket lookup exposes public answers, never internal DEV notes',
      () => {
        const service = createSupportService(db),
          actor = { id: devId, tenantId: null, role: 'DEV' as const }
        let detail = service.detail(actor, ticketId)
        service.reply(actor, ticketId, {
          key: randomUUID(),
          version: detail.ticket.version,
          body: 'Nota privada QA',
          internal: true,
          attachments: [],
        })
        detail = service.detail(actor, ticketId)
        service.reply(actor, ticketId, {
          key: randomUUID(),
          version: detail.ticket.version,
          body: 'Resposta pública QA',
          internal: false,
          attachments: [],
        })
        const res = execute(a, 'get_support_requests', {
          ticket_id: ticketId,
        })!.toolResult
        assert.ok(JSON.stringify(res).includes('Resposta pública QA'))
        assert.ok(!JSON.stringify(res).includes('Nota privada QA'))
        assert.throws(() =>
          execute(b, 'get_support_requests', { ticket_id: ticketId }),
        )
      },
    )
    await t.test(
      'support reply keeps concurrency version and goes to real history',
      () => {
        const p = action('prepare_support_reply', {
          ticket_id: ticketId,
          body: 'Obrigada! Consegui conectar.',
        })
        assert.ok(confirm(a, p.id)?.ok)
        assert.ok(
          JSON.stringify(
            createSupportService(db).detail(
              { id: a.userId, tenantId: a.tenantId, role: 'ADMIN' },
              ticketId,
            ),
          ).includes('Obrigada!'),
        )
      },
    )
    await t.test(
      'personal preferences are scoped and audited behind approval',
      () => {
        const p = action('prepare_luma_preferences', {
          tone: 'DIRECT',
          focus: 'FINANCE',
          instructions: 'Resuma em poucas palavras.',
        })
        assert.ok(confirm(a, p.id)?.ok)
        assert.equal(
          (
            db
              .prepare(
                'SELECT COUNT(*) as n FROM assistant_preferences WHERE tenant_id=?',
              )
              .get(b.tenantId) as { n: number }
          ).n,
          0,
        )
      },
    )
    await t.test(
      'personal reminder scheduling respects studio timezone and does not send immediately',
      () => {
        const date = remindDate(10),
          p = action('prepare_whatsapp_reminder', {
            date,
            time: '09:15',
            message: 'Conferir a agenda.',
          })
        assert.ok(confirm(a, p.id)?.ok)
        reminderId = p.id
        assert.equal(
          (
            db
              .prepare(
                'SELECT due_at as due FROM assistant_reminders WHERE id=?',
              )
              .get(reminderId) as { due: string }
          ).due,
          `${date}T13:15:00.000Z`,
        )
        assert.equal(
          (
            db
              .prepare('SELECT status as s FROM assistant_reminders WHERE id=?')
              .get(reminderId) as { s: string }
          ).s,
          'SCHEDULED',
        )
      },
    )
    await t.test(
      'reminder worker uses Evolution sender once, to the owner phone only',
      async () => {
        db.prepare('UPDATE assistant_reminders SET due_at=? WHERE id=?').run(
          past,
          reminderId,
        )
        const calls: Array<{ tenantId: string; phone: string; text: string }> =
          []
        const runtime = createLumaReminderRuntime(
          db,
          async (tenantId, phone, text, options) => {
            calls.push({ tenantId, phone, text })
            assert.equal(options.persist, false)
            options.onProviderMessageId('provider-qa')
            return true
          },
        )
        await Promise.all([runtime.processDue(), runtime.processDue()])
        assert.equal(calls.length, 1)
        assert.equal(calls[0].phone, '5571999991234')
        assert.equal(calls[0].tenantId, a.tenantId)
        await runtime.processDue()
        assert.equal(calls.length, 1)
        assert.equal(
          (
            db
              .prepare('SELECT status as s FROM assistant_reminders WHERE id=?')
              .get(reminderId) as { s: string }
          ).s,
          'SENT',
        )
      },
    )
    await t.test(
      'uncertain delivery never triggers an automatic duplicate send',
      async () => {
        const p = action('prepare_whatsapp_reminder', {
          date: remindDate(11),
          time: '09:00',
          message: 'Teste de falha.',
        })
        confirm(a, p.id)
        db.prepare('UPDATE assistant_reminders SET due_at=? WHERE id=?').run(
          past,
          p.id,
        )
        let calls = 0
        const runtime = createLumaReminderRuntime(db, async () => {
          calls++
          return false
        })
        await runtime.processDue()
        await runtime.processDue()
        assert.equal(calls, 1)
        assert.equal(
          (
            db
              .prepare('SELECT status as s FROM assistant_reminders WHERE id=?')
              .get(p.id) as { s: string }
          ).s,
          'UNKNOWN',
        )
      },
    )
    await t.test(
      'inactive account blocks due reminders before contacting provider',
      async () => {
        const p = action('prepare_whatsapp_reminder', {
          date: remindDate(12),
          time: '09:00',
          message: 'Teste de conta inativa.',
        })
        confirm(a, p.id)
        db.prepare('UPDATE assistant_reminders SET due_at=? WHERE id=?').run(
          past,
          p.id,
        )
        db.prepare(
          "UPDATE subscriptions SET status='EXPIRED' WHERE tenant_id=?",
        ).run(a.tenantId)
        let calls = 0
        const runtime = createLumaReminderRuntime(db, async () => {
          calls++
          return true
        })
        await runtime.processDue()
        assert.equal(calls, 0)
        assert.equal(
          (
            db
              .prepare('SELECT status as s FROM assistant_reminders WHERE id=?')
              .get(p.id) as { s: string }
          ).s,
          'FAILED',
        )
      },
    )
    await t.test(
      'cancellation preserves history and rejects another owner',
      () => {
        const p = action('prepare_whatsapp_reminder', {
          date: remindDate(13),
          time: '09:00',
          message: 'Lembrete a cancelar.',
        })
        confirm(a, p.id)
        const cancel = action('prepare_cancel_reminder', { reminder_id: p.id })
        assert.equal(confirm(b, cancel.id), null)
        assert.ok(confirm(a, cancel.id)?.ok)
        assert.equal(
          (
            db
              .prepare('SELECT status as s FROM assistant_reminders WHERE id=?')
              .get(p.id) as { s: string }
          ).s,
          'CANCELLED',
        )
      },
    )
    await t.test(
      'expired proposals never execute and database foreign keys remain intact',
      () => {
        const p = action('prepare_finance_entry', {
          type: 'INCOME',
          amount_cents: 500,
          note: 'Teste expirado',
          date: now.slice(0, 10),
        })
        db.prepare(
          'UPDATE assistant_operation_actions SET expires_at=? WHERE id=?',
        ).run(past, p.id)
        assert.equal(confirm(a, p.id)?.ok, false)
        assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
      },
    )
  } finally {
    closeDb()
    rmSync(directory, { recursive: true, force: true })
  }
})
