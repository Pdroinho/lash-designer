export type Role = 'DEV' | 'ADMIN' | 'CLIENT'

export type TenantPublic = {
  id: string
  slug: string
  name: string
  primaryColor: string
  logoUrl: string | null
}

export type SessionUser = {
  id: string
  email: string
  role: Role
  tenantId: string | null
  tenantSlug: string | null
}

