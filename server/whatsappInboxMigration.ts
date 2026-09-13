import type Database from 'better-sqlite3'

type MigrationDb = Pick<Database.Database, 'exec' | 'prepare'>

const tableColumns = (db: MigrationDb, tableName: string) =>
  new Set(
    (db.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string }>).map((column) => column.name),
  )

const hasColumns = (columns: Set<string>, required: string[]) => required.every((column) => columns.has(column))

export function ensureWhatsAppInboxSchema(db: MigrationDb) {
  const messagesColumns = tableColumns(db, 'whatsapp_messages')
  const isInboxSchema = hasColumns(messagesColumns, [
    'conversation_id',
    'phone_normalized',
    'direction',
    'body_text',
    'sent_at',
  ])
  const isLegacyQueueSchema = hasColumns(messagesColumns, ['to_phone', 'body', 'status', 'scheduled_at'])

  if (messagesColumns.size > 0 && !isInboxSchema) {
    if (!isLegacyQueueSchema) {
      throw new Error('Schema desconhecido em whatsapp_messages; migração interrompida para evitar perda de dados.')
    }
    if (tableColumns(db, 'whatsapp_messages_legacy_queue').size > 0) {
      throw new Error('whatsapp_messages_legacy_queue já existe; migração interrompida para evitar sobrescrita.')
    }
    db.exec('ALTER TABLE whatsapp_messages RENAME TO whatsapp_messages_legacy_queue;')
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_conversations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      phone_normalized TEXT NOT NULL,
      display_name TEXT,
      client_user_id TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_preview TEXT,
      last_message_direction TEXT CHECK (last_message_direction IN ('INBOUND','OUTBOUND')),
      last_message_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (tenant_id, phone_normalized)
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tenant_last
      ON whatsapp_conversations(tenant_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_client
      ON whatsapp_conversations(tenant_id, client_user_id);

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      phone_normalized TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
      message_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT','IMAGE','AUDIO','DOCUMENT','UNKNOWN')),
      body_text TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'WEBHOOK' CHECK (source IN ('WEBHOOK','MANUAL','AUTOMATION','SYSTEM')),
      provider_message_id TEXT,
      sent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES whatsapp_conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_sent
      ON whatsapp_messages(tenant_id, conversation_id, sent_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_provider
      ON whatsapp_messages(tenant_id, provider_message_id)
      WHERE provider_message_id IS NOT NULL;
  `)
}
