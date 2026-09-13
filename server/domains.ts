import { resolve4, resolve6, resolveCname, resolveTxt } from 'node:dns/promises'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { badRequest } from './http.js'

export type DomainVerificationConfig = {
  appBaseUrl?: string
  devHost?: string
  cnameTarget?: string
  expectedIpv4: string[]
  expectedIpv6: string[]
}

export type DomainVerificationResult = {
  verified: boolean
  ownershipVerified: boolean
  routingVerified: boolean
  checkedAt: string
  error: string | null
  details: {
    txtRecords: string[]
    cnameRecords: string[]
    ipv4Records: string[]
    ipv6Records: string[]
  }
}

const normalizeDnsName = (value: string) => value.trim().toLowerCase().replace(/\.$/, '')

export function normalizeCustomDomain(raw: string) {
  const input = String(raw ?? '').trim().toLowerCase()
  if (!input) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (input.includes('://')) throw badRequest('Use apenas o domínio, sem http:// ou https://', 'INVALID_DOMAIN')
  if (/[\s/?#@]/.test(input)) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (input.startsWith('.') || input.endsWith('.')) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')

  const ascii = domainToASCII(input)
  if (!ascii || ascii.length > 253) throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  if (isIP(ascii)) throw badRequest('Informe um domínio, não um endereço IP', 'INVALID_DOMAIN')

  const labels = ascii.split('.')
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw badRequest('Domínio inválido', 'INVALID_DOMAIN')
  }

  return ascii
}

export function domainVerificationRecord(domain: string) {
  return `_lashdesigner-verification.${domain}`
}

export function domainVerificationValue(token: string) {
  return `lashdesigner=${token}`
}

export function assertDomainIsNotReserved(domain: string, config: DomainVerificationConfig) {
  const reserved = new Set<string>()
  const addHost = (value?: string) => {
    if (!value) return
    try {
      reserved.add(normalizeDnsName(new URL(value).hostname))
    } catch {
      reserved.add(normalizeDnsName(value))
    }
  }

  addHost(config.appBaseUrl)
  addHost(config.devHost)
  addHost(config.cnameTarget)

  for (const value of reserved) {
    if (!value) continue
    if (domain === value || domain.endsWith(`.${value}`)) {
      throw badRequest('Esse domínio é reservado pela plataforma', 'DOMAIN_RESERVED')
    }
  }
}

async function safeResolve<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    const code = (error as { code?: string }).code
    // Ausência autoritativa de registro é um resultado válido da verificação.
    // Falhas transitórias do resolvedor devem subir para que um domínio já ativo
    // não seja desativado por timeout, SERVFAIL ou indisponibilidade momentânea.
    if (code === 'ENODATA' || code === 'ENOTFOUND') return null
    throw error
  }
}

export async function verifyCustomDomain(
  domain: string,
  verificationToken: string,
  config: DomainVerificationConfig,
): Promise<DomainVerificationResult> {
  const checkedAt = new Date().toISOString()
  const txtName = domainVerificationRecord(domain)

  const [txtRaw, cnameRaw, ipv4Raw, ipv6Raw] = await Promise.all([
    safeResolve(() => resolveTxt(txtName)),
    safeResolve(() => resolveCname(domain)),
    safeResolve(() => resolve4(domain)),
    safeResolve(() => resolve6(domain)),
  ])

  const txtRecords = (txtRaw ?? []).map((chunks) => chunks.join('').trim())
  const cnameRecords = (cnameRaw ?? []).map(normalizeDnsName)
  const ipv4Records = (ipv4Raw ?? []).map((value) => value.trim())
  const ipv6Records = (ipv6Raw ?? []).map((value) => value.trim().toLowerCase())

  const ownershipVerified = txtRecords.includes(domainVerificationValue(verificationToken))
  const cnameTarget = config.cnameTarget ? normalizeDnsName(config.cnameTarget) : null
  const expectedIpv4 = new Set(config.expectedIpv4.map((value) => value.trim()).filter(Boolean))
  const expectedIpv6 = new Set(config.expectedIpv6.map((value) => value.trim().toLowerCase()).filter(Boolean))

  const cnameMatches = Boolean(cnameTarget && cnameRecords.some((record) => record === cnameTarget))
  const ipv4Matches = ipv4Records.some((record) => expectedIpv4.has(record))
  const ipv6Matches = ipv6Records.some((record) => expectedIpv6.has(record))
  const routingConfigured = Boolean(cnameTarget || expectedIpv4.size || expectedIpv6.size)
  const routingVerified = routingConfigured && (cnameMatches || ipv4Matches || ipv6Matches)

  let error: string | null = null
  if (!routingConfigured) {
    error = 'A plataforma ainda não configurou o destino DNS para domínios personalizados.'
  } else if (!ownershipVerified && !routingVerified) {
    error = 'Os registros de verificação e apontamento ainda não foram encontrados.'
  } else if (!ownershipVerified) {
    error = 'O registro TXT de verificação ainda não foi encontrado.'
  } else if (!routingVerified) {
    error = 'O domínio ainda não aponta para a plataforma.'
  }

  return {
    verified: ownershipVerified && routingVerified,
    ownershipVerified,
    routingVerified,
    checkedAt,
    error,
    details: { txtRecords, cnameRecords, ipv4Records, ipv6Records },
  }
}
