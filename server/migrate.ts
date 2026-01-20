import { getDb } from './db.js'

export function migrate() {
  const db = getDb()

  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set<number>(
    db
      .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all()
      .map((r) => (r as { version: number }).version),
  )

  const apply = (version: number, fn: () => void) => {
    if (applied.has(version)) return
    const now = new Date().toISOString()
    const tx = db.transaction(() => {
      fn()
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        now,
      )
    })
    tx()
  }

  apply(1, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        primary_color TEXT NOT NULL,
        logo_url TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
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
  })

  apply(2, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id TEXT PRIMARY KEY,
        secondary_color TEXT NOT NULL,
        timezone TEXT NOT NULL,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS business_hours (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        weekday INTEGER NOT NULL,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_business_hours_tenant ON business_hours(tenant_id);

      CREATE TABLE IF NOT EXISTS time_off (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_time_off_tenant ON time_off(tenant_id);

      CREATE TABLE IF NOT EXISTS booking_rules (
        tenant_id TEXT PRIMARY KEY,
        min_notice_minutes INTEGER NOT NULL,
        max_future_days INTEGER NOT NULL,
        slot_step_minutes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
    `)
  })

  apply(3, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sku TEXT,
        unit TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        cost_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        delta_qty REAL NOT NULL,
        reason TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);

      CREATE TABLE IF NOT EXISTS cash_transactions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        method TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_cash_transactions_tenant ON cash_transactions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_cash_transactions_created ON cash_transactions(created_at);
    `)
  })

  apply(4, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_instances (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        base_url TEXT,
        api_key TEXT,
        instance_name TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_tenant ON whatsapp_instances(tenant_id);

      CREATE TABLE IF NOT EXISTS whatsapp_messages (
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

      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant ON whatsapp_messages(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_due ON whatsapp_messages(status, scheduled_at);
    `)
  })

  apply(5, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS appmax_subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        external_id TEXT,
        status TEXT NOT NULL,
        current_period_end TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_appmax_subscriptions_tenant ON appmax_subscriptions(tenant_id);

      CREATE TABLE IF NOT EXISTS appmax_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        received_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_appmax_events_received ON appmax_events(received_at);
    `)
  })

  apply(6, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_domains (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        domain TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains(tenant_id);
    `)
  })

  apply(7, () => {
    db.exec(`
      ALTER TABLE services ADD COLUMN cover_url TEXT;
    `)
  })

  apply(8, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_settings (
        tenant_id TEXT PRIMARY KEY,
        reminders_enabled INTEGER NOT NULL,
        reminder_offset_hours INTEGER NOT NULL,
        reminder_message TEXT NOT NULL,
        promo_enabled INTEGER NOT NULL,
        promo_message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
    `)
  })

  apply(9, () => {
    const cols = db.prepare('PRAGMA table_info(tenants)').all() as Array<{ name: string }>
    const hasStatus = cols.some((c) => c.name === 'status')
    if (hasStatus) return
    db.exec(`ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';`)
  })

  apply(10, () => {
    const indexes = db.prepare(`PRAGMA index_list('users')`).all() as Array<{ name: string }>
    const hasTenantEmail = indexes.some((i) => i.name === 'idx_users_tenant_email')
    const hasDevEmail = indexes.some((i) => i.name === 'idx_users_dev_email')
    const cols = db.prepare(`PRAGMA table_info('users')`).all() as Array<{ name: string }>
    const hasTenantId = cols.some((c) => c.name === 'tenant_id')
    if (hasTenantEmail && hasDevEmail && hasTenantId) return

    db.exec(`PRAGMA foreign_keys = OFF;`)
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users_new (
          id TEXT PRIMARY KEY,
          tenant_id TEXT,
          email TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
      `)

      db.exec(`
        INSERT INTO users_new (id, tenant_id, email, password_hash, role, created_at)
        SELECT id, tenant_id, email, password_hash, role, created_at
        FROM users;
      `)

      db.exec(`DROP TABLE users;`)
      db.exec(`ALTER TABLE users_new RENAME TO users;`)

      db.exec(`CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);`)
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email) WHERE tenant_id IS NOT NULL;`,
      )
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_dev_email ON users(email) WHERE tenant_id IS NULL;`)
    } finally {
      db.exec(`PRAGMA foreign_keys = ON;`)
    }
  })

  apply(11, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  })
}
