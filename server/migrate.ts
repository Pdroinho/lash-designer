import { getDb } from './db.js'

export function migrate() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      primary_color TEXT NOT NULL,
      logo_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients(tenant_id);

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON services(tenant_id);

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      client_user_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
      FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON appointments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
  `)
}
