import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminTenantSettingsRouter, type TenantDomainRow } from './adminTenantSettingsRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const pendingDomain = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const activeDomain = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const otherDomain = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

test('configurações ADMIN preservam identidade, DNS, limites e isolamento por tenant', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY, slug TEXT, name TEXT, primary_color TEXT, logo_url TEXT
    );
    CREATE TABLE tenant_domains (
      id TEXT PRIMARY KEY, tenant_id TEXT, domain TEXT UNIQUE, status TEXT,
      verification_token TEXT, verification_method TEXT, created_at TEXT,
      last_checked_at TEXT, verified_at TEXT, verification_error TEXT,
      is_primary INTEGER DEFAULT 0
    );
    INSERT INTO tenants VALUES
      ('${tenantOne}', 'espaco-um', 'Espaço Um', '#7D2450', NULL),
      ('${tenantTwo}', 'espaco-dois', 'Espaço Dois', '#112233', NULL);
    INSERT INTO tenant_domains VALUES
      ('${pendingDomain}', '${tenantOne}', 'pendente.exemplo.com', 'PENDING', 'token-pending', 'DNS_TXT', '2030-01-01T00:00:00.000Z', NULL, NULL, NULL, 0),
      ('${activeDomain}', '${tenantOne}', 'agenda.exemplo.com', 'ACTIVE', 'token-active', 'DNS_TXT', '2030-01-02T00:00:00.000Z', '2030-01-03T00:00:00.000Z', '2030-01-03T00:00:00.000Z', NULL, 1),
      ('${otherDomain}', '${tenantTwo}', 'tomado.com', 'ACTIVE', 'token-other', 'DNS_TXT', '2030-01-04T00:00:00.000Z', NULL, NULL, NULL, 1);
  `)

  const getDomainRow = (id: string, tenantId?: string) => db.prepare(`
    SELECT id, tenant_id as tenantId, domain, status,
           verification_token as verificationToken, created_at as createdAt,
           last_checked_at as lastCheckedAt, verified_at as verifiedAt,
           verification_error as verificationError, is_primary as isPrimary
    FROM tenant_domains
    WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}
  `).get(...(tenantId ? [id, tenantId] : [id])) as TenantDomainRow | undefined

  const domainSetupPayload = (row: TenantDomainRow) => ({
    id: row.id,
    domain: row.domain,
    status: row.status,
    isPrimary: Boolean(row.isPrimary),
    verificationToken: row.verificationToken,
  })

  let limiterCalls = 0
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    if (req.headers['x-test-admin'] === 'true') {
      req.sessionUser = {
        id: 'admin-1', role: 'ADMIN',
        tenantId: req.headers['x-test-missing-tenant'] === 'true' ? '33333333-3333-4333-8333-333333333333' : tenantOne,
        sessionId: 'session-admin', persistent: false, trustedDeviceId: null,
      }
    }
    next()
  })
  app.use('/api/admin', createAdminTenantSettingsRouter({
    db,
    domainVerifyLimiter: (_req, _res, next) => { limiterCalls += 1; next() },
    domainVerificationConfig: {
      appBaseUrl: 'https://app.exemplo.com',
      cnameTarget: 'domains.exemplo.com',
      expectedIpv4: [],
      expectedIpv6: [],
    },
    getDomainRow,
    verifyDomainRow: async row => {
      const checkedAt = '2030-01-10T12:00:00.000Z'
      db.prepare(`UPDATE tenant_domains SET status = 'ACTIVE', last_checked_at = ?, verified_at = ?, verification_error = NULL WHERE id = ?`)
        .run(checkedAt, checkedAt, row.id)
      return { verified: true, ownershipVerified: true, routingVerified: true, error: null, row: getDomainRow(row.id) }
    },
    domainSetupPayload,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const headers = { 'content-type': 'application/json', 'x-test-admin': 'true' }

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/domains`)).status, 401)

    const emptyTenantPatch = await fetch(`${baseUrl}/api/admin/tenant`, { method: 'PATCH', headers, body: '{}' })
    assert.equal(emptyTenantPatch.status, 400)
    assert.equal((await emptyTenantPatch.json() as { code: string }).code, 'NO_UPDATES')

    const invalidLogo = await fetch(`${baseUrl}/api/admin/tenant`, {
      method: 'PATCH', headers, body: JSON.stringify({ logoUrl: 'ftp://arquivo.example/logo.png' }),
    })
    assert.equal(invalidLogo.status, 400)

    const updatedTenantResponse = await fetch(`${baseUrl}/api/admin/tenant`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ name: 'Espaço Atualizado', primaryColor: '#AABBCC', logoUrl: '  https://cdn.example/logo.png  ' }),
    })
    assert.equal(updatedTenantResponse.status, 200)
    assert.deepEqual(await updatedTenantResponse.json(), {
      tenant: { id: tenantOne, slug: 'espaco-um', name: 'Espaço Atualizado', primaryColor: '#AABBCC', logoUrl: 'https://cdn.example/logo.png' },
    })
    assert.equal((db.prepare('SELECT name FROM tenants WHERE id = ?').get(tenantTwo) as { name: string }).name, 'Espaço Dois')

    const missingTenant = await fetch(`${baseUrl}/api/admin/tenant`, {
      method: 'PATCH', headers: { ...headers, 'x-test-missing-tenant': 'true' }, body: JSON.stringify({ name: 'Inexistente' }),
    })
    assert.equal(missingTenant.status, 404)
    assert.equal((await missingTenant.json() as { code: string }).code, 'TENANT_NOT_FOUND')

    const listed = await fetch(`${baseUrl}/api/admin/domains`, { headers }).then(response => response.json()) as { domains: Array<{ id: string }> }
    assert.deepEqual(listed.domains.map(domain => domain.id), [activeDomain, pendingDomain])

    const reserved = await fetch(`${baseUrl}/api/admin/domains`, {
      method: 'POST', headers, body: JSON.stringify({ domain: 'sub.app.exemplo.com' }),
    })
    assert.equal(reserved.status, 400)
    assert.equal((await reserved.json() as { code: string }).code, 'DOMAIN_RESERVED')

    const taken = await fetch(`${baseUrl}/api/admin/domains`, {
      method: 'POST', headers, body: JSON.stringify({ domain: 'TOMADO.COM' }),
    })
    assert.equal(taken.status, 400)
    assert.equal((await taken.json() as { code: string }).code, 'DOMAIN_TAKEN')

    const createdResponse = await fetch(`${baseUrl}/api/admin/domains`, {
      method: 'POST', headers, body: JSON.stringify({ domain: ' WWW.Novo.COM ' }),
    })
    assert.equal(createdResponse.status, 201)
    const created = await createdResponse.json() as { domain: { id: string; domain: string; status: string; verificationToken: string } }
    assert.equal(created.domain.domain, 'www.novo.com')
    assert.equal(created.domain.status, 'PENDING')
    assert.match(created.domain.verificationToken, /^[a-f0-9]{48}$/)

    const pendingPrimary = await fetch(`${baseUrl}/api/admin/domains/${pendingDomain}/primary`, { method: 'POST', headers })
    assert.equal(pendingPrimary.status, 400)
    assert.equal((await pendingPrimary.json() as { code: string }).code, 'DOMAIN_NOT_ACTIVE')

    const unauthorizedVerify = await fetch(`${baseUrl}/api/admin/domains/${created.domain.id}/verify`, { method: 'POST' })
    assert.equal(unauthorizedVerify.status, 401)
    assert.equal(limiterCalls, 1)

    const foreignVerify = await fetch(`${baseUrl}/api/admin/domains/${otherDomain}/verify`, { method: 'POST', headers })
    assert.equal(foreignVerify.status, 404)
    assert.equal(limiterCalls, 2)

    const verified = await fetch(`${baseUrl}/api/admin/domains/${created.domain.id}/verify`, { method: 'POST', headers })
      .then(response => response.json()) as { domain: { status: string }; verification: { verified: boolean } }
    assert.equal(verified.domain.status, 'ACTIVE')
    assert.equal(verified.verification.verified, true)
    assert.equal(limiterCalls, 3)

    const primary = await fetch(`${baseUrl}/api/admin/domains/${created.domain.id}/primary`, { method: 'POST', headers })
      .then(response => response.json()) as { domain: { id: string; isPrimary: boolean } }
    assert.deepEqual(primary.domain, { id: created.domain.id, domain: 'www.novo.com', status: 'ACTIVE', isPrimary: true, verificationToken: created.domain.verificationToken })
    assert.equal((db.prepare('SELECT is_primary as isPrimary FROM tenant_domains WHERE id = ?').get(activeDomain) as { isPrimary: number }).isPrimary, 0)
    assert.equal((db.prepare('SELECT is_primary as isPrimary FROM tenant_domains WHERE id = ?').get(otherDomain) as { isPrimary: number }).isPrimary, 1)

    const foreignDelete = await fetch(`${baseUrl}/api/admin/domains/${otherDomain}`, { method: 'DELETE', headers })
    assert.equal(foreignDelete.status, 404)
    assert.deepEqual(await fetch(`${baseUrl}/api/admin/domains/${created.domain.id}`, { method: 'DELETE', headers }).then(response => response.json()), { ok: true })

    for (let index = 0; index < 3; index += 1) {
      db.prepare(`INSERT INTO tenant_domains (id, tenant_id, domain, status, verification_token, verification_method, created_at, is_primary) VALUES (?, ?, ?, 'PENDING', ?, 'DNS_TXT', ?, 0)`)
        .run(`dddddddd-dddd-4ddd-8dd${index}-ddddddddddd${index}`, tenantOne, `extra-${index}.example.com`, `token-${index}`, `2030-01-0${index + 5}T00:00:00.000Z`)
    }
    const limited = await fetch(`${baseUrl}/api/admin/domains`, {
      method: 'POST', headers, body: JSON.stringify({ domain: 'sexto.example.com' }),
    })
    assert.equal(limited.status, 400)
    assert.equal((await limited.json() as { code: string }).code, 'DOMAIN_LIMIT_REACHED')
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
