import type { AppointmentConfirmationStatus } from '../../types'

type AdminService = {
  id: string
  name: string
  durationMinutes: number
  priceCents: number
  coverUrl?: string | null
}

type AdminAppointment = {
  id: string
  serviceId: string
  startsAt: string
  endsAt: string
  status: string
  confirmationStatus?: AppointmentConfirmationStatus
  confirmationSentAt?: string | null
  confirmationReminderSentAt?: string | null
  confirmationRespondedAt?: string | null
  appointmentReminderSentAt?: string | null
  clientEmail: string
  clientName: string | null
  clientPhone: string | null
  serviceName: string
  priceCents: number
}
export type { AdminService, AdminAppointment }

export type AdminBusinessHour = {
  id: string
  weekday: number
  startMinute: number
  endMinute: number
}

export type AdminTimeOff = {
  id: string
  startsAt: string
  endsAt: string
  reason: string | null
  createdAt: string
}
