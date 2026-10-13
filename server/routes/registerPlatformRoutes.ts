import { createSupportRouter } from './supportRoutes.js'
import type Database from 'better-sqlite3'
import type express from 'express'
import { legalPublicConfig } from '../legal.js'
import { createPublicRouter } from './publicRoutes.js'
import { createPublicProfessionalsRouter } from './publicProfessionalsRoutes.js'
import { createAuthRouter } from './authRoutes.js'
import { createDevCoreRouter } from './devCoreRoutes.js'
import { createDevOperationsRouter } from './devOperationsRoutes.js'
import { createDevReferralRouter } from './devReferralRoutes.js'
import { createDevEvolutionRouter } from './devEvolutionRoutes.js'
import { createPublicOnboardingRouter } from './publicOnboardingRoutes.js'
import { createProfessionalAccessRouter } from './professionalAccessRoutes.js'
import { createPublicReferralRouter } from './referralRoutes.js'
import { createOperationalRouter, createPublicBillingCatalogRouter, createPublicDevThemeRouter, createPublicLegalRouter } from './platformRoutes.js'
import type { createPlatformNetworkConfig } from '../platformNetworkConfig.js'
import type { createCommercialConfig } from '../commercialConfig.js'
import type { createPlatformEvolutionRuntime } from '../platformEvolutionRuntime.js'
import type { createAuthSessionRuntime } from '../authSessionRuntime.js'
import type { createRequestLimiters } from '../requestLimiters.js'
import type { createTenantRouting } from '../middleware/tenantRouting.js'
import type { createProfessionalConsentService } from '../professionalConsentService.js'
import type { createInfinitePayRuntime } from '../infinitePay.js'
import type { createAppmaxBillingService } from '../appmaxBillingService.js'

type PlatformRouteOptions = {
  db: Database.Database
  appVersion: string
  nodeEnv: string
  domainAuthSecret?: string
  devHost?: string
  network: ReturnType<typeof createPlatformNetworkConfig>
  commercial: ReturnType<typeof createCommercialConfig>
  platformEvolution: ReturnType<typeof createPlatformEvolutionRuntime>
  authSession: ReturnType<typeof createAuthSessionRuntime>
  limiters: ReturnType<typeof createRequestLimiters>
  tenantRouting: ReturnType<typeof createTenantRouting>
  professionalConsent: ReturnType<typeof createProfessionalConsentService>
  infinitePay: ReturnType<typeof createInfinitePayRuntime>
  appmaxBilling: ReturnType<typeof createAppmaxBillingService> | null
  appmaxEnabled: boolean
}

export function registerPlatformRoutes(app: express.Express, options: PlatformRouteOptions) {
  const { db, appVersion, nodeEnv, domainAuthSecret, devHost, network, commercial, platformEvolution, authSession, limiters, tenantRouting, professionalConsent, infinitePay, appmaxBilling, appmaxEnabled } = options

  app.use('/api', createOperationalRouter({
    db,
    appVersion,
    domainAuthSecret,
    platformHostname: network.configuredPlatformHostname,
    devHost,
    getTenantSlugFromHostname: tenantRouting.getTenantSlugFromHostname,
  }))

  app.use('/api/support', createSupportRouter({ db, requireDevHost: tenantRouting.requireDevHost }))

  app.use('/api/public', createPublicRouter({ db }))
  app.use('/api/public', createPublicProfessionalsRouter(db))
  app.use('/api', createProfessionalAccessRouter({ db, publicLimiter: limiters.publicCheckoutLimiter,
    normalizeUserE164Phone: platformEvolution.normalizeUserE164Phone,
    recordLegalAcceptance: professionalConsent.recordLegalAcceptance }))

  app.use('/api/auth', createAuthRouter({
    db,
    nodeEnv,
    isDevHost: tenantRouting.isDevHost,
    authLoginLimiter: limiters.authLoginLimiter,
    authLoginUserLimiter: limiters.authLoginUserLimiter,
    authWhatsappOtpSendLimiter: limiters.authWhatsappOtpSendLimiter,
    authPasswordLimiter: limiters.authPasswordLimiter,
    authSessionRuntime: authSession,
    sendPlatformWhatsappText: platformEvolution.sendPlatformWhatsappText,
    normalizeUserE164Phone: platformEvolution.normalizeUserE164Phone,
    maskE164Phone: platformEvolution.maskE164Phone,
    recordLegalAcceptance: professionalConsent.recordLegalAcceptance,
    recordPlatformMarketingChoice: professionalConsent.recordPlatformMarketingChoice,
  }))

  app.use('/api/dev', createDevCoreRouter({
    db,
    requireDevHost: tenantRouting.requireDevHost,
    devBootstrapLimiter: limiters.devBootstrapLimiter,
    assertTenantSlugIsAvailable: tenantRouting.assertTenantSlugIsAvailable,
    normalizeUserE164Phone: platformEvolution.normalizeUserE164Phone,
  }))

  app.use('/api/public', createPublicDevThemeRouter({ db, requireDevHost: tenantRouting.requireDevHost }))

  app.use('/api/dev', createDevOperationsRouter({
    db,
    requireDevHost: tenantRouting.requireDevHost,
    devBackupExportLimiter: limiters.devBackupExportLimiter,
  }))

  app.use('/api/dev', createDevReferralRouter({
    db,
    requireDevHost: tenantRouting.requireDevHost,
    referralMutationLimiter: limiters.referralMutationLimiter,
    referralToken: commercial.referralToken,
    publicReferralUrl: commercial.publicReferralUrl,
  }))

  app.use('/api/dev', createDevEvolutionRouter({
    db,
    requireDevHost: tenantRouting.requireDevHost,
    platformEvolutionConfig: platformEvolution.platformEvolutionConfig,
    platformEvolutionDefaultInstanceName: platformEvolution.platformEvolutionDefaultInstanceName,
    encryptPlatformApiKey: platformEvolution.encryptPlatformApiKey,
  }))

  app.use('/api/public', createPublicLegalRouter(legalPublicConfig))
  app.use('/api/public', createPublicBillingCatalogRouter(commercial.billingPlans, appmaxEnabled && Boolean(appmaxBilling)))
  app.use('/api/public', createPublicReferralRouter({ db }))

  app.use('/api/public', createPublicOnboardingRouter({
    db,
    publicCheckoutLimiter: limiters.publicCheckoutLimiter,
    publicCheckoutEmailLimiter: limiters.publicCheckoutEmailLimiter,
    billingPlanByCycle: commercial.billingPlanByCycle,
    assertTenantSlugIsAvailable: tenantRouting.assertTenantSlugIsAvailable,
    subscriptionCheckoutQuote: commercial.subscriptionCheckoutQuote,
    normalizeUserE164Phone: platformEvolution.normalizeUserE164Phone,
    recordLegalAcceptance: professionalConsent.recordLegalAcceptance,
    recordPlatformMarketingChoice: professionalConsent.recordPlatformMarketingChoice,
    createInfinitePayLink: infinitePay.createInfinitePayLink,
    appmaxBilling,
    appmaxEnabled,
  }))
}
