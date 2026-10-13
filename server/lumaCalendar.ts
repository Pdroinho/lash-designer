import type Database from 'better-sqlite3'
import { z } from 'zod'
import { dayBoundsUtc,parseYmd } from './dateTime.js'
import { badRequest } from './http.js'
const rangeSchema = z
  .object({
    start_date: z.string(),
    end_date: z.string(),
    page: z.number().int().min(1).max(10000).default(1),
  })
  .strict()
export function lumaCalendar(
  database: Database.Database,
  tenantId: string,
  input: unknown,
) {
  const args = rangeSchema.parse(input),
    timezone =
      (
        database
          .prepare('SELECT timezone FROM tenant_settings WHERE tenant_id=?')
          .get(tenantId) as { timezone: string } | undefined
      )?.timezone ?? 'America/Sao_Paulo'
  if (
    !parseYmd(args.start_date) ||
    !parseYmd(args.end_date) ||
    args.start_date > args.end_date ||
    Date.parse(args.end_date) - Date.parse(args.start_date) > 92 * 86400000
  )
    throw badRequest(
      'Escolha um período de até 93 dias, com início antes do fim.',
      'INVALID_DATE_RANGE',
    )
  const start = dayBoundsUtc({
      timeZone: timezone,
      ymd: args.start_date,
    }).start.toISOString(),
    end = dayBoundsUtc({
      timeZone: timezone,
      ymd: args.end_date,
    }).endExclusive.toISOString()
  const totals = database
    .prepare(
      `SELECT COUNT(*) as total,SUM(status='CANCELLED') as cancelled,SUM(attendance_status='ATTENDED') as attended,SUM(attendance_status='NO_SHOW') as absent,SUM(attendance_status='NOT_RECORDED' AND status!='CANCELLED' AND starts_at<=?) as needsAttendance FROM appointments WHERE tenant_id=? AND starts_at>=? AND starts_at<?`,
    )
    .get(new Date().toISOString(), tenantId, start, end) as Record<
    string,
    number
  >
  const appointments = database
    .prepare(
      `SELECT a.id,a.starts_at as startsAt,a.ends_at as endsAt,a.status,a.confirmation_status as confirmationStatus,a.attendance_status as attendanceStatus,
    COALESCE(c.name,u.email) as clientName,s.name as serviceName,s.price_cents as priceCents,p.name as professionalName
    FROM appointments a JOIN users u ON u.id=a.client_user_id LEFT JOIN clients c ON c.tenant_id=a.tenant_id AND c.user_id=u.id
    JOIN services s ON s.tenant_id=a.tenant_id AND s.id=a.service_id LEFT JOIN professionals p ON p.tenant_id=a.tenant_id AND p.id=a.professional_id
    WHERE a.tenant_id=? AND a.starts_at>=? AND a.starts_at<? ORDER BY a.starts_at,a.id LIMIT 50 OFFSET ?`,
    )
    .all(tenantId, start, end, (args.page - 1) * 50)
  return {
    ok: true,
    timezone,
    period: { start: args.start_date, end: args.end_date },
    totals,
    appointments,
    page: args.page,
    pages: Math.max(1, Math.ceil(totals.total / 50)),
  }
}
