import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const app = read('src/App.tsx')
const setup = read('src/components/WorkspaceSetup.tsx')
const setupCss = read('src/setup.css')
const server = read('server/index.ts')
const migrate = read('server/migrate.ts')
const assistant = read('server/assistant.ts')
const landing = read('src/LandingPage.tsx')
const checkout = read('src/components/LandingCheckout.tsx')
const env = read('server/env.ts')

const checks = [
  ['migração 22 cria estado isolado por tenant', migrate.includes('apply(22') && migrate.includes('CREATE TABLE IF NOT EXISTS tenant_onboarding') && migrate.includes('tenant_id TEXT PRIMARY KEY')],
  ['tenants existentes não recebem onboarding forçado', migrate.includes("SELECT id, 'COMPLETED', 'MANUAL'")],
  ['novas compras iniciam onboarding pendente', server.includes("INSERT INTO tenant_onboarding") && server.includes("'PENDING', 0")],
  ['setup oferece caminhos assistido e manual', setup.includes("type SetupMode = 'ASSISTED' | 'MANUAL'")],
  ['análise visual é opcional e possui fallback curado', server.includes("source: 'CURATED'") && server.includes("source: 'VISION'")],
  ['análise visual limita tentativas por tenant', server.includes('ai_attempts < 3') && server.includes('onboardingAssistantLimiter')],
  ['logo é validada e limitada no servidor', server.includes("max(450_000)") && server.includes('data:image')],
  ['conclusão salva marca, agenda e serviços em transação', server.includes("app.post('/api/admin/onboarding/complete'") && server.includes('db.transaction(() =>') && server.includes('DELETE FROM business_hours')],
  ['catálogo inicial não duplica serviços existentes', server.includes('activeServices === 0')],
  ['interface móvel do setup possui contrato dedicado', setupCss.includes('@media (max-width: 820px)') && setupCss.includes('min-height: 100dvh')],
  ['setup é montado somente no painel administrativo', app.includes('<WorkspaceSetup tenant={tenant}')],
  ['checkout separa pagamento da personalização', checkout.includes("step === 1") && checkout.includes('Sua marca vem depois do pagamento')],
  ['landing comunica o setup pós-compra sem prometer dependência de IA', landing.includes('setup guiado ajuda a organizar marca, horários e serviços') && landing.includes('assistente opcional')],
  ['OpenRouter usa modelos síncronos separados para conversa e visão', assistant.includes('assistantProvider') && env.includes('OPENROUTER_MODEL') && env.includes('OPENROUTER_VISION_MODEL')],
  ['modelo batch fica reservado fora do fluxo síncrono', env.includes("OPENROUTER_BATCH_MODEL") && assistant.includes('batchModel: env.OPENROUTER_BATCH_MODEL') && !assistant.includes('model: assistantProvider.batchModel')],
  ['avanço inicial não depende da análise de IA', setup.includes('function advance()') && setup.includes('data-setup-next onClick={advance}') && !setup.match(/function advance\(\)[\s\S]{0,500}analyz/)],
]

let failed = 0
for (const [label, ok] of checks) { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${label}`) }
console.log(`\n${checks.length - failed}/${checks.length} verificações de onboarding aprovadas.`)
process.exitCode = failed ? 1 : 0
