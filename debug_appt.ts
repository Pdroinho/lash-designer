
import Database from 'better-sqlite3'
const db = new Database('data/app.db')

const tenant = db.prepare("SELECT id, slug FROM tenants WHERE slug = 'pedro2'").get()
if (!tenant) {
  console.log('Tenant pedro2 not found')
  process.exit(1)
}

console.log('Tenant:', tenant)

const users = db.prepare("SELECT id, email FROM users WHERE tenant_id = ?").all(tenant.id)
console.log('Users:', users)

const appointments = db.prepare(`
  SELECT a.id, a.starts_at, a.status, u.email
  FROM appointments a
  JOIN users u ON u.id = a.client_user_id
  WHERE a.tenant_id = ?
  ORDER BY a.starts_at DESC
`).all(tenant.id)

console.log('Appointments:', appointments)
