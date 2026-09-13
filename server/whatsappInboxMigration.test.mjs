import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { ensureWhatsAppInboxSchema } from './whatsappInboxMigration.ts'

function baseDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE tenants (id TEXT PRIMARY KEY);
    CREATE TABLE users (id TEXT PRIMARY KEY);
  `)
  return db
}

function columns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info('${table}')`).all().map((column) => column.name))
}

function createLegacyQueue(db) {
  db.exec(`
    CREATE TABLE whatsapp_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      to_phone TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      sent_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id);
    CREATE INDEX idx_whatsapp_messages_due ON whatsapp_messages(status, scheduled_at);
  `)
}

test('fresh schema creates the inbox tables', () => {
  const db = baseDb()
  ensureWhatsAppInboxSchema(db)
  assert.ok(columns(db, 'whatsapp_messages').has('conversation_id'))
  assert.ok(columns(db, 'whatsapp_conversations').has('phone_normalized'))
  assert.equal(columns(db, 'whatsapp_messages_legacy_queue').size, 0)
})

test('legacy queue is preserved before creating the inbox table', () => {
  const db = baseDb()
  db.exec("INSERT INTO tenants (id) VALUES ('tenant-1')")
  createLegacyQueue(db)
  db.prepare(`
    INSERT INTO whatsapp_messages (id, tenant_id, to_phone, body, status, scheduled_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('legacy-1', 'tenant-1', '5579999999999', 'mensagem antiga', 'PENDING', '2026-08-11T12:00:00Z', '2026-08-11T11:00:00Z')

  ensureWhatsAppInboxSchema(db)

  assert.ok(columns(db, 'whatsapp_messages').has('conversation_id'))
  assert.ok(columns(db, 'whatsapp_messages_legacy_queue').has('to_phone'))
  assert.deepEqual(
    { ...db.prepare('SELECT id, body, status FROM whatsapp_messages_legacy_queue').get() },
    { id: 'legacy-1', body: 'mensagem antiga', status: 'PENDING' },
  )
})

test('existing inbox data survives reconciliation and repeated execution', () => {
  const db = baseDb()
  db.exec("INSERT INTO tenants (id) VALUES ('tenant-1')")
  ensureWhatsAppInboxSchema(db)
  db.prepare(`
    INSERT INTO whatsapp_conversations (id, tenant_id, phone_normalized, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('conversation-1', 'tenant-1', '5579999999999', '2026-08-11T11:00:00Z', '2026-08-11T11:00:00Z')
  db.prepare(`
    INSERT INTO whatsapp_messages (
      id, tenant_id, conversation_id, phone_normalized, direction, body_text, sent_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'message-1',
    'tenant-1',
    'conversation-1',
    '5579999999999',
    'INBOUND',
    'oi',
    '2026-08-11T11:01:00Z',
    '2026-08-11T11:01:00Z',
  )

  ensureWhatsAppInboxSchema(db)
  ensureWhatsAppInboxSchema(db)

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM whatsapp_messages').get().count, 1)
  assert.equal(db.prepare('SELECT body_text FROM whatsapp_messages WHERE id = ?').get('message-1').body_text, 'oi')
})

test('unknown whatsapp_messages schema aborts instead of deleting data', () => {
  const db = baseDb()
  db.exec(`CREATE TABLE whatsapp_messages (id TEXT PRIMARY KEY, strange_column TEXT NOT NULL);`)
  assert.throws(
    () => ensureWhatsAppInboxSchema(db),
    /Schema desconhecido em whatsapp_messages/,
  )
  assert.ok(columns(db, 'whatsapp_messages').has('strange_column'))
})

test('existing legacy archive aborts instead of overwriting it', () => {
  const db = baseDb()
  createLegacyQueue(db)
  db.exec(`CREATE TABLE whatsapp_messages_legacy_queue (id TEXT PRIMARY KEY, marker TEXT);`)
  assert.throws(
    () => ensureWhatsAppInboxSchema(db),
    /whatsapp_messages_legacy_queue já existe/,
  )
  assert.ok(columns(db, 'whatsapp_messages').has('to_phone'))
})
