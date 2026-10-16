/* global document, window */
// Compiled client + real auth routes/SQLite/sessions. Only the global WhatsApp transport is simulated.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'
const directory = mkdtempSync(path.join(tmpdir(), 'lash-reset-ui-'))
process.env.NODE_ENV = 'test'; process.env.DATABASE_PATH = path.join(directory, 'test.db')
const { migrate } = await import('../dist/server/migrate.js'); migrate()
const { getDb, closeDb } = await import('../dist/server/db.js'), db = getDb()
const { createAuthRouter } = await import('../dist/server/routes/authRoutes.js')
const { createAuthSessionRuntime } = await import('../dist/server/authSessionRuntime.js')
const { createTenantRouting } = await import('../dist/server/middleware/tenantRouting.js')
const { sessionMiddleware } = await import('../dist/server/auth.js')
const { hashPassword, verifyPassword } = await import('../dist/server/security.js')
const { handleError } = await import('../dist/server/http.js')
const { chromium } = await import(process.env.LASH_QA_PLAYWRIGHT_MODULE || 'playwright')
const tenantId = randomUUID(), now = new Date().toISOString(), originalHash = await hashPassword('senha-anterior-123')
db.prepare('INSERT INTO tenants(id,slug,name,primary_color,status,created_at) VALUES(?,?,?,?,?,?)').run(tenantId, 'studio', 'Studio QA', '#972d57', 'ACTIVE', now)
const tenant = { id: tenantId, slug: 'studio', name: 'Studio QA', primaryColor: '#972d57' }
const sent = [], errors = []
let confirmations = 0, checks = 0, browser, page, server
const pass = message => { checks++; console.log('PASS ' + message) }
const app = express(); app.use(express.json()); app.use(cookieParser())
const routing = createTenantRouting({ db, nodeEnv: 'test', devHost: 'dev.localhost', platformHostname: 'localhost' })
app.use(routing.resolveTenantFromSubdomain); app.use(sessionMiddleware)
app.use((req, _res, next) => { if (req.path === '/api/auth/password-reset/confirm') confirmations++; next() })
const next = (_req, _res, proceed) => proceed()
app.use('/api/auth', createAuthRouter({ db, nodeEnv: 'test', isDevHost: routing.isDevHost, authLoginLimiter: next, authLoginUserLimiter: next, authWhatsappOtpSendLimiter: next, authPasswordLimiter: next, authSessionRuntime: createAuthSessionRuntime(db, 'test'), sendPlatformWhatsappText: async (phone, text) => { sent.push({ phone, text }); return true }, normalizeUserE164Phone: phone => phone, maskE164Phone: phone => phone, recordLegalAcceptance: () => {}, recordPlatformMarketingChoice: () => ({ changed: false, whatsappPromotions: false }) }))
app.get('/api/public/tenant', (_req, res) => res.json({ tenant }))
// These screens are outside this test. Authentication and recovery above are real.
app.get('/api/admin/legal/preferences', (_req, res) => res.json({ required: false }))
app.get('/api/admin/dashboard', (_req, res) => res.json({}))
app.use('/api', (_req, res) => res.status(404).json({ message: 'Auxiliary endpoint outside recovery test' }))
app.use(handleError)
app.get('/admin', (req,res) => req.sessionUser ? res.type('html').send('<h1>Acesso confirmado</h1>') : res.status(401).send('Sem sessão'))
app.use(express.static(path.resolve('dist/client'), { index: false }))
app.get(/.*/, (_req, res) => res.type('html').send(readFileSync('dist/client/index.html', 'utf8')))
try {
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://studio.localhost:${server.address().port}`
  browser = await chromium.launch({ headless: true, ...(process.env.LASH_QA_CHROMIUM_PATH ? { executablePath: process.env.LASH_QA_CHROMIUM_PATH } : {}), args: ['--host-resolver-rules=MAP *.localhost 127.0.0.1', '--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'] })
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message))
    const userId = randomUUID(), email = `admin-${width}@example.com`
    db.prepare('INSERT INTO users(id,tenant_id,email,password_hash,role,phone,created_at) VALUES(?,?,?,?,?,?,?)').run(userId, tenantId, email, originalHash, 'ADMIN', '5511999999999', now)
    await page.goto(origin + '/login')
    await page.getByRole('button', { name: 'Esqueci minha senha', exact: true }).click()
    await page.getByRole('heading', { name: 'Esqueceu sua senha?', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Receber código no WhatsApp', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Confira o e-mail' }).waitFor()
    await page.getByLabel('E-mail da conta', { exact: true }).fill(email)
    await page.getByRole('button', { name: 'Receber código no WhatsApp', exact: true }).click()
    await page.getByRole('heading', { name: 'Crie sua nova senha', exact: true }).waitFor()
    assert.equal(sent.at(-1).phone, '5511999999999')
    const code = sent.at(-1).text.match(/\b\d{6}\b/)[0]
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    assert.ok(await page.getByRole('button', { name: /Reenviar em/ }).isDisabled())
    assert.equal((db.prepare('SELECT password_hash AS hash FROM users WHERE id=?').get(userId)).hash, originalHash)
    pass(`request, inline validation, resend cooldown and unchanged password at ${width}px`)
    await page.getByLabel('Código do WhatsApp', { exact: true }).fill(code === '000000' ? '000001' : '000000')
    await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-123')
    await page.getByLabel('Repita a nova senha', { exact: true }).fill('diferente-123')
    assert.ok(await page.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).isDisabled())
    const previous = confirmations
    await page.getByLabel('Repita a nova senha', { exact: true }).fill('nova-senha-123')
    await page.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Código inválido ou expirado' }).waitFor()
    assert.equal(confirmations, previous + 1)
    assert.equal((db.prepare('SELECT password_hash AS hash FROM users WHERE id=?').get(userId)).hash, originalHash)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    pass(`confirmation matching, invalid code recovery and responsive controls at ${width}px`)
    await page.getByLabel('Código do WhatsApp', { exact: true }).fill(code)
    if (process.env.LASH_QA_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.LASH_QA_SCREENSHOT_DIR, `password-recovery-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Salvar senha e entrar', exact: true }).click()
    await page.waitForURL('**/admin')
    const me = await page.evaluate(async () => (await fetch('/api/auth/me')).json())
    assert.equal(me.user.id, userId)
    const hash = db.prepare('SELECT password_hash AS hash FROM users WHERE id=?').get(userId).hash
    assert.ok(await verifyPassword('nova-senha-123', hash))
    assert.ok(!(await verifyPassword('senha-anterior-123', hash)))
    assert.ok((await context.cookies()).some(cookie => cookie.name === 'session' && cookie.httpOnly))
    pass(`real password change, session cookie and automatic entry at ${width}px`)
    await context.close()
  }
  assert.deepEqual(errors, []); assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  pass('no browser exceptions or foreign key violations')
  console.log(`${checks} password recovery browser checks passed; global WhatsApp delivery simulated, no external messages.`)
} catch (error) {
  console.error(error)
  if (page && !page.isClosed()) { try { console.error(await page.locator('body').innerText({ timeout: 2000 })) } catch { /* Preserve original error. */ } }
  throw error
} finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); closeDb(); rmSync(directory, { recursive: true, force: true }) }
