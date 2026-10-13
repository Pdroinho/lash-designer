import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
export function syncBookedClientConversation(
  db: Database.Database,
  tenantId: string,
  userId: string,
) {
  const client = db
    .prepare(
      'SELECT name,phone_normalized AS phone FROM clients WHERE tenant_id=? AND user_id=? LIMIT 1',
    )
    .get(tenantId, userId) as { name: string; phone: string | null } | undefined
  if (!client?.phone) return
  db.prepare(
    `INSERT INTO whatsapp_conversations (id,tenant_id,phone_normalized,display_name,client_user_id,created_at,updated_at)
 VALUES (?,?,?,?,?,?,?) ON CONFLICT(tenant_id,phone_normalized) DO UPDATE SET display_name=excluded.display_name,client_user_id=excluded.client_user_id,updated_at=excluded.updated_at`,
  ).run(
    randomUUID(),
    tenantId,
    client.phone,
    client.name,
    userId,
    new Date().toISOString(),
    new Date().toISOString(),
  )
}
