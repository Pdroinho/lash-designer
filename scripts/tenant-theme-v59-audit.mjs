import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const theme = read('src/theme.ts')
const app = read('src/App.tsx')
const shell = read('src/shell-v24.css')
const dashboard = read('src/dashboard-v24.css')
const booking = read('src/booking-v30.css')
const setup = read('src/setup.css')
const workspace = read('src/components/WorkspaceSetup.tsx')

const checks = [
  ['tema do tenant deriva superfícies da cor principal', theme.includes('function applyTenantSurfaces()') && theme.includes("'--surface-canvas'") && theme.includes("'--surface-soft'") && theme.includes("'--surface-muted'")],
  ['tema do tenant propaga superfícies para o Product Design System', theme.includes("'--ld-color-canvas': 'var(--surface-canvas)'") && theme.includes("'--ld-color-soft': 'var(--surface-soft)'") && theme.includes("'--ld-color-line-soft': 'var(--line-soft)'")],
  ['legado gray-50 segue a superfície temática', theme.includes("'--gray-50': 'var(--surface-canvas)'")],
  ['clearTenantTheme remove tokens de superfície', theme.includes('...TENANT_SURFACE_KEYS')],
  ['applyTenantTheme aplica accent e superfícies', /applyTenantTheme[\s\S]{0,220}applyPrimaryColor\(tenant\.primaryColor\)[\s\S]{0,120}applyTenantSurfaces\(\)/.test(theme)],
  ['dashboard não possui mais gradiente vinho fixo', dashboard.includes('var(--primary-900)') && dashboard.includes('var(--primary-600)') && !/#321f2a|#5a193a|#7d2450|#571a38/i.test(dashboard)],
  ['transição foto/banner do dashboard é derivada do tenant', dashboard.includes('color-mix(in srgb, var(--primary-700)')],
  ['booking usa as superfícies globais do tenant', booking.includes('--b30-canvas: var(--surface-canvas') && booking.includes('--b30-panel: var(--surface-soft') && booking.includes('--b30-paper: var(--ld-color-paper')],
  ['booking remove acentos rosa hardcoded das interações', !/rgba\(139\s*,\s*23\s*,\s*71/i.test(booking) && booking.includes('color-mix(in srgb, var(--b30-wine)')],
  ['sidebar aceita logo e nome do espaço', app.includes("brand?: Pick<TenantPublic, 'name' | 'logoUrl'>") && app.includes("props.brand?.logoUrl || '/brand/logo-symbol.png'") && app.includes("props.brand?.name || 'Lash Designer'")],
  ['painel admin envia tenant ao shell', (app.match(/brand=\{tenant\}/g) || []).length >= 2],
  ['salvar identidade atualiza shell sem refetch obrigatório', app.includes('onUpdate?.(res.data.tenant)') && app.includes('onUpdate={(updatedTenant) =>') && app.includes('setTenant(updatedTenant)')],
  ['logo de tenant recebe tratamento próprio no shell', shell.includes('.logo-icon.is-tenant-logo') && shell.includes('object-fit: contain')],
  ['setup usa a paleta escolhida no próprio container', workspace.includes("'--setup-primary': palette.primary") && workspace.includes("'--setup-secondary': palette.secondary")],
  ['rail do setup deriva a composição da paleta escolhida', setup.includes('var(--setup-primary)') && setup.includes('var(--setup-secondary)') && !/#401b2d|#6e1740|#321723/i.test(setup)],
  ['inputs do setup não usam mais altura bugada de 76px', !/workspace-brand-fields[\s\S]{0,260}min-height:\s*76px/.test(setup) && setup.includes('min-height: 50px') && setup.includes('min-height: 88px')],
  ['setup muda controles ao vivo pela paleta escolhida', setup.includes('--brand-action: var(--setup-primary') && setup.includes('--brand-soft: color-mix(in srgb, var(--setup-primary')],
  ['passo de serviços não cria overflow horizontal intencional', setup.includes('overflow-y: auto; overflow-x: hidden;') && setup.includes('grid-template-columns: 28px minmax(0, 1fr) 116px 126px 28px;')],
  ['contador isolado do booking sai do desktop', booking.includes('.booking30-step-count { display: none;')],
  ['contador compacto do booking permanece apenas no mobile', /@media \(max-width: 820px\)[\s\S]*?\.booking30-step-count \{ display: flex; padding-right: 18px; \}/.test(booking)],
]

let passed = 0
for (const [label, ok] of checks) {
  if (ok) { passed += 1; console.log(`✓ ${label}`) }
  else console.error(`✗ ${label}`)
}
console.log(`\n${passed}/${checks.length} verificações de tema do tenant aprovadas.`)
if (passed !== checks.length) process.exit(1)
