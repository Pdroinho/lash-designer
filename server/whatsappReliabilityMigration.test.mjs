import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { ensureWhatsappReliabilitySchema } from './whatsappReliabilityMigration.ts'

const makeDb = () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE whatsapp_instances (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'CONFIGURED', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE whatsapp_messages (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, direction TEXT NOT NULL, sent_at TEXT NOT NULL
    );
  `)
  return db
}

test('adiciona campos de health, receipts e media sem perder mensagens', () => {
  const db = makeDb()
  db.prepare(`INSERT INTO whatsapp_messages (id, tenant_id, direction, sent_at) VALUES (?, ?, ?, ?)`).run('in', 't1', 'INBOUND', '2026-08-11T00:00:00Z')
  db.prepare(`INSERT INTO whatsapp_messages (id, tenant_id, direction, sent_at) VALUES (?, ?, ?, ?)`).run('out', 't1', 'OUTBOUND', '2026-08-11T00:00:01Z')
  ensureWhatsappReliabilitySchema(db)
  const rows = db.prepare(`SELECT id, delivery_status as status, media_status as media FROM whatsapp_messages ORDER BY id`).all().map((row) => ({ id: row.id, status: row.status, media: row.media }))
  assert.deepEqual(rows, [
    { id: 'in', status: 'RECEIVED', media: 'NONE' },
    { id: 'out', status: 'SENT', media: 'NONE' },
  ])
  const columns = new Set(db.prepare(`PRAGMA table_info('whatsapp_instances')`).all().map((row) => row.name))
  assert.equal(columns.has('reconnect_attempts'), true)
  assert.equal(columns.has('webhook_last_at'), true)
  assert.equal(db.prepare(`SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='evolution_webhook_events'`).get().count, 1)
})

test('é idempotente', () => {
  const db = makeDb()
  ensureWhatsappReliabilitySchema(db)
  assert.doesNotThrow(() => ensureWhatsappReliabilitySchema(db))
})

test('recusa schema de fila antiga em vez de alterá-lo parcialmente', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE whatsapp_instances (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE whatsapp_messages (id TEXT PRIMARY KEY, to_phone TEXT, body TEXT, sent_at TEXT);
  `)
  assert.throws(() => ensureWhatsappReliabilitySchema(db), /schema de inbox/)
})
