type DbLike = {
  exec(sql: string): unknown
  prepare(sql: string): { all(...args: unknown[]): unknown[]; run(...args: unknown[]): unknown }
}

export function ensureWhatsappReliabilitySchema(db: DbLike) {
  const instanceColumns = new Set(
    (db.prepare("PRAGMA table_info('whatsapp_instances')").all() as Array<{ name: string }>).map((column) => column.name),
  )
  if (instanceColumns.size === 0) throw new Error('whatsapp_instances ausente')
  const addInstanceColumn = (name: string, sql: string) => {
    if (!instanceColumns.has(name)) db.exec(sql)
  }
  addInstanceColumn('connection_state', `ALTER TABLE whatsapp_instances ADD COLUMN connection_state TEXT;`)
  addInstanceColumn('last_health_check_at', `ALTER TABLE whatsapp_instances ADD COLUMN last_health_check_at TEXT;`)
  addInstanceColumn('last_connected_at', `ALTER TABLE whatsapp_instances ADD COLUMN last_connected_at TEXT;`)
  addInstanceColumn('last_connection_error', `ALTER TABLE whatsapp_instances ADD COLUMN last_connection_error TEXT;`)
  addInstanceColumn('reconnect_attempts', `ALTER TABLE whatsapp_instances ADD COLUMN reconnect_attempts INTEGER NOT NULL DEFAULT 0;`)
  addInstanceColumn('reconnect_after', `ALTER TABLE whatsapp_instances ADD COLUMN reconnect_after TEXT;`)
  addInstanceColumn('reconnect_claimed_at', `ALTER TABLE whatsapp_instances ADD COLUMN reconnect_claimed_at TEXT;`)
  addInstanceColumn('webhook_last_at', `ALTER TABLE whatsapp_instances ADD COLUMN webhook_last_at TEXT;`)

  const messageColumns = new Set(
    (db.prepare("PRAGMA table_info('whatsapp_messages')").all() as Array<{ name: string }>).map((column) => column.name),
  )
  if (!messageColumns.has('tenant_id') || !messageColumns.has('direction') || !messageColumns.has('sent_at')) {
    throw new Error('whatsapp_messages não está no schema de inbox esperado')
  }
  const addMessageColumn = (name: string, sql: string) => {
    if (!messageColumns.has(name)) db.exec(sql)
  }
  addMessageColumn('delivery_status', `ALTER TABLE whatsapp_messages ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'UNKNOWN';`)
  addMessageColumn('status_updated_at', `ALTER TABLE whatsapp_messages ADD COLUMN status_updated_at TEXT;`)
  addMessageColumn('media_mime_type', `ALTER TABLE whatsapp_messages ADD COLUMN media_mime_type TEXT;`)
  addMessageColumn('media_file_name', `ALTER TABLE whatsapp_messages ADD COLUMN media_file_name TEXT;`)
  addMessageColumn('media_size_bytes', `ALTER TABLE whatsapp_messages ADD COLUMN media_size_bytes INTEGER;`)
  addMessageColumn('media_storage_path', `ALTER TABLE whatsapp_messages ADD COLUMN media_storage_path TEXT;`)
  addMessageColumn('media_status', `ALTER TABLE whatsapp_messages ADD COLUMN media_status TEXT NOT NULL DEFAULT 'NONE';`)
  addMessageColumn('media_remote_jid', `ALTER TABLE whatsapp_messages ADD COLUMN media_remote_jid TEXT;`)
  addMessageColumn('media_attempts', `ALTER TABLE whatsapp_messages ADD COLUMN media_attempts INTEGER NOT NULL DEFAULT 0;`)
  addMessageColumn('media_next_attempt_at', `ALTER TABLE whatsapp_messages ADD COLUMN media_next_attempt_at TEXT;`)
  addMessageColumn('media_last_error', `ALTER TABLE whatsapp_messages ADD COLUMN media_last_error TEXT;`)

  db.prepare(`UPDATE whatsapp_messages SET delivery_status = 'RECEIVED' WHERE direction = 'INBOUND' AND delivery_status = 'UNKNOWN'`).run()
  db.prepare(`UPDATE whatsapp_messages SET delivery_status = 'SENT' WHERE direction = 'OUTBOUND' AND delivery_status = 'UNKNOWN'`).run()

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_health
      ON whatsapp_instances(status, reconnect_after, last_health_check_at);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_delivery
      ON whatsapp_messages(tenant_id, direction, delivery_status, sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_media_queue
      ON whatsapp_messages(media_status, media_next_attempt_at, media_attempts);

    CREATE TABLE IF NOT EXISTS evolution_webhook_events (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      instance_name TEXT,
      event_type TEXT NOT NULL,
      provider_message_id TEXT,
      outcome TEXT NOT NULL,
      error_code TEXT,
      payload_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_evolution_webhook_events_tenant_created
      ON evolution_webhook_events(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_evolution_webhook_events_type_created
      ON evolution_webhook_events(event_type, created_at DESC);
  `)
}
