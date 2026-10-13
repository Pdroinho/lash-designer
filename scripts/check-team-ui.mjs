/* global document, window */
// Production client, real team routes, migrated SQLite and opaque sessions.
// Unrelated dashboard/legal endpoints are fixtures. Build with VITE_DEV_HOST=dev.localhost before this check.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import cookieParser from 'cookie-parser'

const directory = mkdtempSync(path.join(tmpdir(), 'lash-support-browser-'))
process.env.NODE_ENV = 'test'
process.env.DATABASE_PATH = path.join(directory, 'test.db')
const { getDb, closeDb } = await import('../dist/server/db.js'),
  { migrate } = await import('../dist/server/migrate.js'),
  { sessionMiddleware } = await import('../dist/server/auth.js'),
  { createSession } = await import('../dist/server/session.js'),
  { createTenantRouting } =
    await import('../dist/server/middleware/tenantRouting.js'),
  { createSupportRouter } =
    await import('../dist/server/routes/supportRoutes.js'),
  { createPublicRouter } =
    await import('../dist/server/routes/publicRoutes.js'),
  { createClientPortalRouter } =
    await import('../dist/server/routes/clientPortalRoutes.js'),
  { handleError } = await import('../dist/server/http.js')
migrate()
const db = getDb(),
  tenantId = randomUUID(),
  now = new Date().toISOString()
db.prepare(
  "INSERT INTO tenants (id,slug,name,primary_color,status,created_at) VALUES (?,'studio','Studio QA','#972d57','ACTIVE',?)",
).run(tenantId, now)
const users = {
    admin: randomUUID(),
    dev: randomUUID(),
    staff: randomUUID(),
    client: randomUUID(),
  },
  tokens = {}
for (const [role, id] of Object.entries(users)) {
  db.prepare(
    'INSERT INTO users (id,tenant_id,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?)',
  ).run(
    id,
    role === 'dev' ? null : tenantId,
    `${role}@example.com`,
    'not-used',
    role.toUpperCase(),
    now,
  )
  tokens[role] = createSession(db, { userId: id }).token
}
db.prepare(
  'INSERT INTO professionals (id,tenant_id,name,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?)',
).run(randomUUID(), tenantId, 'Ana', users.staff, now, now)
const serviceId = randomUUID()
db.prepare(
  'INSERT INTO tenant_settings (tenant_id,secondary_color,timezone,currency,created_at,updated_at) VALUES (?,?,?,?,?,?)',
).run(tenantId, '#fff', 'America/Manaus', 'BRL', now, now)
db.prepare(
  'INSERT INTO clients (id,tenant_id,user_id,name,phone,phone_normalized,created_at) VALUES (?,?,?,?,?,?,?)',
).run(
  randomUUID(),
  tenantId,
  users.client,
  'Cliente QA',
  '+5571999999999',
  '5571999999999',
  now,
)
db.prepare(
  'INSERT INTO services (id,tenant_id,name,duration_minutes,price_cents,active,created_at) VALUES (?,?,?,?,?,?,?)',
).run(serviceId, tenantId, 'Serviço QA', 60, 10000, 1, now)
const professional = db
  .prepare('SELECT id FROM professionals WHERE user_id=?')
  .get(users.staff).id
db.prepare(
  'INSERT INTO appointments (id,tenant_id,service_id,client_user_id,professional_id,starts_at,ends_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
).run(
  randomUUID(),
  tenantId,
  serviceId,
  users.client,
  professional,
  '2030-07-02T12:00:00.000Z',
  '2030-07-02T13:00:00.000Z',
  'PENDING',
  now,
)
db.prepare(
  'INSERT INTO professional_services (tenant_id,professional_id,service_id) VALUES (?,?,?)',
).run(tenantId, professional, serviceId)
const owner = tenantId
db.prepare('UPDATE professionals SET name=?, user_id=? WHERE id=?').run(
  'Responsável',
  users.admin,
  owner,
)
db.prepare(
  'INSERT OR IGNORE INTO professional_services (tenant_id,professional_id,service_id) VALUES (?,?,?)',
).run(tenantId, owner, serviceId)
for (let day = 1; day < 6; day++)
  db.prepare(
    'INSERT INTO business_hours (id,tenant_id,weekday,start_minute,end_minute,created_at) VALUES (?,?,?,?,?,?)',
  ).run(randomUUID(), tenantId, day, 540, 1080, now)
const app = express(),
  routing = createTenantRouting({
    db,
    nodeEnv: 'test',
    devHost: 'dev.localhost',
    platformHostname: 'localhost',
  })
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
app.use(routing.resolveTenantFromSubdomain)
app.use(sessionMiddleware)
app.use(
  '/api/support',
  createSupportRouter({ db, requireDevHost: routing.requireDevHost }),
)
const { createAdminProfessionalsRouter } =
  await import('../dist/server/routes/adminProfessionalsRoutes.js')
