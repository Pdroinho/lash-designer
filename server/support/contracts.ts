import { z } from 'zod'
import { badRequest } from '../http.js'

export const statuses = [
  'NEW',
  'OPEN',
  'PENDING',
  'ON_HOLD',
  'RESOLVED',
  'CLOSED',
] as const
export const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const
export const categories = [
  'ACCOUNT',
  'BILLING',
  'WHATSAPP',
  'BOOKING',
  'BUG',
  'FEATURE',
  'OTHER',
] as const
export const responseTargetHours = { LOW: 48, NORMAL: 24, HIGH: 12, URGENT: 4 }
export const attachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    base64: z.string().max(480000),
  })
  .strict()
export const commandSchema = z.object({ key: z.string().uuid() })
export const createSchema = commandSchema
  .extend({
    subject: z.string().trim().min(5).max(160),
    category: z.enum(categories),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
    body: z.string().trim().min(10).max(8000),
    attachments: z.array(attachmentSchema).max(3).default([]),
  })
  .strict()
export const replySchema = commandSchema
  .extend({
    version: z.number().int().positive(),
    body: z.string().trim().min(1).max(8000),
    internal: z.boolean().default(false),
    attachments: z.array(attachmentSchema).max(3).default([]),
  })
  .strict()
export const updateSchema = commandSchema
  .extend({
    version: z.number().int().positive(),
    status: z.enum(statuses).optional(),
    priority: z.enum(priorities).optional(),
    assignedTo: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined ||
      value.priority !== undefined ||
      value.assignedTo !== undefined,
  )
export type Ticket = {
  id: number
  tenantId: string
  requesterId: string | null
  subject: string
  category: (typeof categories)[number]
  priority: (typeof priorities)[number]
  status: (typeof statuses)[number]
  assignedTo: string | null
  version: number
  createdAt: string
  updatedAt: string
  firstResponseAt: string | null
  resolvedAt: string | null
  closedAt: string | null
}
export type Actor = {
  id: string
  role: 'DEV' | 'ADMIN' | 'STAFF'
  tenantId: string | null
}
export const protocol = (id: number) => `SUP-${String(id).padStart(6, '0')}`

export function decodeAttachments(files: z.infer<typeof attachmentSchema>[]) {
  return files.map((file) => {
    if (
      !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64) ||
      file.base64.length % 4 !== 0
    )
      throw badRequest('Anexo inválido.', 'SUPPORT_ATTACHMENT_INVALID')
    const data = Buffer.from(file.base64, 'base64')
    if (
      data.length === 0 ||
      data.length > 350 * 1024 ||
      data.toString('base64') !== file.base64
    )
      throw badRequest(
        'Cada imagem deve ter até 350 KB.',
        'SUPPORT_ATTACHMENT_SIZE',
      )
    const valid =
      file.mime === 'image/png'
        ? data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.mime === 'image/jpeg'
          ? data[0] === 255 && data[1] === 216 && data[2] === 255
          : data.subarray(0, 4).toString() === 'RIFF' &&
            data.subarray(8, 12).toString() === 'WEBP'
    if (!valid)
      throw badRequest(
        'Envie uma imagem PNG, JPEG ou WebP válida.',
        'SUPPORT_ATTACHMENT_INVALID',
      )
    const name = Array.from(file.name, (character) =>
      character.charCodeAt(0) < 32 ||
      character.charCodeAt(0) === 127 ||
      '/\\"<>:'.includes(character)
        ? '_'
        : character,
    )
      .join('')
      .slice(0, 100)
    return { name, mime: file.mime, data }
  })
}
