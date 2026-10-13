import type Database from 'better-sqlite3'
export function createLumaOperationsSchema(db: Database.Database) {
  db.exec(`
    ALTER TABLE assistant_usage ADD COLUMN credit_source TEXT NOT NULL DEFAULT 'INCLUDED' CHECK(credit_source IN ('INCLUDED','EXTRA'));
    ALTER TABLE appointments ADD COLUMN attendance_status TEXT NOT NULL DEFAULT 'NOT_RECORDED' CHECK(attendance_status IN ('NOT_RECORDED','ATTENDED','NO_SHOW'));
    ALTER TABLE appointments ADD COLUMN attendance_recorded_at TEXT;
    ALTER TABLE appointments ADD COLUMN attendance_recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL;
    CREATE TABLE assistant_operation_actions (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, action_type TEXT NOT NULL,
      payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','EXECUTED','EXPIRED','CANCELLED')),
      result_json TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, executed_at TEXT
    );
    CREATE INDEX idx_luma_operation_owner ON assistant_operation_actions(tenant_id,user_id,status,expires_at);
    CREATE TABLE assistant_preferences (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tone TEXT NOT NULL DEFAULT 'FRIENDLY', focus TEXT NOT NULL DEFAULT 'GENERAL', instructions TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
      PRIMARY KEY(tenant_id,user_id)
    );
    CREATE TABLE assistant_reminders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','SENDING','SENT','FAILED','UNKNOWN','CANCELLED')),
      created_at TEXT NOT NULL, processed_at TEXT, provider_message_id TEXT, error_code TEXT
    );
    CREATE INDEX idx_luma_reminder_due ON assistant_reminders(status,due_at);
    CREATE TABLE assistant_appmax_orders (
      id TEXT PRIMARY KEY REFERENCES assistant_credit_orders(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, payment_link_id INTEGER UNIQUE,
      provider_order_id INTEGER UNIQUE, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','REVERSED','FAILED')),
      updated_at TEXT NOT NULL
    );
  `)
}
