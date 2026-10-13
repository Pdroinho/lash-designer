/* Run with NODE_ENV=test DATABASE_PATH=/path/to/disposable.db after build. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getDb } from '../dist/server/db.js'
import { migrate } from '../dist/server/migrate.js'

if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_PATH) throw new Error('Use NODE_ENV=test and a disposable DATABASE_PATH')
migrate()
const db = getDb()
const now = new Date().toISOString()
const first = randomUUID()
const second = randomUUID()
for (const [id, slug] of [[first, 'studio-um'], [second, 'studio-dois']]) {
  db.prepare('INSERT INTO tenants (id, slug, name, primary_color, created_at) VALUES (?, ?, ?, ?, ?)').run(id, slug, slug, '#884466', now)
  const professional = db.prepare('SELECT id, tenant_id AS tenantId FROM professionals WHERE tenant_id = ?').all(id)
  assert.deepEqual(professional, [{ id, tenantId: id }])
}
const service = randomUUID()
db.prepare('INSERT INTO services (id, tenant_id, name, duration_minutes, price_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(service, first, 'Teste', 60, 1000, now)
assert.equal(db.prepare('SELECT COUNT(*) AS total FROM professional_services WHERE tenant_id = ? AND professional_id = ? AND service_id = ?').get(first, first, service).total, 1)
assert.throws(() => db.prepare('INSERT INTO professional_services (tenant_id, professional_id, service_id) VALUES (?, ?, ?)').run(second, second, service))
assert.deepEqual(db.pragma('foreign_key_check'), [])
console.log('PASS migration 39: default professional, service link, tenant isolation, foreign keys')
db.close()
