/* global document,window */
// Browser-only billing regression; API fixtures do not initiate external payments.
import assert from 'node:assert/strict'
import {once} from 'node:events'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import express from 'express'
const {chromium}=await import(process.env.LASH_QA_PLAYWRIGHT_MODULE||'playwright')
const app=express();app.use(express.static(path.resolve('dist/client'),{index:false}));app.get(/.*/,(_req,res)=>res.type('html').send(readFileSync('dist/client/index.html','utf8')))
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://studio.localhost:${server.address().port}`
const plans=[{code:'TEAM_3',seats:3,minProfessionals:1,label:'1 a 3 profissionais',amountCents:7490},{code:'TEAM_6',seats:6,minProfessionals:4,label:'4 a 6 profissionais',amountCents:9990},{code:'TEAM_15',seats:15,minProfessionals:7,label:'7 a 15 profissionais',amountCents:14900}]
let browser,page,mode='off',post=null,legacyPosts=0,count=0
const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
try{
 browser=await chromium.launch({headless:true,...(process.env.LASH_QA_CHROMIUM_PATH?{executablePath:process.env.LASH_QA_CHROMIUM_PATH}:{}),args:['--host-resolver-rules=MAP *.localhost 127.0.0.1','--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu']})
 const context=await browser.newContext({timezoneId:'America/Bahia'});page=await context.newPage();page.setDefaultTimeout(10000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url())
  if(url.pathname==='/api/public/tenant')return json(route,{tenant:{id:'studio',slug:'studio',name:'Studio QA',primaryColor:'#972d57',billingRecovery:true}})
  if(url.pathname==='/api/auth/me')return json(route,{user:{id:'admin',email:'qa@example.com',role:'ADMIN',tenantId:'studio',tenantSlug:'studio',subscriptionStatus:'EXPIRED',billingRecovery:true},isTestMode:true})
  if(url.pathname==='/api/auth/legal-preferences')return json(route,{currentDocuments:{termsVersion:'QA',privacyVersion:'QA',bundleHash:'QA'},latestAcceptance:{termsVersion:'QA',privacyVersion:'QA',bundleHash:'QA'}})
  if(url.pathname==='/api/admin/subscription/team-plans')return mode==='error'?json(route,{message:'Catalog unavailable'},503):mode==='legacy'?json(route,{plans:[{cycle:'ANNUAL',amountCents:59880}],checkoutAvailable:true}):json(route,{plans,checkoutAvailable:['on','active'].includes(mode),activeProfessionals:4,currentSubscription:mode==='active'?{planCode:'TEAM_6',currentPeriodEnd:null}:null,orders:[]})
  if(url.pathname==='/api/admin/subscription/team-checkout'){post=route.request().postDataJSON();return json(route,{message:'No real payment in this test'},503)}
  if(url.pathname==='/api/admin/subscription/checkout-url')legacyPosts++
  if(url.pathname==='/api/support/notifications')return json(route,{unreadCount:0,notifications:[]})
  return json(route,{message:'Fixture omitted'},403)
 })
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport)
  for(const state of ['off','error','legacy','on','active']){
   mode=state;post=null;await page.goto(origin+'/admin');await page.getByRole('heading',{name:'O tamanho certo para o seu estúdio'}).waitFor()
   await page.waitForFunction(()=>Boolean(document.querySelector('.billing-checkout'))&&document.querySelector('.billing-checkout').textContent!=='Verificando disponibilidade…')
   assert.equal(await page.getByRole('radio').count(),3)
   const text=await page.locator('.billing-shell').innerText();assert.ok(!/39,90|59,90|598,80|InfinitePay|Trimestral|Semestral/.test(text))
   if(state==='on'){
    await page.getByRole('radio').filter({hasText:'7 a 15 profissionais'}).click()
    const button=viewport.width===390?page.locator('.billing-mobile-cta button'):page.locator('.billing-checkout')
    await button.click();await page.locator('.billing-shell').getByRole('alert').filter({hasText:'No real payment'}).waitFor();assert.deepEqual(post,{planCode:'TEAM_15'})
   } else {
    const button=viewport.width===390?page.locator('.billing-mobile-cta button'):page.locator('.billing-checkout')
    assert.equal(await button.isDisabled(),true);assert.equal(post,null)
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
   if(process.env.LASH_QA_SCREENSHOT_DIR&&state==='off')await page.screenshot({path:path.join(process.env.LASH_QA_SCREENSHOT_DIR,`billing-${viewport.width}.png`),fullPage:true})
   count++;console.log(`PASS billing ${viewport.width}px ${state}: current plans and guarded checkout`)
  }
 }
 assert.equal(legacyPosts,0);assert.deepEqual(errors,[]);count++;console.log(`PASS no legacy payments or browser errors\n${count}/${count} billing checks passed`)
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:'/tmp/lash-billing-debug.png'});console.error(await page.locator('body').innerText())}throw error}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
