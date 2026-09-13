import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (file) => readFileSync(resolve(root, file), 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const index = read('server/index.ts')
const mfa = read('server/mfa.ts')
const migrate = read('server/migrate.ts')
const authMigration = read('server/auth51Migration.ts')
const env = read('server/env.ts')
const preflight = read('scripts/preflight.mjs')
const external = read('server/externalUrl.ts')
const service = read('deploy/lashdesigner.service')
const app = read('src/App.tsx')
const landing = read('src/components/LandingCheckout.tsx')
const icons = read('src/components/Icons.ts')
const passwordChecklist = read('src/components/PasswordChecklist.tsx')

const checks = [
  ['release package and lockfile versions match', () => assert.equal(pkg.version, lock.version)],
  ['release remains on hardened 5.x line', () => assert.match(pkg.version, /^5\./)],
  ['jsonwebtoken removed from runtime dependencies', () => assert.equal(pkg.dependencies?.jsonwebtoken, undefined)],
  ['lockfile has no jsonwebtoken package', () => assert.equal(lock.packages?.['node_modules/jsonwebtoken'], undefined)],
  ['OTPAuth removed from runtime dependencies', () => assert.equal(pkg.dependencies?.otpauth, undefined)],
  ['lockfile has no OTPAuth package', () => assert.equal(lock.packages?.['node_modules/otpauth'], undefined)],
  ['fast login route is gone', () => assert.equal(index.includes('/api/auth/client-fast-login'), false)],
  ['legacy client password registration route is gone', () => assert.equal(index.includes('/api/auth/register-client'), false)],
  ['legacy insecure fast-login flag is gone from runtime', () => assert.equal(env.includes('ALLOW_INSECURE_FAST_LOGIN'), false)],
  ['JWT secret is gone from runtime', () => assert.equal(env.includes('JWT_SECRET'), false)],
  ['production encryption key is required', () => assert.match(env, /APP_ENCRYPTION_KEY/)],
  ['preflight validates production encryption key', () => assert.match(preflight, /APP_ENCRYPTION_KEY/)],
  ['server uses opaque session creation', () => assert.match(index, /createAndSetSession/)],
  ['logout revokes server-side session', () => assert.match(index, /revokeSession\(db/)],
  ['active sessions can be revoked individually', () => assert.match(index, /\/api\/auth\/security\/sessions\/:sessionId/)],
  ['logout-all revokes all server-side sessions', () => assert.match(index, /revokeSessionsForUser\(db/)],
  ['professional login rejects CLIENT', () => assert.match(index, /CLIENT_OTP_REQUIRED/)],
  ['professional MFA uses WhatsApp OTP routes', () => {
    assert.match(index, /\/api\/auth\/whatsapp-otp\/send/)
    assert.match(index, /\/api\/auth\/whatsapp-otp\/verify/)
    assert.match(index, /WHATSAPP_MFA_OTP_SENT/)
  }],
  ['legacy TOTP routes are absent', () => {
    assert.equal(index.includes('/api/auth/mfa/enrollment'), false)
    assert.equal(index.includes('/api/auth/mfa/verify'), false)
    assert.equal(index.includes('/api/auth/mfa/recovery'), false)
    assert.equal(index.includes('recovery-codes/regenerate'), false)
  }],
  ['WhatsApp OTP is six digits with five-minute expiry and max five attempts', () => {
    assert.match(mfa, /CHALLENGE_TTL_MS = 5 \* 60 \* 1000/)
    assert.match(mfa, /MAX_OTP_ATTEMPTS = 5/)
    assert.match(mfa, /randomInt\(100000, 1000000\)/)
  }],
  ['trusted device lasts 365 days in database and cookie', () => {
    assert.match(mfa, /TRUSTED_DEVICE_TTL_MS = 365 \* 24 \* 60 \* 60 \* 1000/)
    assert.match(index, /maxAge: TRUSTED_DEVICE_TTL_MS/)
  }],
  ['WhatsApp OTP resend has persistent challenge-scoped rate limiting', () => {
    assert.match(index, /authWhatsappOtpSendLimiter/)
    assert.match(index, /keyPrefix: 'auth:whatsapp-otp:send'/)
    assert.match(index, /createHash\('sha256'\)\.update\(token\)/)
  }],
  ['users receive a phone column in migration 36', () => {
    assert.match(migrate, /apply\(36/)
    assert.match(authMigration, /ALTER TABLE users ADD COLUMN phone TEXT/)
  }],
  ['platform settings encryption metadata is upgraded in migration 37', () => {
    assert.match(migrate, /apply\(37/)
    assert.match(authMigration, /ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0/)
    assert.match(authMigration, /evolution_instance_name/)
  }],
  ['password policy is minimum eight characters in server auth/admin flows', () => {
    assert.match(index, /password: z\.string\(\)\.min\(8\)/)
    assert.equal(index.includes('password: z.string().min(12)'), false)
  }],
  ['frontend password policy says eight characters', () => {
    assert.match(passwordChecklist, /Pelo menos 8 caracteres/)
    assert.equal(app.includes('Mín. 12 caracteres'), false)
    assert.equal(landing.includes('minLength={12}'), false)
  }],
  ['frontend login uses WhatsApp OTP and no authenticator enrollment', () => {
    assert.match(app, /WHATSAPP_OTP/)
    assert.match(app, /whatsapp-otp\/verify/)
    assert.equal(app.includes('/api/auth/mfa/verify'), false)
    assert.equal(app.includes('aplicativo autenticador'), false)
  }],
  ['ChevronDown hot-fix is present in source', () => assert.match(icons, /CaretDownIcon as ChevronDown/)],
  ['legacy duplicate DEV integrations route is removed', () => assert.equal(index.includes('/api/dev/integrations'), false)],
  ['global Evolution DEV routes exist', () => {
    for (const route of ['/api/dev/evolution/config', '/api/dev/evolution/status', '/api/dev/evolution/connect', '/api/dev/evolution/disconnect']) assert.match(index, new RegExp(route.replaceAll('/', '\\/')))
  }],
  ['global Evolution reconnect uses provider restart endpoint', () => assert.match(index, /\/instance\/restart\//)],
  ['global Evolution key stays encrypted at rest', () => assert.match(index, /encryptSecret\(body\.apiKey, evolutionPlatformSecretPurpose\)/)],
  ['global Evolution environment fallback exists for first MFA login', () => {
    assert.match(env, /EVOLUTION_API_URL/)
    assert.match(env, /EVOLUTION_API_KEY/)
    assert.match(index, /env\.EVOLUTION_API_URL/)
    assert.match(index, /env\.EVOLUTION_API_KEY/)
  }],
  ['payment activation requires payment_check', () => assert.match(index, /payment_check/)],
  ['InfinitePay webhook has dedicated limiter', () => assert.match(index, /infinitePayWebhookLimiter/)],
  ['Evolution receives messages, receipts and connection events', () => {
    for (const event of ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE']) assert.match(index, new RegExp(event))
  }],
  ['Evolution external URLs require DNS validation', () => assert.match(index, /resolveExternalHttpsBaseUrl/)],
  ['DNS validation rejects private resolved addresses', () => assert.match(external, /assertResolvedAddressesPublic/)],
  ['tenant credentials cannot be changed by ADMIN in production', () => assert.match(index, /WHATSAPP_PLATFORM_MANAGED/)],
  ['Evolution fetches reject redirects', () => assert.match(index, /redirect: 'error'/)],
  ['webhook does not enable base64 payloads', () => assert.match(index, /base64: false/)],
  ['private WhatsApp media directory is allowed by systemd', () => assert.match(service, /\/opt\/lashdesigner\/media/)],
  ['database path is not printed at startup', () => assert.equal(index.includes('DATABASE_PATH configurado'), false)],
]

let passed = 0
for (const [name, run] of checks) {
  try {
    run()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}
console.log(`Security 5.1 audit: ${passed}/${checks.length}`)
