import type Database from 'better-sqlite3'
import type { Request } from 'express'

// Recovery admits ADMIN authentication and billing only, never an unpaid workspace.
export function isBillingRecoveryTenant(db: Database.Database, tenantId: string, status: string | null) {
  if (status === 'ONBOARDING') {
    return Boolean(db.prepare('SELECT 1 FROM appmax_checkout_intents WHERE tenant_id = ? LIMIT 1').get(tenantId))
  }
  if (status === 'SUSPENDED') {
    return Boolean(db.prepare("SELECT 1 FROM tenants WHERE id = ? AND suspension_reason = 'APPMAX'").get(tenantId))
  }
  return false
}

export function isBillingRecoveryRequest(req: Pick<Request, 'method' | 'originalUrl'>) {
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '')
  if (path.startsWith('/api/auth/')) return true
  if (req.method === 'GET' && /^\/api\/support\/(tickets(?:\/\d+)?|notifications|attachments\/[a-f0-9-]{36})$/i.test(path)) return true
  if (req.method === 'POST' && /^\/api\/support\/tickets(?:\/\d+\/(?:replies|read))?$/.test(path)) return true
  if (req.method === 'PATCH' && /^\/api\/support\/(notifications|tickets\/\d+)$/.test(path)) return true
  if (req.method === 'GET') {
    return ['/api/public/tenant', '/api/admin/billing/overview', '/api/admin/subscription/team-plans'].includes(path)
      || /^\/api\/admin\/subscription\/team-order\/[a-f0-9-]{36}$/i.test(path)
  }
  return req.method === 'POST' && path === '/api/admin/subscription/team-checkout'
}
