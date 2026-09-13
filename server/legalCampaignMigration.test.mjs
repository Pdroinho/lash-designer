import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

function migration38Sql() {
  const source = fs.readFileSync(new URL('./migrate.ts', import.meta.url), 'utf8')
  const start = source.indexOf('apply(38, () => {')
  assert.ok(start >= 0, 'migration 38 exists')
  const execStart = source.indexOf('db.exec(`', start)
  const sqlStart = execStart + 'db.exec(`'.length
  const sqlEnd = source.indexOf('`)', sqlStart)
  assert.ok(execStart >= 0 && sqlEnd > sqlStart, 'migration 38 SQL block exists')
  return source.slice(sqlStart, sqlEnd)
}

function baseDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `)
  return db
}

const columns = (db, table) => new Set(db.prepare(`PRAGMA table_info('${table}')`).all().map((row) => row.name))

test('migration 38 creates legal evidence, marketing preference and campaign queue schema', () => {
  const db = baseDb()
  db.exec(migration38Sql())

  const userColumns = columns(db, 'users')
  assert.ok(userColumns.has('platform_marketing_whatsapp_opt_in'))
  assert.ok(userColumns.has('platform_marketing_whatsapp_opt_in_at'))
  assert.ok(userColumns.has('platform_marketing_whatsapp_opt_out_at'))

  const acceptanceColumns = columns(db, 'user_legal_acceptances')
  assert.ok(acceptanceColumns.has('bundle_hash'))
  assert.ok(acceptanceColumns.has('snapshot_json'))
  assert.ok(acceptanceColumns.has('ip_hash'))
  assert.ok(acceptanceColumns.has('user_agent_hash'))
  assert.ok(columns(db, 'platform_marketing_consent_events').has('policy_version'))
  assert.ok(columns(db, 'whatsapp_marketing_campaigns').has('status'))
  assert.ok(columns(db, 'whatsapp_marketing_recipients').has('claimed_at'))
  assert.ok(columns(db, 'whatsapp_marketing_recipients').has('next_attempt_at'))
})

test('legal evidence remains append-only even when the same bundle is accepted again', () => {
  const db = baseDb()
  db.exec(migration38Sql())
  db.prepare(`INSERT INTO tenants (id, name) VALUES ('t1', 'Studio')`).run()
  db.prepare(`INSERT INTO users (id, tenant_id, email) VALUES ('u1', 't1', 'admin@example.com')`).run()
  const insert = db.prepare(`INSERT INTO user_legal_acceptances (id, user_id, tenant_id, bundle_version, bundle_hash, terms_version, privacy_version, source, snapshot_json, accepted_at) VALUES (?, 'u1', 't1', 'v1', ?, 't1', 'p1', 'TEST', '{}', ?)` )
  insert.run('a1', 'hash-a', '2026-08-14T00:00:00Z')
  insert.run('a2', 'hash-b', '2026-08-14T00:01:00Z')
  insert.run('a3', 'hash-b', '2026-08-14T00:02:00Z')
  const count = db.prepare(`SELECT COUNT(*) as n FROM user_legal_acceptances WHERE user_id = 'u1'`).get()
  assert.equal(Number(count.n), 3)
})

test('campaign queue constraints reject invalid recipient state', () => {
  const db = baseDb()
  db.exec(migration38Sql())
  db.prepare(`INSERT INTO tenants (id, name) VALUES ('t1', 'Studio')`).run()
  db.prepare(`INSERT INTO users (id, tenant_id, email) VALUES ('u1', 't1', 'admin@example.com')`).run()
  db.prepare(`INSERT INTO whatsapp_marketing_campaigns (id, tenant_id, created_by_user_id, name, message_text, status, total_recipients, created_at) VALUES ('c1','t1','u1','Teste','Mensagem','QUEUED',1,'2026-08-14T00:00:00Z')`).run()
  assert.throws(() => db.prepare(`INSERT INTO whatsapp_marketing_recipients (id, campaign_id, tenant_id, client_user_id, phone_normalized, client_name, status, created_at) VALUES ('r1','c1','t1','u1','5511999999999','Maria','INVALID','2026-08-14T00:00:00Z')`).run())
})
