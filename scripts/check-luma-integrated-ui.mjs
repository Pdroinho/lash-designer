/* global document, window */
// Production client and real Luma/finance/support/credit routes with SQLite and opaque sessions. LLM, Appmax and Evolution providers are deterministic local doubles; no external payment/message is initiated.
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

const {createAdminLumaOperationsRouter}=await import('../dist/server/routes/adminLumaOperationsRoutes.js')
const {createAdminLumaAssistantRouter}=await import('../dist/server/routes/adminLumaAssistantRoutes.js')
const {createAdminLumaBillingRouter}=await import('../dist/server/routes/adminLumaBillingRoutes.js')
const {createLumaAppmaxCredits}=await import('../dist/server/lumaAppmaxCredits.js')
const {executeLumaTool,confirmLumaAction}=await import('../dist/server/lumaBridge.js')
const {createAdminFinanceRouter}=await import('../dist/server/routes/adminFinanceRoutes.js')
const finance=await import('../dist/server/finance.js')
const dates=await import('../dist/server/dateTime.js')
const {createLumaReminderRuntime}=await import('../dist/server/lumaReminderRuntime.js')
db.prepare('UPDATE users SET phone=? WHERE id=?').run('5571999991111',users.admin)
db.prepare('INSERT INTO subscriptions(id,tenant_id,status,current_period_end,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(randomUUID(),tenantId,'ACTIVE','2099-01-01T00:00:00.000Z',now,now)
const localToday=dates.getZonedDateTimeParts(new Date(),'America/Manaus').ymd,pastId=randomUUID(),pastStart=dates.dayBoundsUtc({timeZone:'America/Manaus',ymd:localToday}).start.toISOString()
db.prepare('INSERT INTO appointments(id,tenant_id,service_id,client_user_id,professional_id,starts_at,ends_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(pastId,tenantId,serviceId,users.client,professional,pastStart,new Date(Date.parse(pastStart)+3600000).toISOString(),'CONFIRMED',now)
let nextLink=50,providerState='UNKNOWN',modelFails=false
const creditService=createLumaAppmaxCredits(db,{createPaymentLink:async()=>{const linkId=nextLink++;return {linkId,checkoutUrl:`https://checkout.example/${linkId}`}},inspectPaymentLinkOrder:async({orderId})=>orderId===777?providerState:'UNKNOWN',listPaymentLinkOrders:async()=>[{id:777,status:'paid'}]})
app.use('/api/admin',createAdminLumaOperationsRouter(db,(_req,_res,next)=>next()))
app.use('/api/admin',createAdminLumaBillingRouter({db,appmaxCredits:creditService,appmaxEnabled:true,createInfinitePayLink:async()=>{throw Error('Legacy checkout must not be used')}}))
app.use('/api/admin',createAdminFinanceRouter({db,tenantFinanceTimeZone:finance.tenantFinanceTimeZone,financeMonthSnapshot:finance.financeMonthSnapshot,financeRecentMonths:finance.financeRecentMonths,financeExpenseCategories:finance.financeExpenseCategories}))
app.use('/api/admin',createAdminLumaAssistantRouter({db,assistantEnabled:true,creditCheckoutAvailable:true,assistantProvider:{apiKey:'local-test',name:'test',model:'test'},lumaAssistantLimiter:(_req,_res,next)=>next(),confirmLumaAction,generateAssistantAnswer:async({message,context})=>{
 if(modelFails)throw Error('Provider test failure')
 let result
 if(message.includes('SUPORTE_TESTE')) result=executeLumaTool(context,'prepare_support_ticket',{subject:'Ajuda com minha agenda',body:'Preciso de ajuda para conferir os horários da minha equipe.',category:'BOOKING'})
 else if(message.includes('DESPESA_TESTE')) result=executeLumaTool(context,'prepare_finance_entry',{type:'EXPENSE',amount_cents:2500,note:'Material Luma QA',date:localToday,method:'PIX'})
 else if(message.includes('HISTORICO_TESTE')) result=executeLumaTool(context,'get_support_requests',{})
 return {text:'Conferi o pedido. Revise a ação abaixo antes de confirmar.',inputTokens:1,outputTokens:1,reasoningTokens:0,costUsd:.0001,model:'local-provider-double',steps:1,toolCalls:result?1:0,visionInputs:0,pendingActions:result?.pendingAction?[result.pendingAction]:[]}
}}))
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
let browser,page,checks=0
const pass=label=>{checks++;console.log(`PASS ${label}`)}
try{
 browser=await chromium.launch({headless:true,...(process.env.LASH_QA_CHROMIUM_PATH?{executablePath:process.env.LASH_QA_CHROMIUM_PATH}:{}),args:['--host-resolver-rules=MAP *.localhost 127.0.0.1','--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu']})
 const context=await browser.newContext({timezoneId:'America/Bahia'});await context.addCookies([{name:'session',value:tokens.admin,url:origin}]);await context.addInitScript(()=>{localStorage.setItem('lashdesigner:tour:admin-dashboard:v4','done');localStorage.setItem('lashdesigner:tour:admin-team:v4','done');sessionStorage.setItem('lashdesigner:luma-thread:v2',JSON.stringify([{id:'old',role:'user',text:'PRIVATE_OLD_ACCOUNT'}]))})
 page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const call=(url,method='GET',body)=>page.evaluate(async({url,method,body})=>{const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()}},{url,method,body})
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/admin?view=team');await page.getByRole('heading',{name:'Cada profissional, uma agenda organizada.'}).waitFor()
 await page.getByRole('button',{name:'Pedir ajuda à Luma nesta tela'}).click();await page.getByRole('dialog',{name:'Conversa com a Luma'}).waitFor();assert.ok((await page.getByLabel('Mensagem para a Luma',{exact:true}).inputValue()).includes('equipe'));assert.equal(await page.getByText('PRIVATE_OLD_ACCOUNT',{exact:true}).count(),0);await page.getByRole('button',{name:'Fechar Luma',exact:true}).click();pass('Luma opens contextually from Team, without floating overlap or old-account history')
 await page.getByRole('button',{name:'Luma',exact:true}).click();await page.getByRole('navigation',{name:'Ferramentas da Luma'}).waitFor();assert.equal(await page.getByRole('button',{name:'Minha rotina',exact:true}).count(),1)
 await page.getByRole('button',{name:'Minha rotina',exact:true}).click();await page.getByRole('heading',{name:'Cliente QA',exact:true}).waitFor();assert.ok(await page.getByText('America/Manaus',{exact:false}).count());pass('routine uses real studio timezone and appointments, not fabricated summaries')
 await page.getByRole('button',{name:'Veio',exact:true}).click();await page.getByRole('dialog',{name:'Revise antes de confirmar'}).waitFor();assert.equal(db.prepare('SELECT attendance_status AS s FROM appointments WHERE id=?').get(pastId).s,'NOT_RECORDED');await page.getByRole('button',{name:'Registrar comparecimento',exact:true}).click();await page.getByText('Compareceu',{exact:true}).waitFor();assert.equal(db.prepare('SELECT attendance_status AS s FROM appointments WHERE id=?').get(pastId).s,'ATTENDED');pass('manual attendance is previewed, confirmed, persisted and refreshed')
 await page.getByRole('button',{name:'Faltou',exact:true}).click();await page.getByRole('button',{name:'Registrar comparecimento',exact:true}).click();await page.getByText('Faltou',{exact:true}).first().waitFor();assert.equal(db.prepare('SELECT attendance_status AS s FROM appointments WHERE id=?').get(pastId).s,'NO_SHOW');pass('absence and intent-to-attend remain separate facts')
 await page.getByRole('button',{name:'Conversar',exact:true}).click();await page.getByLabel('Mensagem para a Luma',{exact:true}).fill('SUPORTE_TESTE');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await page.getByRole('button',{name:'Enviar pedido de ajuda',exact:true}).waitFor();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n,0);await page.getByRole('button',{name:'Enviar pedido de ajuda',exact:true}).click();await page.getByText('Pedido enviado ao suporte.',{exact:true}).waitFor();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n,1);pass('a simulated model prepares a ticket; user confirmation calls real support service')
 await page.getByRole('button',{name:'Meus pedidos',exact:true}).click();await page.getByRole('heading',{name:'Ajuda com minha agenda',exact:true}).waitFor();await page.getByRole('button',{name:'Luma, me atualize'}).click();await page.waitForFunction(()=>document.querySelector('textarea')?.value.includes('Consulte meu pedido'));pass('support summary is live and opens a contextual follow-up')
 await page.getByLabel('Mensagem para a Luma',{exact:true}).fill('DESPESA_TESTE');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await page.getByRole('button',{name:'Salvar lançamento',exact:true}).click();await page.getByText('Alteração registrada com sucesso.',{exact:true}).waitFor();assert.equal(db.prepare("SELECT amount_cents AS n FROM cash_transactions WHERE note='Material Luma QA'").get().n,2500);pass('Luma financial action writes a real expense only after confirmation')
 await page.getByRole('button',{name:'Financeiro',exact:true}).last().click();await page.getByRole('heading',{name:'Seu financeiro, com a Luma'}).waitFor();await page.locator('.finance36').waitFor();assert.equal(await page.getByRole('button',{name:'Luma, analise meu financeiro'}).count(),1);pass('Luma reuses the existing visual finance module')
 await page.getByRole('button',{name:'Do meu jeito',exact:true}).click();await page.getByRole('button',{name:'Tom da Luma'}).click();await page.getByRole('option',{name:'Direta e resumida',exact:true}).click();await page.getByRole('button',{name:'Salvar preferências',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Salvar preferências',exact:true}).click();assert.equal(db.prepare('SELECT tone FROM assistant_preferences WHERE tenant_id=? AND user_id=?').get(tenantId,users.admin).tone,'DIRECT');pass('personalization persists per owner through the shared review dialog')
 await page.getByRole('button',{name:'Lembretes',exact:true}).click();await page.getByRole('button',{name:'Quando lembrar',exact:true}).click();const future=new Date(Date.now()+2*86400000),p=dates.getZonedDateTimeParts(future,'America/Manaus'),label=`${String(p.day).padStart(2,'0')}/${String(p.month).padStart(2,'0')}/${p.year}`;if(p.month!==dates.getZonedDateTimeParts(new Date(),'America/Manaus').month)await page.getByRole('button',{name:'Próximo mês Quando lembrar'}).click();await page.getByRole('button',{name:label,exact:true}).click();await page.getByLabel('O que você quer lembrar?').fill('Conferir a agenda Luma QA.');await page.getByRole('button',{name:'Agendar lembrete',exact:true}).click();await page.getByRole('button',{name:'Agendar meu lembrete',exact:true}).click();await page.getByText('Conferir a agenda Luma QA.',{exact:true}).waitFor();const reminder=db.prepare("SELECT id,due_at AS due FROM assistant_reminders WHERE body='Conferir a agenda Luma QA.'").get();assert.equal(reminder.due,`${p.ymd}T13:00:00.000Z`);pass('shared date/time controls schedule a real personal reminder in studio timezone')
 db.prepare('UPDATE assistant_reminders SET due_at=? WHERE id=?').run(pastStart,reminder.id);const sends=[];const runtime=createLumaReminderRuntime(db,async(tenantId,phone,text)=>{sends.push({tenantId,phone,text});return true});await runtime.processDue();await runtime.processDue();assert.equal(sends.length,1);assert.equal(sends[0].phone,'5571999991111');pass('Evolution integration sender is invoked once, for the owner; provider is simulated')
 await page.getByRole('button',{name:'Conversar',exact:true}).click();await page.route('https://checkout.example/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Checkout simulado</h1>'}));db.prepare("UPDATE assistant_usage SET cost_usd=1 WHERE tenant_id=? AND status='COMPLETED'").run(tenantId);await page.getByLabel('Mensagem para a Luma',{exact:true}).fill('Limite teste');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await page.getByRole('button',{name:'Comprar 25',exact:true}).click();await page.getByRole('heading',{name:'Checkout simulado'}).waitFor();const order=db.prepare('SELECT order_nsu AS nsu,amount_cents AS amount FROM assistant_credit_orders ORDER BY created_at DESC LIMIT 1').get();assert.equal(order.amount,500);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM assistant_message_credit_ledger').get().n,0);providerState='PAID';await page.goto(origin+'/admin?lumaCredits=return');await page.getByRole('status').filter({hasText:'Pagamento confirmado'}).waitFor();assert.equal(db.prepare('SELECT SUM(delta_messages) AS n FROM assistant_message_credit_ledger').get().n,25);await creditService.refreshOrder(tenantId,order.nsu);assert.equal(db.prepare('SELECT SUM(delta_messages) AS n FROM assistant_message_credit_ledger').get().n,25);pass('Appmax credit checkout uses valid minimum and verified return grants one pack, with provider simulated')
 await page.getByRole('button',{name:'Minhas compras de créditos'}).click();await page.getByText('25 créditos · R$ 5,00',{exact:true}).waitFor();pass('credit purchase history shows real order and current price')
 const data=await call('/api/admin/assistant/operations/prepare','POST',{name:'prepare_finance_entry',args:{type:'EXPENSE',amount_cents:-1,date:localToday,note:'bad'}});assert.equal(data.status,400);pass('invalid financial mutation rejected by server despite direct request')
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Minha rotina',exact:true}).click();await page.getByRole('heading',{name:'Cliente QA',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.getByRole('button',{name:'Veio',exact:true}).click();const panel=page.getByRole('dialog',{name:'Revise antes de confirmar'});const box=await panel.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);assert.ok(await panel.getByRole('button',{name:'Registrar comparecimento'}).isVisible());await panel.getByRole('button',{name:'Cancelar',exact:true}).click();if(process.env.LASH_QA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.LASH_QA_SCREENSHOT_DIR,`luma-routine-${width}.png`),fullPage:true});pass(`routine and shared confirmation dialog fit ${width}px`)}
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Conversar',exact:true}).click();modelFails=true;await page.getByLabel('Mensagem para a Luma',{exact:true}).fill('Teste de erro');await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await page.locator('.luma34-error,.luma35-error,[role=alert]').first().waitFor();assert.equal(db.prepare('SELECT SUM(delta_messages) AS n FROM assistant_message_credit_ledger').get().n,25);modelFails=false;pass('model failure displays recovery and does not consume paid credits')
 assert.deepEqual(errors,[]);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);console.log(`${checks} integrated Luma browser checks passed; provider calls use local doubles.`)
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:'/tmp/luma-integrated-debug.png'});console.error(await page.locator('body').innerText())}throw error}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));closeDb();rmSync(directory,{recursive:true,force:true})}
