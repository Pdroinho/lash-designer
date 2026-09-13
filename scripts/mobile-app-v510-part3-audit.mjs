import fs from 'node:fs'
const css = fs.readFileSync('src/mobile-app-v510-part3.css','utf8')
const main = fs.readFileSync('src/main.tsx','utf8')
const billing = fs.readFileSync('src/components/BillingCenter.tsx','utf8')
const chart = fs.readFileSync('src/components/FinanceFlowChart.tsx','utf8')
const checks = [
  ['Camada mobile Parte 3 está importada por último', main.includes("import './mobile-app-v510-part3.css'")],
  ['Financeiro mobile remove hero de desktop', css.includes('.finance36-hero') && css.includes('background: transparent') && css.includes('box-shadow: none')],
  ['Financeiro mantém KPIs 2x2 no celular', css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))') && css.includes('.finance36-kpis')],
  ['Ações financeiras possuem touch target', css.includes('.finance36-btn') && css.includes('min-height: 44px')],
  ['Filtros financeiros viram segmented control', css.includes('.finance36-filter-group') && css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))')],
  ['Modais financeiros viram bottom sheet', css.includes('.finance36-dialog') && css.includes('border-radius: 24px 24px 0 0')],
  ['Gráfico detecta largura mobile', chart.includes('const isMobile = host.clientWidth <= 520')],
  ['Gráfico remove eixo Y no celular para ganhar área', chart.includes('display: !isMobile')],
  ['Legenda do gráfico funciona para toque', chart.includes('Toque ou passe o cursor')],
  ['Luma ocupa viewport útil do app', css.includes('.luma34--page') && css.includes('var(--ld-mobile-tabbar-height)')],
  ['Luma remove moldura de desktop no celular', css.includes('border-radius: 0') && css.includes('box-shadow: none')],
  ['Sugestões da Luma são horizontalmente navegáveis', css.includes('.luma34-starters') && css.includes('scroll-snap-type: x proximity')],
  ['Composer da Luma respeita safe area', css.includes('.luma34-composer') && css.includes('env(safe-area-inset-bottom)')],
  ['Assinatura possui CTA mobile persistente', billing.includes('billing-mobile-cta') && css.includes('.billing-mobile-cta') && css.includes('position: fixed')],
  ['CTA de assinatura fica acima da tabbar', css.includes('bottom: calc(var(--ld-mobile-tabbar-height)')],
  ['Planos viram linhas compactas no celular', css.includes("grid-template-areas:") && css.includes("'top monthly'")],
  ['Checkout desktop é ocultado quando CTA mobile existe', css.includes('.billing-summary .billing-checkout { display: none; }')],
  ['Parte 3 está isolada em breakpoint mobile', css.includes('@media (max-width: 640px)')],
]
let failed = 0
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`)
  else { console.error(`✗ ${label}`); failed++ }
}
console.log(`\n${checks.length - failed}/${checks.length} verificações mobile Parte 3 aprovadas.`)
if (failed) process.exit(1)
