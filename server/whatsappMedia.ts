import path from 'node:path'

export const WHATSAPP_MEDIA_MAX_BYTES = 8 * 1024 * 1024

const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'video/mp4': '.mp4',
  'application/pdf': '.pdf',
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function normalizeWhatsappMediaPayload(raw: unknown) {
  const root = record(raw)
  const nested = record(root.data)
  const source = typeof root.base64 !== 'undefined' ? root : nested
  const base64Raw = source.base64
  let buffer: Buffer | null = null
  if (typeof base64Raw === 'string') {
    const encoded = base64Raw.includes(',') && base64Raw.startsWith('data:') ? base64Raw.slice(base64Raw.indexOf(',') + 1) : base64Raw
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(encoded) || encoded.length > Math.ceil(WHATSAPP_MEDIA_MAX_BYTES * 4 / 3) + 8) return null
    buffer = Buffer.from(encoded, 'base64')
  } else if (base64Raw && typeof base64Raw === 'object') {
    const obj = record(base64Raw)
    if (obj.type === 'Buffer' && Array.isArray(obj.data) && obj.data.length <= WHATSAPP_MEDIA_MAX_BYTES) {
      const bytes = obj.data.every((item) => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 255) ? obj.data as number[] : null
      if (bytes) buffer = Buffer.from(bytes)
    }
  }
  if (!buffer?.length || buffer.length > WHATSAPP_MEDIA_MAX_BYTES) return null

  const mime = String(source.mimetype ?? source.mimeType ?? source.mime ?? 'application/octet-stream').trim().toLowerCase().split(';')[0]
  const fileName = typeof source.fileName === 'string' ? source.fileName.trim().slice(0, 180) : null
  const extension = mimeExtensions[mime] ?? safeExtension(fileName) ?? '.bin'
  return { buffer, mime, fileName, extension }
}

function safeExtension(fileName: string | null) {
  if (!fileName) return null
  const extension = path.extname(fileName).toLowerCase()
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : null
}

export function safeWhatsappMediaRelativePath(tenantId: string, messageId: string, extension: string) {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[0-9a-f-]{36}$/i.test(messageId)) throw new Error('Identificador de mídia inválido')
  if (!/^\.[a-z0-9]{1,8}$/i.test(extension)) throw new Error('Extensão de mídia inválida')
  return path.join(tenantId, `${messageId}${extension.toLowerCase()}`)
}

export function resolvePrivateWhatsappMediaPath(rootDir: string, relativePath: string) {
  const root = path.resolve(rootDir)
  const target = path.resolve(root, relativePath)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('Caminho de mídia fora do diretório privado')
  return target
}
