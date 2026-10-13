import type Database from 'better-sqlite3'
import type express from 'express'
import { financeExpenseCategories, financeMonthSnapshot, financeRecentMonths, tenantFinanceTimeZone } from '../finance.js'
import { resolveExternalHttpsBaseUrl } from '../externalUrl.js'
import { hashPassword } from '../security.js'
import { secretHmac } from '../secretCrypto.js'
import { createClientAccessService } from '../clientAccessService.js'
import { createWhatsappWorkerRuntime } from '../whatsappWorkerRuntime.js'
import { createAdminAppointmentsRouter } from './adminAppointmentsRoutes.js'
import { createAdminAvailabilityRouter } from './adminAvailabilityRoutes.js'
import { createAdminDashboardRouter } from './adminDashboardRoutes.js'
import { createAdminTenantSettingsRouter } from './adminTenantSettingsRoutes.js'
import { createAdminClientsRouter } from './adminClientsRoutes.js'
import { createAdminFinanceRouter } from './adminFinanceRoutes.js'
import { createAdminWhatsappSettingsRouter } from './adminWhatsappSettingsRoutes.js'
import { createAdminWhatsappConnectionRouter } from './adminWhatsappConnectionRoutes.js'
import { createAdminWhatsappCampaignRouter } from './adminWhatsappCampaignRoutes.js'
import { createAdminWhatsappConversationRouter } from './adminWhatsappConversationRoutes.js'
import { createPublicBookingRouter } from './publicBookingRoutes.js'
import { createClientPortalRouter, createPublicClientAccessRouter } from './clientPortalRoutes.js'
import type { createAppointmentAutomationRuntime } from '../appointmentAutomationRuntime.js'
import type { createDomainVerificationRuntime } from '../domainVerificationRuntime.js'
import type { createDomainSetupPayloadFactory } from '../domainSetupPayload.js'
import type { createPlatformNetworkConfig } from '../platformNetworkConfig.js'
import type { createRequestLimiters } from '../requestLimiters.js'
import type { createWhatsappEvolutionRuntime } from '../whatsappEvolutionRuntime.js'
import type { createPlatformEvolutionRuntime } from '../platformEvolutionRuntime.js'
import type { createClientMarketingConsentService } from '../clientMarketingConsentService.js'
import type { createAuthSessionRuntime } from '../authSessionRuntime.js'
import type { createCustomerAppointmentService } from '../customerAppointmentService.js'

type TenantRouteOptions = {
  db: Database.Database
  normalizePhone: (raw: string) => string
  nodeEnv: string
  mediaDir: string
  campaignsEnabled: boolean
  campaignMaxRecipients: number
  campaignSendIntervalSeconds: number
  domainSetupPayload: ReturnType<typeof createDomainSetupPayloadFactory>
  network: ReturnType<typeof createPlatformNetworkConfig>
  domains: ReturnType<typeof createDomainVerificationRuntime>
  appointments: ReturnType<typeof createAppointmentAutomationRuntime>
  customerAppointments: ReturnType<typeof createCustomerAppointmentService>
  limiters: ReturnType<typeof createRequestLimiters>
  whatsapp: ReturnType<typeof createWhatsappEvolutionRuntime>
  platformEvolution: ReturnType<typeof createPlatformEvolutionRuntime>
  clientConsent: ReturnType<typeof createClientMarketingConsentService>
  authSession: ReturnType<typeof createAuthSessionRuntime>
}

