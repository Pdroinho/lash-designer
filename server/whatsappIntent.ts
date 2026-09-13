export type ConfirmationIntent = 'CONFIRM' | 'DECLINE' | null

function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function confirmationReplyIntent(text: string) {
  const normalized = normalizeText(text)
  const code = /\b([a-f0-9]{4})\b/i.exec(text)?.[1]?.toUpperCase() ?? null
  if (!normalized) return { intent: null as ConfirmationIntent, code }

  const tokens = normalized.split(' ')
  const first = tokens[0]

  const decline =
    first === '2' ||
    /^(nao|n|cancelar|cancela|cancelo|desmarcar|desmarca|remarcar|remarca)\b/.test(normalized) ||
    /\b(nao vou|nao consigo|nao posso|nao poderei|nao comparecerei|nao estarei|quero cancelar|preciso cancelar|pode cancelar|preciso remarcar|quero remarcar)\b/.test(normalized) ||
    /\binfelizmente nao\b/.test(normalized)

  // Negative language always wins over confirmation vocabulary. This prevents
  // phrases such as "não vou conseguir confirmar" from becoming confirmations.
  if (decline) return { intent: 'DECLINE' as const, code }

  const confirm =
    first === '1' ||
    /^(sim|s|confirmo|confirmado|confirmada)\b/.test(normalized) ||
    /^confirmar(?: [a-f0-9]{4})?$/.test(normalized) ||
    /\b(pode confirmar|pode deixar confirmado|vou sim|estarei ai|estarei la|presenca confirmada)\b/.test(normalized)

  return { intent: confirm ? 'CONFIRM' as const : null, code }
}

export function marketingWhatsappOptOutIntent(text: string) {
  const normalized = normalizeText(text)
  if (!normalized) return false
  return /^(pare|parar|stop|sair|cancelar promocoes|cancelar promocao|remover meu numero|remova meu numero|nao quero|nao quero receber|nao enviar|nao me envie|nao me mande)$/.test(normalized)
}
