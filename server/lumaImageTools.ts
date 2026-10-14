import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from './db.js'
import { prepareLogoImage } from './logoImageProcessing.js'
import type { LumaToolContext, LumaToolExecution } from './lumaBridge.js'

const hash = (value: string | null) => createHash('sha256').update(value || '').digest('hex')
export const imageToolDefinitions = [{
  type: 'function', function: {
    name: 'prepare_brand_image',
    description: 'Prepara uma prévia da logo: remove fundo liso e recorta margens vazias sem redesenhar a marca. Também restaura o original de uma edição anterior. Não funciona com fundos fotográficos/irregulares. Nunca aplica sem confirmação da usuária.',
    parameters: { type: 'object', properties: {
      source: { type: 'string', enum: ['CURRENT_LOGO', 'ATTACHMENT'] },
      mode: { type: 'string', enum: ['REMOVE_BACKGROUND_AND_TRIM', 'TRIM', 'RESTORE_ORIGINAL'] },
    }, required: ['source', 'mode'], additionalProperties: false },
  },
}]

export async function executeLumaImageTool(context: LumaToolContext, name: string, args: unknown): Promise<LumaToolExecution | null> {
  if (name !== 'prepare_brand_image') return null
  const parsed = z.object({ source: z.enum(['CURRENT_LOGO', 'ATTACHMENT']), mode: z.enum(['REMOVE_BACKGROUND_AND_TRIM', 'TRIM', 'RESTORE_ORIGINAL']) }).strict().parse(args)
  const db = getDb()
  const tenant = db.prepare('SELECT logo_url AS logo FROM tenants WHERE id = ?').get(context.tenantId) as { logo: string | null } | undefined
  if (!tenant) throw new Error('Espaço não encontrado.')
  let original = parsed.source === 'ATTACHMENT' ? context.attachment?.dataUrl : tenant.logo
  let imageDataUrl: string
  let details: Record<string, unknown> = {}
  if (parsed.mode === 'RESTORE_ORIGINAL') {
    const previous = db.prepare("SELECT payload_json FROM assistant_operation_actions WHERE tenant_id = ? AND action_type = 'UPDATE_BRAND_IMAGE' AND status = 'EXECUTED' ORDER BY executed_at DESC, rowid DESC LIMIT 1").get(context.tenantId) as { payload_json: string } | undefined
    if (!previous) throw new Error('Não há uma edição da Luma para desfazer.')
    const payload = JSON.parse(previous.payload_json)
    if (tenant.logo !== payload.imageDataUrl) throw new Error('A logo já foi alterada depois dessa edição. Envie o original novamente.')
    imageDataUrl = payload.original
    original = tenant.logo
  } else {
    if (!original) throw new Error('Envie uma logo no chat ou adicione uma em Configurações.')
    const prepared = await prepareLogoImage(original, parsed.mode)
    imageDataUrl = prepared.imageDataUrl
    details = { width: prepared.width, height: prepared.height, removedBackground: prepared.removedBackground, cropped: prepared.cropped }
  }
  const payload = { imageDataUrl, original, baselineHash: hash(tenant.logo), ...details }
  const payloadJson = JSON.stringify(payload), now = new Date().toISOString()
  db.prepare("UPDATE assistant_operation_actions SET status = 'EXPIRED', payload_json = '{}' WHERE tenant_id = ? AND action_type = 'UPDATE_BRAND_IMAGE' AND status = 'PENDING' AND expires_at <= ?").run(context.tenantId, now)
  const existing = db.prepare("SELECT id, expires_at FROM assistant_operation_actions WHERE tenant_id = ? AND user_id = ? AND action_type = 'UPDATE_BRAND_IMAGE' AND status = 'PENDING' AND payload_json = ? AND expires_at > ? LIMIT 1").get(context.tenantId, context.userId, payloadJson, now) as {id:string;expires_at:string} | undefined
  const id = existing?.id || randomUUID(), expiresAt = existing?.expires_at || new Date(Date.now() + 15 * 60_000).toISOString()
  if (!existing) db.prepare("INSERT INTO assistant_operation_actions (id, tenant_id, user_id, action_type, payload_json, expires_at, created_at) VALUES (?, ?, ?, 'UPDATE_BRAND_IMAGE', ?, ?, ?)").run(id, context.tenantId, context.userId, JSON.stringify(payload), expiresAt, new Date().toISOString())
  return {
    toolResult: { ok: true, requires_confirmation: true, action_id: id, ...details, message: 'Prévia pronta. A usuária deve revisar e confirmar no cartão. O original fica guardado e pode ser restaurado pelo chat.' },
    pendingAction: { id, type: 'UPDATE_BRAND_IMAGE', title: parsed.mode === 'RESTORE_ORIGINAL' ? 'Restaurar logo original' : 'Logo preparada', description: 'Confira a prévia antes de aplicar. Você pode pedir à Luma para restaurar o original.', confirmLabel: 'Usar esta logo', expiresAt, payload },
  }
}

export function confirmLogoImageAction(context: LumaToolContext, actionId: string) {
  const db = getDb()
  return db.transaction(() => {
    const action = db.prepare("SELECT * FROM assistant_operation_actions WHERE id = ? AND tenant_id = ? AND user_id = ? AND action_type = 'UPDATE_BRAND_IMAGE'").get(actionId, context.tenantId, context.userId) as { status: string; expires_at: string; payload_json: string } | undefined
    if (!action) return null
    if (action.status === 'EXECUTED') return { ok: true as const, actionType: 'UPDATE_BRAND_IMAGE', alreadyExecuted: true }
    if (action.status !== 'PENDING' || Date.parse(action.expires_at) <= Date.now()) return { ok: false as const, code: 'ACTION_EXPIRED', message: 'Essa prévia expirou. Peça uma nova à Luma.' }
    const payload = JSON.parse(action.payload_json)
    const tenant = db.prepare('SELECT logo_url AS logo FROM tenants WHERE id = ?').get(context.tenantId) as { logo: string | null }
    if (!tenant || hash(tenant.logo) !== payload.baselineHash) return { ok: false as const, code: 'LOGO_CHANGED', message: 'A logo foi alterada depois dessa prévia. Peça à Luma para preparar novamente.' }
    db.prepare('UPDATE tenants SET logo_url = ? WHERE id = ?').run(payload.imageDataUrl, context.tenantId)
    // Keep one original backup per tenant, without accumulating image copies in history.
    db.prepare("UPDATE assistant_operation_actions SET payload_json = '{}' WHERE tenant_id = ? AND action_type = 'UPDATE_BRAND_IMAGE' AND status = 'EXECUTED' AND id != ?").run(context.tenantId, actionId)
    db.prepare("UPDATE assistant_operation_actions SET status = 'EXECUTED', executed_at = ?, result_json = ? WHERE id = ?").run(new Date().toISOString(), JSON.stringify({ updated: true }), actionId)
    return { ok: true as const, actionType: 'UPDATE_BRAND_IMAGE', result: { updated: true } }
  }).immediate()
}
