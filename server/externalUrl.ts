import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'

const blockedHostnames = new Set(['localhost', 'localhost.localdomain'])

const isBlockedIpv4 = (host: string) => {
  const octets = host.split('.').map(Number)
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

const isBlockedIpv6 = (host: string) => {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    return isIP(mapped) === 4 ? isBlockedIpv4(mapped) : true
  }
  return false
}

export function isPublicExternalIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '')
  const version = isIP(normalized)
  if (version === 4) return !isBlockedIpv4(normalized)
  if (version === 6) return !isBlockedIpv6(normalized)
  return false
}

export function assertResolvedAddressesPublic(addresses: readonly string[]) {
  if (addresses.length === 0 || addresses.some((address) => !isPublicExternalIp(address))) {
    throw new Error('Host externo resolveu para endereço privado, local ou inválido')
  }
}

export function normalizeExternalHttpsBaseUrl(raw: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new Error('URL externa inválida')
  }

  if (parsed.protocol !== 'https:') throw new Error('A URL externa deve usar HTTPS')
  if (parsed.username || parsed.password) throw new Error('A URL externa não pode conter credenciais')
  if (parsed.search || parsed.hash) throw new Error('A URL externa não pode conter query string ou fragmento')

  const normalizedHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const asciiHost = isIP(normalizedHost) ? normalizedHost : domainToASCII(normalizedHost)
  if (!asciiHost || blockedHostnames.has(asciiHost) || asciiHost.endsWith('.local') || asciiHost.endsWith('.internal')) {
    throw new Error('Host externo não permitido')
  }

  const ipVersion = isIP(asciiHost)
  if ((ipVersion === 4 && isBlockedIpv4(asciiHost)) || (ipVersion === 6 && isBlockedIpv6(asciiHost))) {
    throw new Error('Endereços privados ou locais não são permitidos')
  }

  parsed.hostname = asciiHost
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
  return parsed.toString().replace(/\/$/, '')
}

export async function resolveExternalHttpsBaseUrl(raw: string): Promise<string> {
  const normalized = normalizeExternalHttpsBaseUrl(raw)
  const parsed = new URL(normalized)
  if (isIP(parsed.hostname)) return normalized

  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true })
  assertResolvedAddressesPublic(addresses.map((item) => item.address))
  return normalized
}
