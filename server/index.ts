import { createLumaAppmaxCredits } from './lumaAppmaxCredits.js'
import { createLumaReminderRuntime } from './lumaReminderRuntime.js'
import express from 'express'
import { sessionMiddleware } from './auth.js'
import { closeDb, getDb } from './db.js'
import { createDomainVerificationRuntime } from './domainVerificationRuntime.js'
import { env } from './env.js'
import { normalizeBrazilPhone } from './phone.js'
import { resolveExternalHttpsBaseUrl } from './externalUrl.js'
import { badRequest, handleError, notFound } from './http.js'
import { migrate } from './migrate.js'
import { createWhatsappEvolutionRuntime } from './whatsappEvolutionRuntime.js'
import { createPlatformEvolutionRuntime } from './platformEvolutionRuntime.js'
import { createSameOriginMiddleware } from './middleware/requestSecurity.js'
import { createTenantRouting } from './middleware/tenantRouting.js'
import { configureAppFoundation } from './appFoundation.js'
import { createAuthSessionRuntime } from './authSessionRuntime.js'
import { createAppointmentAutomationRuntime } from './appointmentAutomationRuntime.js'
import { syncBookedClientConversation } from './clientConversationSync.js'
import { createCustomerAppointmentService } from './customerAppointmentService.js'
import { createClientMarketingConsentService } from './clientMarketingConsentService.js'
import { createProfessionalConsentService } from './professionalConsentService.js'
import { createCommercialConfig } from './commercialConfig.js'
import { createPlatformNetworkConfig } from './platformNetworkConfig.js'
import { createRequestLimiters } from './requestLimiters.js'
import { initializeProcessFoundation } from './processFoundation.js'
import { configureProductionClientDelivery } from './productionClientDelivery.js'
import { createDomainSetupPayloadFactory } from './domainSetupPayload.js'
import { createApplicationServerRuntime } from './applicationServerRuntime.js'
import { createInfinitePayRuntime } from './infinitePay.js'
import { createAppmaxClient } from './appmax.js'
import { createAppmaxBillingService } from './appmaxBillingService.js'
import { createAppmaxWebhookRuntime } from './appmaxWebhookRuntime.js'
import { registerPlatformRoutes } from './routes/registerPlatformRoutes.js'
import { registerBillingAssistantRoutes } from './routes/registerBillingAssistantRoutes.js'
import { registerTenantRoutes } from './routes/registerTenantRoutes.js'

const { appVersion } = initializeProcessFoundation({ nodeEnv: env.NODE_ENV, port: env.PORT })

migrate()
const db = getDb()
const commercial = createCommercialConfig({ db, appBaseUrl: env.APP_BASE_URL, frontendOrigin: env.FRONTEND_ORIGIN })
const platformEvolution = createPlatformEvolutionRuntime({
  db,
  environmentBaseUrl: env.EVOLUTION_API_URL,
  environmentApiKey: env.EVOLUTION_API_KEY,
  environmentInstanceName: env.EVOLUTION_INSTANCE_NAME,
  resolveExternalHttpsBaseUrl,
})
platformEvolution.migrateEvolutionSecretsAtRest()

const infinitePay = createInfinitePayRuntime(db)
const appmaxClient = env.APPMAX_CHECKOUT_ENABLED && env.APPMAX_MERCHANT_CLIENT_ID && env.APPMAX_MERCHANT_CLIENT_SECRET
  ? createAppmaxClient({ environment: env.APPMAX_ENVIRONMENT, merchantClientId: env.APPMAX_MERCHANT_CLIENT_ID, merchantClientSecret: env.APPMAX_MERCHANT_CLIENT_SECRET })
  : null
const appmaxBilling = appmaxClient ? createAppmaxBillingService(db, appmaxClient) : null
const lumaAppmaxCredits = appmaxClient ? createLumaAppmaxCredits(db, appmaxClient) : null
const appmaxWebhook = appmaxBilling ? createAppmaxWebhookRuntime(db, appmaxBilling, lumaAppmaxCredits ?? undefined) : null
const network = createPlatformNetworkConfig({
  appBaseUrl: env.APP_BASE_URL,
  frontendOrigin: env.FRONTEND_ORIGIN,
  devHost: env.DEV_HOST,
  cnameTarget: env.CUSTOM_DOMAIN_CNAME_TARGET,
  customDomainIpv4: env.CUSTOM_DOMAIN_IPV4,
  customDomainIpv6: env.CUSTOM_DOMAIN_IPV6,
})
const authSession = createAuthSessionRuntime(db, env.NODE_ENV)
const limiters = createRequestLimiters({ db, preauthCookieName: authSession.preauthCookieName })
const app = express()
const tenantRouting = createTenantRouting({
  db,
  nodeEnv: env.NODE_ENV,
  devHost: env.DEV_HOST,
  platformHostname: network.configuredPlatformHostname,
})

configureAppFoundation(app, {
  db,
  nodeEnv: env.NODE_ENV,
  devHost: env.DEV_HOST,
  platformHostname: network.configuredPlatformHostname,
  getTenantSlugFromHostname: tenantRouting.getTenantSlugFromHostname,
  resolveTenantFromSubdomain: tenantRouting.resolveTenantFromSubdomain,
  sessionMiddleware,
  requireSameOrigin: createSameOriginMiddleware(env.NODE_ENV),
})

