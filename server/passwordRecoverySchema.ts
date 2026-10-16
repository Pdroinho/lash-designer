import type Database from 'better-sqlite3'
export function createPasswordRecoverySchema(db: Database.Database) {
  db.exec(`CREATE TABLE password_reset_challenges (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, code_hash TEXT NOT NULL,
    phone_snapshot TEXT NOT NULL, password_snapshot TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL, consumed_at TEXT
  );
  CREATE INDEX idx_password_reset_user ON password_reset_challenges(user_id, created_at);
  CREATE INDEX idx_password_reset_expiry ON password_reset_challenges(expires_at);`)
}
