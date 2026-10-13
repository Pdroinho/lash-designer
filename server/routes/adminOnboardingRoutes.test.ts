import assert from 'node:assert/strict'
import { once } from 'node:events'
import test from 'node:test'
import Database from 'better-sqlite3'
import express from 'express'
import { handleError } from '../http.js'
import { createAdminOnboardingRouter } from './adminOnboardingRoutes.js'

const tenantOne = '11111111-1111-4111-8111-111111111111'
const tenantTwo = '22222222-2222-4222-8222-222222222222'
const fixedNow = new Date('2030-04-10T12:00:00.000Z')
const visionPalettes = [
  { name: 'Visão 1', primary: '#112233', secondary: '#445566', background: '#F8F8F8', rationale: 'Primeira' },
  { name: 'Visão 2', primary: '#223344', secondary: '#556677', background: '#F7F7F7', rationale: 'Segunda' },
  { name: 'Visão 3', primary: '#334455', secondary: '#667788', background: '#F6F6F6', rationale: 'Terceira' },
]

test('onboarding ADMIN preserva fallback, IA, transação, skip e isolamento', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE tenants (
      id TEXT PRIMARY KEY, slug TEXT, name TEXT, primary_color TEXT, logo_url TEXT
    );
    CREATE TABLE tenant_settings (
      tenant_id TEXT PRIMARY KEY, secondary_color TEXT, updated_at TEXT
    );
    CREATE TABLE tenant_onboarding (
      tenant_id TEXT PRIMARY KEY, status TEXT, mode TEXT, current_step INTEGER,
      answers_json TEXT, ai_attempts INTEGER, completed_at TEXT, updated_at TEXT
    );
    CREATE TABLE business_hours (
      id TEXT PRIMARY KEY, tenant_id TEXT, weekday INTEGER,
      start_minute INTEGER, end_minute INTEGER, created_at TEXT
    );
    CREATE TABLE services (
      id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, duration_minutes INTEGER,
      price_cents INTEGER, cover_url TEXT, active INTEGER, created_at TEXT
    );
    CREATE TABLE assistant_usage (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, request_day TEXT,
      input_chars INTEGER, input_tokens INTEGER, output_tokens INTEGER,
      cost_usd REAL, vision_inputs INTEGER, status TEXT, model TEXT, created_at TEXT
    );

    INSERT INTO tenants VALUES
      ('${tenantOne}', 'studio-aurora', 'Nome antigo', '#111111', NULL),
      ('${tenantTwo}', 'studio-externo', 'Espaço externo', '#222222', 'https://example.com/externo.png');
    INSERT INTO tenant_settings VALUES
      ('${tenantOne}', '#333333', '2030-01-01T00:00:00.000Z'),
      ('${tenantTwo}', '#444444', '2030-01-01T00:00:00.000Z');
    INSERT INTO tenant_onboarding VALUES
      ('${tenantOne}', 'PENDING', NULL, 2, '{"estilo":"editorial"}', 0, NULL, '2030-01-01T00:00:00.000Z'),
      ('${tenantTwo}', 'PENDING', NULL, 1, '{"externo":true}', 0, NULL, '2030-01-01T00:00:00.000Z');
    INSERT INTO business_hours VALUES
      ('hour-old-1', '${tenantOne}', 1, 540, 1080, '2030-01-01T00:00:00.000Z'),
      ('hour-foreign', '${tenantTwo}', 2, 600, 1020, '2030-01-01T00:00:00.000Z');
    INSERT INTO services VALUES
      ('service-foreign', '${tenantTwo}', 'Serviço externo', 90, 30000, NULL, 1, '2030-01-01T00:00:00.000Z');
  `)

  let limiterCalls = 0
  let generatorCalls = 0
  let generatorFails = false
  const generatorInputs: Array<Record<string, unknown>> = []
  const generator = async (input: { businessName: string; preferences: string; logoDataUrl?: string | null }) => {
    generatorCalls += 1
    generatorInputs.push(input)
    if (generatorFails) throw new Error('falha visual simulada')
    return { palettes: visionPalettes, inputTokens: 21, outputTokens: 34, costUsd: 0.012, model: 'vision-test' }
  }

  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use((req, _res, next) => {
    const selectedTenant = req.headers['x-test-tenant']
    if (selectedTenant === 'one' || selectedTenant === 'two') {
      req.sessionUser = {
        id: selectedTenant === 'one' ? 'admin-1' : 'admin-2',
        role: 'ADMIN',
        tenantId: selectedTenant === 'one' ? tenantOne : tenantTwo,
        sessionId: `session-${selectedTenant}`,
        persistent: false,
        trustedDeviceId: null,
      }
    }
    next()
  })
  const limiter = (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    limiterCalls += 1
    next()
  }
  app.use('/api/admin', createAdminOnboardingRouter({
    db,
    onboardingAssistantLimiter: limiter,
    assistantEnabled: true,
    assistantProvider: { apiKey: 'test-key', visionModel: 'vision-model' },
    generateBrandSetupSuggestions: generator,
    now: () => fixedNow,
  }))
  app.use('/api/disabled', createAdminOnboardingRouter({
    db,
    onboardingAssistantLimiter: limiter,
    assistantEnabled: false,
    assistantProvider: { apiKey: undefined, visionModel: 'vision-disabled' },
    generateBrandSetupSuggestions: generator,
    now: () => fixedNow,
  }))
  app.use(handleError)

  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const tenantOneHeaders = { 'content-type': 'application/json', 'x-test-tenant': 'one' }
  const tenantTwoHeaders = { 'content-type': 'application/json', 'x-test-tenant': 'two' }

  const completionBody = {
    mode: 'ASSISTED',
    businessName: 'Studio Aurora Renovado',
    primaryColor: '#aabbcc',
    secondaryColor: '#ddeeff',
    logoUrl: 'https://example.com/logo.png',
    workingDays: [5, 1, 5, 3],
    startMinute: 480,
    endMinute: 1080,
    services: [
      { name: 'Volume brasileiro', durationMinutes: 90, priceCents: 15990 },
      { name: 'Manutenção', durationMinutes: 60, priceCents: 10990 },
    ],
    answers: { objetivo: 'crescer', atendimentos: 4, premium: true },
  }

  try {
    assert.equal((await fetch(`${baseUrl}/api/admin/onboarding`)).status, 401)
    const initial = await fetch(`${baseUrl}/api/admin/onboarding`, { headers: tenantOneHeaders }).then(response => response.json())
    assert.deepEqual(initial, {
      onboarding: {
        status: 'PENDING', mode: null, currentStep: 2,
        aiAttempts: 0, completedAt: null, answers: { estilo: 'editorial' },
      },
      assistantEnabled: true,
      visionModel: 'vision-model',
    })

    const disabledStatus = await fetch(`${baseUrl}/api/disabled/onboarding`, { headers: tenantOneHeaders }).then(response => response.json()) as {
      assistantEnabled: boolean; visionModel: string
    }
    assert.equal(disabledStatus.assistantEnabled, false)
    assert.equal(disabledStatus.visionModel, 'vision-disabled')

    const unauthorizedSuggestion = await fetch(`${baseUrl}/api/admin/onboarding/brand-suggestions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ businessName: 'Teste', preferences: '' }),
    })
    assert.equal(unauthorizedSuggestion.status, 401)
    assert.equal(limiterCalls, 1)

    const curated = await fetch(`${baseUrl}/api/disabled/onboarding/brand-suggestions`, {
      method: 'POST', headers: tenantOneHeaders,
      body: JSON.stringify({ businessName: 'Studio Aurora', preferences: 'quente e terracota' }),
    }).then(response => response.json()) as { source: string; palettes: Array<{ name: string }> }
    assert.equal(curated.source, 'CURATED')
    assert.deepEqual(curated.palettes.map(palette => palette.name), ['Terracota editorial', 'Cacau rosé', 'Oliva dourado'])
    assert.equal(generatorCalls, 0)

    const logoDataUrl = 'data:image/png;base64,AAAA'
    const vision = await fetch(`${baseUrl}/api/admin/onboarding/brand-suggestions`, {
      method: 'POST', headers: tenantOneHeaders,
      body: JSON.stringify({ businessName: 'Studio Aurora', preferences: 'marcante', logoDataUrl }),
    }).then(response => response.json())
    assert.deepEqual(vision, { palettes: visionPalettes, source: 'VISION' })
    assert.deepEqual(generatorInputs[0], { businessName: 'Studio Aurora', preferences: 'marcante', logoDataUrl })
    assert.deepEqual(db.prepare(`
      SELECT tenant_id as tenantId, user_id as userId, request_day as requestDay,
             input_chars as inputChars, input_tokens as inputTokens, output_tokens as outputTokens,
             cost_usd as costUsd, vision_inputs as visionInputs, status, model, created_at as createdAt
      FROM assistant_usage
    `).get(), {
      tenantId: tenantOne, userId: 'admin-1', requestDay: '2030-04-10',
      inputChars: 8, inputTokens: 21, outputTokens: 34, costUsd: 0.012,
      visionInputs: 1, status: 'COMPLETED', model: 'vision-test', createdAt: fixedNow.toISOString(),
    })

    generatorFails = true
    const fallback = await fetch(`${baseUrl}/api/admin/onboarding/brand-suggestions`, {
      method: 'POST', headers: tenantOneHeaders,
      body: JSON.stringify({ businessName: 'Studio Aurora', preferences: 'forte' }),
    }).then(response => response.json()) as { source: string; fallback: boolean; palettes: Array<{ name: string }> }
    assert.equal(fallback.source, 'CURATED')
    assert.equal(fallback.fallback, true)
    assert.deepEqual(fallback.palettes.map(palette => palette.name), ['Vinho assinatura', 'Ameixa moderna', 'Azul petróleo'])
    assert.equal(generatorCalls, 2)

    db.prepare(`UPDATE tenant_onboarding SET ai_attempts = 3 WHERE tenant_id = ?`).run(tenantOne)
    const limited = await fetch(`${baseUrl}/api/admin/onboarding/brand-suggestions`, {
      method: 'POST', headers: tenantOneHeaders,
      body: JSON.stringify({ businessName: 'Studio Aurora', preferences: '' }),
    }).then(response => response.json()) as { source: string; limitReached: boolean }
    assert.equal(limited.source, 'CURATED')
    assert.equal(limited.limitReached, true)
    assert.equal(generatorCalls, 2)

    const invalidTime = await fetch(`${baseUrl}/api/admin/onboarding/complete`, {
      method: 'POST', headers: tenantOneHeaders,
      body: JSON.stringify({ ...completionBody, startMinute: 900, endMinute: 800 }),
    })
    assert.equal(invalidTime.status, 400)
    const invalidLogo = await fetch(`${baseUrl}/api/admin/onboarding/complete`, {
      method: 'POST', headers: tenantOneHeaders,
      body: JSON.stringify({ ...completionBody, logoUrl: 'http://inseguro.example/logo.png' }),
    })
    assert.equal(invalidLogo.status, 400)

    const completed = await fetch(`${baseUrl}/api/admin/onboarding/complete`, {
      method: 'POST', headers: tenantOneHeaders, body: JSON.stringify(completionBody),
    }).then(response => response.json())
    assert.deepEqual(completed, {
      onboarding: { status: 'COMPLETED' },
      tenant: {
        id: tenantOne, slug: 'studio-aurora', name: 'Studio Aurora Renovado',
        primaryColor: '#AABBCC', logoUrl: 'https://example.com/logo.png',
      },
    })
    assert.deepEqual(db.prepare(`SELECT secondary_color as secondaryColor, updated_at as updatedAt FROM tenant_settings WHERE tenant_id = ?`).get(tenantOne), {
      secondaryColor: '#DDEEFF', updatedAt: fixedNow.toISOString(),
    })
    assert.deepEqual(db.prepare(`SELECT weekday, start_minute as startMinute, end_minute as endMinute FROM business_hours WHERE tenant_id = ? ORDER BY weekday`).all(tenantOne), [
      { weekday: 1, startMinute: 480, endMinute: 1080 },
      { weekday: 3, startMinute: 480, endMinute: 1080 },
      { weekday: 5, startMinute: 480, endMinute: 1080 },
    ])
    assert.deepEqual(db.prepare(`SELECT name, duration_minutes as durationMinutes, price_cents as priceCents, active FROM services WHERE tenant_id = ? ORDER BY name`).all(tenantOne), [
      { name: 'Manutenção', durationMinutes: 60, priceCents: 10990, active: 1 },
      { name: 'Volume brasileiro', durationMinutes: 90, priceCents: 15990, active: 1 },
    ])
    const onboarding = db.prepare(`SELECT status, mode, current_step as currentStep, answers_json as answersJson, completed_at as completedAt FROM tenant_onboarding WHERE tenant_id = ?`).get(tenantOne) as Record<string, unknown>
    assert.deepEqual({ ...onboarding, answersJson: JSON.parse(String(onboarding.answersJson)) }, {
      status: 'COMPLETED', mode: 'ASSISTED', currentStep: 4,
      answersJson: completionBody.answers, completedAt: fixedNow.toISOString(),
    })

    const foreignSnapshot = {
      tenant: db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(tenantTwo),
      settings: db.prepare(`SELECT * FROM tenant_settings WHERE tenant_id = ?`).get(tenantTwo),
      hours: db.prepare(`SELECT * FROM business_hours WHERE tenant_id = ?`).all(tenantTwo),
      services: db.prepare(`SELECT * FROM services WHERE tenant_id = ?`).all(tenantTwo),
    }
    assert.equal((await fetch(`${baseUrl}/api/admin/onboarding/skip`, { method: 'POST', headers: tenantTwoHeaders })).status, 200)
    const foreignOnboarding = db.prepare(`SELECT status, current_step as currentStep, completed_at as completedAt FROM tenant_onboarding WHERE tenant_id = ?`).get(tenantTwo)
    assert.deepEqual(foreignOnboarding, { status: 'SKIPPED', currentStep: 4, completedAt: fixedNow.toISOString() })
    assert.deepEqual(db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(tenantTwo), foreignSnapshot.tenant)
    assert.deepEqual(db.prepare(`SELECT * FROM tenant_settings WHERE tenant_id = ?`).get(tenantTwo), foreignSnapshot.settings)
    assert.deepEqual(db.prepare(`SELECT * FROM business_hours WHERE tenant_id = ?`).all(tenantTwo), foreignSnapshot.hours)
    assert.deepEqual(db.prepare(`SELECT * FROM services WHERE tenant_id = ?`).all(tenantTwo), foreignSnapshot.services)

    const serviceCount = (db.prepare(`SELECT COUNT(*) as count FROM services WHERE tenant_id = ?`).get(tenantOne) as { count: number }).count
    await fetch(`${baseUrl}/api/admin/onboarding/complete`, {
      method: 'POST', headers: tenantOneHeaders,
      body: JSON.stringify({ ...completionBody, services: [{ name: 'Não duplicar', durationMinutes: 30, priceCents: 5000 }] }),
    })
    assert.equal((db.prepare(`SELECT COUNT(*) as count FROM services WHERE tenant_id = ?`).get(tenantOne) as { count: number }).count, serviceCount)
    assert.equal(limiterCalls, 5)
  } finally {
    server.close()
    await once(server, 'close')
    db.close()
  }
})
