import fs from 'node:fs'

const clientsPage = fs.readFileSync('src/features/clients/AdminClients.tsx', 'utf8')
const dashboard = fs.readFileSync('src/features/dashboard/AdminDashboard.tsx', 'utf8')
const calendarPage = fs.readFileSync('src/features/calendar/AdminCalendar.tsx', 'utf8')
const bookingPage = fs.readFileSync('src/features/booking/BookingPage.tsx', 'utf8')
const main = fs.readFileSync('src/main.tsx', 'utf8')
const css = fs.readFileSync('src/mobile-experience-v511.css', 'utf8')

const bookingMobile = fs.readFileSync('src/booking-mobile-refinement.css', 'utf8')

const checks = [
  ['Camada 5.11 está importada por último', main.indexOf("import './mobile-experience-v511.css'") > main.indexOf("import './mobile-app-v510-part4.css'")],
  ['Dashboard possui composição mobile própria', dashboard.includes('ld-mobile-dashboard-stage') && dashboard.includes('ld-mobile-next-card') && dashboard.includes('ld-mobile-business-pulse')],
  ['Dashboard prioriza próximo atendimento real', dashboard.includes('const nextAppointment = upcoming[0]') && dashboard.includes('nextAppointment?.time') && dashboard.includes('nextAppointment?.service')],
  ['Agenda possui visão mobile independente do grid desktop', calendarPage.includes('ld-mobile-agenda-view') && calendarPage.includes('ld-mobile-agenda-timeline') && css.includes('.ld-agenda > .ld-calendar { display: none; }')],
  ['Agenda diária navega em datas reais', calendarPage.includes('mobileAgendaDays') && calendarPage.includes('setCurrentDate(date)') && calendarPage.includes('mobileDayEvents')],
  ['Agenda mobile abre o mesmo detalhe de evento', calendarPage.includes('className="ld-mobile-agenda-event"') && calendarPage.includes('setSelectedEvent(event)')],
  ['Clientes possuem resumo editorial com dados reais', clientsPage.includes('client-mobile-overview') && clientsPage.includes('topClient.totalSpentCents') && clientsPage.includes('visitedClients')],
  ['Cards de clientes mantêm busca e dados reais', clientsPage.includes('normalizedQuery') && clientsPage.includes('client-mobile-card') && clientsPage.includes('formatBRL(client.totalSpentCents / 100)')],
  ['Booking mantém as quatro etapas e handlers existentes', bookingPage.includes("const stepLabels = ['Serviço', 'Profissional e data', 'Horário', 'Confirmar']") && bookingPage.includes('confirmBooking') && bookingPage.includes('setStep(4)')],
  ['Booking agrupa horários por contexto no mobile', bookingPage.includes('mobileTimeGroups') && bookingPage.includes("label: 'Manhã'") && bookingPage.includes("label: 'Tarde'") && bookingPage.includes("label: 'Noite'")],
  ['Galeria de serviços continua usando serviços reais', bookingPage.includes('filteredServices.map((service, index)') && bookingPage.includes('service.coverUrl || bundledServiceCover(service.name)')],
  ['Navegação inferior vira dock flutuante', css.includes('.ld-mobile-tabbar {') && css.includes('border-radius: 24px') && css.includes('background: var(--ink-strong)')],
  ['Tela de agenda não é mera compressão do calendário desktop', css.includes('.ld-mobile-day-rail') && css.includes('.ld-mobile-agenda-event-body')],
  ['Booking mobile usa lista vertical de serviços', bookingMobile.includes('.booking30-services') && bookingMobile.includes('grid-auto-flow: row') && bookingMobile.includes('overflow: visible')],
  ['Horários mobile usam grupos de toque', css.includes('.booking30-mobile-time-groups') && css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))')],
  ['Confirmação prioriza dados da reserva sem foto gigante', bookingPage.includes('booking30-success-details') && bookingMobile.includes('.booking30-success-photo { display: none; }')],
  ['Refino mobile é importado depois das camadas anteriores', main.indexOf("import './booking-mobile-refinement.css'") > main.indexOf("import './product-refinement-v5132.css'")],
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
