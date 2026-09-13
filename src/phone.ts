const onlyDigits = (value: string) => String(value ?? '').replace(/\D/g, '')

function stripBrazilTrunkPrefix(digits: string) {
  if (digits.startsWith('550') && (digits.length === 13 || digits.length === 14)) return `55${digits.slice(3)}`
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) return digits.slice(1)
  return digits
}

export function normalizeBrazilPhone(value: string): string | null {
  const raw = String(value ?? '').trim()
  let digits = stripBrazilTrunkPrefix(onlyDigits(raw))

  const explicitlyInternational = raw.startsWith('+')
  if (explicitlyInternational && !digits.startsWith('55')) return null
  if (digits.length > 11 && !digits.startsWith('55')) return null
  if (digits.startsWith('55') && (explicitlyInternational || digits.length >= 12)) digits = digits.slice(2)

  if (digits.length !== 10 && digits.length !== 11) return null
  const ddd = digits.slice(0, 2)
  const subscriber = digits.slice(2)
  if (!/^[1-9]\d$/.test(ddd)) return null
  if (subscriber.length !== 8 && subscriber.length !== 9) return null

  return `55${digits}`
}

function formatNationalBrazilPhone(nationalDigits: string) {
  const digits = nationalDigits.slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 2) return digits.length === 2 ? `(${digits})` : `(${digits}`

  const ddd = digits.slice(0, 2)
  const subscriber = digits.slice(2)
  const splitAt = subscriber.length > 8 ? 5 : 4
  const first = subscriber.slice(0, splitAt)
  const second = subscriber.slice(splitAt, splitAt + 4)
  return `(${ddd}) ${first}${second ? `-${second}` : ''}`
}

export function formatBrazilPhoneInput(value: string): string {
  const raw = String(value ?? '')
  let digits = stripBrazilTrunkPrefix(onlyDigits(raw))
  const explicitPlus = raw.trim().startsWith('+')
  const hasExplicitCountryCode = explicitPlus || (digits.startsWith('55') && digits.length > 11)

  if (explicitPlus && !digits.startsWith('55')) return `+${digits.slice(0, 13)}`
  if (hasExplicitCountryCode && digits.startsWith('55')) {
    digits = digits.slice(2)
    return `+55 ${formatNationalBrazilPhone(digits)}`.trimEnd()
  }

  return formatNationalBrazilPhone(digits)
}

export function isBrazilPhoneComplete(value: string) {
  return normalizeBrazilPhone(value) !== null
}
