import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const src = path.join(root, 'src')
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(full) : [full]
})
const uiFiles = walk(src).filter((file) => /\.(tsx|jsx)$/.test(file))
const uiText = uiFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')

const cssFiles = walk(src).filter((file) => /\.css$/.test(file))
const cssText = cssFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
const productSelect = fs.readFileSync(path.join(src, 'components', 'ProductSelect.tsx'), 'utf8')
const productCss = fs.readFileSync(path.join(src, 'product-controls-v40.css'), 'utf8')
const main = fs.readFileSync(path.join(src, 'main.tsx'), 'utf8')
const app = fs.readFileSync(path.join(src, 'App.tsx'), 'utf8')
const whatsapp = fs.readFileSync(path.join(src, 'components', 'WhatsAppCenter.tsx'), 'utf8')
const setup = fs.readFileSync(path.join(src, 'components', 'WorkspaceSetup.tsx'), 'utf8')
const financeCss = fs.readFileSync(path.join(src, 'finance-v36.css'), 'utf8')
const waCss = fs.readFileSync(path.join(src, 'whatsapp-v39.css'), 'utf8')
const setupCss = fs.readFileSync(path.join(src, 'setup.css'), 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))

const listboxFiles = uiFiles.filter((file) => fs.readFileSync(file, 'utf8').includes('role="listbox"'))
const checks = [
  ['nenhum select nativo é renderizado pelo produto', !/<select\b/i.test(uiText)],
  ['não há clones legados custom-select/time-select no JSX', !/custom-select|time-select-custom|time-select-trigger|time-select-dropdown|time-option/i.test(uiText)],
  ['há uma única implementação de listbox de seleção', listboxFiles.length === 1 && listboxFiles[0].endsWith(path.join('components', 'ProductSelect.tsx'))],
  ['ProductSelect é portaled para escapar de clipping', productSelect.includes('createPortal') && productSelect.includes('position')],
  ['ProductSelect cobre teclado e Escape', productSelect.includes("event.key === 'ArrowDown'") && productSelect.includes("event.key === 'ArrowUp'") && productSelect.includes("event.key === 'Escape'") && productSelect.includes("event.key === 'Home'") && productSelect.includes("event.key === 'End'")],
  ['ProductSelect restaura foco sem mover a página', productSelect.includes("focus({ preventScroll: true })")],
  ['ProductSelect fecha fora e reposiciona em resize/scroll', productSelect.includes("document.addEventListener('pointerdown'") && productSelect.includes("window.addEventListener('resize'") && productSelect.includes("window.addEventListener('scroll'")],
  ['estilo canônico de dropdown é globalmente importado', main.includes("import './product-controls-v40.css'")],
  ['novo CSS de controles nasce sem !important/100vw', !productCss.includes('!important') && !/100d?vw/.test(productCss)],
  ['Financeiro usa ProductSelect', app.includes("import { ProductSelect } from './components/ProductSelect'") && app.includes('Filtrar extrato por tipo')],
  ['WhatsApp usa ProductSelect', whatsapp.includes("import { ProductSelect } from './ProductSelect'") && whatsapp.match(/<ProductSelect/g)?.length >= 4],
  ['Setup usa ProductSelect', setup.includes("import { ProductSelect } from './ProductSelect'") && setup.includes('ariaLabel={`Duração de ${service.name')],
  ['CSS de WhatsApp não estiliza select nativo localmente', !/\.wa39-[^{,]*select\b/.test(waCss)],
  ['CSS de Setup não estiliza select nativo localmente', !/\.workspace-[^{,]*select\b/.test(setupCss)],
  ['Financeiro não mantém o gráfico SVG artesanal legado', !/finance36-chart-v2|finance36-balance-line|finance36-sparse-note|finance36-zero-line/.test(financeCss)],
  ['Chart.js está travado em versão e lockfile coerentes', lock.version === pkg.version && lock.packages?.['']?.version === pkg.version && pkg.dependencies?.['chart.js'] === '4.5.1' && lock.packages?.['node_modules/chart.js']?.version === '4.5.1'],
  ['componentes novos não introduzem 100vw ou !important', !/100d?vw|!important/.test(productSelect + productCss + fs.readFileSync(path.join(src, 'components', 'FinanceFlowChart.tsx'), 'utf8'))],
  ['Agenda não envolve ProductSelect em shell de input legado', uiText.includes('schedule-time-select-field') && !/time-input-wrapper[^>]*>[\s\S]{0,220}<TimeSelect/.test(uiText)],
  ['CSS não mantém implementações visuais legadas de dropdown', !/\.custom-select\b|\.time-select-trigger\b|\.time-select-dropdown\b|\.time-option\b/.test(cssText)],
]

let passed = 0
for (const [label, ok] of checks) {
  if (ok) { passed += 1; console.log(`✓ ${label}`) }
  else console.error(`✗ ${label}`)
}
console.log(`\n${passed}/${checks.length} verificações de consistência aprovadas.`)
if (passed !== checks.length) process.exit(1)
