/* global document,window */
// Built landing + real public catalog router, no external payment is attempted.
// Build with VITE_DEV_HOST=dev.localhost; /landing uses the same marketing component.
import assert from 'node:assert/strict'
import {once} from 'node:events'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import express from 'express'
import {createPublicBillingCatalogRouter} from '../dist/server/routes/platformRoutes.js'
const {chromium}=await import(process.env.LASH_QA_PLAYWRIGHT_MODULE||'playwright')
const app=express(),off=createPublicBillingCatalogRouter([],false),on=createPublicBillingCatalogRouter([],true)
let mode='off',purchases=0
app.use('/api/public',(req,res,next)=>{
  if(req.path==='/billing/plans'){
    if(mode==='error')return res.status(503).json({message:'Unavailable'})
    if(mode==='legacy')return res.json({plans:[{cycle:'ANNUAL',amountCents:59880}],checkoutProvider:'INFINITEPAY'})
    if(mode==='slow')return setTimeout(()=>off(req,res,next),650)
    return (mode==='on'?on:off)(req,res,next)
  }
  next()
})
app.get('/api/public/legal',(_req,res)=>res.json({documents:{termsVersion:'QA',privacyVersion:'QA',bundleHash:'QA'}}))
app.post('/api/public/onboarding/team-checkout',(_req,res)=>{purchases++;res.status(503).json({message:'External gateway is not part of this test'})})
app.use(express.static(path.resolve('dist/client'),{index:false}));app.get(/^(?!\/api).*$/,(_req,res)=>res.type('html').send(readFileSync('dist/client/index.html','utf8')))
const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://dev.localhost:${server.address().port}`
let browser,page,count=0
function pass(label){count++;console.log('PASS '+label)}
try{
 browser=await chromium.launch({headless:true,...(process.env.LASH_QA_CHROMIUM_PATH?{executablePath:process.env.LASH_QA_CHROMIUM_PATH}:{}),args:['--host-resolver-rules=MAP *.localhost 127.0.0.1','--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote','--disable-gpu']})
 const context=await browser.newContext({reducedMotion:'reduce',timezoneId:'America/Bahia'});page=await context.newPage();page.setDefaultTimeout(10000)
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport)
  for(const state of ['off','error','legacy','slow','on']){
   mode=state;await page.goto(origin+'/landing',{waitUntil:'domcontentloaded'})
   await page.locator('#preco .ld53-plan-grid article').first().waitFor()
   assert.equal(await page.locator('#preco .ld53-plan-grid article').count(),3)
   const prices=await page.locator('#preco .ld53-plan-grid article>strong').allTextContents()
   assert.deepEqual(prices.map(v=>v.replace(/\s/g,'')),['R$74,90/mês','R$99,90/mês','R$149,00/mês'])
   assert.ok(await page.locator('.sales-skip').evaluate(el=>el.getBoundingClientRect().bottom<0))
   assert.ok(await page.locator('.skip-link').evaluate(el=>el.getBoundingClientRect().bottom<0))
   const text=await page.locator('body').innerText();assert.ok(!/39,90|59,90|49,90|598,80|Trimestral|Semestral|InfinitePay/.test(text))
   await page.locator('#equipe').scrollIntoViewIfNeeded()
   assert.equal(await page.locator('#equipe article').count(),3)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
   await page.locator('#preco article').nth(1).getByRole('button',{name:/Escolher esse plano/}).click()
   const dialog=page.getByRole('dialog');await dialog.waitFor()
   await dialog.getByRole('radio').filter({hasText:'4 a 6 profissionais'}).waitFor()
   assert.equal(await dialog.getByRole('radio').filter({hasText:'4 a 6 profissionais'}).getAttribute('aria-checked'),'true')
   if(state==='on'){
    await dialog.getByRole('button',{name:/Continuar com/}).click()
    await dialog.getByRole('heading',{name:/Só o essencial/}).waitFor()
    assert.match(await dialog.locator('.checkout-order-total').innerText(),/99,90/)
   } else {
    await dialog.getByRole('button',{name:'Contratação indisponível'}).waitFor()
    assert.equal(await dialog.getByRole('button',{name:'Contratação indisponível'}).isDisabled(),true)
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
   await dialog.getByRole('button',{name:'Fechar compra'}).click()
   pass(`${viewport.width}px catalog ${state}: current prices, product copy, correct plan and safe checkout`)
  }
 }
 assert.equal(purchases,0);assert.deepEqual(errors,[]);pass('no payment initiated or uncaught browser errors')
 console.log(`${count}/${count} landing checks passed`)
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:'/tmp/lash-landing-team-debug.png',fullPage:false});console.error(await page.locator('body').innerText())}throw error}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
