export type WhatsappDeliveryStatus = 'UNKNOWN' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

const deliveryRank: Record<Exclude<WhatsappDeliveryStatus, 'FAILED'>, number> = {
  UNKNOWN: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
}

export function normalizeEvolutionEvent(value: unknown) {
  return String(value ?? '').replace(/[.-]/g, '_').toUpperCase()
}

export function normalizeEvolutionDeliveryStatus(value: unknown): WhatsappDeliveryStatus | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return 'FAILED'
    if (value <= 2) return 'SENT'
    if (value === 3) return 'DELIVERED'
    if (value >= 4) return 'READ'
  }
  const normalized = String(value ?? '').trim().replace(/[.\s-]/g, '_').toUpperCase()
  if (!normalized) return null
  if (['ERROR', 'FAILED', 'FAILURE'].includes(normalized)) return 'FAILED'
  if (['PENDING', 'SERVER_ACK', 'SENT', 'ACK'].includes(normalized)) return 'SENT'
  if (['DELIVERY_ACK', 'DELIVERED', 'DELIVERY'].includes(normalized)) return 'DELIVERED'
  if (['READ', 'READ_ACK', 'PLAYED'].includes(normalized)) return 'READ'
  return null
}

export function nextWhatsappDeliveryStatus(currentRaw: unknown, incomingRaw: unknown): WhatsappDeliveryStatus | null {
  const current = normalizeStoredDeliveryStatus(currentRaw)
  const incoming = normalizeEvolutionDeliveryStatus(incomingRaw)
  if (!incoming) return null
  if (incoming === 'FAILED') return current === 'UNKNOWN' || current === 'SENT' ? 'FAILED' : null
  if (current === 'FAILED') return incoming
  return deliveryRank[incoming] > deliveryRank[current] ? incoming : null
}

function normalizeStoredDeliveryStatus(value: unknown): WhatsappDeliveryStatus {
  const normalized = String(value ?? '').toUpperCase()
  if (normalized === 'SENT' || normalized === 'DELIVERED' || normalized === 'READ' || normalized === 'FAILED') return normalized
  return 'UNKNOWN'
}

const records = (value: unknown): Record<string, unknown>[] => {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(records)
  return [value as Record<string, unknown>]
}

export function extractEvolutionMessageUpdates(payload: unknown) {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  const event = normalizeEvolutionEvent(root.event ?? root.type)
  if (event !== 'MESSAGES_UPDATE') return []
  const data = root.data ?? root.message ?? root.messages
  const updates: Array<{ providerMessageId: string; status: WhatsappDeliveryStatus }> = []
  for (const item of records(data)) {
    const key = item.key && typeof item.key === 'object' ? item.key as Record<string, unknown> : {}
    const update = item.update && typeof item.update === 'object' ? item.update as Record<string, unknown> : {}
    const providerMessageId = [key.id, item.id, update.id].find((value) => typeof value === 'string' && value.trim())
    const status = normalizeEvolutionDeliveryStatus(update.status ?? item.status ?? update.messageStatus ?? item.messageStatus)
    if (typeof providerMessageId === 'string' && status) updates.push({ providerMessageId: providerMessageId.trim(), status })
  }
  return updates
}

export function normalizeEvolutionConnectionState(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (['open', 'connected', 'online'].includes(normalized)) return 'CONNECTED' as const
  if (['connecting', 'qr', 'qrcode', 'qr_scan'].includes(normalized)) return 'CONNECTING' as const
  if (['close', 'closed', 'disconnected', 'offline'].includes(normalized)) return 'DISCONNECTED' as const
  return 'UNKNOWN' as const
}

export function extractEvolutionConnectionState(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const event = normalizeEvolutionEvent(root.event ?? root.type)
  if (event !== 'CONNECTION_UPDATE') return null
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root
  return normalizeEvolutionConnectionState(data.state ?? data.status ?? data.connection ?? root.state ?? root.status)
}
