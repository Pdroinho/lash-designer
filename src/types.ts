export type Role = 'DEV' | 'ADMIN' | 'CLIENT'

export type AppointmentConfirmationStatus =
  | 'NOT_REQUESTED'
  | 'AWAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'NO_RESPONSE'
  | 'DELIVERY_FAILED'
  | 'MANUALLY_CONFIRMED'

export type TenantPublic = {
  id: string
  slug: string
  name: string
  primaryColor: string
  logoUrl: string | null
  publicBaseUrl?: string | null
}

export type TenantDev = TenantPublic & {
  createdAt: string
  adminEmail: string | null
  userCount: number
  status?: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
  subscriptionStatus?: string | null
  subscriptionPeriodEnd?: string | null
}

export type SessionUser = {
  id: string
  name?: string
  email: string
  role: Role
  tenantId: string | null
  tenantSlug: string | null
  subscriptionStatus?: string | null
}

export type CalendarEvent = {
  id: string
  title: string
  clientName: string
  start: string // ISO date string
  end: string // ISO date string
  color?: string
  textColor?: string
  status: 'confirmed' | 'pending' | 'cancelled'
  confirmationStatus?: AppointmentConfirmationStatus
  confirmationSentAt?: string | null
  confirmationRespondedAt?: string | null
  appointmentReminderSentAt?: string | null
  clientPhone?: string | null
}
