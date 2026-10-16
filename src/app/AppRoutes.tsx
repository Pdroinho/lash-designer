import { PageLoading } from '../components/PageLoading'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { api } from '../api'
import type { TenantPublic } from '../types'
import {
  configuredPlatformBaseUrl,
} from '../lib/runtime'
const BookingPage = lazy(() => import('../features/booking/BookingPage').then((module) => ({ default: module.BookingPage })))
const ClientPortal = lazy(() => import('../features/client/ClientPortal').then((module) => ({ default: module.ClientPortal })))
const RootEntry = lazy(() => import('../features/auth/Authentication').then((module) => ({ default: module.RootEntry })))
const UnifiedLogin = lazy(() => import('../features/auth/Authentication').then((module) => ({ default: module.UnifiedLogin })))
const Dev = lazy(() => import('../features/dev/DevConsole').then((module) => ({ default: module.Dev })))
const Admin = lazy(() => import('../features/admin/AdminApp').then((module) => ({ default: module.Admin })))
const SupportWorkspace = lazy(() => import('../features/support/SupportWorkspace').then(module => ({default:module.SupportWorkspace})))
const StaffArea = lazy(() => import('../features/staff/StaffArea').then(module => ({ default: module.StaffArea })))
const StaffInvitation = lazy(() => import('../features/staff/StaffInvitation').then(module => ({ default: module.StaffInvitation })))
const LandingPage = lazy(() => import('../LandingPage').then((module) => ({ default: module.LandingPage })))
const WorkspaceAccessPage = lazy(() => import('../LandingPage').then((module) => ({ default: module.WorkspaceAccessPage })))
const LegalPage = lazy(() => import('../LegalPage').then((module) => ({ default: module.LegalPage })))



function SlugToSubdomainRedirect() {
  const params = useParams()
  const loc = useLocation()
  const slug = String(params.tenantSlug ?? '').trim().toLowerCase()
  const rest = String((params as Record<string, unknown>)['*'] ?? '').trim()

  useEffect(() => {
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) return
    let target = configuredPlatformBaseUrl()
    if (!target && import.meta.env.DEV && typeof window !== 'undefined') {
      target = new URL(window.location.origin)
    }
    if (!target) return

    const rootHost = target.hostname.toLowerCase().startsWith('www.') ? target.hostname.slice(4) : target.hostname
    const port = target.port ? `:${target.port}` : ''
    const path = rest ? `/${rest}` : '/'
    window.location.assign(`${target.protocol}//${slug}.${rootHost}${port}${path}${loc.search}${loc.hash}`)
  }, [slug, rest, loc.search, loc.hash])

  return (
    <div className="container">
      <div className="text-center">Redirecionando...</div>
    </div>
  )
}

function RouteLoading() { return <PageLoading /> }