app.use('/api', (req, res, next) => {
  if ((req.path || '').startsWith('/webhooks/')) return next()
  limiters.apiLimiter(req, res, next)
})
app.use('/api/webhooks', (req, res, next) => {
  limiters.webhooksLimiter(req, res, next)
})

const normalizePhone = (raw: string) => {
  const phone = normalizeBrazilPhone(raw)
  if (!phone) throw badRequest('Telefone inválido', 'INVALID_PHONE')
  return phone
}

const clientConsent = createClientMarketingConsentService({ db })
const professionalConsent = createProfessionalConsentService({ db })
const appointmentAutomationBridge: { current?: ReturnType<typeof createAppointmentAutomationRuntime> } = {}
const whatsapp = createWhatsappEvolutionRuntime({
  db,
  production: env.NODE_ENV === 'production',
  appBaseUrl: env.APP_BASE_URL,
  webhookSecret: env.EVOLUTION_WEBHOOK_SECRET,
  normalizeFallbackPhone: normalizePhone,
  decryptPlatformApiKey: platformEvolution.decryptPlatformApiKey,
  decryptTenantApiKey: platformEvolution.decryptTenantApiKey,
  resolveExternalHttpsBaseUrl,
  getAppointmentAutomation: () => {
    if (!appointmentAutomationBridge.current) throw new Error('Appointment automation runtime not initialized')
    return appointmentAutomationBridge.current
  },
})

const domainSetupPayload = createDomainSetupPayloadFactory({
  cnameTarget: env.CUSTOM_DOMAIN_CNAME_TARGET,
  verificationConfig: network.domainVerificationConfig,
})
const domains = createDomainVerificationRuntime({
  db,
  config: network.domainVerificationConfig,
  verifyIntervalMinutes: env.DOMAIN_VERIFY_INTERVAL_MINUTES,
  activeReverifyHours: env.DOMAIN_ACTIVE_REVERIFY_HOURS,
})

registerPlatformRoutes(app, {
  db, appVersion, nodeEnv: env.NODE_ENV, domainAuthSecret: env.DOMAIN_AUTH_SECRET,
  devHost: env.DEV_HOST, network, commercial, platformEvolution,
  authSession, limiters, tenantRouting, professionalConsent, infinitePay,
  appmaxBilling, appmaxEnabled: env.APPMAX_CHECKOUT_ENABLED,
})

registerBillingAssistantRoutes(app, {
  db, commercial, infinitePay, limiters, whatsapp, clientConsent, appmaxBilling, appmaxWebhook, lumaAppmaxCredits,
  appmaxEnabled: env.APPMAX_CHECKOUT_ENABLED, production: env.NODE_ENV === 'production',
  infinitePayConfigured: Boolean(env.INFINITEPAY_HANDLE),
  assistantEnabled: env.AI_ASSISTANT_ENABLED,
  evolutionWebhookSecret: env.EVOLUTION_WEBHOOK_SECRET,
})

const appointments = createAppointmentAutomationRuntime({
  db,
  getSettings: tenantId => whatsapp.requireWhatsappSettings(tenantId) ?? whatsapp.defaultWhatsappSettings,
  configureWebhook: whatsapp.configureEvolutionWebhookForTenant,
  sendWhatsappText: whatsapp.sendWhatsappTextForTenant,
})
appointmentAutomationBridge.current = appointments
const customerAppointments = createCustomerAppointmentService({
  db,
  staffEnabled: true,
  syncClientConversation: (tenantId,userId) => syncBookedClientConversation(db,tenantId,userId),
  scheduleAppointmentAutomationJobs: appointments.scheduleAppointmentAutomationJobs,
})

const { whatsappWorkerRuntime } = registerTenantRoutes(app, {
  db, normalizePhone, nodeEnv: env.NODE_ENV,
  mediaDir: env.WHATSAPP_MEDIA_DIR,
  campaignsEnabled: env.WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED,
  campaignMaxRecipients: env.WHATSAPP_CAMPAIGN_MAX_RECIPIENTS,
  campaignSendIntervalSeconds: env.WHATSAPP_CAMPAIGN_SEND_INTERVAL_SECONDS,
  domainSetupPayload, network, domains, appointments, customerAppointments,
  limiters, whatsapp, platformEvolution, clientConsent, authSession,
})

app.all('/api/*path', (_req, _res, next) => next(notFound()))
configureProductionClientDelivery(app, {
  nodeEnv: env.NODE_ENV,
  platformHostname: network.configuredPlatformHostname,
  canonicalBaseUrl: env.APP_BASE_URL,
})
app.use(handleError)

const serverLifecycleRuntime = createApplicationServerRuntime({
  app,
  db,
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  managedRuntimes: [...(appmaxWebhook ? [appmaxWebhook] : []), createLumaReminderRuntime(db, whatsapp.sendWhatsappTextForTenant), domains, appointments, whatsappWorkerRuntime],
  closeDatabase: closeDb,
})
serverLifecycleRuntime.start()
