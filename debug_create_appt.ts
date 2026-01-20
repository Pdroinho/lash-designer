
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

const db = new Database('data/app.db')

// Mock input
const tenantSlug = 'pedro2'
const serviceName = 'teste'
const startsAtInput = '2026-01-19T10:00:00' // Local time? No, input is ISO string from frontend.
// Frontend sends ISO.
// If frontend is in Brazil: 2026-01-19 10:00 -> 2026-01-19T13:00:00.000Z
const startsAtIso = '2026-01-19T13:00:00.000Z'

const tenant = db.prepare("SELECT id, slug FROM tenants WHERE slug = ?").get(tenantSlug)
if (!tenant) { console.error('Tenant not found'); process.exit(1) }

const service = db.prepare("SELECT id, duration_minutes FROM services WHERE tenant_id = ? AND name = ?").get(tenant.id, serviceName)
if (!service) { console.error('Service not found'); process.exit(1) }

const clientUser = db.prepare("SELECT id FROM users WHERE tenant_id = ? AND role = 'CLIENT' LIMIT 1").get(tenant.id)
// If no client, create one mock
let clientId = clientUser?.id
if (!clientId) {
    clientId = randomUUID()
    db.prepare("INSERT INTO users (id, tenant_id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(clientId, tenant.id, 'mock@client.com', 'hash', 'CLIENT', new Date().toISOString())
}

console.log('Testing appointment creation:')
console.log('Tenant:', tenant.id)
console.log('Service:', service.id, 'Duration:', service.duration_minutes)
console.log('Starts At:', startsAtIso)

// Logic from server/index.ts
const startsAt = new Date(startsAtIso)
const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000)

console.log('Ends At:', endsAt.toISOString())

// 1. Min Notice
// Assume bookingRules default
const rules = { minNoticeMinutes: 60, maxFutureDays: 60, slotStepMinutes: 15 }
const nowDt = new Date() // Today is 2026-01-19 in env
console.log('Now:', nowDt.toISOString())

const minStart = new Date(nowDt.getTime() + rules.minNoticeMinutes * 60_000)
if (startsAt.getTime() < minStart.getTime()) {
    console.error('ERROR: MIN_NOTICE. Starts:', startsAt.toISOString(), 'Min:', minStart.toISOString())
} else {
    console.log('OK: MIN_NOTICE')
}

// 2. Max Future
const maxStart = new Date(nowDt)
maxStart.setDate(maxStart.getDate() + rules.maxFutureDays)
if (startsAt.getTime() > maxStart.getTime()) {
    console.error('ERROR: MAX_FUTURE')
} else {
    console.log('OK: MAX_FUTURE')
}

// 3. Business Hours & Zoned Parts
const timeZone = 'America/Sao_Paulo'
const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const zonedFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
})

const getZonedParts = (d: Date) => {
    const parts = zonedFormatter.formatToParts(d)
    const weekdayToken = parts.find((p) => p.type === 'weekday')?.value
    const hourToken = parts.find((p) => p.type === 'hour')?.value
    const minuteToken = parts.find((p) => p.type === 'minute')?.value
    const weekday = weekdayToken ? weekdayMap[weekdayToken] : undefined
    const hour = hourToken ? Number(hourToken) : NaN
    const minute = minuteToken ? Number(minuteToken) : NaN
    return { weekday, minutesOfDay: hour * 60 + minute }
}

const startParts = getZonedParts(startsAt)
const endParts = getZonedParts(endsAt)

console.log('Start Parts:', startParts)
console.log('End Parts:', endParts)

if (startParts.weekday !== endParts.weekday || endParts.minutesOfDay < startParts.minutesOfDay) {
    console.error('ERROR: CROSS_DAY')
} else {
    console.log('OK: CROSS_DAY')
}

const businessHours = db.prepare("SELECT weekday, start_minute, end_minute FROM business_hours WHERE tenant_id = ?").all(tenant.id)
const matchingRanges = businessHours.filter((r) => r.weekday === startParts.weekday)

console.log('Matching Ranges:', matchingRanges)

const stepMinutes = Math.max(5, rules.slotStepMinutes)
const fitsAnyRange = matchingRanges.some((r) => {
    const aligned = (startParts.minutesOfDay - r.start_minute) % stepMinutes === 0
    if (!aligned) {
        console.log('  Range', r, 'failed alignment')
        return false
    }
    const fits = (
        startParts.minutesOfDay >= r.start_minute &&
        startParts.minutesOfDay < r.end_minute &&
        endParts.minutesOfDay <= r.end_minute
    )
    console.log('  Range', r, 'fits?', fits)
    return fits
})

if (!fitsAnyRange) {
    console.error('ERROR: OUTSIDE_BUSINESS_HOURS')
} else {
    console.log('OK: OUTSIDE_BUSINESS_HOURS')
}

// 4. Overlaps
const overlap = db.prepare(`
    SELECT id FROM appointments
    WHERE tenant_id = ?
    AND status IN ('CONFIRMED', 'PENDING')
    AND NOT (ends_at <= ? OR starts_at >= ?)
    LIMIT 1
`).get(tenant.id, startsAt.toISOString(), endsAt.toISOString())

if (overlap) {
    console.error('ERROR: SLOT_UNAVAILABLE (Appointment)')
} else {
    console.log('OK: No Appointment Overlap')
}