export function registerTenantRoutes(app: express.Express, options: TenantRouteOptions) {
  const { db, normalizePhone, nodeEnv, mediaDir, campaignsEnabled, campaignMaxRecipients, campaignSendIntervalSeconds, domainSetupPayload, network, domains, appointments, customerAppointments, limiters, whatsapp, platformEvolution, clientConsent, authSession } = options

  app.use('/api/admin', createAdminAppointmentsRouter({
    db,
    staffEnabled: true,
    normalizePhone,
    hashPassword,
    scheduleAppointmentAutomationJobs: appointments.scheduleAppointmentAutomationJobs,
    cancelAppointmentJobs: appointments.cancelAppointmentJobs,
    confirmationAppointmentById: appointments.confirmationAppointmentById,
    sendAppointmentConfirmation: appointments.sendAppointmentConfirmation,
    confirmationEvent: appointments.confirmationEvent,
  }))

  app.use('/api/admin', createAdminAvailabilityRouter({ db }))
  app.use('/api/admin', createAdminDashboardRouter({ db }))

  app.use('/api/admin', createAdminTenantSettingsRouter({
    db,
    domainVerifyLimiter: limiters.domainVerifyLimiter,
    domainVerificationConfig: network.domainVerificationConfig,
    getDomainRow: domains.getDomainRow,
    verifyDomainRow: domains.verifyDomainRow,
    domainSetupPayload,
  }))

  app.use('/api/admin', createAdminClientsRouter({ db }))

  app.use('/api/admin', createAdminFinanceRouter({
    db,
    tenantFinanceTimeZone,
    financeMonthSnapshot,
    financeRecentMonths,
    financeExpenseCategories,
  }))

  app.use('/api/admin', createAdminWhatsappSettingsRouter({
    db,
    production: nodeEnv === 'production',
    requireWhatsappConfig: whatsapp.requireWhatsappConfig,
    ensurePlatformWhatsappConfig: whatsapp.ensurePlatformWhatsappConfig,
    requireWhatsappSettings: whatsapp.requireWhatsappSettings,
    defaultWhatsappSettings: whatsapp.defaultWhatsappSettings,
    resolveExternalHttpsBaseUrl,
    encryptTenantApiKey: platformEvolution.encryptTenantApiKey,
    scheduleAppointmentAutomationJobsForTenant: appointments.scheduleAppointmentAutomationJobsForTenant,
  }))

  app.use('/api/admin', createAdminWhatsappConnectionRouter({
    db,
    requireWhatsappConfig: whatsapp.requireWhatsappConfig,
    ensurePlatformWhatsappConfig: whatsapp.ensurePlatformWhatsappConfig,
    resolveExternalHttpsBaseUrl,
    configureEvolutionWebhookForTenant: whatsapp.configureEvolutionWebhookForTenant,
    evolutionWebhookConfiguredForTenant: whatsapp.evolutionWebhookConfiguredForTenant,
    updateEvolutionConnectionFromWebhook: whatsapp.updateEvolutionConnectionFromWebhook,
  }))

  app.use('/api/admin', createAdminWhatsappCampaignRouter({
    db,
    campaignsEnabled,
    maxRecipients: campaignMaxRecipients,
    sendIntervalSeconds: campaignSendIntervalSeconds,
    requireWhatsappSettings: whatsapp.requireWhatsappSettings,
    defaultWhatsappSettings: whatsapp.defaultWhatsappSettings,
  }))

  app.use('/api/admin', createAdminWhatsappConversationRouter({
    db,
    whatsappSendLimiter: limiters.whatsappSendLimiter,
    whatsappMediaDir: mediaDir,
    configureEvolutionWebhookForTenant: whatsapp.configureEvolutionWebhookForTenant,
    sendWhatsappTextForTenant: whatsapp.sendWhatsappTextForTenant,
  }))

  const { requestClientAccess, verifyClientAccess } = createClientAccessService({
    db,
    normalizePhone,
    requireWhatsappConfig: whatsapp.requireWhatsappConfig,
    hashCode: (tenantId, userId, code) => secretHmac(`${tenantId}:${userId}:${code}`, 'client-login-otp'),
    sendWhatsappText: whatsapp.sendWhatsappTextForTenant,
  })

  app.use('/api/public', createPublicBookingRouter({
    db,
    publicBookingLimiter: limiters.publicBookingLimiter,
    publicBookingPhoneLimiter: limiters.publicBookingPhoneLimiter,
    normalizePhone,
    hashPassword,
    createAppointmentForUser: customerAppointments.createAppointmentForUser,
    setClientWhatsappMarketingConsent: clientConsent.setClientWhatsappMarketingConsent,
  }))

  const whatsappWorkerRuntime = createWhatsappWorkerRuntime({
    db,
    mediaDir,
    campaignsEnabled,
    campaignSendIntervalSeconds,
    requireWhatsappConfig: whatsapp.requireWhatsappConfig,
    resolveExternalHttpsBaseUrl,
    sendWhatsappTextForTenant: whatsapp.sendWhatsappTextForTenant,
  })

  app.use('/api/public', createPublicClientAccessRouter({
    clientAccessRequestLimiter: limiters.clientAccessRequestLimiter,
    clientAccessPhoneLimiter: limiters.clientAccessPhoneLimiter,
    clientAccessVerifyLimiter: limiters.clientAccessVerifyLimiter,
    requestClientAccess,
    verifyClientAccess,
    createAndSetSession: authSession.createAndSetSession,
  }))

  app.use('/api/client', createClientPortalRouter({
    db,
    setClientWhatsappMarketingConsent: clientConsent.setClientWhatsappMarketingConsent,
    createAppointmentForUser: customerAppointments.createAppointmentForUser,
  }))

  return { whatsappWorkerRuntime }
}
