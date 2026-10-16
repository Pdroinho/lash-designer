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
const {executeLumaImageTool}=await import('../dist/server/lumaImageTools.js')
const {default:sharp}=await import('sharp')
const ink=await sharp({create:{width:30,height:20,channels:4,background:'#972d57'}}).png().toBuffer()
const originalLogo='data:image/png;base64,'+(await sharp({create:{width:80,height:60,channels:4,background:'#fff'}}).composite([{input:ink,left:25,top:20}]).png().toBuffer()).toString('base64')
db.prepare('UPDATE tenants SET logo_url=? WHERE id=?').run(originalLogo,tenantId)
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
 if(message.includes('LOGO_TESTE')) result=await executeLumaImageTool(context,'prepare_brand_image',{source:'CURRENT_LOGO',mode:'REMOVE_BACKGROUND_AND_TRIM'})
 else if(message.includes('RESTAURAR_TESTE')) result=await executeLumaImageTool(context,'prepare_brand_image',{source:'CURRENT_LOGO',mode:'RESTORE_ORIGINAL'})
 else if(message.includes('SUPORTE_TESTE')) result=executeLumaTool(context,'prepare_support_ticket',{subject:'Ajuda com minha agenda',body:'Preciso de ajuda para conferir os horários da minha equipe.',category:'BOOKING'})
 else if(message.includes('DESPESA_TESTE')) result=executeLumaTool(context,'prepare_finance_entry',{type:'EXPENSE',amount_cents:2500,note:'Material Luma QA',date:localToday,method:'PIX'})
 else if(message.includes('PRESENCA_TESTE')) result=executeLumaTool(context,'prepare_attendance',{appointment_id:pastId,attendance:'ATTENDED'})
 else if(message.includes('LEMBRETE_TESTE')) result=executeLumaTool(context,'prepare_whatsapp_reminder',{date:dates.getZonedDateTimeParts(new Date(Date.now()+2*86400000),'America/Manaus').ymd,time:'14:00',message:'Lembrete pessoal QA'})
 else if(message.includes('PREFERENCIA_TESTE')) result=executeLumaTool(context,'prepare_luma_preferences',{tone:'DIRECT',focus:'FINANCE',instructions:'Seja objetiva.'})
 else if(message.includes('AGENDA_TESTE')) result=executeLumaTool(context,'get_calendar_period',{start_date:localToday,end_date:localToday})
 else if(message.includes('HISTORICO_TESTE')) result=executeLumaTool(context,'get_support_requests',{})
 return {text:message.includes('AGENDA_TESTE')?'Agenda consultada: Cliente QA · Ana · America/Manaus.':message.includes('HISTORICO_TESTE')?'Chamados consultados: Ajuda com minha agenda.':'Conferi o pedido. Revise a ação abaixo antes de confirmar.',inputTokens:1,outputTokens:1,reasoningTokens:0,costUsd:.0001,model:'local-provider-double',steps:1,toolCalls:result?1:0,visionInputs:0,pendingActions:result?.pendingAction?[result.pendingAction]:[]}
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
 browser=await chromium.launch({headless:true,...(process.env.LASH_QA_CHROMIUM_PATH?{executablePath:process.env.LASH_QA_CHROMIUM_PATH}:{}),args:['--host-resolver-rules=MAP *.localhost 127.0.0.1','--no-sandbox','--disable-dev-shm-usage',...(process.env.LASH_QA_MULTIPROCESS==='true'?[]:['--single-process']),'--no-zygote','--disable-gpu']})
 const context=await browser.newContext({timezoneId:'America/Bahia'});await context.addCookies([{name:'session',value:tokens.admin,url:origin}]);await context.addInitScript(()=>{localStorage.setItem('lashdesigner:tour:admin-dashboard:v4','done');localStorage.setItem('lashdesigner:tour:admin-team:v4','done');sessionStorage.setItem('lashdesigner:luma-thread:v2',JSON.stringify([{id:'old',role:'user',text:'PRIVATE_OLD_ACCOUNT'}]))})
 page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message))

 await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/admin?view=team');await page.getByRole('heading',{name:'Cada profissional, uma agenda organizada.'}).waitFor()
 await page.getByRole('button',{name:'Pedir ajuda à Luma nesta tela'}).click();await page.getByRole('dialog',{name:'Conversa com a Luma'}).waitFor();assert.ok((await page.getByLabel('Mensagem para a Luma',{exact:true}).inputValue()).includes('equipe'));assert.equal(await page.getByText('PRIVATE_OLD_ACCOUNT',{exact:true}).count(),0);await page.getByRole('button',{name:'Fechar Luma',exact:true}).click();assert.equal(await page.locator('.luma34-launcher').count(),0);assert.equal(await page.getByRole('button',{name:'Pedir ajuda à Luma nesta tela'}).evaluate(el=>el===document.activeElement),true);pass('header is the sole Luma launcher and closing restores keyboard focus')
 await page.getByRole('button',{name:'Luma',exact:true}).click();await page.getByRole('heading',{name:'Sua rotina, em uma conversa'}).waitFor()
 assert.equal(await page.getByRole('navigation',{name:'Ferramentas da Luma'}).count(),0);assert.equal(await page.locator('.luma34-starters button').count(),4);pass('one chat replaces the six tabs, with four clear starting suggestions')
 for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});await page.locator('.luma-chat-capabilities summary').click();assert.equal(await page.locator('.luma-chat-examples button').count(),7);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.locator('.luma-chat-capabilities summary').click();if(width<=768){const composer=await page.locator('.luma34-composer').boundingBox();assert.ok(composer.y+composer.height<=820,'composer stays above mobile navigation')}if(process.env.LASH_QA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.LASH_QA_SCREENSHOT_DIR,`luma-chat-${width}.png`),fullPage:true});pass(`chat and capability examples fit ${width}px`)}
 await page.setViewportSize({width:1440,height:1000});await page.locator('.luma-chat-capabilities summary').click();await page.getByRole('button',{name:'Personalizar a Luma',exact:true}).click();await page.locator('.luma34-message.is-user').filter({hasText:'Quero personalizar'}).waitFor();await page.locator('.luma34-message.is-assistant').waitFor();assert.equal(await page.locator('.luma-chat-capabilities[open]').count(),0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM assistant_preferences').get().n,0);pass('examples start the same chat without mutation or navigation')
 const send=async text=>{await page.getByLabel('Mensagem para a Luma',{exact:true}).fill(text);await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click()}
 await send('AGENDA_TESTE');await page.getByText('Agenda consultada: Cliente QA · Ana · America/Manaus.',{exact:true}).waitFor();pass('agenda is read with the real tool and explained inside chat')
 await send('PRESENCA_TESTE');await page.getByRole('button',{name:'Registrar comparecimento',exact:true}).waitFor();assert.equal(db.prepare('SELECT attendance_status AS s FROM appointments WHERE id=?').get(pastId).s,'NOT_RECORDED');await page.getByRole('button',{name:'Registrar comparecimento',exact:true}).click();await page.locator('.luma35-action.is-done').waitFor();assert.equal(db.prepare('SELECT attendance_status AS s FROM appointments WHERE id=?').get(pastId).s,'ATTENDED');pass('attendance is prepared and confirmed entirely in chat')
 await send('SUPORTE_TESTE');await page.getByRole('button',{name:'Enviar pedido de ajuda',exact:true}).waitFor();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n,0);await page.getByRole('button',{name:'Enviar pedido de ajuda',exact:true}).click();await page.getByText('Pedido enviado ao suporte.',{exact:true}).waitFor();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM support_tickets').get().n,1);pass('support ticket opens from chat only after review')
 await send('HISTORICO_TESTE');await page.getByText('Chamados consultados: Ajuda com minha agenda.',{exact:true}).waitFor();pass('support updates use real ticket tool in the same conversation')
 await send('DESPESA_TESTE');await page.getByRole('button',{name:'Salvar lançamento',exact:true}).click();await page.locator('.luma35-action.is-done').filter({hasText:'Salvar lançamento'}).waitFor();assert.equal(db.prepare("SELECT amount_cents AS n FROM cash_transactions WHERE note='Material Luma QA'").get().n,2500);pass('chat confirmation persists a real financial entry')
 const contrasts=await page.locator('.luma35-action.is-done').filter({hasText:'Salvar lançamento'}).evaluate(el=>{
  const pixel=color=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)}
  const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
  const b=lum(pixel(window.getComputedStyle(el).backgroundColor));return [...el.querySelectorAll('strong,small,.luma35-action-done')].map(t=>{const f=lum(pixel(window.getComputedStyle(t).color));return (Math.max(f,b)+.05)/(Math.min(f,b)+.05)})
 });assert.ok(contrasts.every(r=>r>=4.5));pass('completed action text passes 4.5:1 contrast on a neutral receipt')
 await send('PREFERENCIA_TESTE');await page.getByRole('button',{name:'Salvar preferências',exact:true}).click();await page.locator('.luma35-action.is-done').filter({hasText:'Salvar preferências'}).waitFor();assert.equal(db.prepare('SELECT tone FROM assistant_preferences WHERE tenant_id=? AND user_id=?').get(tenantId,users.admin).tone,'DIRECT');pass('personalization is conversational and user-confirmed')
 await send('LEMBRETE_TESTE');await page.getByRole('button',{name:'Agendar meu lembrete',exact:true}).click();await page.getByText('Lembrete agendado. O envio acontecerá no horário escolhido.',{exact:true}).waitFor();const reminder=db.prepare('SELECT id FROM assistant_reminders WHERE user_id=?').get(users.admin);assert.ok(reminder);let sent=0;db.prepare('UPDATE assistant_reminders SET due_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),reminder.id);const worker=createLumaReminderRuntime(db,async()=>{sent++;return {accepted:true,messageId:'qa-message'}});await worker.processDue();await worker.processDue();assert.equal(sent,1);pass('conversational reminder queues once through simulated Evolution sender')
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:900});await send('LOGO_TESTE');const card=page.locator('.luma35-action').filter({hasText:'Logo preparada'}).last();await card.locator('img').waitFor();assert.equal(db.prepare('SELECT logo_url AS logo FROM tenants WHERE id=?').get(tenantId).logo,originalLogo);assert.ok(await card.locator('img').evaluate(el=>el.naturalWidth>0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await card.getByRole('button',{name:'Usar esta logo'}).click();await card.locator('.luma35-action-done').waitFor();assert.notEqual(db.prepare('SELECT logo_url AS logo FROM tenants WHERE id=?').get(tenantId).logo,originalLogo);
  await send('RESTAURAR_TESTE');const restore=page.locator('.luma35-action').filter({hasText:'Restaurar logo original'}).last();await restore.getByRole('button',{name:'Usar esta logo'}).click();await restore.locator('.luma35-action-done').waitFor();assert.equal(db.prepare('SELECT logo_url AS logo FROM tenants WHERE id=?').get(tenantId).logo,originalLogo);pass(`real logo preview, confirmed apply and original restoration at ${width}px`)
 }
 db.prepare("UPDATE assistant_usage SET cost_usd=1 WHERE tenant_id=? AND status='COMPLETED'").run(tenantId);await send('Limite teste');await page.route('https://checkout.example/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Checkout simulado</h1>'}));await page.getByRole('button',{name:'Comprar 25',exact:true}).click();await page.getByRole('heading',{name:'Checkout simulado'}).waitFor();const order=db.prepare('SELECT order_nsu AS nsu,amount_cents AS amount FROM assistant_credit_orders ORDER BY created_at DESC LIMIT 1').get();assert.equal(order.amount,500);providerState='PAID';await page.goto(origin+'/admin?lumaCredits=return');await page.getByRole('status').filter({hasText:'Pagamento confirmado'}).waitFor();assert.equal(db.prepare('SELECT SUM(delta_messages) AS n FROM assistant_message_credit_ledger').get().n,25);await creditService.refreshOrder(tenantId,order.nsu);assert.equal(db.prepare('SELECT SUM(delta_messages) AS n FROM assistant_message_credit_ledger').get().n,25);pass('credit checkout remains accessible in chat; verified simulated return grants once')
 await page.getByRole('button',{name:'Minhas compras de créditos'}).click();await page.getByText('25 créditos · R$ 5,00',{exact:true}).waitFor();pass('purchase history remains a secondary control, not a separate work tab')
 modelFails=true;await send('Teste de erro');await page.locator('.luma34-error,.luma35-error,[role=alert]').first().waitFor();assert.equal(db.prepare('SELECT SUM(delta_messages) AS n FROM assistant_message_credit_ledger').get().n,25);pass('model error preserves paid credits and presents recovery')
 assert.deepEqual(errors,[]);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);console.log(`${checks} integrated chat checks passed; provider calls use local doubles.`)
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:'/tmp/luma-integrated-debug.png'});console.error(await page.locator('body').innerText())}throw error}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));closeDb();rmSync(directory,{recursive:true,force:true})}
