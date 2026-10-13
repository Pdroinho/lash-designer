// Match provider states exactly: "disconnected" contains "connected".
export function whatsappConnectionState(raw: string | null) {
  const state = String(raw ?? '').trim().toLowerCase()
  if (['open', 'connected'].includes(state)) return 'connected' as const
  if (['qr', 'qrcode', 'qr_scan', 'scan', 'pair', 'pairing', 'connecting'].includes(state)) return 'qr_scan' as const
  return 'disconnected' as const
}
