import type Database from 'better-sqlite3'

export function createSupportSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      requester_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('ACCOUNT','BILLING','WHATSAPP','BOOKING','BUG','FEATURE','OTHER')),
      priority TEXT NOT NULL CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
      status TEXT NOT NULL CHECK(status IN ('NEW','OPEN','PENDING','ON_HOLD','RESOLVED','CLOSED')),
      assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_public_at TEXT NOT NULL,
      first_response_at TEXT, resolved_at TEXT, closed_at TEXT
    );
    CREATE INDEX idx_support_tenant_queue ON support_tickets(tenant_id,status,updated_at);
    CREATE INDEX idx_support_agent_queue ON support_tickets(status,priority,updated_at);
    CREATE TABLE support_messages (
      id TEXT PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL, author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      author_role TEXT NOT NULL, author_name TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK(visibility IN ('PUBLIC','INTERNAL')),
      kind TEXT NOT NULL CHECK(kind IN ('COMMENT','EVENT')),
      body TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(ticket_id,sequence)
    );
    CREATE TABLE support_attachments (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, data BLOB NOT NULL
    );
    CREATE INDEX idx_support_attachments_message ON support_attachments(message_id);
    CREATE TABLE support_reads (
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_sequence INTEGER NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY(ticket_id,user_id)
    );
    CREATE TABLE support_notifications (
      serial INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT
    );
    CREATE INDEX idx_support_notifications_user ON support_notifications(user_id,read_at,created_at);
    CREATE TABLE support_commands (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, command_key TEXT NOT NULL,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      operation TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(user_id,command_key)
    );
  `)
}
