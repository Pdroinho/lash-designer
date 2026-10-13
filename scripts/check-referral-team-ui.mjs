/* global document,window */
// Compiled React product, fixture API and simulated gateway only.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import { TEAM_PLANS } from '../dist/server/teamPlans.js'
import { discountQuote } from '../dist/server/referrals.js'
const { chromium } = await import(
  process.env.LASH_QA_PLAYWRIGHT_MODULE || 'playwright'
)
const app = express()
app.use(express.static(path.resolve('dist/client'), { index: false }))
app.get(/.*/, (_req, res) =>
  res.type('html').send(readFileSync('dist/client/index.html', 'utf8')),
)
const server = app.listen(0, '127.0.0.1')
await once(server, 'listening')
const port = server.address().port
const token = 'valid-referral-token-123456789',
  fingerprint = 'f'.repeat(64)
let browser,
  page,
  mode = 'public',
  invalid = false,
  posts = [],
  linkCreated = false,
  count = 0
const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
const pass = (label) => {
  count++
  console.log('PASS ' + label)
}
async function shot(name) {
  if (process.env.LASH_QA_SCREENSHOT_DIR)
    await page.screenshot({
      path: path.join(process.env.LASH_QA_SCREENSHOT_DIR, name + '.png'),
      fullPage: mode !== 'public',
    })
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
  const context = await browser.newContext({
    timezoneId: 'America/Bahia',
    reducedMotion: 'reduce',
  })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  await page.addInitScript(() => {
    for (const tab of ['dashboard', 'billing', 'referrals'])
      window.localStorage.setItem(`lashdesigner:tour:admin-${tab}:v3`, 'qa')
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()),
      p = url.pathname
    if (p === '/api/public/billing/plans')
      return json(route, { teamPlans: TEAM_PLANS, checkoutAvailable: true })
    if (p === '/api/public/legal')
      return json(route, {
        documents: {
          termsVersion: 'QA',
          privacyVersion: 'QA',
          bundleHash: fingerprint,
        },
      })
    if (p === '/api/public/onboarding/team-quote')
      return invalid
        ? json(route, { message: 'Link de indicação expirado' }, 400)
        : json(route, {
            quote: {
              ...discountQuote(
                TEAM_PLANS.find(
                  (plan) => plan.code === url.searchParams.get('planCode'),
                ).amountCents,
                15,
              ),
              fingerprint,
            },
          })
    if (p === '/api/public/onboarding/team-checkout') {
      const body = route.request().postDataJSON()
      posts.push(body)
      assert.equal(body.referralToken, token)
      assert.equal(body.quoteFingerprint, fingerprint)
      assert.equal(body.amountCents, undefined)
      return json(
        route,
        { message: 'Pagamento externo simulado; nenhum pagamento iniciado' },
        503,
      )
    }
    if (p === '/api/public/tenant')
      return json(route, {
        tenant: {
          id: 'studio',
          slug: 'studio',
          name: 'Studio QA',
          primaryColor: '#972d57',
          billingRecovery: mode === 'billing',
        },
      })
    if (p === '/api/auth/me')
      return json(route, {
        user: {
          id: 'admin',
          email: 'qa@example.com',
          role: 'ADMIN',
          tenantId: 'studio',
          tenantSlug: 'studio',
          subscriptionStatus: mode === 'billing' ? 'EXPIRED' : 'ACTIVE',
          billingRecovery: mode === 'billing',
        },
        isTestMode: false,
      })
    if (p === '/api/auth/legal-preferences')
      return json(route, {
        currentDocuments: {
          termsVersion: 'QA',
          privacyVersion: 'QA',
          bundleHash: fingerprint,
        },
        latestAcceptance: {
          termsVersion: 'QA',
          privacyVersion: 'QA',
          bundleHash: fingerprint,
        },
      })
    if (p === '/api/support/notifications')
      return json(route, { unreadCount: 0, notifications: [] })
    if (p === '/api/admin/dashboard')
      return json(route, {
        upcoming: [],
        recentActivity: [],
        today: { appointmentsCount: 0, expectedRevenueCents: 0 },
      })
    if (p === '/api/admin/onboarding')
      return json(route, { onboarding: { status: 'DONE' } })
    if (p === '/api/admin/subscription/team-plans')
      return json(route, {
        plans: TEAM_PLANS,
        quotes: Object.fromEntries(
          TEAM_PLANS.map((plan) => [
            plan.code,
            { ...discountQuote(plan.amountCents, 10), source: 'CREDITS' },
          ]),
        ),
        checkoutAvailable: true,
        activeProfessionals: 1,
        currentSubscription: null,
        orders: [],
      })
    if (p === '/api/admin/subscription/team-checkout') {
      const body = route.request().postDataJSON()
      assert.deepEqual(body, { planCode: 'TEAM_3' })
      posts.push(body)
      return json(route, { message: 'Checkout de renovação simulado' }, 503)
    }
    if (p === '/api/admin/referrals/overview')
      return json(route, {
        teamDiscountsAvailable: true,
        availableRenewalDiscountPercent: 10,
        debtRecoveryPercent: 10,
        link: linkCreated
          ? {
              id: 'link',
              url: `http://dev.localhost:${port}/landing?ref=${token}`,
              active: true,
            }
          : null,
        credits: [
          { discountPercent: 10, status: 'AVAILABLE' },
          { discountPercent: 10, status: 'AVAILABLE' },
        ],
        metrics: { total: 2, paid: 2, customerSavingsCents: 2248 },
        rules: {
          inviteeDiscountPercent: 15,
          referrerRewardPercent: 10,
          renewalCapPercent: 30,
        },
      })
    if (p === '/api/admin/referrals/link') {
      linkCreated = true
      return json(route, {
        url: `http://dev.localhost:${port}/landing?ref=${token}`,
      })
    }
    return json(route, { message: 'Auxiliary endpoint not used' }, 403)
  })
  for (const width of [1440, 390]) {
    mode = 'public'
    invalid = false
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`http://dev.localhost:${port}/landing?ref=${token}`)
    await page
      .locator('#preco article')
      .first()
      .getByRole('button', { name: /Escolher esse plano/ })
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    for (const plan of TEAM_PLANS) {
      await dialog.getByRole('radio').filter({ hasText: plan.label }).click()
      await dialog
        .getByRole('status')
        .filter({
          hasText: money(discountQuote(plan.amountCents, 15).amountCents),
        })
        .waitFor()
      await dialog.getByRole('button', { name: /Continuar com/ }).click()
      await dialog
        .locator('.checkout-order-total')
        .filter({
          hasText: money(discountQuote(plan.amountCents, 15).amountCents),
        })
        .waitFor()
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      if (plan.code === 'TEAM_3') await shot(`referral-first-${width}`)
      await dialog.getByRole('button', { name: 'Voltar', exact: true }).click()
      pass(`public ${width}px ${plan.code}: verified 15% first-purchase total`)
    }
    await dialog.getByRole('button', { name: /Continuar com/ }).click()
    await dialog.getByLabel('Seu nome', { exact: true }).fill('Cliente QA')
    await dialog
      .getByLabel('Nome do estúdio', { exact: true })
      .fill('Studio Cliente QA')
    await dialog
      .getByLabel('E-mail', { exact: true })
      .fill('clienteqa@example.com')
    await dialog.getByLabel('WhatsApp', { exact: true }).fill('71999999999')
    await dialog.getByLabel(/Crie uma senha/).fill('Strong!Pass123')
    await dialog.locator('.checkout-legal-choice.is-required input').check()
    await dialog
      .getByRole('button', { name: /Ir para o pagamento seguro/ })
      .click()
    await dialog
      .getByRole('alert')
      .filter({ hasText: 'Pagamento externo simulado' })
      .waitFor()
    pass(
      `public ${width}px: sends token and quote fingerprint, never client price`,
    )
    await dialog.getByRole('button', { name: 'Fechar compra' }).click()
    invalid = true
    await page
      .locator('#preco article')
      .first()
      .getByRole('button', { name: /Escolher esse plano/ })
      .click()
    await dialog
      .getByRole('status')
      .filter({ hasText: 'Link de indicação expirado' })
      .waitFor()
    assert.equal(
      await dialog.getByRole('button', { name: /Continuar com/ }).isDisabled(),
      true,
    )
    await dialog
      .getByRole('button', { name: 'Continuar sem indicação e sem desconto' })
      .click()
    await dialog.getByRole('button', { name: /Continuar com/ }).click()
    await dialog
      .locator('.checkout-order-total')
      .filter({ hasText: '74,90' })
      .waitFor()
    pass(
      `public ${width}px: invalid coupon blocks; explicit removal restores full price`,
    )
  }
  mode = 'billing'
  invalid = false
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`http://studio.localhost:${port}/admin`)
    await page
      .locator('.billing-summary__price')
      .filter({ hasText: '67,41' })
      .waitFor()
    await shot(`referral-renewal-${width}`)
    const button =
      width === 390
        ? page.locator('.billing-mobile-cta button')
        : page.locator('.billing-checkout')
    await button.click()
    await page
      .locator('.billing-shell')
      .getByRole('alert')
      .filter({ hasText: 'Checkout de renovação simulado' })
      .waitFor()
    pass(`renewal ${width}px: 10% credit total and server-owned pricing`)
  }
  mode = 'referrals'
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`http://studio.localhost:${port}/admin`)
  await page
    .locator('.ld-sidebar')
    .getByRole('button', { name: 'Indicações', exact: true })
    .click()
  await page.getByRole('button', { name: 'Criar meu link' }).waitFor()
  assert.match(await page.locator('.referral-reward').innerText(), /10%/)
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw Error('Clipboard blocked in test')
    }
  })
  await page.getByRole('button', { name: 'Criar meu link' }).click()
  await page.getByRole('textbox', { name: 'Link de indicação' }).waitFor()
  assert.equal(linkCreated, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(
    () =>
      document.querySelector('.ld-sidebar').getBoundingClientRect().right <= 1,
  )
  await shot('referral-panel-390')
  pass(
    'referral panel shows net usable discount and preserves created link when clipboard fails',
  )
  assert.deepEqual(errors, [])
  pass('no uncaught browser errors')
  console.log(
    `${count}/${count} referral browser checks passed; API fixtures and simulated provider`,
  )
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: '/tmp/lash-referral-debug.png' })
    console.error(await page.locator('body').innerText())
  }
  throw error
} finally {
  if (browser) await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
function money(cents) {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}
