import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import './client-portal.css'
import { api } from '../../api'
import type { SessionUser, TenantPublic } from '../../types'
import type { ClientAppointment } from '../shared/types'
import { applyTenantTheme, setAppMode } from '../../theme'
import { formatBrazilPhoneInput, normalizeBrazilPhone } from '../../phone'
import { appointmentPresenceMeta, withBasePath } from '../../lib/runtime'
import { formatDateTimeInZone } from '../../dateTime'
import { shellTourSteps } from '../../lib/tourSteps'
import { Shell } from '../../layouts/Shell'
import { EmptyState, SidebarItem } from '../../components/SharedUi'
import { ArrowRight, Calendar, ChevronLeft, ClipboardList, Clock, LogOut, ShieldCheck, Smartphone } from '../../components/Icons'

export function ClientPortal(props: { tenant?: TenantPublic; tenantSlug?: string; basePath?: string } = {}) {
    const { tenantSlug } = useParams()
    const nav = useNavigate()
    const slug = (props.tenantSlug ?? tenantSlug ?? '').trim().toLowerCase()
    const basePath = props.basePath ?? (slug ? `/${slug}` : '')
    const [resolvedTenant, setResolvedTenant] = useState<TenantPublic | null>(props.tenant ?? null)
    const [me, setMe] = useState<SessionUser | null>(null)
    const [authLoading, setAuthLoading] = useState(true)
    const [appointments, setAppointments] = useState<ClientAppointment[]>([])
    const [appointmentsLoading,setAppointmentsLoading] = useState(true)
    const [appointmentsError,setAppointmentsError] = useState<string|null>(null)
    const [appointmentsReload,setAppointmentsReload] = useState(0)
    const [tenantTimeZone, setTenantTimeZone] = useState('America/Sao_Paulo')
    const [accessPhone, setAccessPhone] = useState('')
    const [accessCode, setAccessCode] = useState('')
    const [accessStage, setAccessStage] = useState<'phone' | 'code'>('phone')
    const [accessBusy, setAccessBusy] = useState(false)
    const [accessError, setAccessError] = useState<string | null>(null)
    const [marketingPreferences, setMarketingPreferences] = useState<{ whatsappPromotions: boolean } | null>(null)
    const [marketingBusy, setMarketingBusy] = useState(false)
    const [marketingError, setMarketingError] = useState<string | null>(null)
    const clientTourSteps = useMemo(() => shellTourSteps('client', 'appointments'), [])

    useEffect(() => {
        setAppMode('tenant')
        if (props.tenant) applyTenantTheme(props.tenant)
        api<{ user: SessionUser | null }>('/api/auth/me').then(res => {
            if(res.ok) setMe(res.data.user)
            setAuthLoading(false)
        })
    }, [])

    useEffect(() => {
        if (props.tenant) return
        api<{ tenant: TenantPublic }>(slug ? `/api/public/tenant/${encodeURIComponent(slug)}` : '/api/public/tenant').then((res) => {
            if (!res.ok) return
            setResolvedTenant(res.data.tenant)
            applyTenantTheme(res.data.tenant)
        })
        api<{ timezone: string }>(slug ? `/api/public/tenant/${encodeURIComponent(slug)}/booking` : '/api/public/booking').then((res) => {
            if (res.ok && res.data?.timezone) setTenantTimeZone(res.data.timezone)
        })
    }, [slug, props.tenant])

    useEffect(() => {
        if (!me || me.role !== 'CLIENT') return
        const controller = new AbortController()
        setAppointmentsLoading(true); setAppointmentsError(null); setAppointments([])
        api<{appointments: ClientAppointment[]; timezone?:string}>('/api/client/appointments',{signal:controller.signal}).then(res => {
            if(controller.signal.aborted)return
            if(res.ok){setAppointments(res.data.appointments);if(res.data.timezone)setTenantTimeZone(res.data.timezone)}
            else setAppointmentsError(res.error.message)
            setAppointmentsLoading(false)
        })
        api<{preferences: { whatsappPromotions: boolean }}>('/api/client/marketing-preferences',{signal:controller.signal}).then(res => {
            if(!controller.signal.aborted && res.ok) setMarketingPreferences(res.data.preferences)
        })
        return () => controller.abort()
    }, [me,appointmentsReload])

    async function updateMarketingPreference(nextValue: boolean) {
        if (marketingBusy) return
        setMarketingBusy(true)
        setMarketingError(null)
        const res = await api<{ preferences: { whatsappPromotions: boolean } }>('/api/client/marketing-preferences', {
            method: 'PUT',
            body: JSON.stringify({ whatsappPromotions: nextValue }),
        })
        setMarketingBusy(false)
        if (!res.ok) { setMarketingError(res.error.message); return }
        setMarketingPreferences(res.data.preferences)
    }

  if (authLoading) {
        return (
            <Shell title="Minha Área" subtitle="Carregando..." sidebar={<div className="nav" />}>
                <div style={{maxWidth: 640, margin: '40px auto 0'}}>
                    <div className="card skeleton skeleton-card" style={{height: 180}} />
                </div>
            </Shell>
        )
    }

    if (!me || me.role !== 'CLIENT') {
        async function requestAccess() {
            if (accessBusy) return
            if (!normalizeBrazilPhone(accessPhone)) { setAccessError('Informe um WhatsApp brasileiro válido, com DDD.'); return }
            setAccessBusy(true); setAccessError(null)
            const res = await api<{ sent: true }>('/api/public/client-access/request', { method: 'POST', body: JSON.stringify({ tenantSlug: slug, phone: normalizeBrazilPhone(accessPhone) ?? accessPhone }) })
            setAccessBusy(false)
            if (!res.ok) { setAccessError(res.error.message); return }
            setAccessStage('code')
        }
        async function verifyAccess() {
            if (accessBusy) return
            if (!/^\d{6}$/.test(accessCode.trim())) { setAccessError('Digite o código de 6 números enviado no WhatsApp.'); return }
            setAccessBusy(true); setAccessError(null)
            const res = await api<{ user: SessionUser }>('/api/public/client-access/verify', { method: 'POST', body: JSON.stringify({ tenantSlug: slug, phone: normalizeBrazilPhone(accessPhone) ?? accessPhone, code: accessCode.trim() }) })
            setAccessBusy(false)
            if (!res.ok) { setAccessError(res.error.message); return }
            setMe(res.data.user)
        }
        return (
            <main className="client25-access">
              <section className="client25-access-card" aria-labelledby="client-access-title">
                <button type="button" className="client25-back" onClick={() => nav(withBasePath(basePath, '/'))}><ChevronLeft size={17}/> Voltar</button>
                <div className="client25-access-brand"><span><Smartphone size={20}/></span><div><strong>Meus horários</strong><small>{resolvedTenant?.name ?? 'Lash Designer'}</small></div></div>
                <div className="client25-access-copy"><span>Acesso simples</span><h1 id="client-access-title">{accessStage === 'phone' ? 'Entre com seu WhatsApp.' : 'Confira seu WhatsApp.'}</h1><p>{accessStage === 'phone' ? 'Sem e-mail e sem senha. Em um aparelho novo, confirmamos que o número é seu.' : `Enviamos um código de 6 números para ${accessPhone}. Ele expira em poucos minutos.`}</p></div>
                <form onSubmit={(event) => { event.preventDefault(); void (accessStage === 'phone' ? requestAccess() : verifyAccess()) }} aria-busy={accessBusy}>
                {accessStage === 'phone' ? <label className="client25-field"><span>WhatsApp com DDD</span><input name="phone" disabled={accessBusy} aria-invalid={Boolean(accessError)} aria-describedby={accessError ? "client-access-error" : undefined} value={accessPhone} onChange={(e) => { setAccessPhone(formatBrazilPhoneInput(e.target.value)); setAccessError(null) }} placeholder="(11) 99999-9999 ou +55…" inputMode="tel" autoComplete="tel" maxLength={20} autoFocus /></label> : <label className="client25-field"><span>Código de acesso</span><input name="code" disabled={accessBusy} aria-invalid={Boolean(accessError)} aria-describedby={accessError ? "client-access-error" : undefined} value={accessCode} onChange={(e) => { setAccessCode(e.target.value.replace(/\D/g,'').slice(0,6)); setAccessError(null) }} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" autoFocus /></label>}
                {accessError ? <div id="client-access-error" className="client25-access-error" role="alert">{accessError}</div> : null}
                <button type="submit" className="client25-access-submit" disabled={accessBusy}>{accessBusy ? 'Aguarde…' : accessStage === 'phone' ? 'Continuar pelo WhatsApp' : 'Entrar nos meus horários'} <ArrowRight size={17}/></button>
                {accessStage === 'code' ? <div className="client25-access-secondary"><button type="button" className="client25-change-phone" disabled={accessBusy} onClick={requestAccess}>Reenviar código</button><span aria-hidden="true">·</span><button type="button" className="client25-change-phone" disabled={accessBusy} onClick={() => { setAccessStage('phone'); setAccessCode(''); setAccessError(null) }}>Usar outro número</button></div> : null}
                </form>
                <small className="client25-access-note"><ShieldCheck size={14}/> Neste navegador, sua sessão fica lembrada. Novo dispositivo pede confirmação novamente.</small>
              </section>
            </main>
        )
    }

    return (
        <Shell
            title="Minha Área"
            subtitle="Painel do Cliente"
            brand={props.tenant}
            tourKey="client-appointments"
            tourSteps={clientTourSteps}
            autoStartTour
            sidebar={
                <div className="ld-nav-group">
                    <SidebarItem icon={<Calendar size={18}/>} label="Agendar Novo" onClick={() => nav(withBasePath(basePath, '/agendar'))} />
                    <SidebarItem active icon={<ClipboardList size={18}/>} label="Meus Agendamentos" onClick={() => {}} />
                    <div className="navDivider" />
                    <SidebarItem icon={<LogOut size={18}/>} label="Sair" onClick={async () => {
                        await api('/api/auth/logout', {method: 'POST'})
                        nav(withBasePath(basePath, '/'))
                    }} />
                </div>
            }
        >
            <div className="column" style={{gap: '1.5rem'}}>
            <div className="card">
                <div className="cardHeader"><h2 className="cardTitle">Meus Agendamentos</h2></div>

                {appointmentsLoading ? <div className="cardBody" role="status">Carregando seus agendamentos…</div> : appointmentsError ? <div className="cardBody"><p role="alert">{appointmentsError}</p><button type="button" className="btn btnPrimary" onClick={() => setAppointmentsReload(value => value+1)}>Tentar novamente</button></div> : <>
                {/* Desktop Table View */}
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{paddingLeft: 24}}>Serviço</th>
                                <th>Data e Horário</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.length === 0 ? (
                                <tr><td colSpan={3}><EmptyState compact image="/empty-states/empty-calendar.png" title="Nenhum agendamento encontrado" /></td></tr>
                            ) : (
                                appointments.map(a => {
                                    const meta = appointmentPresenceMeta(a.status, a.confirmationStatus)
                                    const statusLabel = meta.label
                                    const statusClass = meta.className

                                    return (
                                        <tr key={a.id}>
                                            <td style={{fontWeight: 600, paddingLeft: 24}}>{a.serviceName}{a.professionalName ? <small style={{display:'block',fontWeight:400,color:'var(--text-muted)',marginTop:4,whiteSpace:'normal',overflowWrap:'anywhere'}}>Com {a.professionalName}</small> : null}</td>
                                            <td>{formatDateTimeInZone(a.startsAt, tenantTimeZone)}</td>
                                            <td><span className={`status-badge ${statusClass}`}>{statusLabel}</span></td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile List View */}
                <div className="mobile-appointment-list" style={{padding: '1.5rem'}}>
                    {appointments.length === 0 ? <EmptyState image="/empty-states/empty-calendar.png" title="Nenhum agendamento" description="Seus próximos horários aparecerão aqui." /> : null}
                    {appointments.map(a => {
                            const meta = appointmentPresenceMeta(a.status, a.confirmationStatus)
                            const statusLabel = meta.label
                            const statusClass = meta.className

                            return (
                                <div className="mobile-appointment-card" key={a.id}>
                                    <div className="mobile-appointment-header">
                                        <div style={{fontWeight: 700, color: 'var(--gray-900)'}}>{a.serviceName}</div>
                                        <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                                    </div>
                                    {a.professionalName ? <div style={{fontSize:'.85rem',color:'var(--text-muted)',marginTop:6,overflowWrap:'anywhere'}}>Com {a.professionalName}</div> : null}
                            <div className="mobile-appointment-row">
                                        <div style={{display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gray-600)'}}>
                                            <Clock size={14} />
                                            {formatDateTimeInZone(a.startsAt, tenantTimeZone)}
                                        </div>
                                    </div>
                                </div>
                            )
                    })}
                </div>
                </>}
            </div>
            {marketingPreferences ? <section className="client27-comms" aria-label="Preferências de comunicação">
                <div className="client27-comms-copy"><span>Comunicação</span><h2>Novidades no WhatsApp</h2><p>{marketingPreferences.whatsappPromotions ? 'Você autorizou ofertas e novidades.' : 'Promoções desativadas.'}</p><small>Preferência opcional para novidades deste estúdio. Você pode mudar quando quiser.</small></div>
                <button type="button" className="btn btn-ghost" role="switch" aria-checked={marketingPreferences.whatsappPromotions} aria-label="Receber novidades deste estúdio no WhatsApp" disabled={marketingBusy} onClick={() => void updateMarketingPreference(!marketingPreferences.whatsappPromotions)}>{marketingBusy ? 'Salvando…' : marketingPreferences.whatsappPromotions ? 'Desativar' : 'Ativar'}</button>
                {marketingError ? <p role="alert">{marketingError}</p> : null}
            </section> : null}
            </div>
        </Shell>
    )
}