export function AppRoutes() {
  const location = useLocation()
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
  const configuredDevHost = String(import.meta.env.VITE_DEV_HOST ?? '').trim().toLowerCase()
  const configuredRootHost = configuredPlatformBaseUrl()?.hostname.toLowerCase() ?? ''
  const isLocalDevelopment = import.meta.env.DEV && (host === 'localhost' || host === '127.0.0.1' || host === '::1')
  const isDevHost = isLocalDevelopment || Boolean(configuredDevHost && host === configuredDevHost)
  const isPlatformRootHost = Boolean(configuredRootHost && host.replace(/^www\./, '') === configuredRootHost.replace(/^www\./, ''))
  const [hostTenant, setHostTenant] = useState<TenantPublic | null | undefined>(() => (isDevHost || isPlatformRootHost ? null : undefined))

  useEffect(() => {
    if (typeof document === 'undefined') return
    const isPublicBooking = Boolean(hostTenant) && location.pathname === '/agendar'
    const isMarketingLanding = !isDevHost && hostTenant === null && location.pathname === '/'
    const titleByPath = isDevHost
      ? 'Lash Designer — Console DEV'
      : isMarketingLanding
        ? 'Lash Designer — Agenda e gestão para profissionais de cílios'
        : location.pathname.startsWith('/admin')
          ? `${hostTenant?.name ?? 'Lash Designer'} — Painel`
          : location.pathname.startsWith('/cliente')
            ? `${hostTenant?.name ?? 'Lash Designer'} — Minha área`
            : location.pathname === '/agendar'
              ? `Agende seu horário — ${hostTenant?.name ?? 'Lash Designer'}`
              : `${hostTenant?.name ?? 'Lash Designer'} — Acesso`
    document.title = titleByPath

    const marketingDescription = 'Agenda online, clientes, serviços, financeiro e domínio próprio para lash designers que querem profissionalizar o negócio.'
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!description) {
      description = document.createElement('meta')
      description.name = 'description'
      document.head.appendChild(description)
    }
    description.content = isMarketingLanding
      ? marketingDescription
      : isPublicBooking
        ? `Agende seu atendimento com ${hostTenant?.name ?? 'Lash Designer'}.`
        : 'Área segura do Lash Designer.'

    for (const [property, content] of [
      ['og:title', titleByPath],
      ['og:description', isMarketingLanding ? marketingDescription : description.content],
      ['og:image', '/og-cover.jpg'],
    ] as const) {
      let meta = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('property', property)
        document.head.appendChild(meta)
      }
      meta.content = content
    }

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    robots.content = isPublicBooking || isMarketingLanding ? 'index,follow' : 'noindex,nofollow'

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (isPublicBooking || isMarketingLanding) {
      if (!canonical) {
        canonical = document.createElement('link')
        canonical.rel = 'canonical'
        document.head.appendChild(canonical)
      }
      canonical.href = isPublicBooking
        ? `${(hostTenant?.publicBaseUrl || window.location.origin).replace(/\/$/, '')}/agendar`
        : window.location.origin
    } else {
      canonical?.remove()
    }
  }, [hostTenant, isDevHost, location.pathname])

  useEffect(() => {
    if (isDevHost || isPlatformRootHost) return
    let mounted = true
    api<{ tenant: TenantPublic }>('/api/public/tenant').then((res) => {
      if (!mounted) return
      if (!res.ok) {
        setHostTenant(null)
        return
      }
      setHostTenant(res.data.tenant)
    })
    return () => {
      mounted = false
    }
  }, [isDevHost, isPlatformRootHost])

  if (isDevHost) {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<RootEntry loginElement={<UnifiedLogin isDevHost />} renderWhenAuthenticated={() => <Dev />} />} />
          <Route path="/dev" element={<Dev />} />
          <Route path="/login" element={<UnifiedLogin isDevHost />} />
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/termos" element={<LegalPage kind="terms" />} />
          <Route path="/privacidade" element={<LegalPage kind="privacy" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    )
  }

  if (hostTenant === undefined) {
    return (
      <PageLoading />
    )
  }

  if (hostTenant === null) {
      const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
      const configuredRootHost = configuredPlatformBaseUrl()?.hostname.toLowerCase().replace(/^www\./, '')
      const normalizedHost = host.replace(/^www\./, '')
      const isPlatformRoot = Boolean(configuredRootHost && normalizedHost === configuredRootHost)
      const isSubdomain = !isPlatformRoot
          && host.split('.').length > (host.includes('localhost') ? 1 : 2)
          && !host.startsWith('www.')
          && !host.startsWith('dev.')

      if (isSubdomain) {
          return (
              <div className="container text-center" style={{paddingTop: 100}}>
                  <h1>Espaço não encontrado</h1>
                  <p>O endereço <strong>{host}</strong> não está cadastrado.</p>
                  <button type="button" className="btn btnPrimary" onClick={() => {
                      const platformUrl = configuredPlatformBaseUrl()
                      window.location.assign(platformUrl?.toString() ?? '/')
                  }}>Voltar para início</button>
              </div>
          )
      }
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route
          path="/"
          element={hostTenant
            ? <RootEntry hostTenant={hostTenant} loginElement={<UnifiedLogin hostTenant={hostTenant} />} />
            : <LandingPage />}
        />
        <Route path="/login" element={hostTenant ? <UnifiedLogin hostTenant={hostTenant} /> : <WorkspaceAccessPage />} />
        <Route path="/termos" element={<LegalPage kind="terms" />} />
        <Route path="/privacidade" element={<LegalPage kind="privacy" />} />

        {hostTenant?.billingRecovery ? <Route path="/admin" element={<Admin tenant={hostTenant} tenantSlug={hostTenant.slug} basePath="" />} /> : null}
        {hostTenant && !hostTenant.billingRecovery ? (
          <>
            <Route path="/agendar" element={<BookingPage tenant={hostTenant} tenantSlug={hostTenant.slug} basePath="" />} />
            <Route path="/admin" element={<Admin tenant={hostTenant} tenantSlug={hostTenant.slug} basePath="" />} />
            <Route path="/equipe" element={<StaffArea />} />
            <Route path="/suporte" element={<SupportWorkspace />} />
            <Route path="/convite/:token" element={<StaffInvitation />} />
            <Route path="/cliente" element={<ClientPortal tenant={hostTenant} tenantSlug={hostTenant.slug} basePath="" />} />
            <Route path="/cliente/entrar" element={<Navigate to="/" replace />} />
            <Route path="/cliente/cadastro" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <Route path="/:tenantSlug/*" element={<SlugToSubdomainRedirect />} />
        )}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
