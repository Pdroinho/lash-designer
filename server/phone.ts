export function normalizeBrazilPhone(raw: string) {
  const original = String(raw ?? '').trim()
  let digits = original.replace(/\D/g, '')

  if (digits.startsWith('550') && (digits.length === 13 || digits.length === 14)) digits = `55${digits.slice(3)}`
  if (digits.startsWith('0') && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1)

  const explicitlyInternational = original.startsWith('+')
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
