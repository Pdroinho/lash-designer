import type { TenantPublic } from './types'

export function applyTenantTheme(tenant: TenantPublic | null) {
  const root = document.documentElement
  if (!tenant) return
  root.style.setProperty('--primary', tenant.primaryColor)
}

