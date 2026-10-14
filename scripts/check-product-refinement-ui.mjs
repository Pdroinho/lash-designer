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
let bookingMode='data',staffZone='America/Bahia'
let serviceMode='data',clientMode='data',mutationMode='error',setupMode=false
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia'}).format(new Date())
const serviceRows=[{id:'11111111-1111-4111-8111-111111111111',name:'Extensão de cílios clássico',durationMinutes:60,priceCents:12000},{id:'22222222-2222-4222-8222-222222222222',name:'Volume brasileiro',durationMinutes:90,priceCents:18000}]
const professionalRows=[{id:'33333333-3333-4333-8333-333333333333',name:'Mariana Souza',active:true,bookable:true,userId:null,accessRole:null,accessDisabledAt:null,serviceIds:serviceRows.map(s=>s.id),hours:[],pendingInvitation:null}]
professionalRows.push({...professionalRows[0],id:'44444444-4444-4444-8444-444444444444',name:'Juliana Santos'})
const clientRows=[{id:'c1',name:'Amanda Oliveira',email:'amanda@example.com',phone:'5571999999999',marketingWhatsappOptIn:1,totalSpentCents:36000,lastVisitAt:new Date().toISOString()},{id:'c2',name:'Bianca Santos',email:'bianca@example.com',phone:null,marketingWhatsappOptIn:0,totalSpentCents:18000,lastVisitAt:null},{id:'c3',name:'Camila Ferreira de Albuquerque',email:'camila.longname@example.com',phone:'5571988888888',marketingWhatsappOptIn:1,totalSpentCents:24000,lastVisitAt:new Date().toISOString()}]
const appointments=[{id:'a1',serviceId:serviceRows[0].id,serviceName:serviceRows[0].name,professionalId:professionalRows[0].id,professionalName:professionalRows[0].name,startsAt:today+'T15:00:00.000Z',endsAt:today+'T16:00:00.000Z',status:'CONFIRMED',confirmationStatus:'AWAITING_CONFIRMATION',clientName:'Amanda Oliveira',clientEmail:'amanda@example.com',clientPhone:'5571999999999',priceCents:12000}]
let browser,page,role=null,waState='disconnected',waError=false,domainMode='empty',refError=false,count=0
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
const pass=(label)=>{count++;console.log('PASS '+label)}
async function cleanLayout(){const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);if(!fits)console.log('OVERFLOW',await page.evaluate(()=>[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>window.innerWidth+1).slice(0,15).map(el=>({class:el.className,right:el.getBoundingClientRect().right,text:el.textContent?.slice(0,60)}))));assert.ok(fits)}
async function shot(name){if(await page.locator('.ld-sidebar').count() && await page.evaluate(()=>window.innerWidth<768))await page.waitForFunction(()=>document.querySelector('.ld-sidebar').getBoundingClientRect().right<=1);if(process.env.LASH_QA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.LASH_QA_SCREENSHOT_DIR,name+'.png'),fullPage:true})}

