import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

test('logo tool previews real pixels, isolates owners, checks stale logos, applies once and restores original', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'luma-image-'))
  process.env.NODE_ENV = 'test'; process.env.DATABASE_PATH = path.join(directory, 'test.db')
  const { migrate } = await import('./migrate.js'); migrate()
  const { getDb, closeDb } = await import('./db.js'), db = getDb()
  try {
    const { executeLumaImageTool: execute, confirmLogoImageAction: confirm } = await import('./lumaImageTools.js')
    const { lumaToolDefinitions, confirmLumaAction } = await import('./lumaBridge.js')
    assert.ok(lumaToolDefinitions.some(tool => tool.function.name === 'prepare_brand_image'))
    const owner = { tenantId: randomUUID(), userId: randomUUID() }, now = new Date().toISOString()
    const ink = await sharp({ create: { width: 30, height: 20, channels: 4, background: '#972d57' } }).png().toBuffer()
    const original = 'data:image/png;base64,' + (await sharp({ create: { width: 80, height: 60, channels: 4, background: '#fff' } }).composite([{ input: ink, left: 25, top: 20 }]).png().toBuffer()).toString('base64')
    db.prepare('INSERT INTO tenants(id,slug,name,primary_color,status,created_at,logo_url) VALUES (?,?,?,?,?,?,?)').run(owner.tenantId, 'logo-qa', 'Studio', '#972d57', 'ACTIVE', now, original)
    db.prepare('INSERT INTO users(id,tenant_id,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)').run(owner.userId, owner.tenantId, 'logo@example.com', 'test', 'ADMIN', now)
    const preview = await execute(owner, 'prepare_brand_image', { source: 'CURRENT_LOGO', mode: 'REMOVE_BACKGROUND_AND_TRIM' })
    assert.ok(preview?.pendingAction); assert.equal((db.prepare('SELECT logo_url FROM tenants WHERE id=?').get(owner.tenantId) as {logo_url:string}).logo_url, original)
    assert.ok(!JSON.stringify(preview.toolResult).includes('base64'))
    assert.equal(confirm({ ...owner, userId: randomUUID() }, preview.pendingAction.id), null)
    db.prepare('UPDATE tenants SET logo_url=? WHERE id=?').run('changed', owner.tenantId)
    assert.equal(confirm(owner, preview.pendingAction.id)?.ok, false)
    db.prepare('UPDATE tenants SET logo_url=? WHERE id=?').run(original, owner.tenantId)
    assert.equal(confirmLumaAction(owner, preview.pendingAction.id).ok, true)
    assert.equal(confirm(owner, preview.pendingAction.id)?.alreadyExecuted, true)
    const restore = await execute(owner, 'prepare_brand_image', { source: 'CURRENT_LOGO', mode: 'RESTORE_ORIGINAL' })
    assert.ok(restore?.pendingAction); assert.equal(confirm(owner, restore.pendingAction.id)?.ok, true)
    assert.equal((db.prepare('SELECT logo_url FROM tenants WHERE id=?').get(owner.tenantId) as {logo_url:string}).logo_url, original)
    const expired = await execute(owner, 'prepare_brand_image', { source: 'CURRENT_LOGO', mode: 'TRIM' })
    assert.ok(expired?.pendingAction)
    db.prepare('UPDATE assistant_operation_actions SET expires_at=? WHERE id=?').run('2000-01-01', expired.pendingAction.id)
    assert.equal(confirm(owner, expired.pendingAction.id)?.ok, false)
  } finally { closeDb(); rmSync(directory, { recursive: true, force: true }) }
})
