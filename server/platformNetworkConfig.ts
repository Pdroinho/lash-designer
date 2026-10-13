import type { DomainVerificationConfig } from './domains.js'

type PlatformNetworkConfigOptions = {
  appBaseUrl?: string
  frontendOrigin?: string
  devHost?: string
  cnameTarget?: string
  customDomainIpv4?: string
  customDomainIpv6?: string
}

const splitCsv = (value?: string) => String(value ?? '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

export function createPlatformNetworkConfig({
  appBaseUrl,
  frontendOrigin,
  devHost,
  cnameTarget,
  customDomainIpv4,
  customDomainIpv6,
}: PlatformNetworkConfigOptions) {
  const domainVerificationConfig: DomainVerificationConfig = {
    appBaseUrl,
    devHost,
    cnameTarget,
    expectedIpv4: splitCsv(customDomainIpv4),
    expectedIpv6: splitCsv(customDomainIpv6),
  }

  let configuredPlatformHostname: string | null = null
  for (const raw of [appBaseUrl, frontendOrigin]) {
    if (!raw) continue
    try {
      configuredPlatformHostname = new URL(raw).hostname.toLowerCase()
      break
    } catch {
      // Environment validation reports malformed URLs during startup.
    }
  }

  return { domainVerificationConfig, configuredPlatformHostname }
}
