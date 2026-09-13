import fs from 'node:fs'
const css = fs.readFileSync('src/mobile-app-v510-part4.css','utf8')
const main = fs.readFileSync('src/main.tsx','utf8')
const app = fs.readFileSync('src/App.tsx','utf8')
const referral = fs.readFileSync('src/components/ReferralCenter.tsx','utf8')
const setup = fs.readFileSync('src/components/WorkspaceSetup.tsx','utf8')
const checks = [
  ['Camada mobile Parte 4 está importada', main.includes("import './mobile-app-v510-part4.css'")],
  ['Parte 4 está isolada em breakpoint mobile', css.includes('@media (max-width: 640px)')],
  ['Configurações viram coluna única no mobile', css.includes('.settings-grid') && css.includes('grid-template-columns: 1fr')],
  ['Domínios mantêm touch targets', css.includes('.domain-actions .btn') && css.includes('min-height: 40px')],
  ['Salvar identidade ocupa largura do celular', css.includes('.form-actions .btnPrimary { width: 100%')],
  ['Histórico de faturas deixa de depender de tabela horizontal', css.includes('.table-scroll .data-table tr') && css.includes('display: block')],
  ['Segurança é compactada sem remover seções', app.includes('security-settings-section') && css.includes('.security-settings-section { padding: 14px')],
  ['Indicações preservam métricas reais', referral.includes('data.metrics.paid') && referral.includes('customerSavingsCents')],
  ['Métricas de indicação viram trilho horizontal', css.includes('.referral-metrics') && css.includes('scroll-snap-type: x proximity')],
  ['Link de indicação ganha CTA de largura total', css.includes('.referral-link-field') && css.includes('grid-template-columns: 1fr')],
  ['Setup continua com quatro etapas reais', setup.includes("['Caminho', 'Sua marca', 'Sua agenda', 'Seus serviços']")],
  ['Progresso do setup vira barra compacta', css.includes('.workspace-setup-progress li') && css.includes('height: 5px')],
  ['Ações do onboarding ficam persistentes', css.includes('.workspace-setup-actions') && css.includes('position: sticky')],
  ['Paletas do onboarding viram carrossel de toque', css.includes('.workspace-palette-grid') && css.includes('scroll-snap-align: start')],
  ['Booking público mantém quatro etapas reais', app.includes('aria-label="Etapas do agendamento"') && app.includes('/ 4')],
  ['Booking ganha topbar persistente', css.includes('.booking30-topbar') && css.includes('position: sticky')],
  ['Etapas do booking viram barra de progresso compacta', css.includes('.booking30-steps button') && css.includes('height: 4px')],
  ['CTA final do booking fica acessível ao polegar', css.includes('.booking30-confirm-button') && css.includes('bottom: max(10px, env(safe-area-inset-bottom))')],
  ['Safe area permanece respeitada', css.includes('env(safe-area-inset-bottom)')],
  ['Desktop não recebe regra estrutural fora dos breakpoints', css.trim().startsWith('/* Lash Designer 5.10.3') && css.indexOf('@media (max-width: 640px)') < css.indexOf('.ld-shell.has-mobile-tabbar .settings-page')],
]
let failed = 0
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`)
  else { console.error(`✗ ${label}`); failed++ }
}
console.log(`\n${checks.length - failed}/${checks.length} verificações mobile Parte 4 aprovadas.`)
if (failed) process.exit(1)
