import { LumaContextAction } from '../../components/LumaContextAction'
import '../luma/luma-workspace.css'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { SessionUser, TenantPublic } from '../../types'
import { applyTenantTheme, setAppMode } from '../../theme'
import { shellTourSteps } from '../../lib/tourSteps'
import { LumaChatLauncher } from '../../components/LumaChatLauncher'
import { WorkspaceSetup } from '../../components/WorkspaceSetup'
import { notify } from '../../components/FeedbackCenter'
import { SidebarItem } from '../../components/SharedUi'
import { Shell } from '../../layouts/Shell'
import type { LegalPreferencesState } from '../settings/AdminSettings'
import type { AdminStats } from '../shared/types'
import {
  Calendar,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Users,
  Wallet,
  Settings,
  Image as ImageIcon,
  ShieldCheck,
  CreditCard,
  MessageSquare,
  HeartHandshake,
} from '../../components/Icons'

const SupportCenter = lazy(() => import('../support/SupportCenter').then(module => ({ default: module.SupportCenter })))
const BillingCenter = lazy(() => import('../../components/BillingCenter').then(module => ({ default: module.BillingCenter })))
const BusinessAssistant = lazy(() => import('../../components/BusinessAssistant').then(module => ({ default: module.BusinessAssistant })))
const ReferralCenter = lazy(() => import('../../components/ReferralCenter').then(module => ({ default: module.ReferralCenter })))
const WhatsAppCenter = lazy(() => import('../../components/WhatsAppCenter').then(module => ({ default: module.WhatsAppCenter })))
const AdminTeam = lazy(() => import('../team/AdminTeam').then(module => ({ default: module.AdminTeam })))
const AdminServices = lazy(() => import('../services/AdminServices').then(module => ({ default: module.AdminServices })))
const AdminClients = lazy(() => import('../clients/AdminClients').then(module => ({ default: module.AdminClients })))
const AdminDashboard = lazy(() => import('../dashboard/AdminDashboard').then(module => ({ default: module.AdminDashboard })))
const AdminCalendar = lazy(() => import('../calendar/AdminCalendar').then(module => ({ default: module.AdminCalendar })))
const AdminFinance = lazy(() => import('../finance/AdminFinance').then(module => ({ default: module.AdminFinance })))
const AdminSettings = lazy(() => import('../settings/AdminSettings').then(module => ({ default: module.AdminSettings })))

function AdminAreaLoading() {
  return (
    <div aria-busy="true" aria-label="Carregando área administrativa" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16}}>
      <div className="card skeleton-card skeleton" style={{height: 140}} />
      <div className="card skeleton-card skeleton" style={{height: 140}} />
      <div className="card skeleton-card skeleton" style={{height: 140}} />
    </div>
  )
}

function AdminEvolutionAPI() {
    return <WhatsAppCenter />
}

function LegalAcceptanceGate({ documents, onAccepted }: { documents: { termsVersion: string; privacyVersion: string; bundleHash: string }; onAccepted: () => void }) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function acceptCurrentDocuments() {
    if (!checked || busy) return
    setBusy(true)
    setError(null)
    const res = await api<{ ok: true }>('/api/auth/legal-acceptance', {
      method: 'POST',
      body: JSON.stringify({ accepted: true, termsVersion: documents.termsVersion, privacyVersion: documents.privacyVersion, bundleHash: documents.bundleHash }),
    })
    setBusy(false)
    if (!res.ok) { setError(res.error.message); return }
    onAccepted()
  }

  return <main className="legal-acceptance-screen">
    <section className="legal-acceptance-card" aria-labelledby="legal-acceptance-title">
      <div className="security-settings-icon"><ShieldCheck size={20} aria-hidden="true" /></div>
      <span>Documentos da plataforma</span>
      <h1 id="legal-acceptance-title">Revise a versão vigente antes de continuar.</h1>
      <p>Os Termos de Uso ou a Política de Privacidade desta conta precisam de aceite na versão atual. Marketing permanece uma escolha separada.</p>
      <div className="legal-acceptance-links"><a href="/termos" target="_blank" rel="noopener noreferrer">Ler Termos de Uso</a><a href="/privacidade" target="_blank" rel="noopener noreferrer">Ler Política de Privacidade</a></div>
      <label className="legal-acceptance-check"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /><span>Li e aceito os Termos de Uso e declaro ciência da Política de Privacidade vigentes.</span></label>
      <small>Termos {documents.termsVersion} · Privacidade {documents.privacyVersion}</small>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button type="button" className="btn btnPrimary" onClick={() => void acceptCurrentDocuments()} disabled={!checked || busy}>{busy ? 'Registrando aceite…' : 'Aceitar e continuar'}</button>
    </section>
  </main>
}

