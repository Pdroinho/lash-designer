import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError, notFound } from '../http.js'
import type { BillingPlan } from '../plans.js'
import {
  createOperationalRouter,
  createPublicBillingCatalogRouter,
  createPublicDevThemeRouter,
  createPublicLegalRouter,
} from './platformRoutes.js'

const tenantActive = '11111111-1111-4111-8111-111111111111'
const tenantInactive = '22222222-2222-4222-8222-222222222222'

test('rotas da plataforma preservam saúde, domínios, tema, legal e planos', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT, status TEXT);
    CREATE TABLE tenant_domains (id TEXT PRIMARY KEY, tenant_id TEXT, domain TEXT, status TEXT);
    CREATE TABLE platform_settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO tenants VALUES
      ('${tenantActive}', 'studio-ativo', 'ACTIVE'),
      ('${tenantInactive}', 'studio-inativo', 'SUSPENDED');
    INSERT INTO tenant_domains VALUES
      ('domain-active', '${tenantActive}', 'agenda.studioativo.com.br', 'ACTIVE'),
      ('domain-pending', '${tenantActive}', 'pendente.studioativo.com.br', 'PENDING'),
      ('domain-inactive-tenant', '${tenantInactive}', 'agenda.inativo.com.br', 'ACTIVE');
    INSERT INTO platform_settings VALUES ('dev_primary_color', '#7A3151');
  `)
  const unavailableDb = new Database(':memory:')
  unavailableDb.close()
  const plans: BillingPlan[] = [{
    cycle: 'MONTHLY', months: 1, label: 'Mensal', amountCents: 5990,
    monthlyEquivalentCents: 5990, savingsPercent: 0, featured: false,
  }]
  let legalReads = 0
  const tenantSlug = (hostname: string) => {
    const suffix = '.platform.example'
    if (!hostname.endsWith(suffix)) return null
    const label = hostname.slice(0, -suffix.length)
    return label && !label.includes('.') ? label : null
  }

  const app = express()
  app.use('/api', createOperationalRouter({
    db,
    appVersion: '5.11.0-test',
    domainAuthSecret: 'domain-secret-test',
    platformHostname: 'platform.example',
    devHost: 'dev.example',
    getTenantSlugFromHostname: tenantSlug,
  }))
  app.use('/unavailable', createOperationalRouter({
    db: unavailableDb,
    appVersion: 'unavailable',
    platformHostname: null,
    getTenantSlugFromHostname: () => null,
  }))
  app.use('/api/public', createPublicDevThemeRouter({
    db,
    requireDevHost: (req, _res, next) => req.headers['x-test-dev'] === 'true' ? next() : next(notFound()),
  }))
  app.use('/api/public', createPublicLegalRouter(() => {
    legalReads += 1
    return { bundleVersion: 'terms-test|privacy-test', provider: { name: 'Lash Designer Teste' } }
  }))
  app.use('/api/public', createPublicBillingCatalogRouter(plans))
  app.use('/api/team-public', createPublicBillingCatalogRouter(plans, true))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const authorize = (secret: string, domain: string) => fetch(`${baseUrl}/api/internal/domains/authorize/${secret}?domain=${encodeURIComponent(domain)}`)

  try {
    const health = await fetch(`${baseUrl}/api/health`)
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { ok: true, service: 'lashdesigner', version: '5.11.0-test' })

    const ready = await fetch(`${baseUrl}/api/ready`)
    assert.equal(ready.status, 200)
    assert.deepEqual(await ready.json(), { ok: true, database: 'ready' })
    const unavailable = await fetch(`${baseUrl}/unavailable/ready`)
    assert.equal(unavailable.status, 503)
    assert.deepEqual(await unavailable.json(), { ok: false, database: 'unavailable' })
    const missingSecretConfig = await fetch(`${baseUrl}/unavailable/internal/domains/authorize/anything?domain=platform.example`)
    assert.equal(missingSecretConfig.status, 503)
    assert.deepEqual(await missingSecretConfig.json(), { message: 'Autorização de domínio não configurada' })

    assert.equal((await authorize('wrong-secret', 'platform.example')).status, 401)
    assert.equal((await authorize('domain-secret-test', 'https://platform.example')).status, 400)
    assert.equal((await authorize('domain-secret-test', 'platform.example')).status, 204)
    assert.equal((await authorize('domain-secret-test', 'dev.example')).status, 204)
    assert.equal((await authorize('domain-secret-test', 'studio-ativo.platform.example')).status, 204)
    assert.equal((await authorize('domain-secret-test', 'studio-inativo.platform.example')).status, 403)
    assert.equal((await authorize('domain-secret-test', 'agenda.studioativo.com.br')).status, 204)
    assert.equal((await authorize('domain-secret-test', 'pendente.studioativo.com.br')).status, 403)
    assert.equal((await authorize('domain-secret-test', 'agenda.inativo.com.br')).status, 403)
    assert.equal((await authorize('domain-secret-test', 'desconhecido.example')).status, 403)

    assert.equal((await fetch(`${baseUrl}/api/public/dev-theme`)).status, 404)
    const theme = await fetch(`${baseUrl}/api/public/dev-theme`, { headers: { 'x-test-dev': 'true' } })
    assert.equal(theme.status, 200)
    assert.deepEqual(await theme.json(), { primaryColor: '#7A3151' })

    const legal = await fetch(`${baseUrl}/api/public/legal`)
    assert.equal(legal.status, 200)
    assert.deepEqual(await legal.json(), { bundleVersion: 'terms-test|privacy-test', provider: { name: 'Lash Designer Teste' } })
    assert.equal(legalReads, 1)

    const catalog = await fetch(`${baseUrl}/api/public/billing/plans`)
    assert.equal(catalog.status, 200)
    const published = await catalog.json()
    assert.deepEqual(published.plans, [])
    assert.equal(published.checkoutAvailable, false)
    assert.equal(published.checkoutProvider, 'APPMAX')
    assert.deepEqual(published.teamPlans.map((plan: {amountCents:number}) => plan.amountCents), [7490,9990,14900])
    const teamCatalog = await fetch(`${baseUrl}/api/team-public/billing/plans`)
    assert.equal(teamCatalog.status, 200)
    const teamBody = await teamCatalog.json() as { teamPlans: Array<{ code: string; amountCents: number }>; plans: unknown[]; teamCheckoutEnabled: boolean; checkoutProvider: string; checkoutAvailable:boolean }
    assert.equal(teamBody.teamCheckoutEnabled, true)
    assert.equal(teamBody.checkoutAvailable, true)
    assert.deepEqual(teamBody.plans, [])
    assert.equal(teamBody.checkoutProvider, 'APPMAX')
    assert.deepEqual(teamBody.teamPlans.map(plan => [plan.code, plan.amountCents]), [['TEAM_3', 7490], ['TEAM_6', 9990], ['TEAM_15', 14900]])
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
