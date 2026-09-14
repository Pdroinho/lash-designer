import type { AppointmentConfirmationStatus } from '../../types'

export type AdminStats = {
  timeZone?: string
  publicBaseUrl?: string | null
  today?: { appointmentsCount?: number; expectedRevenueCents?: number }
  newClients30d?: number
  pendingAppointments?: number
  confirmationSummary?: { confirmed: number; awaiting: number; noResponse: number; deliveryFailed: number; declined: number; notRequested: number }
  confirmationAttention?: Array<{
    id: string
    startsAt: string
    status: string
    confirmationStatus: AppointmentConfirmationStatus
    confirmationSentAt?: string | null
    serviceName: string
    clientName: string | null
    clientPhone: string | null
  }>
  upcoming?: Array<{
    id: string
    startsAt: string
    status: string
    confirmationStatus?: AppointmentConfirmationStatus
    confirmationSentAt?: string | null
    confirmationRespondedAt?: string | null
    serviceName: string
    priceCents: number
    clientEmail: string
    clientName: string | null
    clientPhone?: string | null
  }>
  recentActivity?: Array<{
    kind: string
    at: string
    clientName: string | null
    clientEmail: string | null
    serviceName: string | null
    priceCents: number | null
    amountCents: number | null
    note: string | null
  }>
}
