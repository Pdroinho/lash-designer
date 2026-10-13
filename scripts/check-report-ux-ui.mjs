/* global document,window */
// Compiled product in Chromium with controlled API fixtures; never contacts external services.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
const { chromium } = await import(process.env.LASH_QA_PLAYWRIGHT_MODULE || 'playwright')
const app=express();app.use(express.static(path.resolve('dist/client'),{index:false}));app.get(/.*/,(_req,res)=>res.type('html').send(readFileSync('dist/client/index.html','utf8')))
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://studio.localhost:${server.address().port}`
const tenant={id:'studio',slug:'studio',name:'Studio QA',primaryColor:'#972d57'}
const plans=[{code:'TEAM_3',seats:3,minProfessionals:1,label:'1 a 3 profissionais',amountCents:7490},{code:'TEAM_6',seats:6,minProfessionals:4,label:'4 a 6 profissionais',amountCents:9990},{code:'TEAM_15',seats:15,minProfessionals:7,label:'7 a 15 profissionais',amountCents:14900}]
const snapshot={ym:'2026-10',entriesCents:20000,expensesCents:10000,balanceCents:10000,serviceEntriesCents:20000,manualIncomeCents:0,confirmedAppointments:2}
const omitted = new Set()
let browser,page,role=null,waState='disconnected',waError=false,domainMode='empty',refError=false,otpRequests=0,otpVerifications=0,inboxRequests=0,count=0
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
const pass=(label)=>{count++;console.log('PASS '+label)}
async function cleanLayout(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))}
async function shot(name){if(await page.locator('.ld-sidebar').count() && await page.evaluate(()=>window.innerWidth<768))await page.waitForFunction(()=>document.querySelector('.ld-sidebar').getBoundingClientRect().right<=1);if(process.env.LASH_QA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.LASH_QA_SCREENSHOT_DIR,name+'.png'),fullPage:true})}
async function tab(label){await page.setViewportSize({width:1440,height:900});await page.locator('.ld-sidebar').getByRole('button',{name:label,exact:true}).click()}
try{
 browser=await chromium.launch({headless:true,...(process.env.LASH_QA_CHROMIUM_PATH?{executablePath:process.env.LASH_QA_CHROMIUM_PATH}:{}),args:['--host-resolver-rules=MAP *.localhost 127.0.0.1','--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu']})
 const context=await browser.newContext({timezoneId:'America/Bahia'});page=await context.newPage();page.setDefaultTimeout(10000)
 await page.addInitScript(()=>{for(const tab of ['dashboard','settings','evolution','referrals','finance','assistant','billing'])window.localStorage.setItem(`lashdesigner:tour:admin-${tab}:v3`,'qa');window.localStorage.setItem('lashdesigner:tour:client-appointments:v3','qa')})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()), p=url.pathname
  if(p==='/api/public/tenant')return json(route,{tenant})
  if(p==='/api/auth/security')return json(route,{phone:null,whatsappMfaReady:false,devices:[],sessions:[]})
  if(p==='/api/auth/me')return json(route,{user:role?{id:'user',email:'qa@example.com',role,tenantId:'studio',tenantSlug:'studio',subscriptionStatus:'ACTIVE'}:null,isTestMode:false})
  if(p==='/api/auth/legal-preferences')return json(route,{currentDocuments:{termsVersion:'qa',privacyVersion:'qa',bundleHash:'qa'},latestAcceptance:{termsVersion:'qa',privacyVersion:'qa',bundleHash:'qa'},whatsappPromotions:false})
  if(p==='/api/public/client-access/request'){otpRequests++;assert.equal(route.request().postDataJSON().phone,'5571999999999');return json(route,{sent:true})}
  if(p==='/api/public/client-access/verify'){otpVerifications++;assert.equal(route.request().postDataJSON().code,'123456');return json(route,{message:'Código de teste inválido'},400)}
  if(p==='/api/admin/dashboard')return json(route,{upcoming:[],recentActivity:[],today:{appointmentsCount:0,expectedRevenueCents:0}})
  if(p==='/api/admin/onboarding')return json(route,{onboarding:{status:'DONE'}})
  if(p==='/api/support/notifications')return json(route,{unreadCount:0,notifications:[]})
  if(p==='/api/admin/whatsapp')return json(route,{instance:{id:'wa',status:waState,baseUrl:'https://example.com',instanceName:'studio',hasApiKey:true,platformManaged:true}})
  if(p==='/api/admin/whatsapp/status')return waError?json(route,{message:'Status indisponível'},503):json(route,{state:waState})
  if(p==='/api/admin/whatsapp/diagnostics')return json(route,{providerWebhookConfigured:false,lastInboundAt:null,lastOutboundAt:null,optedInClients:0,totalClients:0})
  if(p==='/api/admin/whatsapp/settings')return json(route,{settings:{}})
  if(p==='/api/admin/whatsapp/qrcode')return json(route,{qrCode:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1cAAAAASUVORK5CYII=',state:'connecting'})
  if(p==='/api/admin/whatsapp/conversations'){inboxRequests++;return json(route,{conversations:[]})}
  if(p==='/api/admin/whatsapp/campaigns')return json(route,{campaigns:[],enabled:false,maxRecipients:50,sendIntervalSeconds:15})
  if(p==='/api/admin/domains')return domainMode==='error'?json(route,{message:'Domínios indisponíveis'},503):json(route,{domains:domainMode==='active'?[{id:'domain',domain:'agenda.example.com',status:'ACTIVE',verifiedAt:new Date().toISOString(),isPrimary:true}]:[]})
  if(p==='/api/admin/billing/overview')return json(route,{subscription:null,orders:[]})
  if(p==='/api/admin/subscription/team-plans')return json(route,{plans,activeProfessionals:1,checkoutAvailable:false,currentSubscription:null,orders:[]})
  if(p==='/api/admin/referrals/overview')return refError?json(route,{message:'Indicações indisponíveis'},503):json(route,{teamDiscountsAvailable:false,link:null,metrics:{total:2,paid:1,customerSavingsCents:749},credits:[],rules:{inviteeDiscountPercent:10,referrerRewardPercent:10,renewalCapPercent:30}})
  if(p==='/api/admin/assistant/usage')return json(route,{enabled:true,used:2,limit:40,extraCreditBalance:0})
  if(p==='/api/admin/finance')return json(route,{timeZone:'America/Bahia',todayYmd:'2026-10-13',currentMonthYm:'2026-10',currentMonth:snapshot,previousMonth:{...snapshot,ym:'2026-09',entriesCents:0},totals:{entriesCents:20000,expensesCents:10000,profitCents:10000},goals:{revenueCents:0,newClients:0,currentRevenueCents:20000,currentNewClients:1},expenseCategories:[],lastEntries:[],lastCashTransactions:[],monthly:[snapshot]})
  if(!omitted.has(p)){omitted.add(p);console.log('AUXILIARY FIXTURE '+p)}
  return json(route,{message:'Auxiliary fixture not supplied'},403)
 })
 for(const width of [1440,390]){
  role=null;await page.setViewportSize({width,height:900});await page.goto(origin+'/cliente');await page.locator('.client25-access-card').waitFor()
  await cleanLayout();assert.ok(await page.locator('.client25-field input').evaluate(el=>el.getBoundingClientRect().height)>=44)
  assert.ok(await page.locator('.client25-access-submit').evaluate(el=>el.getBoundingClientRect().height)>=44)
  await page.getByRole('button',{name:'Continuar pelo WhatsApp'}).click();await page.getByRole('alert').filter({hasText:'WhatsApp brasileiro válido'}).waitFor();assert.equal(otpRequests,width===1440?0:1)
  await page.getByLabel('WhatsApp com DDD').fill('71999999999');await page.getByLabel('WhatsApp com DDD').press('Enter');await page.getByLabel('Código de acesso').waitFor()
  assert.ok((await page.locator('.client25-access-copy').innerText()).includes('(71)'))
  await page.getByLabel('Código de acesso').fill('123456');await page.getByLabel('Código de acesso').press('Enter');await page.getByRole('alert').filter({hasText:'Código de teste inválido'}).waitFor()
  await shot(`client-access-${width}`);await page.getByRole('button',{name:'Usar outro número'}).click();await page.getByLabel('WhatsApp com DDD').waitFor();await cleanLayout();pass(`client access ${width}px: layout, Enter, OTP error and change phone`)
 }
 assert.equal(otpRequests,2);assert.equal(otpVerifications,2)
 role='ADMIN';await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/admin');await page.locator('.ld-sidebar').waitFor()
 for(const state of ['disconnected','not_connected','open']){
  waState=state;await tab('WhatsApp');await page.locator('.wa39-health').filter({hasText:state==='open'?'Conectado':'Desconectado'}).waitFor()
  if(state!=='open'){assert.equal(await page.locator('.wa39-tabs').count(),0);assert.equal(inboxRequests,0);assert.equal(await page.getByText('Precisa de atenção',{exact:true}).count(),0);await page.getByRole('button',{name:'Conectar via QR Code'}).click();await page.getByRole('img',{name:'QR Code para conectar o WhatsApp'}).waitFor()}
  else await page.getByRole('heading',{name:'Suas conversas começam aqui.'}).waitFor()
  await page.setViewportSize({width:390,height:844});await cleanLayout();await shot('whatsapp-'+state);pass(`WhatsApp ${state}: correct gate and QR state`);await tab('Assinatura')
 }
 waError=true;await tab('WhatsApp');await page.getByRole('alert').filter({hasText:'Status indisponível'}).waitFor();assert.equal(await page.locator('.wa39-tabs').count(),0);assert.equal(await page.getByRole('button',{name:'Conectar via QR Code'}).isDisabled(),true);waError=false;waState='open';await page.getByRole('button',{name:'Verificar',exact:true}).click();await page.getByRole('navigation',{name:'Seções do WhatsApp'}).waitFor();pass('WhatsApp status failure blocks access and retry recovers')
 for(const mode of ['empty','error','active']){
  domainMode=mode;await tab('Configurações');const card=page.locator('.custom-domains-card');await card.locator('.domain-security-pill').filter({hasText:mode==='active'?'Domínio verificado':mode==='error'?'Verificação indisponível':'Verificação após cadastro'}).waitFor()
  if(mode==='error'){assert.equal(await card.getByText('Nenhum domínio conectado',{exact:true}).count(),0);domainMode='empty';await card.getByRole('button',{name:'Tentar novamente'}).click();await card.getByText('Nenhum domínio conectado',{exact:true}).waitFor()}
  await page.setViewportSize({width:390,height:844});await cleanLayout();await shot('domains-'+mode);pass(`domain ${mode}: status reflects actual data`);await tab('Assinatura')
 }
 await page.locator('.billing-mobile-cta').waitFor({state:'attached'});assert.equal(await page.locator('.luma34-launcher').count(),0);await page.setViewportSize({width:390,height:844});await cleanLayout();await shot('billing-390');pass('billing CTA has no floating Luma overlap')
 refError=true;await tab('Indicações');await page.getByRole('alert').filter({hasText:'Indicações indisponíveis'}).waitFor();refError=false;await page.getByRole('button',{name:'Tentar novamente'}).click();await page.getByRole('heading',{name:'Seu link de indicação da plataforma'}).waitFor();await page.setViewportSize({width:390,height:844});await cleanLayout();await shot('referrals-390');assert.equal(await page.getByRole('button',{name:'Programa em atualização'}).isDisabled(),true);pass('referral errors recover; disabled referral program does not promise discounts')
 await tab('Luma');await page.locator('.luma34-usage strong').filter({hasText:'38'}).waitFor();await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.luma34-usage span').isVisible(),true);await cleanLayout();await shot('luma-390');pass('Luma remaining queries have a visible mobile label')
 await tab('Financeiro');await page.getByText('Mês anterior sem entradas para comparar').waitFor();await page.locator('.finance36-kpi.is-goal').getByText('Definir meta').waitFor();assert.equal(await page.locator('.finance36-mini-progress i').evaluate(el=>el.style.width),'0%');await page.setViewportSize({width:390,height:844});await cleanLayout();await shot('finance-390');pass('finance zero baseline and zero goals do not invent percentages')
 assert.deepEqual(errors,[]);pass('no uncaught browser errors');console.log(`${count}/${count} report UX browser checks passed; API fixtures, no external provider calls`)
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:'/tmp/lash-report-debug.png'});console.error(await page.locator('body').innerText())}throw error}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
