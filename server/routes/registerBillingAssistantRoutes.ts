import type Database from 'better-sqlite3'
import type express from 'express'
import { requireActiveSubscription } from '../auth.js'
import { assistantProvider, generateAssistantAnswer, generateBrandSetupSuggestions } from '../assistant.js'
import { confirmLumaAction } from '../lumaBridge.js'
import { requireWebhookSecret } from '../middleware/requestSecurity.js'
import { createAdminBillingRouter } from './adminBillingRoutes.js'
import { createInfinitePayWebhookRouter } from './infinitePayWebhookRoutes.js'
import { createAdminLumaBillingRouter } from './adminLumaBillingRoutes.js'
import { createAdminLumaAssistantRouter } from './adminLumaAssistantRoutes.js'
import { createEvolutionWebhookRouter } from './evolutionWebhookRoutes.js'
import { createAdminReferralRouter } from './referralRoutes.js'
import { createAdminOnboardingRouter } from './adminOnboardingRoutes.js'
import { createAdminServicesRouter } from './adminServicesRoutes.js'
import { createAdminProfessionalsRouter } from './adminProfessionalsRoutes.js'
import { createAdminAppmaxRouter, createAppmaxWebhookRouter } from './appmaxRoutes.js'
import type { createAppmaxBillingService } from '../appmaxBillingService.js'
import type { createAppmaxWebhookRuntime } from '../appmaxWebhookRuntime.js'
import type { createCommercialConfig } from '../commercialConfig.js'
import type { createInfinitePayRuntime } from '../infinitePay.js'
import type { createRequestLimiters } from '../requestLimiters.js'
import type { createWhatsappEvolutionRuntime } from '../whatsappEvolutionRuntime.js'
import type { createClientMarketingConsentService } from '../clientMarketingConsentService.js'

type BillingAssistantRouteOptions = {
  db: Database.Database
  commercial: ReturnType<typeof createCommercialConfig>
  infinitePay: ReturnType<typeof createInfinitePayRuntime>
  limiters: ReturnType<typeof createRequestLimiters>
  whatsapp: ReturnType<typeof createWhatsappEvolutionRuntime>
  clientConsent: ReturnType<typeof createClientMarketingConsentService>
  infinitePayConfigured: boolean
  assistantEnabled: boolean
  evolutionWebhookSecret?: string
  appmaxBilling: ReturnType<typeof createAppmaxBillingService> | null
  appmaxWebhook: ReturnType<typeof createAppmaxWebhookRuntime> | null
  appmaxEnabled: boolean
  production: boolean
}

export function registerBillingAssistantRoutes(app: express.Express, options: BillingAssistantRouteOptions) {
  const { db, commercial, infinitePay, limiters, whatsapp, clientConsent, infinitePayConfigured, assistantEnabled, evolutionWebhookSecret, appmaxBilling, appmaxWebhook, appmaxEnabled, production } = options

  app.use('/api/admin', createAdminBillingRouter({
    db,
    legacyCheckoutEnabled: !appmaxEnabled,
    billingPlans: commercial.billingPlans,
    billingPlanByCycle: commercial.billingPlanByCycle,
    firstMonthPromoCents: commercial.firstMonthPromoCents,
    hasPaidSubscriptionPurchase: commercial.hasPaidSubscriptionPurchase,
    subscriptionCheckoutQuote: commercial.subscriptionCheckoutQuote,
    createInfinitePayLink: infinitePay.createInfinitePayLink,
  }))

  app.use('/api/admin', createAdminLumaBillingRouter({ db, createInfinitePayLink: infinitePay.createInfinitePayLink }))
  app.use('/api/admin', createAdminAppmaxRouter(db, appmaxBilling, appmaxEnabled, production))
  app.use('/api/webhooks', createAppmaxWebhookRouter(appmaxWebhook))

  app.use('/api/webhooks', createInfinitePayWebhookRouter({
    db,
    infinitePayWebhookLimiter: limiters.infinitePayWebhookLimiter,
    infinitePayConfigured,
    logInfinitePayWebhookEvent: infinitePay.logInfinitePayWebhookEvent,
    verifyInfinitePayPayment: infinitePay.verifyInfinitePayPayment,
  }))

  app.use('/api/admin', requireActiveSubscription)

  app.use('/api/admin', createAdminReferralRouter({
    db,
    referralMutationLimiter: limiters.referralMutationLimiter,
    referralToken: commercial.referralToken,
    publicReferralUrl: commercial.publicReferralUrl,
    teamDiscountsAvailable: appmaxEnabled && Boolean(appmaxBilling),
    creditPreview: appmaxBilling?.creditPreview,
  }))

  app.use('/api/admin', createAdminOnboardingRouter({
    db,
    onboardingAssistantLimiter: limiters.onboardingAssistantLimiter,
    assistantEnabled,
    assistantProvider,
    generateBrandSetupSuggestions,
  }))

  app.use('/api/admin', createAdminLumaAssistantRouter({
    db,
    lumaAssistantLimiter: limiters.lumaAssistantLimiter,
    assistantEnabled,
    assistantProvider,
    generateAssistantAnswer,
    confirmLumaAction,
  }))

  app.use('/api/webhooks', createEvolutionWebhookRouter({
    db,
    requireEvolutionWebhookSecret: requireWebhookSecret(evolutionWebhookSecret),
    extractEvolutionInbound: whatsapp.extractEvolutionInbound,
    recordWhatsappMessage: whatsapp.recordWhatsappMessage,
    setClientWhatsappMarketingConsent: clientConsent.setClientWhatsappMarketingConsent,
    sendWhatsappTextForTenant: whatsapp.sendWhatsappTextForTenant,
    updateEvolutionConnectionFromWebhook: whatsapp.updateEvolutionConnectionFromWebhook,
    handleEvolutionConfirmationWebhook: whatsapp.handleEvolutionConfirmationWebhook,
  }))

  app.use('/api/admin', createAdminServicesRouter({ db }))
  app.use('/api/admin', createAdminProfessionalsRouter(db))
}