type AdminTab='dashboard'|'calendar'|'team'|'services'|'clients'|'finance'|'settings'|'evolution'|'billing'|'assistant'|'referrals'|'support'
const adminTabs:AdminTab[]=['dashboard','calendar','team','services','clients','finance','settings','evolution','billing','assistant','referrals','support']
export function Admin(props: { tenant?: TenantPublic; tenantSlug?: string; basePath?: string } = {}) {
  const { tenantSlug } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const _slug = (props.tenantSlug ?? tenantSlug ?? '').trim().toLowerCase()
  const [me, setMe] = useState<SessionUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [legalGateLoading, setLegalGateLoading] = useState(true)
  const [adminLegalPreferences, setAdminLegalPreferences] = useState<LegalPreferencesState | null>(null)
  const [legalGateError, setLegalGateError] = useState<string | null>(null)
  const [tenant, setTenant] = useState<TenantPublic | null>(null)
  useEffect(() => {
    const refreshBrand = () => { void api<{tenant: TenantPublic}>(_slug ? `/api/public/tenant/${encodeURIComponent(_slug)}` : '/api/public/tenant').then(result => { if (result.ok) { setTenant(result.data.tenant); applyTenantTheme(result.data.tenant) } }) }
    window.addEventListener('lashdesigner:brand-updated', refreshBrand)
    return () => window.removeEventListener('lashdesigner:brand-updated', refreshBrand)
  }, [_slug])
  const [isTestMode, setIsTestMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('lashdesigner_test_mode') === 'true'
    return false
  })
  const [tab, setTab] = useState<AdminTab>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lumaCredits') === 'return') return 'assistant'
    const view=new URLSearchParams(window.location.search).get('view') as AdminTab|null
    if(view&&adminTabs.includes(view))return view
    return 'dashboard'
  })

  useEffect(() => { const view = new URLSearchParams(location.search).get('view'); if (view && adminTabs.includes(view as AdminTab)) setTab(view as AdminTab) }, [location.search])

  const [statsError,setStatsError]=useState<string|null>(null)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const adminTourSteps = useMemo(() => shellTourSteps('admin', tab), [tab])

  function loadStats() {
    api<AdminStats>('/api/admin/dashboard').then(res => {
        if(res.ok){setStats(res.data);setStatsError(null)}
        else setStatsError(res.error.message)
    })
  }

  async function loadAdminLegalPreferences() {
    setLegalGateLoading(true)
    setLegalGateError(null)
    const res = await api<LegalPreferencesState>('/api/auth/legal-preferences')
    if (res.ok) setAdminLegalPreferences(res.data)
    else {
      setAdminLegalPreferences(null)
      setLegalGateError(res.error.message)
    }
    setLegalGateLoading(false)
  }

  useEffect(() => {
    setAppMode('admin')
    if(props.tenant) {
        setTenant(props.tenant)
        applyTenantTheme(props.tenant)
    }
    api<{ user: SessionUser | null; isTestMode?: boolean }>('/api/auth/me').then(res => {
        if(res.ok) {
            setMe(res.data.user)
            if (res.data.user?.role === 'ADMIN') void loadAdminLegalPreferences()
            else setLegalGateLoading(false)
            if (typeof res.data.isTestMode === 'boolean') {
                const serverMode = res.data.isTestMode
                setIsTestMode(serverMode)
                localStorage.setItem('lashdesigner_test_mode', String(serverMode))
            }
        }
        else {
             // Redirect immediately if not logged in to avoid hanging state
             setLegalGateLoading(false)
             nav('/login')
             return
        }
        setAuthLoading(false)
    })

    loadStats()
  }, [])

  useEffect(() => {
    if (authLoading || !me || me.role !== 'ADMIN' || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('lumaCredits') !== 'return') return
    setTab('assistant')
    const orderNsu = localStorage.getItem('lashdesigner_pending_luma_credit_order')
    if (!orderNsu) return
    api<{ order: { status: string; credits: number }; balance: number }>(`/api/admin/assistant/credits/order-status?orderNsu=${encodeURIComponent(orderNsu)}`).then((result) => {
      if (!result.ok) return
      if (result.data.order.status === 'PAID') {
        localStorage.removeItem('lashdesigner_pending_luma_credit_order')
        notify(`${result.data.order.credits} créditos da Luma adicionados. Saldo extra: ${result.data.balance}.`, 'success')
      } else {
        notify('Pagamento recebido. Os créditos serão liberados assim que o provedor confirmar a transação.', 'info')
      }
    })
  }, [authLoading, me])

  const subscriptionActive = Boolean(me && (!me.billingRecovery && (String(me.subscriptionStatus ?? '').toUpperCase() === 'ACTIVE' || isTestMode)))
  const subscriptionInactive = Boolean(me?.role === 'ADMIN' && !subscriptionActive)

  useEffect(() => {
    if (subscriptionInactive && tab !== 'billing' && tab !== 'support') setTab('billing')
  }, [subscriptionInactive, tab])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 900px)').matches) return
    const page = document.getElementById('main-content')
    page?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [tab])

  if (authLoading) {
      return (
        <Shell
          title="Visão Geral"
          subtitle="Seu estúdio"
          user={me}
          brand={tenant}
          isTestMode={isTestMode}
          sidebar={
            <div className="ld-nav-group">
              <div className="ld-nav-section">Principal</div>
              <SidebarItem active icon={<LayoutDashboard size={18}/>} label="Início" onClick={() => {}} />
              <SidebarItem icon={<Calendar size={18}/>} label="Agenda" onClick={() => {}} />
              <SidebarItem icon={<Users size={18}/>} label="Clientes" onClick={() => {}} />
            </div>
          }
        >
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16}}>
            <div className="card skeleton-card skeleton" style={{height: 140}} />
            <div className="card skeleton-card skeleton" style={{height: 140}} />
            <div className="card skeleton-card skeleton" style={{height: 140}} />
          </div>
        </Shell>
      )
  }

  if (!me || me.role !== 'ADMIN') {
      return (
          <div className="authContainer">
              <div className="authCard">
                  <div className="text-center">
                      <h1 className="authTitle">Acesso Negado</h1>
                      <p className="authDesc">Área restrita para administradores.</p>
                      <button type="button" className="btn btnPrimary w-full" onClick={() => nav('/login')}>Ir para Login</button>
                  </div>
              </div>
          </div>
      )
  }

  const legalAcceptanceCurrent = Boolean(adminLegalPreferences?.latestAcceptance
    && adminLegalPreferences.latestAcceptance.termsVersion === adminLegalPreferences.currentDocuments.termsVersion
    && adminLegalPreferences.latestAcceptance.privacyVersion === adminLegalPreferences.currentDocuments.privacyVersion
    && adminLegalPreferences.latestAcceptance.bundleHash === adminLegalPreferences.currentDocuments.bundleHash)

  if (legalGateLoading) {
    return <div className="authContainer"><div className="authCard skeleton skeleton-card" style={{height: 260}} /></div>
  }

  if (legalGateError || !adminLegalPreferences) {
    return <main className="legal-acceptance-screen"><section className="legal-acceptance-card"><div className="security-settings-icon"><ShieldCheck size={20} aria-hidden="true" /></div><span>Verificação necessária</span><h1>Não foi possível validar os documentos da conta.</h1><p>{legalGateError ?? 'Tente novamente antes de acessar o painel.'}</p><button type="button" className="btn btnPrimary" onClick={() => void loadAdminLegalPreferences()}>Tentar novamente</button></section></main>
  }

  if (!legalAcceptanceCurrent) {
    return <LegalAcceptanceGate documents={adminLegalPreferences.currentDocuments} onAccepted={() => void loadAdminLegalPreferences()} />
  }

  function goTab(next: typeof tab) {
    setTab(next)
    const params = new URLSearchParams(location.search)
    params.delete('ticket')
    if (next !== 'dashboard') params.set('view', next)
    else params.delete('view')
    nav({ pathname: location.pathname, search: params.toString() })
  }

  return (
    <Shell
        title={subscriptionInactive && tab !== 'support' ? 'Assinatura' : ({dashboard: 'Visão Geral', calendar: 'Agenda', services: 'Serviços', team: 'Equipe', clients: 'Clientes', finance: 'Financeiro', settings: 'Configurações', evolution: 'WhatsApp', billing: 'Assinatura', assistant: 'Luma', referrals: 'Indicações', support: 'Suporte'} as const)[tab]}
        subtitle="Seu estúdio"
        actions={!subscriptionInactive && tab !== 'assistant' ? <LumaContextAction screen={tab}/> : null}
        user={me}
        brand={tenant}
        isTestMode={isTestMode}
        tourKey={`admin-${tab}`}
        tourSteps={adminTourSteps}
        tourEnabled={!subscriptionInactive}
        autoStartTour={!subscriptionInactive && tab === 'dashboard'}
        mobileNav={subscriptionInactive ? undefined : [
          { key: 'dashboard', label: 'Início', icon: <LayoutDashboard size={21}/>, active: tab === 'dashboard', onClick: () => goTab('dashboard') },
          { key: 'calendar', label: 'Agenda', icon: <Calendar size={21}/>, active: tab === 'calendar', onClick: () => goTab('calendar') },
          { key: 'clients', label: 'Clientes', icon: <Users size={21}/>, active: tab === 'clients', onClick: () => goTab('clients') },
          { key: 'evolution', label: 'WhatsApp', icon: <MessageSquare size={21}/>, active: tab === 'evolution', onClick: () => goTab('evolution') },
        ]}
        mobileMoreActive={!subscriptionInactive && !['dashboard', 'calendar', 'clients', 'evolution'].includes(tab)}
        sidebar={
            <div className="ld-nav-group">
                {subscriptionInactive ? (
                  <>
                    <div className="ld-nav-section">Conta</div>
                    <SidebarItem active icon={<CreditCard size={18}/>} label="Ativar assinatura" onClick={() => goTab('billing')} />
                  </>
                ) : (
                  <>
                    <div className="ld-nav-section">Principal</div>
                    <SidebarItem active={tab === 'dashboard'} icon={<LayoutDashboard size={18}/>} label="Início" onClick={() => goTab('dashboard')} />
                    <SidebarItem active={tab === 'calendar'} icon={<Calendar size={18}/>} label="Agenda" onClick={() => goTab('calendar')} />
                    <SidebarItem active={tab === 'clients'} icon={<Users size={18}/>} label="Clientes" onClick={() => goTab('clients')} />
                    <div className="ld-nav-section ld-nav-section--spaced">Gestão</div>
                    <SidebarItem active={tab === 'team'} icon={<Users size={18}/>} label="Equipe" onClick={() => goTab('team')} />
                    <SidebarItem active={tab === 'services'} icon={<ImageIcon size={18}/>} label="Serviços" onClick={() => goTab('services')} />
                    <SidebarItem active={tab === 'finance'} icon={<Wallet size={18}/>} label="Financeiro" onClick={() => goTab('finance')} />
                    <SidebarItem active={tab === 'evolution'} icon={<MessageSquare size={18}/>} label="WhatsApp" onClick={() => goTab('evolution')} />
                    <SidebarItem active={tab === 'assistant'} icon={<Sparkles size={18}/>} label="Luma" onClick={() => goTab('assistant')} />
                    <div className="ld-nav-section ld-nav-section--spaced">Sistema</div>
                    <SidebarItem active={tab === 'referrals'} icon={<HeartHandshake size={18}/>} label="Indicações" onClick={() => goTab('referrals')} />
                    <SidebarItem active={tab === 'billing'} icon={<CreditCard size={18}/>} label="Assinatura" onClick={() => goTab('billing')} />
                    <SidebarItem active={tab === 'settings'} icon={<Settings size={18}/>} label="Configurações" onClick={() => goTab('settings')} />
                  </>
                )}
                <SidebarItem active={tab === 'support'} icon={<MessageSquare size={18}/>} label="Suporte" onClick={() => goTab('support')} />
                <SidebarItem icon={<LogOut size={18}/>} label="Sair" onClick={async () => {
                     await api('/api/auth/logout', {method: 'POST'})
                     window.location.href = '/'
                }} />
            </div>
        }
    >
        <Suspense fallback={<AdminAreaLoading />}>
          {subscriptionInactive ? (
              tab === 'support' ? <SupportCenter role="ADMIN" /> : <BillingCenter locked />
          ) : (
              <>
                {tab === 'dashboard' ? <AdminDashboard me={me} stats={stats} dataError={statsError} onRefresh={loadStats} onOpenAgenda={() => goTab('calendar')} /> : null}

                {tab === 'support' ? <SupportCenter role="ADMIN" /> : null}

                {tab === 'services' ? <AdminServices /> : null}
                {tab === 'team' ? <AdminTeam onServices={() => goTab('services')} onBilling={() => goTab('billing')} /> : null}

                {tab === 'clients' ? <AdminClients /> : null}

                {tab === 'finance' ? <AdminFinance /> : null}

                {tab === 'calendar' ? <AdminCalendar /> : null}

                {tab === 'evolution' ? <AdminEvolutionAPI /> : null}

                {tab === 'assistant' ? <BusinessAssistant /> : null}

                {tab === 'referrals' ? <ReferralCenter /> : null}

                {tab === 'billing' ? <BillingCenter /> : null}

                {tab === 'settings' ? (
                    <AdminSettings tenant={tenant} onUpdate={(updatedTenant) => {
                        setTenant(updatedTenant)
                        applyTenantTheme(updatedTenant)
                    }} />
                ) : null}
                {tab !== 'support' ? <WorkspaceSetup tenant={tenant} onComplete={(updatedTenant) => {
                  if (updatedTenant) {
                    setTenant(updatedTenant)
                    applyTenantTheme(updatedTenant)
                  }
                  loadStats()
                }} /> : null}
                {tab !== 'assistant' ? <LumaChatLauncher floating={false} /> : null}
              </>
          )}
        </Suspense>
    </Shell>
  )
}



