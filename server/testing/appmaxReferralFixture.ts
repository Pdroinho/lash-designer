import type Database from 'better-sqlite3'
import { createAppmaxReferralSchema } from '../appmaxReferralSchema.js'

// Existing narrow route tests keep their own fixture tables. Extend only the
// billing/referral contract; the full integration tests migrate the real schema.
export function extendAppmaxReferralFixture(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,tenant_id TEXT,email TEXT,phone TEXT,role TEXT);
    CREATE TABLE IF NOT EXISTS infinitepay_orders (tenant_id TEXT,status TEXT);
    CREATE TABLE IF NOT EXISTS referral_links (id TEXT PRIMARY KEY,owner_tenant_id TEXT,token TEXT,invitee_discount_percent INTEGER,referrer_reward_percent INTEGER,max_redemptions INTEGER,redemptions_count INTEGER,expires_at TEXT,active INTEGER,label TEXT);
    CREATE TABLE IF NOT EXISTS referral_redemptions (id TEXT PRIMARY KEY,link_id TEXT,invited_tenant_id TEXT,order_nsu TEXT,status TEXT,gross_amount_cents INTEGER,discount_amount_cents INTEGER,referrer_reward_percent INTEGER,created_at TEXT,paid_at TEXT);
    CREATE TABLE IF NOT EXISTS referral_credits (id TEXT PRIMARY KEY,owner_tenant_id TEXT,redemption_id TEXT UNIQUE,discount_percent INTEGER,status TEXT,applied_order_nsu TEXT,reserved_at TEXT,applied_at TEXT,created_at TEXT);
  `)
  if (
    !(db.pragma('table_info(referral_links)') as Array<{ name: string }>).some(
      (column) => column.name === 'label',
    )
  )
    db.exec(
      "ALTER TABLE referral_links ADD COLUMN label TEXT NOT NULL DEFAULT 'Indicação'",
    )
  createAppmaxReferralSchema(db)
}
