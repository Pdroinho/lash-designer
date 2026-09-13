import type Database from 'better-sqlite3'

type MigrationDb = Pick<Database.Database, 'exec' | 'prepare'>

const tableColumns = (db: MigrationDb, tableName: string) =>
  new Set((db.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string }>).map((column) => column.name))

const tableExists = (db: MigrationDb, tableName: string) => tableColumns(db, tableName).size > 0

export function ensureProfessionalWhatsappMfaSchema(db: MigrationDb) {
  if (!tableColumns(db, 'users').has('phone')) db.exec(`ALTER TABLE users ADD COLUMN phone TEXT;`)

  // Pre-auth challenges are intentionally ephemeral. v5.1 replaces the old
  // TOTP challenge contract during the offline deployment migration.
  db.exec(`
    DROP TABLE IF EXISTS auth_challenges;
    CREATE TABLE auth_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('WHATSAPP_OTP')),
      token_hash TEXT NOT NULL UNIQUE,
      code_hash TEXT NOT NULL,
      phone_snapshot TEXT NOT NULL,
      keep_signed INTEGER NOT NULL DEFAULT 0 CHECK (keep_signed IN (0,1)),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      sent_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_auth_challenges_user_active
      ON auth_challenges(user_id, kind, consumed_at, expires_at);
  `)

  if (tableExists(db, 'mfa_recovery_codes')) db.exec(`DELETE FROM mfa_recovery_codes;`)
  if (tableExists(db, 'user_mfa')) db.exec(`DELETE FROM user_mfa;`)
}

export function ensurePlatformSettingsV51(db: MigrationDb, instanceName = 'lashdesigner-global') {
  if (!tableColumns(db, 'platform_settings').has('encrypted')) {
    db.exec(`ALTER TABLE platform_settings ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;`)
  }
  db.prepare(`
    INSERT INTO platform_settings (key, value, encrypted, updated_at)
    VALUES ('evolution_instance_name', ?, 0, ?)
    ON CONFLICT(key) DO NOTHING
  `).run(instanceName, new Date().toISOString())
}
