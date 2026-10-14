/* global document, window */
// Browser regression of the production build, with isolated API fixtures.
// Install Playwright separately for this optional check; real-provider QA is separate.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import express from 'express'

const { chromium } = await import(process.env.LASH_QA_PLAYWRIGHT_MODULE || 'playwright')
const app = express()
app.use(express.static(path.resolve('dist/client'), { index: false }))
app.get(/^(?!\/api).*$/, (_req, res) => res.type('html').send(readFileSync('dist/client/index.html', 'utf8')))
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
const browser = await chromium.launch({ headless: true,
  ...(process.env.LASH_QA_CHROMIUM_PATH ? { executablePath: process.env.LASH_QA_CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--disable-gpu'],
})
const origin = `http://127.0.0.1:${address.port}`
let activePage
const tenant = { id: 'tenant-ui', name: 'Studio QA', slug: 'studio', primaryColor: '#972d57', logoUrl: null }
const futureDay = offset => { const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); const value = kind => Number(parts.find(part => part.type === kind).value); return new Date(Date.UTC(value('year'),value('month')-1,value('day')+offset)).toISOString().slice(0,10) }
const oldDay = futureDay(1), latestDay = futureDay(2)
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
try {
  const context = await browser.newContext({ timezoneId: 'America/Bahia' })
  const page = await context.newPage()
  activePage = page
  page.setDefaultTimeout(10000)
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    let zoneUnavailable=true
    let oldRequest
    let markOldStarted
    const oldStarted = new Promise(resolve => { markOldStarted = resolve })
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/public/tenant') return json(route, { tenant })
      if(url.pathname==='/api/public/booking')return zoneUnavailable?json(route,{message:'Timezone unavailable'},503):json(route,{timezone:'America/Bahia'})
      if (url.pathname === '/api/auth/me') return json(route, { user: { id: 'staff-ui', role: 'STAFF', tenantId: tenant.id, tenantSlug: tenant.slug } })
      if (url.pathname === '/api/staff/appointments') {
        if (url.searchParams.get('start')?.startsWith(oldDay)) {
          oldRequest = route
          markOldStarted()
          return
        }
        return json(route, { professional: { name: 'Ana' }, appointments: [{ id: 'latest', startsAt: '2026-10-13T12:00:00Z', endsAt: '2026-10-13T13:00:00Z', status: 'CONFIRMED', serviceName: 'Último dia', clientName: 'Cliente QA' }] })
      }
      return json(route, { message: 'Unexpected fixture endpoint' }, 404)
    })
    await page.goto(origin + '/equipe')
    await page.getByRole('alert').filter({hasText:'Não foi possível consultar o fuso'}).waitFor()
    assert.equal(await page.locator('.staff-area-list').count(),0)
    zoneUnavailable=false;await page.getByRole('button',{name:'Tentar novamente',exact:true}).click()
    await page.getByRole('heading', { name: 'Olá, Ana.' }).waitFor()
    await page.getByRole('button', { name: 'Hoje', exact: true }).click()
    await page.locator('.staff-area-list').waitFor()
    const selectDay=async ymd=>{
      await page.getByRole('button',{name:'Escolha o dia',exact:true}).click()
      const target=new Date(ymd+'T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})
      for(let i=0;i<2&&(await page.locator('.ld-date-picker header strong').innerText())!==target;i++)await page.getByRole('button',{name:'Próximo mês Escolha o dia',exact:true}).click()
      await page.getByRole('button',{name:ymd.split('-').reverse().join('/'),exact:true}).click()
    }
    await selectDay(oldDay)
    await Promise.race([oldStarted, new Promise((_, reject) => setTimeout(() => reject(new Error('Delayed request did not start')), 5000))])
    await selectDay(latestDay)
    await page.locator('.staff-area-list').getByText('Último dia', { exact: true }).waitFor()
    await json(oldRequest, { professional: { name: 'Ana' }, appointments: [{ id: 'old', startsAt: '2026-10-12T12:00:00Z', endsAt: '2026-10-12T13:00:00Z', status: 'CONFIRMED', serviceName: 'Dia antigo', clientName: 'Cliente QA' }] }).catch(() => {})
    await page.waitForTimeout(100)
    assert.equal(await page.getByText('Dia antigo', { exact: true }).count(), 0)
    assert.deepEqual(errors, [])
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    console.log(`PASS STAFF timezone recovery, shared date selection, stale response and no horizontal overflow ${viewport.width}x${viewport.height}`)
    await page.unroute('**/api/**')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const documents = { termsVersion: 'qa', privacyVersion: 'qa', bundleHash: 'a'.repeat(64) }
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/public/tenant') return json(route, { tenant: { ...tenant, billingRecovery: true } })
    if (url.pathname === '/api/auth/me') return json(route, { user: { id: 'admin-ui', email: 'admin@example.com', role: 'ADMIN', tenantId: tenant.id, tenantSlug: tenant.slug, billingRecovery: true, subscriptionStatus: 'PAYMENT_REQUIRED' }, isTestMode: true })
    if (url.pathname === '/api/auth/legal-preferences') return json(route, { currentDocuments: documents, latestAcceptance: documents })
    if (url.pathname === '/api/admin/billing/overview') return json(route, { message: 'Legacy overview unavailable' }, 503)
    if (url.pathname === '/api/admin/subscription/team-plans') return json(route, { plans: [
      { code: 'TEAM_3', seats: 3, minProfessionals:1, label: '1 a 3 profissionais', amountCents: 7490 },
      { code: 'TEAM_6', seats: 6, minProfessionals:4, label: '4 a 6 profissionais', amountCents: 9990 },
      { code: 'TEAM_15', seats: 15, minProfessionals:7, label: '7 a 15 profissionais', amountCents: 14900 },
    ], checkoutAvailable: true, activeProfessionals: 1, currentSubscription: null })
    return json(route, { message: 'Payment required' }, 403)
  })
  await page.goto(origin + '/admin')
  await page.getByRole('heading', { name: 'O tamanho certo para o seu estúdio' }).waitFor()
  assert.equal(await page.locator('.ld-sidebar').getByText('Agenda', { exact: true }).count(), 0)
  await page.getByRole('radio').filter({ hasText: '4 a 6 profissionais' }).click()
  assert.equal(await page.getByRole('radio').filter({ hasText: '4 a 6 profissionais' }).getAttribute('aria-checked'), 'true')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  console.log('PASS ADMIN recovery remains locked with test_mode and shows team billing when legacy overview fails')
  await context.close()
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: process.env.LASH_QA_DEBUG_SCREENSHOT || '/tmp/lash-recovery-ui-debug.png' })
    console.error(await activePage.locator('body').innerText())
  }
  throw error
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
