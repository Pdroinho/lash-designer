/* global document, window */
// Production client + real support routes, migrated SQLite and opaque sessions.
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
  { createClientPortalRouter } = await import('../dist/server/routes/clientPortalRoutes.js'),
  { handleError } = await import('../dist/server/http.js')
migrate()
const db = getDb(),
  tenantId = randomUUID(),
  now = new Date().toISOString()
db.prepare(
  "INSERT INTO tenants (id,slug,name,primary_color,status,created_at) VALUES (?,'studio','Studio QA','#972d57','ACTIVE',?)",
).run(tenantId, now)
const users = { admin: randomUUID(), dev: randomUUID(), staff: randomUUID(), client: randomUUID() },
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
const serviceId=randomUUID()
db.prepare('INSERT INTO tenant_settings (tenant_id,secondary_color,timezone,currency,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(tenantId,'#fff','America/Manaus','BRL',now,now)
db.prepare('INSERT INTO clients (id,tenant_id,user_id,name,phone,phone_normalized,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),tenantId,users.client,'Cliente QA','+5571999999999','5571999999999',now)
db.prepare('INSERT INTO services (id,tenant_id,name,duration_minutes,price_cents,active,created_at) VALUES (?,?,?,?,?,?,?)').run(serviceId,tenantId,'Serviço QA',60,10000,1,now)
const professional=db.prepare('SELECT id FROM professionals WHERE user_id=?').get(users.staff).id
db.prepare('INSERT INTO appointments (id,tenant_id,service_id,client_user_id,professional_id,starts_at,ends_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(),tenantId,serviceId,users.client,professional,'2030-07-02T12:00:00.000Z','2030-07-02T13:00:00.000Z','PENDING',now)
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
app.use('/api/public', createPublicRouter({ db }))
app.use('/api/client',createClientPortalRouter({db,setClientWhatsappMarketingConsent:()=>({optedIn:false}),createAppointmentForUser:()=>{throw Error('Booking is not part of this UI check')}}))
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
app.get('/api/dev/users',(_req,res)=>res.json({users:[]}))
app.get('/api/auth/security',(_req,res)=>res.json({devices:[],sessions:[],phone:null,whatsappMfaReady:false}))
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
const passed = []
function pass(label) {
  passed.push(label)
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
  page = await context.newPage()
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  async function session(role) {
    origin = `http://${role === 'dev' ? 'dev.localhost' : 'studio.localhost'}:${port}`
    await context.clearCookies()
    await context.addCookies([
      { name: 'session', value: tokens[role], url: origin },
    ])
  }
  await session('admin')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(origin + '/admin?view=support')
  await page
    .locator('.support-center')
    .getByRole('heading', { name: 'Suporte', exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Novo chamado' }).click()
  await page
    .getByLabel('Assunto', { exact: true })
    .fill('Agendamento com erro no horário')
  await page
    .getByLabel('Descreva o problema')
    .fill('Ao selecionar a profissional, o horário é diferente do esperado.')
  const image = await page.screenshot({
    clip: { x: 0, y: 0, width: 120, height: 120 },
  })
  await page
    .getByLabel('Anexar imagens')
    .setInputFiles({
      name: 'captura.png',
      mimeType: 'image/png',
      buffer: image,
    })
  await page.getByRole('button', { name: 'captura.webp · remover' }).waitFor()
  await page.getByRole('button', { name: 'Abrir chamado', exact: true }).click()
  await page
    .getByRole('heading', { name: 'Agendamento com erro no horário' })
    .waitFor()
  const id = Number(new URL(page.url()).searchParams.get('ticket'))
  assert.ok(id)
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n,
    1,
  )
  assert.equal(
    db.prepare('SELECT mime_type FROM support_attachments').get().mime_type,
    'image/webp',
  )
  pass(
    'ADMIN opens real ticket with optimized screenshot through production UI',
  )
  await session('dev')
  await page.goto(origin + '/?view=support&ticket=' + id)
  await page.getByRole('heading', { name: 'Central de atendimento' }).waitFor()
  assert.equal(await page.getByRole('heading',{name:'Usuários do Sistema'}).count(),0)
  assert.equal(await page.getByRole('heading',{name:'Segurança da conta DEV'}).count(),0)
  assert.equal(await page.getByRole('button',{name:'Adicionar Usuário'}).count(),0)
  if(process.env.LASH_QA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.LASH_QA_SCREENSHOT_DIR,'dev-support.png'),fullPage:true})
  pass('DEV support does not mount user administration or account settings')
  await page
    .getByRole('heading', { name: 'Agendamento com erro no horário' })
    .waitFor()
  await page.getByRole('button',{name:'Configurações',exact:true}).click()
  await page.getByRole('heading',{name:'Usuários do Sistema'}).waitFor()
  await page.getByRole('button',{name:'Atendimento',exact:true}).click()
  await page.getByRole('heading',{name:'Central de atendimento'}).waitFor()
  assert.equal(await page.getByRole('heading',{name:'Usuários do Sistema'}).count(),0)
  pass('DEV settings still render exclusively in their own tab')
  await page.getByLabel('Nota interna · visível apenas ao DEV').check()
  await page
    .getByLabel('Nota para a equipe')
    .fill('Nota privada para investigação')
  await page.getByRole('button', { name: 'Salvar nota interna' }).click()
  await page
    .getByText('Nota privada para investigação', { exact: true })
    .waitFor()
  await page.getByLabel('Nota interna · visível apenas ao DEV').uncheck()
  await page
    .getByLabel('Sua mensagem', { exact: true })
    .fill('Conferimos os horários. Pode verificar novamente?')
  await page
    .getByRole('button', { name: 'Enviar resposta', exact: true })
    .click()
  await page
    .getByText('Conferimos os horários. Pode verificar novamente?', {
      exact: true,
    })
    .waitFor()
  pass('DEV reads real queue, saves private note and sends public reply')
  await session('admin')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(origin + '/admin?view=support')
  await page
    .locator('.support-center')
    .getByRole('heading', { name: 'Suporte', exact: true })
    .waitFor()
  const bell = page.getByRole('button', { name: /Abrir notificações/ })
  await bell.click()
  await page.getByRole('button', { name: /SUP-000001 · Nova resposta/ }).click()
  await page
    .getByText('Conferimos os horários. Pode verificar novamente?', {
      exact: true,
    })
    .waitFor()
  assert.equal(
    await page
      .getByText('Nota privada para investigação', { exact: true })
      .count(),
    0,
  )
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  )
  pass(
    'mobile notification opens ticket; internal note hidden; no horizontal overflow',
  )
  await page
    .getByLabel('Sua mensagem', { exact: true })
    .fill('Meu rascunho permanece após conflito')
  db.prepare('UPDATE support_tickets SET version=version+1 WHERE id=?').run(id)
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().includes('/api/support/tickets/' + id + '?after=') &&
      response.status() === 200,
  )
  await page
    .getByRole('button', { name: 'Enviar resposta', exact: true })
    .click()
  await page.getByRole('alert').filter({ hasText: 'atualização' }).waitFor()
  assert.equal(
    await page.getByLabel('Sua mensagem', { exact: true }).inputValue(),
    'Meu rascunho permanece após conflito',
  )
  await refreshed
  await page
    .getByRole('button', { name: 'Enviar resposta', exact: true })
    .click()
  await page
    .getByText('Meu rascunho permanece após conflito', { exact: true })
    .waitFor()
  pass('concurrent version conflict preserves draft and allows retry')
  await page.getByRole('button', { name: 'Marcar como resolvido' }).click()
  await page.getByRole('button', { name: 'Reabrir chamado' }).waitFor()
  await page.getByRole('button', { name: 'Reabrir chamado' }).click()
  await page.getByRole('button', { name: 'Marcar como resolvido' }).waitFor()
  pass('customer resolves and reopens through real backend')
  await page.goto(origin+'/admin?view=support&ticket=999999')
  await page.getByRole('status').filter({hasText:'Não foi possível abrir este chamado'}).waitFor()
  await page.getByRole('button',{name:'Voltar à lista'}).click()
  await page.locator('.support-list').waitFor()
  pass('missing ticket has a clear error and a mobile return to the list')

  await page.getByRole('searchbox').fill('SUP-000001')
  await page.locator('.support-ticket').first().waitFor()
  pass('mobile search and list navigation work')
  await session('staff')
  await page.goto(origin + '/suporte')
  await page
    .locator('.support-center')
    .getByRole('heading', { name: 'Suporte', exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Novo chamado' }).click()
  await page
    .getByLabel('Assunto', { exact: true })
    .fill('Preciso de ajuda com minha agenda')
  await page
    .getByLabel('Descreva o problema')
    .fill('Gostaria de verificar os atendimentos da minha agenda individual.')
  await page.getByRole('button', { name: 'Abrir chamado', exact: true }).click()
  await page
    .getByRole('heading', { name: 'Preciso de ajuda com minha agenda' })
    .waitFor()
  assert.equal(
    db
      .prepare('SELECT COUNT(*) AS n FROM support_tickets WHERE requester_id=?')
      .get(users.staff).n,
    1,
  )
  pass('STAFF can create and view own tickets through mobile workspace')
  await page.setViewportSize({ width: 768, height: 1024 })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  )
  pass('tablet layout has no horizontal overflow')
  await page.addInitScript(()=>window.localStorage.setItem('lashdesigner:tour:client-appointments:v3','qa'))
  await session('client')
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    await page.setViewportSize(viewport)
    await page.goto(origin+'/cliente')
    const container=page.locator(viewport.width===390?'.mobile-appointment-list':'.data-table')
    await container.getByText('Com Ana',{exact:true}).waitFor()
    await container.getByText(/08:00/).waitFor()
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
    if(process.env.LASH_QA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.LASH_QA_SCREENSHOT_DIR,`client-${viewport.width}.png`),fullPage:true})
    pass(`CLIENT sees the professional and studio timezone at ${viewport.width}px`)
  }
  await page.route('**/api/client/appointments',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Agenda temporariamente indisponível'})}))
  await page.reload()
  await page.getByRole('alert').filter({hasText:'Agenda temporariamente indisponível'}).waitFor()
  assert.equal(await page.getByText('Nenhum agendamento',{exact:true}).count(),0)
  await page.unroute('**/api/client/appointments')
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click()
  await page.locator('.mobile-appointment-list').getByText('Com Ana',{exact:true}).waitFor()
  pass('CLIENT fetch error never pretends an empty agenda and retry recovers')
  assert.deepEqual(errors, [])
  pass('no uncaught browser errors')
  console.log(
    `${passed.length}/${passed.length} browser checks passed; support API and SQLite are real, unrelated endpoints use fixtures.`,
  )
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({
      path:
        process.env.LASH_QA_DEBUG_SCREENSHOT || '/tmp/lash-support-debug.png',
    })
    console.error(await page.locator('body').innerText())
  }
  throw error
} finally {
  if (browser) await browser.close()
  await new Promise((resolve) => server.close(resolve))
  closeDb()
  rmSync(directory, { recursive: true, force: true })
}
