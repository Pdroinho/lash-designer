import fs from 'node:fs'

const app = [
  fs.readFileSync('src/App.tsx', 'utf8'),
  fs.readFileSync('src/features/calendar/AdminCalendar.tsx', 'utf8'),
  fs.readFileSync('src/features/clients/AdminClients.tsx', 'utf8'),
].join('\n')
const main = fs.readFileSync('src/main.tsx', 'utf8')
const css = fs.readFileSync('src/mobile-experience-v511.css', 'utf8')

const checks = [
  ['Camada 5.11 está importada por último', main.indexOf("import './mobile-experience-v511.css'") > main.indexOf("import './mobile-app-v510-part4.css'")],
  ['Dashboard possui composição mobile própria', app.includes('ld-mobile-dashboard-stage') && app.includes('ld-mobile-next-card') && app.includes('ld-mobile-business-pulse')],
  ['Dashboard prioriza próximo atendimento real', app.includes('const nextAppointment = upcoming[0]') && app.includes('nextAppointment?.time') && app.includes('nextAppointment?.service')],
  ['Agenda possui visão mobile independente do grid desktop', app.includes('ld-mobile-agenda-view') && app.includes('ld-mobile-agenda-timeline') && css.includes('.ld-agenda > .ld-calendar { display: none; }')],
  ['Agenda diária navega em datas reais', app.includes('mobileAgendaDays') && app.includes('setCurrentDate(date)') && app.includes('mobileDayEvents')],
  ['Agenda mobile abre o mesmo detalhe de evento', app.includes('className="ld-mobile-agenda-event"') && app.includes('setSelectedEvent(event)')],
  ['Clientes possuem resumo editorial com dados reais', app.includes('client-mobile-overview') && app.includes('topClient.totalSpentCents') && app.includes('visitedClients')],
  ['Cards de clientes mantêm busca e dados reais', app.includes('normalizedQuery') && app.includes('client-mobile-card') && app.includes('formatBRL(client.totalSpentCents / 100)')],
  ['Booking mantém as quatro etapas e handlers existentes', app.includes("const stepLabels = ['Serviço', 'Data', 'Horário', 'Confirmar']") && app.includes('confirmBooking') && app.includes('setStep(4)')],
  ['Booking agrupa horários por contexto no mobile', app.includes('mobileTimeGroups') && app.includes("label: 'Manhã'") && app.includes("label: 'Tarde'") && app.includes("label: 'Noite'")],
  ['Galeria de serviços continua usando serviços reais', app.includes('services.map((service, index)') && app.includes('service.coverUrl || bundledServiceCover(service.name)')],
  ['Navegação inferior vira dock flutuante', css.includes('.ld-mobile-tabbar {') && css.includes('border-radius: 24px') && css.includes('background: var(--ink-strong)')],
  ['Tela de agenda não é mera compressão do calendário desktop', css.includes('.ld-mobile-day-rail') && css.includes('.ld-mobile-agenda-event-body')],
  ['Booking usa galeria horizontal com scroll snap', css.includes('.booking30-services') && css.includes('grid-auto-flow: column') && css.includes('scroll-snap-type: x mandatory')],
  ['Horários mobile usam grupos de toque', css.includes('.booking30-mobile-time-groups') && css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')],
  ['Sucesso do booking vira composição em sheet', css.includes('.booking30-success-copy') && css.includes('border-radius: 30px 30px 0 0')],
  ['Camada nova não contém !important', !css.includes('!important')],
  ['Camada nova não contém 100vw/100dvw', !/100d?vw/.test(css)],
  ['Camada nova não cria paleta hex local', !/#[0-9a-fA-F]{3,8}\b/.test(css)],
  ['Alterações estruturais ficam no breakpoint mobile', css.includes('@media (max-width: 640px)') && css.indexOf('@media (max-width: 640px)') < css.indexOf('.ld-mobile-tabbar {')],
]

let failed = 0
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`)
  else { console.error(`✗ ${label}`); failed++ }
}
console.log(`\n${checks.length - failed}/${checks.length} verificações Mobile Experience 5.11 aprovadas.`)
if (failed) process.exit(1)
