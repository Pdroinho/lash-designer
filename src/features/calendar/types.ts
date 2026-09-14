import type { AppointmentConfirmationStatus } from '../../types'

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
export type { AdminAppointment }

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
