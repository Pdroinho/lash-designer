import { readFileSync } from 'node:fs'

const files = [
  ['src/App.tsx', 20],
  ['src/app/AppRoutes.tsx', 240],
  ['server/index.ts', 210],
]

let failed = 0
for (const [file, ceiling] of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).length
  const ok = lines <= ceiling
  console.log(`${ok ? '✓' : '✗'} ${file}: ${lines}/${ceiling} linhas`)
  if (!ok) failed += 1
}

const appSource = readFileSync('src/App.tsx', 'utf8')
const appRoutesSource = readFileSync('src/app/AppRoutes.tsx', 'utf8')
const shellSource = readFileSync('src/layouts/Shell.tsx', 'utf8')
const dashboardSource = readFileSync('src/features/dashboard/AdminDashboard.tsx', 'utf8')
const calendarSource = readFileSync('src/features/calendar/AdminCalendar.tsx', 'utf8')
const appointmentModalsSource = readFileSync('src/features/calendar/AppointmentModals.tsx', 'utf8')
const financeSource = readFileSync('src/features/finance/AdminFinance.tsx', 'utf8')
const settingsSource = readFileSync('src/features/settings/AdminSettings.tsx', 'utf8')
const bookingSource = readFileSync('src/features/booking/BookingPage.tsx', 'utf8')
const clientPortalSource = readFileSync('src/features/client/ClientPortal.tsx', 'utf8')
const authenticationSource = readFileSync('src/features/auth/Authentication.tsx', 'utf8')
const devConsoleSource = readFileSync('src/features/dev/DevConsole.tsx', 'utf8')
const adminAppSource = readFileSync('src/features/admin/AdminApp.tsx', 'utf8')
const tourStepsSource = readFileSync('src/lib/tourSteps.ts', 'utf8')
const serverSource = readFileSync('server/index.ts', 'utf8')
const publicRoutesSource = readFileSync('server/routes/publicRoutes.ts', 'utf8')
const authRoutesSource = readFileSync('server/routes/authRoutes.ts', 'utf8')
const domainVerificationRuntimeSource = readFileSync('server/domainVerificationRuntime.ts', 'utf8')
const whatsappWorkerRuntimeSource = readFileSync('server/whatsappWorkerRuntime.ts', 'utf8')
const appointmentAutomationRuntimeSource = readFileSync('server/appointmentAutomationRuntime.ts', 'utf8')
const customerAppointmentServiceSource = readFileSync('server/customerAppointmentService.ts', 'utf8')
const clientAccessServiceSource = readFileSync('server/clientAccessService.ts', 'utf8')
const clientMarketingConsentServiceSource = readFileSync('server/clientMarketingConsentService.ts', 'utf8')
const professionalConsentServiceSource = readFileSync('server/professionalConsentService.ts', 'utf8')
const securityStateMaintenanceSource = readFileSync('server/securityStateMaintenance.ts', 'utf8')
const serverLifecycleRuntimeSource = readFileSync('server/serverLifecycleRuntime.ts', 'utf8')
const commercialConfigSource = readFileSync('server/commercialConfig.ts', 'utf8')
const platformNetworkConfigSource = readFileSync('server/platformNetworkConfig.ts', 'utf8')
const requestLimitersSource = readFileSync('server/requestLimiters.ts', 'utf8')
const processFoundationSource = readFileSync('server/processFoundation.ts', 'utf8')
const productionClientDeliverySource = readFileSync('server/productionClientDelivery.ts', 'utf8')
const domainSetupPayloadSource = readFileSync('server/domainSetupPayload.ts', 'utf8')
const applicationServerRuntimeSource = readFileSync('server/applicationServerRuntime.ts', 'utf8')
const whatsappEvolutionRuntimeSource = readFileSync('server/whatsappEvolutionRuntime.ts', 'utf8')
const platformEvolutionRuntimeSource = readFileSync('server/platformEvolutionRuntime.ts', 'utf8')
const routeFiles = [
  'server/routes/devCoreRoutes.ts',
  'server/routes/devOperationsRoutes.ts',
  'server/routes/devReferralRoutes.ts',
  'server/routes/devEvolutionRoutes.ts',
  'server/routes/adminBillingRoutes.ts',
  'server/routes/publicOnboardingRoutes.ts',
  'server/routes/infinitePayWebhookRoutes.ts',
  'server/routes/adminLumaBillingRoutes.ts',
  'server/routes/adminLumaAssistantRoutes.ts',
  'server/routes/evolutionWebhookRoutes.ts',
  'server/routes/adminServicesRoutes.ts',
  'server/routes/adminAppointmentsRoutes.ts',
  'server/routes/adminAvailabilityRoutes.ts',
  'server/routes/adminDashboardRoutes.ts',
  'server/routes/adminTenantSettingsRoutes.ts',
  'server/routes/adminClientsRoutes.ts',
  'server/routes/adminFinanceRoutes.ts',
  'server/routes/adminWhatsappSettingsRoutes.ts',
  'server/routes/adminWhatsappConnectionRoutes.ts',
  'server/routes/adminWhatsappCampaignRoutes.ts',
  'server/routes/adminWhatsappConversationRoutes.ts',
  'server/routes/referralRoutes.ts',
  'server/routes/adminOnboardingRoutes.ts',
  'server/routes/publicBookingRoutes.ts',
  'server/routes/clientPortalRoutes.ts',
  'server/routes/platformRoutes.ts'
]
const platformRegistrationSource = readFileSync('server/routes/registerPlatformRoutes.ts', 'utf8')
const billingRegistrationSource = readFileSync('server/routes/registerBillingAssistantRoutes.ts', 'utf8')
const tenantRegistrationSource = readFileSync('server/routes/registerTenantRoutes.ts', 'utf8')
const ordered = (source, markers) => {
  let cursor = 0
  for (const marker of markers) {
    const position = source.indexOf(marker, cursor)
    if (position < 0) return false
    cursor = position + marker.length
  }
  return true
}
const mounted = (source, entries) => ordered(source, entries.map(([prefix, factory]) => `app.use('${prefix}', ${factory}`))

