import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlatformNetworkConfig } from './platformNetworkConfig.js'

test('configuração de domínio normaliza listas e prioriza hostname público principal', () => {
  const config = createPlatformNetworkConfig({
    appBaseUrl: 'https://APP.Example.com/path',
    frontendOrigin: 'https://fallback.example.com',
    devHost: 'dev.local',
    cnameTarget: 'domains.example.com',
    customDomainIpv4: '203.0.113.10, 203.0.113.11,',
    customDomainIpv6: '2001:db8::10',
  })
  assert.equal(config.configuredPlatformHostname, 'app.example.com')
  assert.deepEqual(config.domainVerificationConfig, {
    appBaseUrl: 'https://APP.Example.com/path', devHost: 'dev.local', cnameTarget: 'domains.example.com',
    expectedIpv4: ['203.0.113.10', '203.0.113.11'], expectedIpv6: ['2001:db8::10'],
  })
})

test('hostname usa origem válida como fallback e aceita ausência total', () => {
  assert.equal(createPlatformNetworkConfig({ appBaseUrl: 'inválida', frontendOrigin: 'https://Web.Example.com', devHost: 'dev.local' }).configuredPlatformHostname, 'web.example.com')
  assert.equal(createPlatformNetworkConfig({ devHost: 'dev.local' }).configuredPlatformHostname, null)
})
