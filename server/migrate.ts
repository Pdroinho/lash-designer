import { getDb } from './db.js'
import { ensureWhatsAppInboxSchema } from './whatsappInboxMigration.js'
import { ensureWhatsappReliabilitySchema } from './whatsappReliabilityMigration.js'
import { ensurePlatformSettingsV51, ensureProfessionalWhatsappMfaSchema } from './auth51Migration.js'

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
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, now)
    })
    tx()
  }

  const applyWithForeignKeysDisabled = (version: number, fn: () => void) => {
    if (applied.has(version)) return
    const now = new Date().toISOString()
    db.pragma('foreign_keys = OFF')
    try {
      const tx = db.transaction(() => {
        fn()
        const violations = db.pragma('foreign_key_check') as Array<Record<string, unknown>>
        if (violations.length) throw new Error(`Migração ${version} gerou violações de chave estrangeira.`)
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, now)
      })
      tx()
    } finally {
      db.pragma('foreign_keys = ON')
    }
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

  applyWithForeignKeysDisabled(10, () => {
    const indexes = db.prepare(`PRAGMA index_list('users')`).all() as Array<{ name: string }>
    const hasTenantEmail = indexes.some((i) => i.name === 'idx_users_tenant_email')
    const hasDevEmail = indexes.some((i) => i.name === 'idx_users_dev_email')
    const cols = db.prepare(`PRAGMA table_info('users')`).all() as Array<{ name: string }>
    const hasTenantId = cols.some((c) => c.name === 'tenant_id')
    if (hasTenantEmail && hasDevEmail && hasTenantId) return

    db.exec(`DROP TABLE IF EXISTS users_new;`)
    db.exec(`
        CREATE TABLE users_new (
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

  apply(12, () => {
    const cols = db.prepare('PRAGMA table_info(tenant_settings)').all() as Array<{ name: string }>
    const hasRevenueGoal = cols.some((c) => c.name === 'monthly_revenue_goal_cents')
    if (!hasRevenueGoal) {
      db.exec(`
        ALTER TABLE tenant_settings ADD COLUMN monthly_revenue_goal_cents INTEGER DEFAULT 1000000;
        ALTER TABLE tenant_settings ADD COLUMN monthly_new_clients_goal INTEGER DEFAULT 10;
      `)
    }
  })

  apply(13, () => {
    const cols = db.prepare("PRAGMA table_info('users')").all() as Array<{ name: string }>
    const hasSessionVersion = cols.some((c) => c.name === 'session_version')
    if (hasSessionVersion) return
    db.exec(`ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;`)
  })

  apply(14, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS infinitepay_orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        order_nsu TEXT NOT NULL UNIQUE,
        transaction_nsu TEXT UNIQUE,
        invoice_slug TEXT,
        amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        checkout_url TEXT,
        receipt_url TEXT,
        capture_method TEXT,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_infinitepay_orders_tenant ON infinitepay_orders(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_infinitepay_orders_status ON infinitepay_orders(status);
    `)
  })

  apply(15, () => {
    const cols = db.prepare("PRAGMA table_info('services')").all() as Array<{ name: string }>
    if (!cols.some((column) => column.name === 'active')) {
      db.exec(`ALTER TABLE services ADD COLUMN active INTEGER NOT NULL DEFAULT 1;`)
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_services_tenant_active ON services(tenant_id, active);`)
  })

  apply(16, () => {
    const cols = db.prepare("PRAGMA table_info('clients')").all() as Array<{ name: string }>
    if (!cols.some((column) => column.name === 'phone_normalized')) {
      db.exec(`ALTER TABLE clients ADD COLUMN phone_normalized TEXT;`)
    }

    const rows = db.prepare(`SELECT id, phone FROM clients WHERE phone IS NOT NULL AND TRIM(phone) != ''`).all() as Array<{
      id: string
      phone: string
    }>
    const update = db.prepare(`UPDATE clients SET phone_normalized = ? WHERE id = ?`)
    for (const row of rows) {
      let digits = String(row.phone).replace(/\D/g, '')
      if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) digits = `55${digits}`
      update.run(digits.length >= 10 && digits.length <= 13 ? digits : null, row.id)
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_clients_tenant_phone_normalized ON clients(tenant_id, phone_normalized);`)
  })

  apply(17, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        external_id TEXT,
        status TEXT NOT NULL,
        current_period_end TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);

      CREATE TABLE IF NOT EXISTS payment_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        received_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payment_events_received ON payment_events(received_at);

      INSERT OR IGNORE INTO subscriptions (id, tenant_id, external_id, status, current_period_end, created_at, updated_at)
      SELECT id, tenant_id, external_id, status, current_period_end, created_at, updated_at
      FROM appmax_subscriptions;

      INSERT OR IGNORE INTO payment_events (id, tenant_id, event_type, payload_json, received_at)
      SELECT id, tenant_id, event_type, payload_json, received_at
      FROM appmax_events;
    `)
  })


  apply(18, () => {
    const cols = db.prepare("PRAGMA table_info('tenant_domains')").all() as Array<{ name: string }>
    const names = new Set(cols.map((column) => column.name))
    if (!names.has('status')) db.exec(`ALTER TABLE tenant_domains ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING';`)
    if (!names.has('verification_token')) db.exec(`ALTER TABLE tenant_domains ADD COLUMN verification_token TEXT;`)
    if (!names.has('verification_method')) db.exec(`ALTER TABLE tenant_domains ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'DNS_TXT';`)
    if (!names.has('last_checked_at')) db.exec(`ALTER TABLE tenant_domains ADD COLUMN last_checked_at TEXT;`)
    if (!names.has('verified_at')) db.exec(`ALTER TABLE tenant_domains ADD COLUMN verified_at TEXT;`)
    if (!names.has('verification_error')) db.exec(`ALTER TABLE tenant_domains ADD COLUMN verification_error TEXT;`)
    if (!names.has('is_primary')) db.exec(`ALTER TABLE tenant_domains ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0;`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tenant_domains_status_domain ON tenant_domains(status, domain);`)
  })

  apply(19, () => {
    db.exec(`
      DELETE FROM subscriptions AS older
      WHERE EXISTS (
        SELECT 1
        FROM subscriptions AS newer
        WHERE newer.tenant_id = older.tenant_id
          AND (
            newer.updated_at > older.updated_at
            OR (newer.updated_at = older.updated_at AND newer.rowid > older.rowid)
          )
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_tenant_unique ON subscriptions(tenant_id);

      UPDATE tenant_domains
      SET is_primary = 0
      WHERE is_primary = 1
        AND rowid NOT IN (
          SELECT MAX(rowid)
          FROM tenant_domains
          WHERE is_primary = 1
          GROUP BY tenant_id
        );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_domains_one_primary
        ON tenant_domains(tenant_id)
        WHERE is_primary = 1;

      CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status_starts
        ON appointments(tenant_id, status, starts_at);
      CREATE INDEX IF NOT EXISTS idx_time_off_tenant_range
        ON time_off(tenant_id, starts_at, ends_at);
    `)
  })

  apply(20, () => {
    const orderCols = db.prepare("PRAGMA table_info('infinitepay_orders')").all() as Array<{ name: string }>
    const orderNames = new Set(orderCols.map((column) => column.name))
    if (!orderNames.has('billing_cycle')) db.exec(`ALTER TABLE infinitepay_orders ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'ANNUAL';`)
    if (!orderNames.has('period_months')) db.exec(`ALTER TABLE infinitepay_orders ADD COLUMN period_months INTEGER NOT NULL DEFAULT 12;`)
    if (!orderNames.has('payment_method')) db.exec(`ALTER TABLE infinitepay_orders ADD COLUMN payment_method TEXT;`)

    const subscriptionCols = db.prepare("PRAGMA table_info('subscriptions')").all() as Array<{ name: string }>
    const subscriptionNames = new Set(subscriptionCols.map((column) => column.name))
    if (!subscriptionNames.has('billing_cycle')) db.exec(`ALTER TABLE subscriptions ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'ANNUAL';`)
    if (!subscriptionNames.has('plan_code')) db.exec(`ALTER TABLE subscriptions ADD COLUMN plan_code TEXT NOT NULL DEFAULT 'PRO';`)

    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_usage (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        request_day TEXT NOT NULL,
        input_chars INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_usage_tenant_day ON assistant_usage(tenant_id, request_day);
      CREATE TABLE IF NOT EXISTS tenant_deletion_audit (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        tenant_slug TEXT NOT NULL,
        tenant_name TEXT NOT NULL,
        requested_by_user_id TEXT NOT NULL,
        confirmation_text TEXT NOT NULL,
        deleted_at TEXT NOT NULL
      );
    `)
  })

  apply(21, () => {
    const orderCols = db.prepare("PRAGMA table_info('infinitepay_orders')").all() as Array<{ name: string }>
    const orderNames = new Set(orderCols.map((column) => column.name))
    if (!orderNames.has('gross_amount_cents')) db.exec(`ALTER TABLE infinitepay_orders ADD COLUMN gross_amount_cents INTEGER;`)
    if (!orderNames.has('discount_amount_cents')) db.exec(`ALTER TABLE infinitepay_orders ADD COLUMN discount_amount_cents INTEGER NOT NULL DEFAULT 0;`)
    if (!orderNames.has('referrer_discount_percent')) db.exec(`ALTER TABLE infinitepay_orders ADD COLUMN referrer_discount_percent INTEGER NOT NULL DEFAULT 0;`)
    if (!orderNames.has('referral_redemption_id')) db.exec(`ALTER TABLE infinitepay_orders ADD COLUMN referral_redemption_id TEXT;`)

    db.exec(`
      UPDATE infinitepay_orders
      SET gross_amount_cents = amount_cents
      WHERE gross_amount_cents IS NULL;

      CREATE TABLE IF NOT EXISTS referral_links (
        id TEXT PRIMARY KEY,
        owner_tenant_id TEXT,
        created_by_user_id TEXT NOT NULL,
        label TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        invitee_discount_percent INTEGER NOT NULL CHECK (invitee_discount_percent BETWEEN 0 AND 100),
        referrer_reward_percent INTEGER NOT NULL CHECK (referrer_reward_percent BETWEEN 0 AND 30),
        max_redemptions INTEGER NOT NULL CHECK (max_redemptions BETWEEN 1 AND 100000),
        redemptions_count INTEGER NOT NULL DEFAULT 0 CHECK (redemptions_count >= 0),
        expires_at TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL,
        FOREIGN KEY (owner_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_referral_links_owner ON referral_links(owner_tenant_id, active);
      CREATE INDEX IF NOT EXISTS idx_referral_links_active_expiry ON referral_links(active, expires_at);

      CREATE TABLE IF NOT EXISTS referral_redemptions (
        id TEXT PRIMARY KEY,
        link_id TEXT NOT NULL,
        invited_tenant_id TEXT NOT NULL UNIQUE,
        order_nsu TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'PAID', 'CANCELLED', 'REVOKED')),
        gross_amount_cents INTEGER NOT NULL,
        discount_amount_cents INTEGER NOT NULL,
        referrer_reward_percent INTEGER NOT NULL CHECK (referrer_reward_percent BETWEEN 0 AND 30),
        created_at TEXT NOT NULL,
        paid_at TEXT,
        FOREIGN KEY (link_id) REFERENCES referral_links(id) ON DELETE RESTRICT,
        FOREIGN KEY (invited_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_referral_redemptions_link_status ON referral_redemptions(link_id, status);

      CREATE TABLE IF NOT EXISTS referral_credits (
        id TEXT PRIMARY KEY,
        owner_tenant_id TEXT NOT NULL,
        redemption_id TEXT NOT NULL UNIQUE,
        discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 30),
        status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'RESERVED', 'APPLIED', 'REVOKED')),
        applied_order_nsu TEXT,
        reserved_at TEXT,
        applied_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (owner_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (redemption_id) REFERENCES referral_redemptions(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_referral_credits_owner_status ON referral_credits(owner_tenant_id, status, created_at);
    `)
  })

  apply(22, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_onboarding (
        tenant_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED')),
        mode TEXT CHECK (mode IN ('ASSISTED', 'MANUAL')),
        current_step INTEGER NOT NULL DEFAULT 0,
        answers_json TEXT NOT NULL DEFAULT '{}',
        ai_attempts INTEGER NOT NULL DEFAULT 0 CHECK (ai_attempts BETWEEN 0 AND 3),
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      INSERT OR IGNORE INTO tenant_onboarding (tenant_id, status, mode, current_step, answers_json, ai_attempts, completed_at, created_at, updated_at)
      SELECT id, 'COMPLETED', 'MANUAL', 4, '{}', 0, created_at, created_at, created_at FROM tenants;
    `)
  })


  apply(23, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS client_login_codes (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
        consumed_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_client_login_codes_lookup
        ON client_login_codes(tenant_id, user_id, consumed_at, expires_at, created_at);
    `)
  })

  apply(24, () => {
    db.exec(`
      ALTER TABLE clients ADD COLUMN marketing_whatsapp_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (marketing_whatsapp_opt_in IN (0, 1));
      ALTER TABLE clients ADD COLUMN marketing_whatsapp_opt_in_at TEXT;
      ALTER TABLE clients ADD COLUMN marketing_whatsapp_opt_out_at TEXT;
      ALTER TABLE clients ADD COLUMN marketing_consent_version TEXT;
      ALTER TABLE clients ADD COLUMN marketing_consent_source TEXT;

      CREATE TABLE IF NOT EXISTS client_marketing_consent_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        client_user_id TEXT NOT NULL,
        channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP')),
        action TEXT NOT NULL CHECK (action IN ('GRANTED', 'WITHDRAWN', 'DECLINED')),
        policy_version TEXT NOT NULL,
        consent_text TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_client_marketing_consent_events_client
        ON client_marketing_consent_events(tenant_id, client_user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_clients_marketing_whatsapp
        ON clients(tenant_id, marketing_whatsapp_opt_in);
    `)
  })


  apply(25, () => {
    const usageCols = db.prepare("PRAGMA table_info('assistant_usage')").all() as Array<{ name: string }>
    const usageNames = new Set(usageCols.map((column) => column.name))
    if (!usageNames.has('reasoning_tokens')) db.exec(`ALTER TABLE assistant_usage ADD COLUMN reasoning_tokens INTEGER NOT NULL DEFAULT 0;`)
    if (!usageNames.has('cost_usd')) db.exec(`ALTER TABLE assistant_usage ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;`)
    if (!usageNames.has('tool_calls')) db.exec(`ALTER TABLE assistant_usage ADD COLUMN tool_calls INTEGER NOT NULL DEFAULT 0;`)
    if (!usageNames.has('vision_inputs')) db.exec(`ALTER TABLE assistant_usage ADD COLUMN vision_inputs INTEGER NOT NULL DEFAULT 0;`)
    if (!usageNames.has('agent_steps')) db.exec(`ALTER TABLE assistant_usage ADD COLUMN agent_steps INTEGER NOT NULL DEFAULT 1;`)
    if (!usageNames.has('status')) db.exec(`ALTER TABLE assistant_usage ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED';`)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_assistant_usage_tenant_created ON assistant_usage(tenant_id, created_at);

      CREATE TABLE IF NOT EXISTS assistant_pending_actions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action_type TEXT NOT NULL CHECK (action_type IN ('CREATE_SERVICE', 'CONFIRM_APPOINTMENT')),
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'EXPIRED', 'CANCELLED')),
        expires_at TEXT NOT NULL,
        executed_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_pending_actions_owner
        ON assistant_pending_actions(tenant_id, user_id, status, expires_at);

      CREATE TABLE IF NOT EXISTS assistant_action_audit (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (action_id) REFERENCES assistant_pending_actions(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_action_audit_tenant
        ON assistant_action_audit(tenant_id, created_at);
    `)
  })


  apply(26, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_message_credit_ledger (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT,
        delta_messages INTEGER NOT NULL,
        source TEXT NOT NULL,
        note TEXT,
        reference_order_nsu TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_credit_ledger_tenant_created
        ON assistant_message_credit_ledger(tenant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS assistant_credit_orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        order_nsu TEXT NOT NULL UNIQUE,
        pack_id TEXT NOT NULL,
        credits INTEGER NOT NULL CHECK (credits > 0),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'FAILED')),
        checkout_url TEXT,
        transaction_nsu TEXT UNIQUE,
        invoice_slug TEXT,
        receipt_url TEXT,
        capture_method TEXT,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_credit_orders_tenant_created
        ON assistant_credit_orders(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_assistant_credit_orders_status
        ON assistant_credit_orders(status);
    `)
  })


  apply(27, () => {
    const appointmentColumns = new Set(
      (db.prepare("PRAGMA table_info('appointments')").all() as Array<{ name: string }>).map((column) => column.name),
    )
    const addAppointmentColumn = (name: string, sql: string) => {
      if (!appointmentColumns.has(name)) db.exec(sql)
    }

    addAppointmentColumn('confirmation_status', `ALTER TABLE appointments ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED' CHECK (confirmation_status IN ('NOT_REQUESTED','AWAITING_CONFIRMATION','CONFIRMED','DECLINED','NO_RESPONSE','DELIVERY_FAILED','MANUALLY_CONFIRMED'));`)
    addAppointmentColumn('confirmation_code', `ALTER TABLE appointments ADD COLUMN confirmation_code TEXT;`)
    addAppointmentColumn('confirmation_sent_at', `ALTER TABLE appointments ADD COLUMN confirmation_sent_at TEXT;`)
    addAppointmentColumn('confirmation_reminder_sent_at', `ALTER TABLE appointments ADD COLUMN confirmation_reminder_sent_at TEXT;`)
    addAppointmentColumn('appointment_reminder_sent_at', `ALTER TABLE appointments ADD COLUMN appointment_reminder_sent_at TEXT;`)
    addAppointmentColumn('confirmation_responded_at', `ALTER TABLE appointments ADD COLUMN confirmation_responded_at TEXT;`)
    addAppointmentColumn('confirmation_last_inbound_at', `ALTER TABLE appointments ADD COLUMN confirmation_last_inbound_at TEXT;`)
    addAppointmentColumn('confirmation_last_inbound_text', `ALTER TABLE appointments ADD COLUMN confirmation_last_inbound_text TEXT;`)

    const whatsappColumns = new Set(
      (db.prepare("PRAGMA table_info('whatsapp_settings')").all() as Array<{ name: string }>).map((column) => column.name),
    )
    const addWhatsappColumn = (name: string, sql: string) => {
      if (!whatsappColumns.has(name)) db.exec(sql)
    }
    addWhatsappColumn('confirmations_enabled', `ALTER TABLE whatsapp_settings ADD COLUMN confirmations_enabled INTEGER NOT NULL DEFAULT 1 CHECK (confirmations_enabled IN (0,1));`)
    addWhatsappColumn('confirmation_offset_hours', `ALTER TABLE whatsapp_settings ADD COLUMN confirmation_offset_hours INTEGER NOT NULL DEFAULT 24;`)
    addWhatsappColumn('confirmation_retry_hours', `ALTER TABLE whatsapp_settings ADD COLUMN confirmation_retry_hours INTEGER NOT NULL DEFAULT 8;`)
    addWhatsappColumn('no_response_cutoff_hours', `ALTER TABLE whatsapp_settings ADD COLUMN no_response_cutoff_hours INTEGER NOT NULL DEFAULT 4;`)
    addWhatsappColumn('confirmation_message', `ALTER TABLE whatsapp_settings ADD COLUMN confirmation_message TEXT NOT NULL DEFAULT 'Oi {{nome}}! Seu horário de {{servico}} no {{espaco}} está chegando. Responda 1 {{codigo}} para confirmar ou 2 {{codigo}} se não puder comparecer.';`)
    addWhatsappColumn('auto_cancel_declined', `ALTER TABLE whatsapp_settings ADD COLUMN auto_cancel_declined INTEGER NOT NULL DEFAULT 0 CHECK (auto_cancel_declined IN (0,1));`)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_appointments_confirmation_queue
        ON appointments(tenant_id, status, confirmation_status, starts_at);

      CREATE TABLE IF NOT EXISTS appointment_confirmation_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        appointment_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'WHATSAPP',
        provider_message_id TEXT,
        details_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_appointment_confirmation_events_appointment
        ON appointment_confirmation_events(tenant_id, appointment_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_confirmation_provider_message
        ON appointment_confirmation_events(provider_message_id)
        WHERE provider_message_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS appointment_automation_jobs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        appointment_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('CONFIRMATION_REQUEST','CONFIRMATION_RETRY','NO_RESPONSE_CUTOFF','APPOINTMENT_REMINDER')),
        idempotency_key TEXT NOT NULL UNIQUE,
        scheduled_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DONE','FAILED','CANCELLED')),
        attempts INTEGER NOT NULL DEFAULT 0,
        claimed_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_appointment_automation_jobs_due
        ON appointment_automation_jobs(status, scheduled_at, claimed_at);
      CREATE INDEX IF NOT EXISTS idx_appointment_automation_jobs_appointment
        ON appointment_automation_jobs(tenant_id, appointment_id, kind);
    `)
  })

  apply(28, () => ensureWhatsAppInboxSchema(db))

  apply(29, () => {
    db.prepare(`
      UPDATE whatsapp_settings
      SET confirmation_message = ?, updated_at = ?
      WHERE confirmation_message = ?
    `).run(
      'Oi {{nome}}! Seu horário de {{servico}} no {{espaco}} está chegando. Responda 1 para confirmar ou 2 se não puder comparecer.',
      new Date().toISOString(),
      'Oi {{nome}}! Seu horário de {{servico}} no {{espaco}} está chegando. Responda 1 {{codigo}} para confirmar ou 2 {{codigo}} se não puder comparecer.',
    )
  })

  apply(30, () => ensureWhatsAppInboxSchema(db))

  apply(31, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS trusted_devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_active
        ON trusted_devices(user_id, revoked_at, expires_at);

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        trusted_device_id TEXT,
        token_hash TEXT NOT NULL UNIQUE,
        persistent INTEGER NOT NULL DEFAULT 0 CHECK (persistent IN (0,1)),
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (trusted_device_id) REFERENCES trusted_devices(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
        ON auth_sessions(user_id, revoked_at, expires_at);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
        ON auth_sessions(revoked_at, expires_at);
    `)
  })

  apply(32, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_mfa (
        user_id TEXT PRIMARY KEY,
        totp_secret_encrypted TEXT NOT NULL,
        last_totp_counter INTEGER,
        enabled_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        used_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, code_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_unused
        ON mfa_recovery_codes(user_id, used_at);

      CREATE TABLE IF NOT EXISTS auth_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('MFA_LOGIN','MFA_ENROLLMENT')),
        token_hash TEXT NOT NULL UNIQUE,
        secret_encrypted TEXT,
        keep_signed INTEGER NOT NULL DEFAULT 0 CHECK (keep_signed IN (0,1)),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_auth_challenges_user_active
        ON auth_challenges(user_id, kind, consumed_at, expires_at);

      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        tenant_id TEXT,
        event_type TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        details_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_security_events_user_created
        ON security_events(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_security_events_tenant_created
        ON security_events(tenant_id, created_at DESC);
    `)
  })

  apply(33, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS security_rate_limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        window_started_at TEXT NOT NULL,
        blocked_until TEXT,
        penalty_level INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_security_rate_limits_updated
        ON security_rate_limits(updated_at);
    `)
  })


  apply(34, () => {
    ensureWhatsappReliabilitySchema(db)
  })


  apply(35, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS infinitepay_webhook_events (
        id TEXT PRIMARY KEY,
        order_nsu TEXT,
        event_hash TEXT NOT NULL,
        outcome TEXT NOT NULL,
        error_code TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_infinitepay_webhook_events_order_created
        ON infinitepay_webhook_events(order_nsu, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_infinitepay_webhook_events_created
        ON infinitepay_webhook_events(created_at DESC);
    `)
  })

  apply(36, () => {
    ensureProfessionalWhatsappMfaSchema(db)
  })

  apply(37, () => {
    ensurePlatformSettingsV51(db)
  })


  apply(38, () => {
    db.exec(`
      ALTER TABLE users ADD COLUMN platform_marketing_whatsapp_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (platform_marketing_whatsapp_opt_in IN (0, 1));
      ALTER TABLE users ADD COLUMN platform_marketing_whatsapp_opt_in_at TEXT;
      ALTER TABLE users ADD COLUMN platform_marketing_whatsapp_opt_out_at TEXT;

      CREATE TABLE IF NOT EXISTS user_legal_acceptances (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT,
        bundle_version TEXT NOT NULL,
        bundle_hash TEXT NOT NULL,
        terms_version TEXT NOT NULL,
        privacy_version TEXT NOT NULL,
        source TEXT NOT NULL,
        ip_hash TEXT,
        user_agent_hash TEXT,
        snapshot_json TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_user_legal_acceptances_user_bundle
        ON user_legal_acceptances(user_id, bundle_hash, accepted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_legal_acceptances_tenant
        ON user_legal_acceptances(tenant_id, accepted_at DESC);

      CREATE TABLE IF NOT EXISTS platform_marketing_consent_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT,
        channel TEXT NOT NULL CHECK (channel IN ('WHATSAPP')),
        action TEXT NOT NULL CHECK (action IN ('GRANTED', 'WITHDRAWN', 'DECLINED')),
        policy_version TEXT NOT NULL,
        consent_text TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_platform_marketing_consent_user
        ON platform_marketing_consent_events(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS whatsapp_marketing_campaigns (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        message_text TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','COMPLETED','CANCELLED','FAILED')),
        total_recipients INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        cancelled_at TEXT,
        last_error TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_marketing_campaigns_tenant
        ON whatsapp_marketing_campaigns(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_whatsapp_marketing_campaigns_status
        ON whatsapp_marketing_campaigns(status, created_at ASC);

      CREATE TABLE IF NOT EXISTS whatsapp_marketing_recipients (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        client_user_id TEXT NOT NULL,
        phone_normalized TEXT NOT NULL,
        client_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING','SENDING','SENT','FAILED','SKIPPED')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_attempt_at TEXT,
        claimed_at TEXT,
        provider_message_id TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        FOREIGN KEY (campaign_id) REFERENCES whatsapp_marketing_campaigns(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (campaign_id, client_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_marketing_recipients_queue
        ON whatsapp_marketing_recipients(campaign_id, status, created_at ASC);
    `)
  })

}