const checks = [
  ['roteamento da aplicação foi extraído', appSource.includes("from './app/AppRoutes'") && appRoutesSource.includes('export function AppRoutes')],
  ['runtime do frontend foi extraído', appRoutesSource.includes("from '../lib/runtime'")],
  ['tipos de domínio do frontend foram extraídos', adminAppSource.includes("from '../shared/types'")],
  ['menu portaled foi extraído', dashboardSource.includes("from '../../components/PortalMenu'")],
  ['primitivas compartilhadas foram extraídas', adminAppSource.includes("from '../../components/SharedUi'")],
  ['central de notificações foi extraída', shellSource.includes("from '../components/NotificationsModal'")],
  ['shell da aplicação foi extraído', adminAppSource.includes("from '../../layouts/Shell'")],
  ['página administrativa de serviços foi extraída', adminAppSource.includes("import('../services/AdminServices')")],
  ['página administrativa de clientes foi extraída', adminAppSource.includes("import('../clients/AdminClients')")],
  ['dashboard administrativo foi extraído', adminAppSource.includes("import('../dashboard/AdminDashboard')")],
  ['página administrativa da agenda foi extraída', adminAppSource.includes("import('../calendar/AdminCalendar')") && calendarSource.includes('export function AdminCalendar')],
  ['modais administrativos da agenda foram extraídos', calendarSource.includes("from './AppointmentModals'") && appointmentModalsSource.includes('export function NewAppointmentModal') && appointmentModalsSource.includes('export function AppointmentDetailsModal')],
  ['página e modais administrativos do financeiro foram extraídos', adminAppSource.includes("import('../finance/AdminFinance')") && financeSource.includes('export function AdminFinance') && financeSource.includes('function NewTransactionModal') && financeSource.includes('function ExtractModal') && financeSource.includes('function GoalsModal')],
  ['configurações e segurança da conta foram extraídas', adminAppSource.includes("import('../settings/AdminSettings')") && settingsSource.includes('export function AdminSettings') && settingsSource.includes('export function SecuritySettingsCard') && settingsSource.includes('export type LegalPreferencesState')],
  ['fluxo público de agendamento foi extraído', appRoutesSource.includes("import('../features/booking/BookingPage')") && bookingSource.includes('export function BookingPage') && bookingSource.includes('function DateScroller')],
  ['portal da cliente foi extraído', appRoutesSource.includes("import('../features/client/ClientPortal')") && clientPortalSource.includes('export function ClientPortal')],
  ['autenticação profissional foi extraída', appRoutesSource.includes("import('../features/auth/Authentication')") && authenticationSource.includes('export function UnifiedLogin') && authenticationSource.includes('export function RootEntry')],
  ['console DEV foi extraído', appRoutesSource.includes("import('../features/dev/DevConsole')") && devConsoleSource.includes('export function Dev') && devConsoleSource.includes('function NewTenantModal') && devConsoleSource.includes('function TenantEditModal')],
  ['composição do painel ADMIN foi extraída', appRoutesSource.includes("import('../features/admin/AdminApp')") && adminAppSource.includes('export function Admin') && adminAppSource.includes('function LegalAcceptanceGate')],
  ['áreas de rota usam code splitting com fallback', (appRoutesSource.match(/lazy\(\(\) => import\(/g) ?? []).length >= 9 && appRoutesSource.includes('<Suspense fallback={<RouteLoading />}>')],
  ['áreas internas do ADMIN usam code splitting com fallback', (adminAppSource.match(/lazy\(\(\) => import\(/g) ?? []).length >= 10 && adminAppSource.includes('<Suspense fallback={<AdminAreaLoading />}>')],
  ['passos compartilhados do Product Tour foram extraídos', adminAppSource.includes("from '../../lib/tourSteps'") && clientPortalSource.includes("from '../../lib/tourSteps'") && tourStepsSource.includes('export const shellTourSteps')],
  ['todos os routers extraídos ainda contêm endpoints', routeFiles.every(file => /router\.(?:get|post|put|patch|delete)\(/.test(readFileSync(file, 'utf8')))],
  ['registro por área foi isolado da raiz', ordered(serverSource, [
    "from './routes/registerPlatformRoutes.js'", "from './routes/registerBillingAssistantRoutes.js'",
    "from './routes/registerTenantRoutes.js'", 'registerPlatformRoutes(app, {',
    'registerBillingAssistantRoutes(app, {', 'registerTenantRoutes(app, {',
    "app.all('/api/*path'", 'configureProductionClientDelivery(app, {', 'app.use(handleError)',
  ])],
  ['fundação HTTP, tenant e limites globais precedem as rotas', ordered(serverSource, [
    'configureAppFoundation(app, {', "app.use('/api', (req, res, next) => {",
    "app.use('/api/webhooks', (req, res, next) => {", 'registerPlatformRoutes(app, {',
  ]) && requestLimitersSource.includes("keyPrefix: 'auth:whatsapp-otp:send'")],
  ['rotas da plataforma, autenticação e console DEV preservam ordem', mounted(platformRegistrationSource, [
    ['/api', 'createOperationalRouter('], ['/api/public', 'createPublicRouter('],
    ['/api/auth', 'createAuthRouter('], ['/api/dev', 'createDevCoreRouter('],
    ['/api/public', 'createPublicDevThemeRouter('], ['/api/dev', 'createDevOperationsRouter('],
    ['/api/dev', 'createDevReferralRouter('], ['/api/dev', 'createDevEvolutionRouter('],
    ['/api/public', 'createPublicLegalRouter('], ['/api/public', 'createPublicBillingCatalogRouter('],
    ['/api/public', 'createPublicReferralRouter('], ['/api/public', 'createPublicOnboardingRouter('],
  ]) && publicRoutesSource.includes('router.get(') && authRoutesSource.includes('router.post(')],
  ['billing e assistente preservam acesso anterior e posterior à assinatura', mounted(billingRegistrationSource, [
    ['/api/admin', 'createAdminBillingRouter('], ['/api/admin', 'createAdminLumaBillingRouter('],
    ['/api/webhooks', 'createInfinitePayWebhookRouter('], ['/api/admin', 'requireActiveSubscription'],
    ['/api/admin', 'createAdminReferralRouter('], ['/api/admin', 'createAdminOnboardingRouter('],
    ['/api/admin', 'createAdminLumaAssistantRouter('], ['/api/webhooks', 'createEvolutionWebhookRouter('],
    ['/api/admin', 'createAdminServicesRouter('],
  ])],
  ['agenda, administração, WhatsApp e cliente preservam ordem', mounted(tenantRegistrationSource, [
    ['/api/admin', 'createAdminAppointmentsRouter('], ['/api/admin', 'createAdminAvailabilityRouter('],
    ['/api/admin', 'createAdminDashboardRouter('], ['/api/admin', 'createAdminTenantSettingsRouter('],
    ['/api/admin', 'createAdminClientsRouter('], ['/api/admin', 'createAdminFinanceRouter('],
    ['/api/admin', 'createAdminWhatsappSettingsRouter('], ['/api/admin', 'createAdminWhatsappConnectionRouter('],
    ['/api/admin', 'createAdminWhatsappCampaignRouter('], ['/api/admin', 'createAdminWhatsappConversationRouter('],
    ['/api/public', 'createPublicBookingRouter('], ['/api/public', 'createPublicClientAccessRouter('],
    ['/api/client', 'createClientPortalRouter('],
  ]) && ordered(tenantRegistrationSource, [
    'createClientAccessService({', "app.use('/api/public', createPublicBookingRouter({",
    'createWhatsappWorkerRuntime({', "app.use('/api/public', createPublicClientAccessRouter({",
  ])],
  ['workflows continuam compartilhando os runtimes originais', serverSource.includes('appointmentAutomationBridge.current = appointments') &&
    serverSource.includes('managedRuntimes: [...(appmaxWebhook ? [appmaxWebhook] : []), createLumaReminderRuntime(db, whatsapp.sendWhatsappTextForTenant), domains, appointments, whatsappWorkerRuntime]') &&
    domainVerificationRuntimeSource.includes('const verifyPendingDomains = async () =>') &&
    whatsappWorkerRuntimeSource.includes('const processMediaQueue = async () =>') &&
    appointmentAutomationRuntimeSource.includes('const processQueue = async () =>')],
  ['serviços e contratos de segurança continuam isolados',
    customerAppointmentServiceSource.includes('transaction.immediate()') &&
    clientAccessServiceSource.includes('timingSafeEqual') &&
    clientMarketingConsentServiceSource.includes('transaction.immediate()') &&
    professionalConsentServiceSource.includes('legalEvidenceFingerprint') &&
    securityStateMaintenanceSource.includes('security_rate_limits') &&
    securityStateMaintenanceSource.includes('trusted_devices') &&
    serverLifecycleRuntimeSource.includes("registerSignal('SIGTERM'") &&
    serverLifecycleRuntimeSource.includes('closeAllConnections()') &&
    applicationServerRuntimeSource.includes('createSecurityStateMaintenance({ db })')],
  ['catálogo, rede, DNS e limitadores permanecem em módulos próprios',
    commercialConfigSource.includes('OFFICIAL_BILLING_PRICES') &&
    platformNetworkConfigSource.includes('configuredPlatformHostname') &&
    domainSetupPayloadSource.includes('domainVerificationValue(row.verificationToken)') &&
    requestLimitersSource.includes("keyPrefix: 'client:access:phone'") &&
    serverSource.includes('createCommercialConfig({') && serverSource.includes('createPlatformNetworkConfig({')],
  ['processo, entrega estática e integração Evolution continuam isolados',
    processFoundationSource.includes("registerFatalHandler('uncaughtException'") &&
    productionClientDeliverySource.includes('renderClientIndexHtml({') &&
    platformEvolutionRuntimeSource.includes('const migrateEvolutionSecretsAtRest =') &&
    whatsappEvolutionRuntimeSource.includes('const handleEvolutionConfirmationWebhook =') &&
    serverSource.includes('platformEvolution.migrateEvolutionSecretsAtRest()')],
]

for (const [label, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failed += 1
}

if (failed) process.exit(1)
console.log('\nContrato arquitetural aprovado.')
