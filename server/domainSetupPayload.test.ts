import assert from 'node:assert/strict'
import test from 'node:test'
import { createDomainSetupPayloadFactory } from './domainSetupPayload.js'
import type { TenantDomainRow } from './domainVerificationRuntime.js'

const row: TenantDomainRow = {
  id: 'domain-1', tenantId: 'tenant-1', domain: 'studio.example.com', status: 'PENDING',
  verificationToken: 'token-1', createdAt: '2030-01-01T00:00:00.000Z', lastCheckedAt: null,
  verifiedAt: null, verificationError: null, isPrimary: 1,
}

test('gera instruções CNAME e converte a flag de domínio primário', () => {
  const payload = createDomainSetupPayloadFactory({
    cnameTarget: 'domains.example.com',
    verificationConfig: { expectedIpv4: ['203.0.113.10'], expectedIpv6: ['2001:db8::10'] },
  })(row)

  assert.equal(payload.isPrimary, true)
  assert.deepEqual(payload.dns.verification, {
    type: 'TXT', name: '_lashdesigner-verification.studio.example.com', value: 'lashdesigner=token-1',
  })
  assert.deepEqual(payload.dns.routing, {
    type: 'CNAME', name: 'studio.example.com', value: 'domains.example.com',
  })
})

test('gera instruções A/AAAA e omite valor TXT enquanto não houver token', () => {
  const payload = createDomainSetupPayloadFactory({
    verificationConfig: { expectedIpv4: ['203.0.113.10'], expectedIpv6: ['2001:db8::10'] },
  })({ ...row, verificationToken: null, isPrimary: 0 })

  assert.equal(payload.isPrimary, false)
  assert.equal(payload.dns.verification.value, null)
  assert.deepEqual(payload.dns.routing, {
    type: 'A/AAAA', name: 'studio.example.com',
    ipv4: ['203.0.113.10'], ipv6: ['2001:db8::10'],
  })
})
