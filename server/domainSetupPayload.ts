import type { DomainVerificationConfig } from './domains.js'
import { domainVerificationRecord, domainVerificationValue } from './domains.js'
import type { TenantDomainRow } from './domainVerificationRuntime.js'

type DomainSetupPayloadOptions = {
  cnameTarget?: string
  verificationConfig: DomainVerificationConfig
}

export function createDomainSetupPayloadFactory({
  cnameTarget,
  verificationConfig,
}: DomainSetupPayloadOptions) {
  return (row: TenantDomainRow) => ({
    id: row.id,
    domain: row.domain,
    status: row.status,
    createdAt: row.createdAt,
    lastCheckedAt: row.lastCheckedAt,
    verifiedAt: row.verifiedAt,
    verificationError: row.verificationError,
    isPrimary: Boolean(row.isPrimary),
    dns: {
      verification: {
        type: 'TXT',
        name: domainVerificationRecord(row.domain),
        value: row.verificationToken ? domainVerificationValue(row.verificationToken) : null,
      },
      routing: cnameTarget
        ? { type: 'CNAME', name: row.domain, value: cnameTarget }
        : {
            type: 'A/AAAA',
            name: row.domain,
            ipv4: verificationConfig.expectedIpv4,
            ipv6: verificationConfig.expectedIpv6,
          },
    },
  })
}