const { createAdminServicesRouter } =
  await import('../dist/server/routes/adminServicesRoutes.js')
const { createProfessionalAccessRouter } =
  await import('../dist/server/routes/professionalAccessRoutes.js')
const { normalizeBrazilPhone } = await import('../dist/server/phone.js')
app.use('/api/admin', createAdminProfessionalsRouter(db))
app.use('/api/admin', createAdminServicesRouter({ db }))
app.use(
  '/api',
  createProfessionalAccessRouter({
    db,
    publicLimiter: (_req, _res, next) => next(),
    normalizeUserE164Phone: (raw) => {
      const phone = normalizeBrazilPhone(raw)
      if (!phone) throw Error('Telefone inválido')
      return phone
    },
    recordLegalAcceptance: () => {},
    subscriptionGate: (_req, _res, next) => next(),
  }),
)
app.get('/api/admin/onboarding', (_req, res) =>
  res.json({ onboarding: { status: 'COMPLETED' } }),
)
app.use('/api/public', createPublicRouter({ db }))
app.use(
  '/api/client',
  createClientPortalRouter({
    db,
    setClientWhatsappMarketingConsent: () => ({ optedIn: false }),
    createAppointmentForUser: () => {
      throw Error('Booking is not part of this UI check')
    },
  }),
)
app.get('/api/auth/me', (req, res) =>
  res.json({
    user: req.sessionUser
      ? {
          ...req.sessionUser,
          email: 'qa@example.com',
          tenantSlug: 'studio',
          subscriptionStatus: 'ACTIVE',
        }
      : null,
    isTestMode: false,
  }),
)
app.get('/api/auth/legal-preferences', (_req, res) =>
  res.json({
    currentDocuments: {
      termsVersion: 'test',
      privacyVersion: 'test',
      bundleHash: 'test',
    },
    latestAcceptance: {
      termsVersion: 'test',
      privacyVersion: 'test',
      bundleHash: 'test',
      acceptedAt: now,
    },
    whatsappPromotions: false,
    marketingConsentText: 'QA',
  }),
)
app.get('/api/dev/tenants', (_req, res) => res.json({ tenants: [] }))
app.get('/api/dev/settings', (_req, res) => res.json({ settings: {} }))
app.get('/api/dev/platform-overview', (_req, res) =>
  res.status(503).json({ message: 'QA fixture omitted' }),
)
app.get('/api/dev/users', (_req, res) => res.json({ users: [] }))
app.get('/api/auth/security', (_req, res) =>
  res.json({ devices: [], sessions: [], phone: null, whatsappMfaReady: false }),
)
app.get('/api/dev/notifications', (_req, res) =>
  res.json({ notifications: [] }),
)
app.get('/api/admin/dashboard', (_req, res) =>
  res.json({ upcoming: [], monthRevenueCents: 0, pendingAppointments: 0 }),
)
app.get(/^\/api\/.*$/, (_req, res) =>
  res.status(404).json({ message: 'Unrelated endpoint omitted' }),
)
app.use(handleError)
app.use(express.static(path.resolve('dist/client'), { index: false }))
app.get(/^(?!\/api).*$/, (_req, res) =>
  res.type('html').send(readFileSync('dist/client/index.html', 'utf8')),
)
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const port = server.address().port
let origin = `http://studio.localhost:${port}`
const { chromium } = await import(
  process.env.LASH_QA_PLAYWRIGHT_MODULE || 'playwright'
)
let browser, page
let checks = 0
const pass = (label) => {
  checks++
  console.log(`PASS ${label}`)
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.LASH_QA_CHROMIUM_PATH
      ? { executablePath: process.env.LASH_QA_CHROMIUM_PATH }
      : {}),
    args: [
      '--host-resolver-rules=MAP *.localhost 127.0.0.1',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--no-zygote',
      '--disable-gpu',
    ],
  })
  const context = await browser.newContext({ timezoneId: 'America/Bahia' })
  await context.addCookies([
    { name: 'session', value: tokens.admin, url: origin },
  ])
  await context.addInitScript(() => {
    localStorage.setItem('lashdesigner:tour:admin-team:v3', 'done')
    localStorage.setItem('lashdesigner:tour:admin-dashboard:v3', 'done')
  })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const apiCall = (url, method = 'GET', body) =>
    page.evaluate(
      async ({ url, method, body }) => {
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
        return { status: response.status, data: await response.json() }
      },
      { url, method, body },
    )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(origin + '/admin?view=team')
  await page
    .getByRole('heading', { name: 'Cada profissional, uma agenda organizada.' })
    .waitFor()
  await page.locator('.team-person').first().waitFor()
  assert.equal(await page.locator('.team-person').count(), 2)
  assert.equal(await page.locator('.luma-chat-launcher').count(), 0)
  if (process.env.LASH_QA_SCREENSHOT_DIR)
    await page.screenshot({
      path: path.join(process.env.LASH_QA_SCREENSHOT_DIR, 'team-desktop.png'),
    })
  pass(
    'dedicated team tab opens directly with real profiles and no Luma overlap',
  )
  await page
    .getByRole('button', { name: 'Adicionar profissional', exact: true })
    .click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'pelo menos 2' }).waitFor()
  await page.getByLabel('Nome da profissional').fill('Camila Souza')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'pelo menos um serviço' })
    .waitFor()
  await page.getByRole('checkbox', { name: /Serviço QA/ }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  assert.ok(
    (await page.getByText('09:00 — 18:00', { exact: true }).count()) >= 5,
  )
  await page
    .getByRole('button', { name: 'Horário personalizado', exact: false })
    .click()
  assert.equal(
    await page
      .getByRole('switch', { name: 'Atender Segunda' })
      .getAttribute('aria-checked'),
    'true',
  )
  assert.equal(
    await page
      .locator('input[type=time], input[type=datetime-local], select')
      .count(),
    0,
  )
  assert.equal(await page.locator('.team-switch').first().evaluate(el => window.getComputedStyle(el, '::after').backgroundColor), 'rgb(255, 255, 255)')
  await page.getByRole('button', { name: 'Início Segunda período 1' }).click()
  await page.getByRole('option', { name: '10:00', exact: true }).click()
  await page
    .getByRole('button', { name: 'Salvar profissional', exact: true })
    .click()
  await page
    .getByRole('heading', { name: 'Camila Souza', exact: true })
    .waitFor()
  const camila = db
    .prepare('SELECT id FROM professionals WHERE name=?')
    .get('Camila Souza').id
  assert.equal(
    db
      .prepare(
        'SELECT start_minute AS m FROM professional_hours WHERE professional_id=? AND weekday=1',
      )
      .get(camila).m,
    600,
  )
  assert.equal(
    db
      .prepare(
        'SELECT COUNT(*) AS n FROM professional_services WHERE professional_id=?',
      )
      .get(camila).n,
    1,
  )
  pass(
    'wizard validates name/services, inherits real hours, custom picker saves to SQLite',
  )
  assert.ok(
    await page
      .getByRole('button', { name: 'Adicionar profissional', exact: true })
      .isDisabled(),
  )
  pass('seat cap disables addition and explains current plan')
  await page
    .getByRole('searchbox', { name: 'Buscar profissional' })
    .fill('Camila')
  assert.equal(await page.locator('.team-person').count(), 1)
  await page
    .getByRole('button', { name: 'Convidar ao painel', exact: true })
    .click()
  await page.getByRole('button', { name: 'Criar convite de acesso' }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'Confira o e-mail' })
    .waitFor()
  pass('invitation validation gives a friendly inline error')
  await page.getByLabel('E-mail da profissional').fill('camila@example.com')
  await page.getByLabel('WhatsApp dela, com DDD').fill('71999995555')
  await page.getByRole('button', { name: 'Criar convite de acesso' }).click()
  await page.getByText('Convite pronto para compartilhar').waitFor()
  const url = await page.getByLabel('Link do convite').inputValue()
  assert.ok(url.includes('/convite/'))
  await page.getByRole('button', { name: 'Concluir', exact: true }).click()
  await page.locator('.team-person').getByText('Convite pendente').waitFor()
  pass('optional access generates real invitation and pending badge')
  await page.goto(url)
  const check = page.locator('.staff-invite-legal input')
  await check.waitFor()
  assert.equal(
    await check.evaluate((el) => window.getComputedStyle(el).appearance),
    'none',
  )
  const tick = await check.evaluate((el) => ({
    color: window.getComputedStyle(el, '::before').borderBottomColor,
    width: window.getComputedStyle(el).width,
  }))
  assert.equal(tick.width, '20px')
  await check.focus()
  await page.keyboard.press('Space')
  assert.ok(await check.isChecked())
  pass(
    'invitation checkbox matches product styling and remains keyboard accessible',
  )
  await page.goto(origin + '/admin?view=team')
  await page
    .locator('.team-person')
    .filter({ hasText: 'Camila Souza' })
    .getByRole('button', { name: 'Configurar', exact: true })
    .click()
  await page.getByRole('button', { name: 'Folgas', exact: true }).click()
  await page.getByText('Nenhum período bloqueado por enquanto.').waitFor()
  const future = new Date(Date.now() + 2 * 86400000),
    ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Manaus',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(future)
  const parts = ymd.split('-'),
    dateLabel = `${parts[2]}/${parts[1]}/${parts[0]}`
  await page
    .getByRole('button', { name: 'Data de início', exact: true })
    .click()
  if (new Date().getUTCMonth() !== future.getUTCMonth())
    await page
      .getByRole('button', { name: 'Próximo mês Data de início' })
      .click()
  await page.getByRole('button', { name: dateLabel, exact: true }).click()
  await page.getByLabel('Motivo (opcional)').fill('Folga QA')
  await page
    .getByRole('button', { name: 'Bloquear período', exact: true })
    .click()
  await page.getByText('Folga QA', { exact: true }).waitFor()
  assert.equal(
    db
      .prepare(
        'SELECT starts_at AS starts FROM professional_time_off WHERE professional_id=?',
      )
      .get(camila).starts,
    `${ymd}T13:00:00.000Z`,
  )
  pass(
    'custom calendar blocks a period using studio timezone, not browser timezone',
  )
  await page
    .getByRole('button', { name: 'Liberar período', exact: true })
    .click()
  await page
    .locator('.confirm-card')
    .getByRole('button', { name: 'Liberar período', exact: true })
    .click()
  await page.getByText('Nenhum período bloqueado por enquanto.').waitFor()
  pass('confirmation releases real time off')
  await page.getByRole('button', { name: 'Concluir', exact: true }).click()
  assert.equal(
    (
      await apiCall(`/api/admin/professionals/${owner}/access`, 'PATCH', {
        enabled: false,
      })
    ).status,
    404,
  )
  assert.equal(
    db
      .prepare('SELECT revoked_at AS v FROM auth_sessions WHERE user_id=?')
      .get(users.admin).v,
    null,
  )
  pass('owner access cannot be suspended through staff endpoint')
  assert.equal(
    (
      await apiCall(`/api/admin/professionals/${camila}`, 'PATCH', {
        hours: [
          { weekday: 1, startMinute: 540, endMinute: 720 },
          { weekday: 1, startMinute: 600, endMinute: 780 },
        ],
      })
    ).status,
    400,
  )
  assert.equal(
    db
      .prepare(
        'SELECT start_minute AS m FROM professional_hours WHERE professional_id=? AND weekday=1',
      )
      .get(camila).m,
    600,
  )
  pass('overlapping schedule rejected atomically, preserving previous schedule')
  assert.equal(
    (
      await apiCall(`/api/admin/professionals/${professional}`, 'PATCH', {
        active: false,
      })
    ).status,
    400,
  )
  pass('future appointments prevent unsafe deactivation')
  await page
    .locator('.team-person')
    .filter({ hasText: 'Camila Souza' })
    .getByRole('button', { name: 'Configurar', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Desativar profissional', exact: true })
    .click()
  await page
    .locator('.confirm-card')
    .getByRole('button', { name: 'Desativar', exact: true })
    .click()
  await page
    .locator('[role=dialog]')
    .getByRole('button', { name: 'Reativar profissional', exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Concluir', exact: true }).click()
  await page.getByRole('button', { name: 'Inativas', exact: true }).click()
  assert.equal(await page.locator('.team-person').count(), 1)
  pass('deactivation keeps history, updates seat count and inactive filter')
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    await page
      .locator('.team-person')
      .filter({ hasText: 'Camila Souza' })
      .getByRole('button', { name: 'Configurar', exact: true })
      .click()
    const bounds = await page.locator('.team-dialog').boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1)
    await page
      .getByRole('button', { name: 'Editar cadastro', exact: true })
      .click()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    assert.ok(
      await page
        .getByRole('button', { name: 'Salvar profissional', exact: true })
        .isVisible(),
    )
    const clockWidths = await page.locator('.team-period .ld-select-value > span:last-child').evaluateAll(elements => elements.map(el => ({ actual: el.scrollWidth, visible: el.clientWidth })))
    assert.ok(clockWidths.every(item => item.actual <= item.visible + 1), 'times must be fully readable, without ellipsis')
    if (process.env.LASH_QA_SCREENSHOT_DIR)
      await page.screenshot({
        path: path.join(
          process.env.LASH_QA_SCREENSHOT_DIR,
          `team-hours-${width}.png`,
        ),
      })
    await page
      .getByRole('button', { name: 'Fechar cadastro', exact: true })
      .click()
    pass(`team and schedule modal fit ${width}px with reachable actions`)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Serviços', exact: true }).click()
  await page.locator('.team-page').waitFor({ state: 'detached' })
  assert.equal(await page.locator('.team-page, .staff52').count(), 0)
  pass('services tab contains only service management')
  assert.deepEqual(errors, [])
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  console.log(
    `${checks} practical team checks passed; no browser errors or foreign-key violations.`,
  )
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: '/tmp/lash-team-debug.png' })
    console.error(await page.locator('body').innerText())
  }
  throw error
} finally {
  if (browser) await browser.close()
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  rmSync(directory, { recursive: true, force: true })
}
