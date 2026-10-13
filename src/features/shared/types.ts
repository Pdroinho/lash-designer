import type { CSSProperties } from 'react'
import type { AppointmentConfirmationStatus } from '../../types'

export type CssVarStyle = CSSProperties & { ['--auth-accent']?: string }

export type AdminStats = {
  timeZone?: string
  publicBaseUrl?: string | null
  today?: { appointmentsCount?: number; expectedRevenueCents?: number }
  newClients30d?: number
  pendingAppointments?: number
  confirmationSummary?: { confirmed: number; awaiting: number; noResponse: number; deliveryFailed: number; declined: number; notRequested: number }
  confirmationAttention?: Array<{ id: string; startsAt: string; status: string; confirmationStatus: AppointmentConfirmationStatus; confirmationSentAt?: string | null; serviceName: string; clientName: string | null; clientPhone: string | null }>
  upcoming?: Array<{ id: string; startsAt: string; status: string; confirmationStatus?: AppointmentConfirmationStatus; confirmationSentAt?: string | null; confirmationRespondedAt?: string | null; serviceName: string; priceCents: number; clientEmail: string; clientName: string | null; clientPhone?: string | null }>
  recentActivity?: Array<{ kind: string; at: string; clientName: string | null; clientEmail: string | null; serviceName: string | null; priceCents: number | null; amountCents: number | null; note: string | null }>
}

export type AdminService = { id: string; name: string; durationMinutes: number; priceCents: number; coverUrl?: string | null }
export type AdminAppointment = { attendanceStatus?:string; id: string; serviceId: string; startsAt: string; endsAt: string; status: string; confirmationStatus?: AppointmentConfirmationStatus; confirmationSentAt?: string | null; confirmationReminderSentAt?: string | null; confirmationRespondedAt?: string | null; appointmentReminderSentAt?: string | null; clientEmail: string; clientName: string | null; clientPhone: string | null; serviceName: string; priceCents: number; professionalId?: string | null; professionalName?: string | null }
export type AdminClientRow = { id: string; name: string; phone: string | null; marketingWhatsappOptIn: number | boolean; email: string; totalSpentCents: number; lastVisitAt: string | null }
export type FinanceMonthSnapshot = { ym: string; serviceEntriesCents: number; manualIncomeCents: number; entriesCents: number; expensesCents: number; balanceCents: number; confirmedAppointments: number }
export type AdminFinanceData = {
  timeZone: string; todayYmd: string; currentMonthYm: string; currentMonth: FinanceMonthSnapshot; previousMonth: FinanceMonthSnapshot
  totals: { entriesCents: number; expensesCents: number; profitCents: number }
  goals: { revenueCents: number; newClients: number; currentRevenueCents: number; currentNewClients: number }
  expenseCategories: Array<{ label: string; amountCents: number; transactions: number }>
  lastCashTransactions: Array<{ id: string; type: 'INCOME' | 'EXPENSE'; amountCents: number; method: string; note: string | null; createdAt: string }>
  lastEntries: Array<{ id: string; startsAt: string; status: string; serviceName: string; priceCents: number; clientEmail: string; clientName: string | null }>
  monthly: FinanceMonthSnapshot[]
}
export type ClientAppointment = { id: string; serviceName: string; professionalName?: string | null; startsAt: string; status: string; confirmationStatus?: AppointmentConfirmationStatus; confirmationSentAt?: string | null; confirmationRespondedAt?: string | null }
