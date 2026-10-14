export type Role = 'DEV' | 'ADMIN' | 'CLIENT' | 'STAFF'

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
  logoLayout?: 'SYMBOL_NAME' | 'FULL'
  logoSize?: 'S' | 'M' | 'L'
  backgroundColor?: string | null
  secondaryColor?: string | null
  publicBaseUrl?: string | null
  billingRecovery?: boolean
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
  billingRecovery?: boolean
}

export type CalendarEvent = {
  id: string
  title: string
  professionalName?: string | null
  clientName: string
  start: string // ISO date string
  end: string // ISO date string
  color?: string
  textColor?: string
  status: 'confirmed' | 'pending' | 'cancelled'
  attendanceStatus?:string
  confirmationStatus?: AppointmentConfirmationStatus
  confirmationSentAt?: string | null
  confirmationRespondedAt?: string | null
  appointmentReminderSentAt?: string | null
  clientPhone?: string | null
}
