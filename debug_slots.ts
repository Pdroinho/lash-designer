
import Database from 'better-sqlite3'

const db = new Database('data/app.db')

const tenantSlug = 'pedro2'
const tenant = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(tenantSlug)

if (!tenant) {
  console.error('Tenant not found')
  process.exit(1)
}

console.log('Tenant ID:', tenant.id)

// Fetch services
const services = db.prepare("SELECT id, name, duration_minutes FROM services WHERE tenant_id = ?").all(tenant.id)
console.log('Services:', services)

const businessHours = db.prepare(`
  SELECT * FROM business_hours 
  WHERE tenant_id = ?
  ORDER BY weekday ASC, start_minute ASC
`).all(tenant.id)

console.log('All Business Hours:', businessHours)

// Simulate slot generation
const serviceDuration = 60 // minutes
const slotStep = 30 // minutes

console.log(`\nSimulating slots (Duration: ${serviceDuration}m, Step: ${slotStep}m):`)

const times: string[] = []
for (const r of businessHours) {
  console.log(`Processing range: ${r.start_minute} (${Math.floor(r.start_minute/60)}:${r.start_minute%60}) to ${r.end_minute} (${Math.floor(r.end_minute/60)}:${r.end_minute%60})`)
  
  const lastStart = r.end_minute - serviceDuration
  console.log(`  Last start possible: ${lastStart} (${Math.floor(lastStart/60)}:${lastStart%60})`)
  
  for (let m = r.start_minute; m <= lastStart; m += slotStep) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    times.push(`${hh}:${mm}`)
  }
}

// Fetch appointments and time-offs for 2026-01-23
const dateStart = '2026-01-23T00:00:00'
const dateEnd = '2026-01-23T23:59:59'

const appointments = db.prepare(`
  SELECT * FROM appointments 
  WHERE tenant_id = ? 
  AND starts_at >= ? AND starts_at <= ?
`).all(tenant.id, dateStart, dateEnd)

console.log('Appointments for 2026-01-23:', appointments)

const timeOffs = db.prepare(`
  SELECT * FROM time_off 
  WHERE tenant_id = ? 
  AND (
    (starts_at <= ? AND ends_at >= ?) OR
    (starts_at >= ? AND starts_at <= ?)
  )
`).all(tenant.id, dateEnd, dateStart, dateStart, dateEnd)

// Fetch appointments for 2026-01-19
const dateStart19 = '2026-01-19T00:00:00'
const dateEnd19 = '2026-01-19T23:59:59'

const allAppointments = db.prepare(`
  SELECT a.id, a.tenant_id, a.starts_at 
  FROM appointments a 
  WHERE starts_at >= ? AND starts_at <= ?
`).all(dateStart19, dateEnd19)

console.log('All Appointments for 2026-01-19 (any tenant):', allAppointments)


