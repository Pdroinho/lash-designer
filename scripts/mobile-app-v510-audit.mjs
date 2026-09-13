import fs from 'node:fs'

const app = fs.readFileSync('src/App.tsx', 'utf8')
const main = fs.readFileSync('src/main.tsx', 'utf8')
const css = fs.readFileSync('src/mobile-app-v510.css', 'utf8')

const checks = [
  ['CSS mobile 5.10 importado', main.includes("import './mobile-app-v510.css'")],
  ['Shell aceita navegação mobile', app.includes('mobileNav?: Array<{ key: string; label: string; icon: ReactNode; active: boolean; onClick: () => void }>')],
  ['Shell marca presença da tabbar', app.includes("props.mobileNav?.length ? 'has-mobile-tabbar' : ''")],
  ['Topbar mobile usa marca do tenant', app.includes('ld-mobile-topbar-brand') && app.includes("props.brand?.logoUrl || '/brand/logo-symbol.png'")],
  ['Bottom bar possui navegação acessível', app.includes('ld-mobile-tabbar') && app.includes('Navegação principal mobile')],
  ['Bottom bar tem Mais para drawer completo', app.includes('Abrir mais áreas') && app.includes('<MoreHorizontal size={21} />')],
  ['Admin expõe Início na barra mobile', app.includes("key: 'dashboard', label: 'Início'")],
  ['Admin expõe Agenda na barra mobile', app.includes("key: 'calendar', label: 'Agenda'")],
  ['Admin expõe Clientes na barra mobile', app.includes("key: 'clients', label: 'Clientes'")],
  ['Admin expõe WhatsApp na barra mobile', app.includes("key: 'evolution', label: 'WhatsApp'")],
  ['Áreas secundárias ativam Mais', app.includes("!['dashboard', 'calendar', 'clients', 'evolution'].includes(tab)")],
  ['Dashboard tem escopo mobile próprio', app.includes('className="ld-dashboard-page"')],
  ['Dashboard mobile usa métricas 2x2', css.includes('.ld-dashboard-page .stats-grid') && css.includes('repeat(2, minmax(0, 1fr))')],
  ['Dashboard mobile mantém hero editorial compacto', css.includes('.ld-dashboard-page .ld-dashboard-hero') && css.includes('min-height: 154px')],
  ['Agenda mobile usa tabs full-width', css.includes('.ld-agenda-tabs') && css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))')],
  ['Agenda mobile converte legenda em scroller horizontal', css.includes('.ld-calendar .appointment-presence-legend') && css.includes('flex-wrap: nowrap')],
  ['Agenda mobile semana suporta um dia fluido', css.includes('.ld-calendar .calendar-day-column') && css.includes('min-width: 0 !important')],
  ['Agenda mobile mês não depende de grid desktop de 700px', css.includes(".ld-calendar-scroll[data-view='month'] .calendar-month-grid") && css.includes('min-width: 0')],
  ['Agenda mobile mês usa 7 colunas compactas', css.includes('grid-template-columns: repeat(7, minmax(0, 1fr)) !important')],
  ['Safe area inferior respeitada', css.includes('env(safe-area-inset-bottom)')],
  ['Luma launcher sobe acima da tabbar', css.includes('.ld-shell.has-mobile-tabbar .luma34-launcher')],
  ['Desktop protegido por media query', css.includes('@media (max-width: 900px)') && css.includes('@media (max-width: 640px)')],
]

let failed = 0
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`)
  else { console.error(`✗ ${label}`); failed++ }
}
console.log(`\n${checks.length - failed}/${checks.length} verificações mobile 5.10 aprovadas.`)
if (failed) process.exit(1)