try{
 browser=await chromium.launch({headless:true,...(process.env.LASH_QA_CHROMIUM_PATH?{executablePath:process.env.LASH_QA_CHROMIUM_PATH}:{}),args:['--host-resolver-rules=MAP *.localhost 127.0.0.1','--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu']})
 const context=await browser.newContext({timezoneId:'America/Bahia'});page=await context.newPage();page.setDefaultTimeout(10000)
 await page.addInitScript(()=>{for(const tab of ['dashboard','settings','evolution','referrals','finance','assistant','billing','calendar','services','clients','team'])window.localStorage.setItem(`lashdesigner:tour:admin-${tab}:v3`,'qa');window.localStorage.setItem('lashdesigner:tour:client-appointments:v3','qa')})
 const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('BROWSER ERROR',error.stack)})
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()), p=url.pathname.replace('/api/public/tenant/studio/','/api/public/').replace(/^\/api\/public\/tenant\/studio$/,'/api/public/tenant')
  if(p==='/api/public/tenant')return json(route,{tenant})
  if(p==='/api/auth/security')return json(route,{phone:null,whatsappMfaReady:false,devices:[],sessions:[]})
  if(p==='/api/auth/me')return json(route,{user:role?{id:'user',email:'qa@example.com',role,tenantId:'studio',tenantSlug:'studio',subscriptionStatus:'ACTIVE'}:null,isTestMode:false})
  if(p==='/api/auth/legal-preferences')return json(route,{currentDocuments:{termsVersion:'qa',privacyVersion:'qa',bundleHash:'qa'},latestAcceptance:{termsVersion:'qa',privacyVersion:'qa',bundleHash:'qa'},whatsappPromotions:false})
  if(p==='/api/public/client-access/request'){assert.equal(route.request().postDataJSON().phone,'5571999999999');return json(route,{sent:true})}
  if(p==='/api/public/client-access/verify'){assert.equal(route.request().postDataJSON().code,'123456');return json(route,{message:'Código de teste inválido'},400)}
  if(p==='/api/public/services')return bookingMode==='error'?json(route,{message:'Catálogo indisponível para teste'},503):json(route,{services:serviceRows})
  if(p==='/api/public/professionals')return json(route,{professionals:professionalRows})
  if(p==='/api/public/staff-availability')return json(route,{professionals:professionalRows.map(p=>({...p,businessHours:Array.from({length:7},(_,weekday)=>({weekday,startMinute:540,endMinute:1080})),blocks:[]}))})
  if(p==='/api/staff/appointments'){assert.ok(url.searchParams.get('start').endsWith('T04:00:00.000Z'));return json(route,{professional:professionalRows[0],appointments})}
  if(p==='/api/admin/onboarding/complete'){setupMode=false;return json(route,{tenant})}
  if(p==='/api/admin/services' && route.request().method()==='GET')return serviceMode==='error'?json(route,{message:'Serviços indisponíveis para teste'},503):json(route,{services:serviceMode==='empty'?[]:serviceRows})
  if(p.startsWith('/api/admin/services') && route.request().method()!=='GET')return mutationMode==='error'?json(route,{message:'Não foi possível salvar o serviço de teste.'},503):json(route,{ok:true,service:serviceRows[0]})
  if(p==='/api/admin/clients')return clientMode==='error'?json(route,{message:'Clientes indisponíveis para teste'},503):json(route,{clients:clientMode==='empty'?[]:clientRows})
  if(p==='/api/admin/professionals')return json(route,{professionals:professionalRows,seatLimit:3,businessHours:[],timezone:'America/Bahia'})
  if(p==='/api/admin/appointments')return json(route,{appointments})
  if(p==='/api/admin/business-hours')return json(route,{businessHours:[{id:'h1',weekday:1,startMinute:540,endMinute:1080}]})
  if(p==='/api/admin/time-off')return json(route,{timeOff:[]})
  if(p==='/api/public/booking')return json(route,{timezone:staffZone,currency:'BRL',bookingRules:{minNoticeMinutes:0,maxFutureDays:30,slotStepMinutes:30},businessHours:Array.from({length:7},(_,weekday)=>({weekday,startMinute:540,endMinute:1080}))})
  if(p==='/api/admin/assistant/preferences')return json(route,{preferences:{tone:'FRIENDLY',focus:'GENERAL',instructions:''},timezone:'America/Bahia',localDate:today})
  if(p==='/api/admin/assistant/credits/history')return json(route,{orders:[],balance:0})
  if(p==='/api/admin/dashboard')return json(route,{timeZone:'America/Bahia',upcoming:appointments,recentActivity:[],today:{appointmentsCount:2,expectedRevenueCents:30000},newClients30d:3,pendingAppointments:1,confirmationSummary:{confirmed:1,awaiting:1,noResponse:0,deliveryFailed:0,declined:0,notRequested:0},confirmationAttention:[]})
  if(p==='/api/admin/onboarding')return json(route,{onboarding:{status:setupMode?'PENDING':'DONE'}})
  if(p==='/api/support/notifications')return json(route,{unreadCount:0,notifications:[]})
  if(p==='/api/admin/whatsapp')return json(route,{instance:{id:'wa',status:waState,baseUrl:'https://example.com',instanceName:'studio',hasApiKey:true,platformManaged:true}})
  if(p==='/api/admin/whatsapp/status')return waError?json(route,{message:'Status indisponível'},503):json(route,{state:waState})
  if(p==='/api/admin/whatsapp/diagnostics')return json(route,{providerWebhookConfigured:false,lastInboundAt:null,lastOutboundAt:null,optedInClients:0,totalClients:0})
  if(p==='/api/admin/whatsapp/settings')return json(route,{settings:{}})
  if(p==='/api/admin/whatsapp/qrcode')return json(route,{qrCode:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1cAAAAASUVORK5CYII=',state:'connecting'})
  if(p==='/api/admin/whatsapp/conversations'){return json(route,{conversations:[]})}
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
 role='ADMIN'
 if(process.env.LASH_QA_FORMS_ONLY || process.argv.includes('--forms')){
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/admin?view=finance');await page.getByRole('button',{name:'Nova movimentação',exact:true}).click();let modal=page.getByRole('dialog');await modal.waitFor();await modal.getByRole('button',{name:'Data da movimentação',exact:true}).click();await page.locator('.ld-date-picker').waitFor();await page.getByRole('button',{name:'Fechar calendário',exact:true}).click();assert.ok(await modal.isVisible());await cleanLayout();await shot(`review-finance-form-${width}`);await modal.getByRole('button',{name:'Cancelar',exact:true}).click();pass(`finance shared calendar and form fit ${width}px`)
  await page.goto(origin+'/admin?view=calendar');await page.getByRole('button',{name:/Novo Agendamento/i}).click();modal=page.getByRole('dialog');await modal.waitFor();await modal.getByRole('button',{name:'Data do agendamento',exact:true}).click();await page.getByRole('button',{name:'Fechar calendário',exact:true}).click();await modal.getByRole('button',{name:'Horário do agendamento',exact:true}).click();await page.getByRole('option',{name:'10:00',exact:true}).click();await cleanLayout();const box=await modal.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);await shot(`review-appointment-form-${width}`);await modal.getByRole('button',{name:'Cancelar',exact:true}).click();pass(`appointment uses shared date/time and dialog fits ${width}px`)
  await page.getByRole('tab',{name:'Bloqueios',exact:true}).click();await page.getByRole('button',{name:'Data de início',exact:true}).waitFor();assert.equal(await page.locator('input[type="datetime-local"]').count(),0);await cleanLayout();await shot(`review-calendar-blocks-${width}`);pass(`calendar block controls fit ${width}px`)
 }
 snapshot.entriesCents=98765432;snapshot.balanceCents=98755432;snapshot.manualIncomeCents=98745432;await page.setViewportSize({width:320,height:900});await page.goto(origin+'/admin?view=finance');await page.locator('.finance36-kpi.is-income strong').waitFor();await cleanLayout();await shot('review-finance-large-values-320');pass('large monetary values remain readable without horizontal overflow')
 }else{
 if(!process.env.LASH_QA_SKIP_SCREEN_MATRIX)for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/admin');await page.getByRole('heading',{name:/bom dia|boa tarde|boa noite/i}).first().waitFor();await cleanLayout();await shot(`review-dashboard-${width}`);pass(`dashboard ${width}px populated layout`)
  for(const [view,selector] of [['services','.service-admin-page'],['clients','.client-admin-page'],['calendar','.ld-agenda'],['finance','.finance36'],['settings','.settings-page'],['assistant','.luma34'],['billing','.billing-shell']]){
   await page.goto(origin+'/admin?view='+view);await page.locator(selector).first().waitFor();await cleanLayout();await shot(`review-${view}-${width}`);pass(`${view} ${width}px rendered layout`)
  }
 }
 role='ADMIN';await page.setViewportSize({width:390,height:844})
 serviceMode='error';await page.goto(origin+'/admin?view=services');await page.getByRole('alert').filter({hasText:'Não foi possível carregar os serviços'}).waitFor();assert.equal(await page.getByText('Nenhum serviço cadastrado',{exact:true}).count(),0);serviceMode='data';await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.locator('.service-mobile-card').getByText(serviceRows[0].name,{exact:true}).waitFor();pass('service fetch error is explicit and retry restores data')
 await page.getByRole('button',{name:'Novo serviço',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();await dialog.locator('input[autofocus],input[placeholder="Ex: Cílios Volume Russo"]').first().fill('Serviço revisado');await dialog.getByRole('button',{name:/Adicionar serviço|Salvar/}).click();await dialog.getByRole('alert').filter({hasText:'Não foi possível salvar'}).waitFor();assert.equal(await dialog.isVisible(),true);assert.equal(await dialog.locator('input[placeholder="Ex: Cílios Volume Russo"]').inputValue(),'Serviço revisado');await shot('review-service-error-390');pass('service save failure preserves the modal and user input')
 await dialog.getByRole('button',{name:/Fechar|Cancelar/}).first().click();clientMode='error';await page.goto(origin+'/admin?view=clients');await page.getByRole('alert').filter({hasText:'Não foi possível carregar as clientes'}).waitFor();assert.equal(await page.getByText('Nenhuma cliente ainda',{exact:true}).count(),0);clientMode='data';await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.getByText('Amanda Oliveira',{exact:true}).first().waitFor();await page.getByRole('textbox',{name:'Buscar clientes'}).fill('Bianca');assert.equal(await page.locator('.client-mobile-card').count(),1);await shot('review-clients-filter-390');pass('client failure is not mistaken for empty data and search recovers')
 clientMode='empty';await page.goto(origin+'/admin?view=clients');await page.locator('.client-mobile-list').getByText('Nenhuma cliente ainda',{exact:true}).waitFor();await shot('review-clients-empty-390');pass('client empty state is truthful and readable')
 setupMode=true;await page.goto(origin+'/admin');await page.getByRole('heading',{name:'Como quer começar?',exact:true}).waitFor();await shot('review-setup-390');await page.getByRole('button',{name:/Quero escolher sozinha/}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();await shot('review-setup-brand-390');pass('setup choices and next step render on mobile')
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('heading',{name:'Quando você costuma atender?',exact:true}).waitFor();assert.equal(await page.locator('.workspace-time-grid input[type=time]').count(),0);await page.getByRole('button',{name:'Horário de início',exact:true}).click();await page.getByRole('option',{name:'08:00',exact:true}).click();await shot('review-setup-hours-390');await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('heading',{name:'Quais serviços já podem entrar na agenda?',exact:true}).waitFor();await shot('review-setup-services-390');pass('setup uses shared time controls and all four steps fit mobile')
 setupMode=false;role=null;for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await page.goto(origin+'/login');await page.getByRole('button',{name:/Entrar/}).first().waitFor();await cleanLayout();await shot(`review-login-${width}`);await page.goto(origin+'/agendar');await page.locator('.booking30-service').first().waitFor();await cleanLayout();await shot(`review-booking-${width}`);await page.locator('.booking30-service').first().click();await page.locator('.dateScrollerWrapper').waitFor();await cleanLayout();await shot(`review-booking-dates-${width}`);await page.locator('.dateCard:not(.disabled)').nth(1).click();await page.locator(width>768?'.booking30-time-grid-desktop button':'.booking30-mobile-time-groups button').first().click();await cleanLayout();await shot(`review-booking-contact-${width}`);pass(`login and public booking service/date/time/contact steps fit ${width}px`)}
 role='ADMIN';for(const color of ['#972d57','#e8bbd0','#c8f8d1','#f4cd42','#2b5797','#ffffff']){tenant.primaryColor=color;await page.goto(origin+'/admin?view=services');const button=page.getByRole('button',{name:'Novo serviço',exact:true});await button.waitFor();const contrast=await button.evaluate(el=>{const pixel=c=>{const x=document.createElement('canvas').getContext('2d');x.fillStyle=c;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data].slice(0,3)};const l=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const c=window.getComputedStyle(el),a=l(pixel(c.color)),b=l(pixel(c.backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});assert.ok(contrast>=4.5,`primary button contrast for ${color}: ${contrast}`);pass(`theme ${color} primary action contrast passes 4.5:1`)}tenant.primaryColor='#972d57';role=null;
 bookingMode='error';await page.goto(origin+'/agendar');await page.getByText('Catálogo indisponível para teste',{exact:true}).waitFor();pass('booking catalog failure does not masquerade as an empty catalog')
 bookingMode='data';staffZone='America/Manaus';role='STAFF';for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await page.goto(origin+'/equipe');await page.getByRole('heading',{name:'Olá, Mariana Souza.',exact:true}).waitFor();await cleanLayout();await shot(`review-staff-${width}`);assert.equal(await page.locator('.staff-area-list time').first().innerText(),'11:00');pass(`staff ${width}px uses studio timezone and shared calendar`)}

 }
 assert.deepEqual(errors,[]);pass('no uncaught browser errors');console.log(`${count}/${count} product refinement checks passed; API fixtures, no external provider calls`)
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:'/tmp/lash-report-debug.png'});console.error(await page.locator('body').innerText())}throw error}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
