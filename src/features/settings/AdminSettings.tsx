import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { TenantPublic } from '../../types'
import { applyTenantTheme } from '../../theme'
import { ColorPicker } from '../../components/ColorPicker'
import { CustomDomainsSettings } from '../../components/CustomDomainsSettings'
import { PasswordChecklist } from '../../components/PasswordChecklist'
import { formatBrazilPhoneInput, normalizeBrazilPhone } from '../../phone'
import { configuredExternalLink, fileToOptimizedDataUrl, formatBRL } from '../../lib/runtime'
import { confirmAction, notify } from '../../components/FeedbackCenter'
import { EmptyState } from '../../components/SharedUi'
import { BellRing, Image as ImageIcon, Lock, ShieldCheck, Smartphone, Trash2 } from '../../components/Icons'

type SecurityDevice = {
    id: string
    label: string
    createdAt: string
    lastUsedAt: string
    expiresAt: string
    current?: boolean
}

type SecuritySession = {
    id: string
    trustedDeviceId: string | null
    persistent: number | boolean
    createdAt: string
    lastSeenAt: string
    expiresAt: string
    userAgent: string | null
    current?: boolean
}

type SecurityState = {
    phone: string | null
    whatsappMfaReady: boolean
    devices: SecurityDevice[]
    sessions: SecuritySession[]
}

export type LegalPreferencesState = {
    whatsappPromotions: boolean
    marketingConsentText: string
    currentDocuments: { termsVersion: string; privacyVersion: string; bundleHash: string }
    latestAcceptance: { termsVersion: string; privacyVersion: string; bundleHash: string; acceptedAt: string } | null
}

export function SecuritySettingsCard({ title = 'Segurança da conta' }: { title?: string }) {
    const [state, setState] = useState<SecurityState | null>(null)
    const [loading, setLoading] = useState(true)
    const [busyDevice, setBusyDevice] = useState<string | null>(null)
    const [busySession, setBusySession] = useState<string | null>(null)
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [savingPassword, setSavingPassword] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [securityPhone, setSecurityPhone] = useState('')
    const [phonePassword, setPhonePassword] = useState('')
    const [phoneBusy, setPhoneBusy] = useState(false)
    const [phoneError, setPhoneError] = useState<string | null>(null)
    const [legalPreferences, setLegalPreferences] = useState<LegalPreferencesState | null>(null)
    const [legalPreferencesBusy, setLegalPreferencesBusy] = useState(false)

    async function loadSecurityState() {
        setLoading(true)
        const res = await api<SecurityState>('/api/auth/security')
        if (res.ok) {
            setState(res.data)
            setSecurityPhone(res.data.phone ? formatBrazilPhoneInput(res.data.phone) : '')
        } else notify(res.error.message, 'error')
        setLoading(false)
    }

    async function loadLegalPreferences() {
        const res = await api<LegalPreferencesState>('/api/auth/legal-preferences')
        if (res.ok) setLegalPreferences(res.data)
    }

    useEffect(() => {
        void loadSecurityState()
        void loadLegalPreferences()
    }, [])

    async function updatePlatformMarketingPreference(next: boolean) {
        if (!legalPreferences || legalPreferencesBusy) return
        setLegalPreferencesBusy(true)
        const res = await api<{ ok: boolean; whatsappPromotions: boolean }>('/api/auth/legal-preferences', {
            method: 'PUT',
            body: JSON.stringify({ whatsappPromotions: next }),
        })
        setLegalPreferencesBusy(false)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        setLegalPreferences((current) => current ? { ...current, whatsappPromotions: res.data.whatsappPromotions } : current)
        notify(next ? 'Comunicações promocionais ativadas.' : 'Comunicações promocionais desativadas.', 'success')
    }

    async function changePassword() {
        setPasswordError(null)
        if (newPassword.length < 8) {
            setPasswordError('A nova senha precisa ter pelo menos 8 caracteres.')
            return
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('A confirmação não corresponde à nova senha.')
            return
        }
        setSavingPassword(true)
        const res = await api<{ ok: boolean }>('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        })
        setSavingPassword(false)
        if (!res.ok) {
            setPasswordError(res.error.message)
            return
        }
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        notify('Senha alterada. As outras sessões foram encerradas.', 'success')
        void loadSecurityState()
    }

    async function saveSecurityPhone() {
        setPhoneError(null)
        const normalizedPhone = normalizeBrazilPhone(securityPhone)
        if (!normalizedPhone) {
            setPhoneError('Informe um WhatsApp brasileiro válido, com DDD.')
            return
        }
        if (!phonePassword) {
            setPhoneError('Informe sua senha atual para alterar o WhatsApp de segurança.')
            return
        }
        setPhoneBusy(true)
        const res = await api<{ phone: string }>('/api/auth/security/phone', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword: phonePassword, phone: normalizedPhone }),
        })
        setPhoneBusy(false)
        if (!res.ok) {
            setPhoneError(res.error.message)
            return
        }
        setPhonePassword('')
        setSecurityPhone(formatBrazilPhoneInput(res.data.phone))
        setState(current => current ? { ...current, phone: res.data.phone, whatsappMfaReady: true } : current)
        notify('WhatsApp de segurança atualizado.', 'success')
    }

    async function revokeDevice(device: SecurityDevice) {
        if (!(await confirmAction({ title: 'Remover dispositivo confiável', message: `Remover ${device.current ? 'este dispositivo confiável' : `o dispositivo “${device.label}”`}?`, confirmLabel: 'Remover', danger: true }))) return
        setBusyDevice(device.id)
        const res = await api<{ ok: boolean; currentSessionRevoked?: boolean }>(`/api/auth/security/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' })
        setBusyDevice(null)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        if (res.data.currentSessionRevoked) {
            window.location.href = '/'
            return
        }
        notify('Dispositivo removido.', 'success')
        void loadSecurityState()
    }

    async function revokeAllDevices() {
        if (!(await confirmAction({ title: 'Remover dispositivos confiáveis', message: 'Remover todos os dispositivos confiáveis? Os acessos vinculados serão encerrados.', confirmLabel: 'Remover todos', danger: true }))) return
        setBusyDevice('all')
        const res = await api<{ ok: boolean }>('/api/auth/security/devices/revoke-all', { method: 'POST' })
        setBusyDevice(null)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        notify('Todos os dispositivos confiáveis foram removidos.', 'success')
        void loadSecurityState()
    }

    async function revokeSessionItem(session: SecuritySession) {
        if (!(await confirmAction({ title: 'Encerrar sessão', message: session.current ? 'Encerrar esta sessão agora?' : 'Encerrar esta sessão ativa?', confirmLabel: 'Encerrar sessão', danger: true }))) return
        setBusySession(session.id)
        const res = await api<{ ok: boolean; currentSessionRevoked?: boolean }>(`/api/auth/security/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' })
        setBusySession(null)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        if (res.data.currentSessionRevoked) {
            window.location.href = '/'
            return
        }
        notify('Sessão encerrada.', 'success')
        void loadSecurityState()
    }

    async function revokeAllSessions() {
        if (!(await confirmAction({ title: 'Encerrar todas as sessões', message: 'Encerrar todas as sessões desta conta? Você precisará entrar novamente.', confirmLabel: 'Encerrar todas', danger: true }))) return
        setBusySession('all')
        const res = await api<{ ok: boolean }>('/api/auth/logout-all', { method: 'POST' })
        setBusySession(null)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        window.location.href = '/'
    }

    const activeSessions = state?.sessions.length ?? 0

    return (
        <div className="card security-settings-card">
            <div className="cardHeader settings-card-header">
                <div>
                    <h2 className="cardTitle">{title}</h2>
                    <p className="cardDesc">Senha, verificação pelo WhatsApp, dispositivos e sessões autorizadas.</p>
                </div>
                <span className={`status-badge ${state?.whatsappMfaReady ? 'status-success' : 'status-warning'}`}>
                    {loading ? 'Verificando…' : state?.whatsappMfaReady ? 'WhatsApp configurado' : 'WhatsApp pendente'}
                </span>
            </div>
            <div className="cardBody security-settings-body">
                <section className="security-settings-section" aria-labelledby="security-password-title">
                    <div className="security-settings-section-head">
                        <div className="security-settings-icon"><Lock size={18} aria-hidden="true" /></div>
                        <div><strong id="security-password-title">Alterar senha</strong><span>Ao trocar, as outras sessões são encerradas.</span></div>
                    </div>
                    <div className="form-stack security-password-form">
                        <div className="input-group"><label className="label" htmlFor="security-current-password">Senha atual</label><input id="security-current-password" className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div>
                        <div className="security-password-grid">
                            <div className="input-group"><label className="label" htmlFor="security-new-password">Nova senha</label><input id="security-new-password" className="input" type="password" autoComplete="new-password" minLength={8} aria-describedby="security-password-requirements" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
                            <div className="input-group"><label className="label" htmlFor="security-confirm-password">Confirmar nova senha</label><input id="security-confirm-password" className="input" type="password" autoComplete="new-password" minLength={8} aria-describedby="security-password-requirements" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div>
                        </div>
                        <PasswordChecklist id="security-password-requirements" password={newPassword} confirmation={confirmPassword} />
                        {passwordError ? <p className="form-error" role="alert">{passwordError}</p> : null}
                        <div className="form-actions"><button type="button" className="btn btnPrimary" onClick={changePassword} disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}>{savingPassword ? 'Alterando…' : 'Alterar senha'}</button></div>
                    </div>
                </section>

                <section className="security-settings-section" aria-labelledby="security-mfa-title">
                    <div className="security-settings-section-head">
                        <div className="security-settings-icon"><ShieldCheck size={18} aria-hidden="true" /></div>
                        <div><strong id="security-mfa-title">Verificação pelo WhatsApp</strong><span>Em um dispositivo novo, enviaremos um código de 6 dígitos para este número.</span></div>
                    </div>
                    <div className="form-stack security-password-form">
                        <div className="security-password-grid">
                            <div className="input-group">
                                <label className="label" htmlFor="security-phone">WhatsApp de segurança</label>
                                <input id="security-phone" className="input" inputMode="tel" autoComplete="tel" value={securityPhone} onChange={(e) => setSecurityPhone(formatBrazilPhoneInput(e.target.value))} placeholder="(11) 99999-9999" aria-invalid={Boolean(securityPhone && !normalizeBrazilPhone(securityPhone))} />
                            </div>
                            <div className="input-group">
                                <label className="label" htmlFor="security-phone-password">Senha atual</label>
                                <input id="security-phone-password" className="input" type="password" autoComplete="current-password" value={phonePassword} onChange={(e) => setPhonePassword(e.target.value)} />
                            </div>
                        </div>
                        {phoneError ? <p className="form-error" role="alert">{phoneError}</p> : null}
                        <div className="form-actions"><button type="button" className="btn" onClick={saveSecurityPhone} disabled={phoneBusy || !normalizeBrazilPhone(securityPhone) || !phonePassword}>{phoneBusy ? 'Salvando…' : state?.phone ? 'Alterar WhatsApp' : 'Cadastrar WhatsApp'}</button></div>
                        <div className="form-hint">O WhatsApp é usado somente como segundo fator de acesso profissional. Dispositivos confiáveis continuam dispensando o código por até 365 dias.</div>
                    </div>
                </section>

                <section className="security-settings-section" aria-labelledby="trusted-devices-title">
                    <div className="security-settings-section-head security-settings-section-head--split">
                        <div className="security-settings-heading">
                            <div className="security-settings-icon"><Smartphone size={18} aria-hidden="true" /></div>
                            <div><strong id="trusted-devices-title">Dispositivos confiáveis</strong><span>{activeSessions} {activeSessions === 1 ? 'sessão ativa' : 'sessões ativas'} nesta conta.</span></div>
                        </div>
                        {(state?.devices.length ?? 0) > 1 ? <button type="button" className="btn security-revoke-all" onClick={revokeAllDevices} disabled={busyDevice === 'all'}>{busyDevice === 'all' ? 'Removendo…' : 'Remover todos'}</button> : null}
                    </div>

                    {loading ? <div className="security-device-empty">Carregando dispositivos…</div> : state?.devices.length ? (
                        <div className="security-device-list">
                            {state.devices.map((device) => (
                                <div className="security-device-row" key={device.id}>
                                    <div className="security-device-copy">
                                        <div className="security-device-title"><strong>{device.label}</strong>{device.current ? <span className="status-badge status-success">Este dispositivo</span> : null}</div>
                                        <span>Último acesso: {new Date(device.lastUsedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · confiável até {new Date(device.expiresAt).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <button type="button" className="btn" onClick={() => revokeDevice(device)} disabled={busyDevice === device.id}>{busyDevice === device.id ? 'Removendo…' : 'Remover'}</button>
                                </div>
                            ))}
                        </div>
                    ) : <div className="security-device-empty">Nenhum dispositivo está marcado como confiável. Um novo login profissional exigirá um código pelo WhatsApp.</div>}
                </section>

                <section className="security-settings-section" aria-labelledby="active-sessions-title">
                    <div className="security-settings-section-head security-settings-section-head--split">
                        <div className="security-settings-heading">
                            <div className="security-settings-icon"><ShieldCheck size={18} aria-hidden="true" /></div>
                            <div><strong id="active-sessions-title">Sessões ativas</strong><span>Encerre acessos individualmente ou invalide todos de uma vez.</span></div>
                        </div>
                        {(state?.sessions.length ?? 0) > 1 ? <button type="button" className="btn security-revoke-all" onClick={revokeAllSessions} disabled={busySession === 'all'}>{busySession === 'all' ? 'Encerrando…' : 'Encerrar todas'}</button> : null}
                    </div>
                    {loading ? <div className="security-device-empty">Carregando sessões…</div> : state?.sessions.length ? (
                        <div className="security-device-list">
                            {state.sessions.map((session) => (
                                <div className="security-device-row" key={session.id}>
                                    <div className="security-device-copy">
                                        <div className="security-device-title"><strong>{session.current ? 'Sessão atual' : session.trustedDeviceId ? 'Sessão em dispositivo confiável' : 'Sessão autenticada'}</strong>{session.current ? <span className="status-badge status-success">Esta sessão</span> : null}</div>
                                        <span>Última atividade: {new Date(session.lastSeenAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · expira em {new Date(session.expiresAt).toLocaleDateString('pt-BR')}</span>
                                    </div>
                                    <button type="button" className="btn" onClick={() => revokeSessionItem(session)} disabled={busySession === session.id}>{busySession === session.id ? 'Encerrando…' : 'Encerrar'}</button>
                                </div>
                            ))}
                        </div>
                    ) : <div className="security-device-empty">Nenhuma sessão ativa.</div>}
                </section>

                <section className="security-settings-section" aria-labelledby="legal-communications-title">
                    <div className="security-settings-section-head security-settings-section-head--split">
                        <div className="security-settings-heading">
                            <div className="security-settings-icon"><BellRing size={18} aria-hidden="true" /></div>
                            <div><strong id="legal-communications-title">Comunicações do Lash Designer</strong><span>Novidades, recursos e ofertas da própria plataforma. Essa autorização é opcional e não interfere no uso do produto.</span></div>
                        </div>
                        {legalPreferences ? <button type="button" className={`btn ${legalPreferences.whatsappPromotions ? '' : 'btnPrimary'}`} onClick={() => void updatePlatformMarketingPreference(!legalPreferences.whatsappPromotions)} disabled={legalPreferencesBusy}>{legalPreferencesBusy ? 'Salvando…' : legalPreferences.whatsappPromotions ? 'Desativar promoções' : 'Quero receber'}</button> : null}
                    </div>
                    <div className="legal-settings-meta">
                        <p>{legalPreferences?.marketingConsentText ?? 'Carregando preferência…'}</p>
                        <div><a href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</a><a href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</a></div>
                        {legalPreferences?.latestAcceptance ? <>
                            <small>Último aceite registrado em {new Date(legalPreferences.latestAcceptance.acceptedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · Termos {legalPreferences.latestAcceptance.termsVersion} · Privacidade {legalPreferences.latestAcceptance.privacyVersion}</small>
                            <div className="legal-settings-proof-links"><a href={`/termos?accepted=${encodeURIComponent(legalPreferences.latestAcceptance.bundleHash)}`} target="_blank" rel="noopener noreferrer">Ver Termos aceitos</a><a href={`/privacidade?accepted=${encodeURIComponent(legalPreferences.latestAcceptance.bundleHash)}`} target="_blank" rel="noopener noreferrer">Ver Privacidade aceita</a></div>
                        </> : <small>O aceite contratual é registrado no fluxo de contratação.</small>}
                    </div>
                </section>
            </div>
        </div>
    )
}

export function AdminSettings({ tenant, onUpdate }: { tenant: TenantPublic | null; onUpdate?: (tenant: TenantPublic) => void }) {
    const [name, setName] = useState(tenant?.name ?? '')
    const [primaryColor, setPrimaryColor] = useState(tenant?.primaryColor ?? '#b43a68')
    const [logoUrl, setLogoUrl] = useState(tenant?.logoUrl ?? '')
    const [saving, setSaving] = useState(false)

    // Logo state
    const [logoBusy, setLogoBusy] = useState(false)
    const [logoError, setLogoError] = useState<string | null>(null)
    const logoInputRef = useRef<HTMLInputElement>(null)

    const [billingLoading, setBillingLoading] = useState(true)
    type BillingOrder = {
        orderNsu: string
        amountCents: number
        status: string
        receiptUrl: string | null
        createdAt: string
        paidAt: string | null
    }
    const [billingOrders, setBillingOrders] = useState<BillingOrder[]>([])
    const [subscription, setSubscription] = useState<
        | null
        | {
              id: string
              externalId: string | null
              status: string
              currentPeriodEnd: string | null
              createdAt: string
              updatedAt: string
          }
    >(null)

    // Update state when tenant changes
    useEffect(() => {
        if(tenant) {
            setName(tenant.name)
            setPrimaryColor(tenant.primaryColor)
            setLogoUrl(tenant.logoUrl || '')
        }
    }, [tenant])

    useEffect(() => {
        let mounted = true
        setBillingLoading(true)
        api<{ subscription: typeof subscription; orders: BillingOrder[] }>('/api/admin/billing/overview').then((res) => {
            if (!mounted) return
            if (res.ok) {
                setSubscription(res.data.subscription)
                setBillingOrders(res.data.orders ?? [])
            }
            setBillingLoading(false)
        })
        return () => {
            mounted = false
        }
    }, [])

    async function handleLogoFile(file: File) {
        setLogoBusy(true)
        setLogoError(null)
        try {
            if (!file.type.startsWith('image/')) {
                setLogoError('Arquivo inválido (envie uma imagem)')
                return
            }
            const dataUrl = await fileToOptimizedDataUrl(file)
            setLogoUrl(dataUrl)
        } catch {
            setLogoError('Falha ao processar a imagem')
        } finally {
            setLogoBusy(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        setLogoError(null)
        try {
            const nextName = name.trim()
            const nextPrimaryColor = primaryColor.trim()
            const nextLogo = logoUrl.trim()
            const payload: Record<string, unknown> = {}

            if (!tenant || nextName !== tenant.name) payload.name = nextName
            if (!tenant || nextPrimaryColor !== tenant.primaryColor) payload.primaryColor = nextPrimaryColor
            const currentLogo = (tenant?.logoUrl ?? '') || ''
            if (!tenant || nextLogo !== currentLogo) payload.logoUrl = nextLogo ? nextLogo : null

            if (Object.keys(payload).length === 0) return

            const res = await api<{ tenant: TenantPublic }>('/api/admin/tenant', {
                method: 'PATCH',
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                setLogoError(res.error.message)
                return
            }

            applyTenantTheme(res.data.tenant)
            onUpdate?.(res.data.tenant)
            notify('Configurações salvas com sucesso!', 'success')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="settings-page">
            <div className="settings-grid">
            <div className="settings-column">
                <div className="card">
                    <div className="cardHeader settings-card-header">
                        <div><h2 className="cardTitle">Identidade visual</h2><p className="cardDesc">Personalize a aparência do seu espaço.</p></div>
                    </div>
                    <div className="cardBody">
                        <div className="form-stack">
                            <div className="input-group">
                                <label className="label">Nome do Espaço</label>
                                <input className="input" value={name} onChange={e => setName(e.target.value)} />
                            </div>

                            <div className="input-group">
                                <label className="label">Logo</label>
                                <div className="settings-logo-field">
                                    <div className="settings-logo-preview">
                                        {logoUrl ? (
                                            <img decoding="async" src={logoUrl} alt="Logo atual do espaço" />
                                        ) : (
                                            <ImageIcon size={24} aria-hidden="true" />
                                        )}
                                        {logoBusy && <div className="spinner settings-logo-spinner" />}
                                    </div>
                                    <div className="settings-logo-controls">
                                        <div className="settings-logo-actions">
                                            <button type="button" className="btn" onClick={() => logoInputRef.current?.click()} disabled={logoBusy}>Trocar logo</button>
                                            {logoUrl && <button type="button" className="icon-btn domain-delete" onClick={() => setLogoUrl('')} aria-label="Remover logo"><Trash2 size={16} /></button>}
                                        </div>
                                        <p className="form-help">Use uma imagem nítida, em PNG, JPG ou WebP.</p>
                                        {logoError && <p className="form-error" role="alert">{logoError}</p>}
                                    </div>
                                    <input type="file" ref={logoInputRef} className="visually-hidden" accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; if(f) void handleLogoFile(f); e.currentTarget.value = '' }} />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="label">Cor Principal</label>
                                <ColorPicker
                                    value={primaryColor}
                                    onChange={setPrimaryColor}
                                />
                            </div>

                            <div className="form-actions">
                                <button type="button" className="btn btnPrimary" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="settings-column">
                <SecuritySettingsCard />
                <div className="card">
                    <div className="cardHeader">
                        <h2 className="cardTitle">Assinatura</h2>
                        {billingLoading ? (
                            <span className="status-badge skeleton skeleton-pill" style={{width: 80}} />
                        ) : subscription?.status?.toUpperCase?.() === 'ACTIVE' ? (
                            <span className="status-badge status-success">Ativa</span>
                        ) : subscription ? (
                            <span className="status-badge status-warning">{subscription.status}</span>
                        ) : (
                            <span className="status-badge status-warning">Sem assinatura</span>
                        )}
                    </div>
                    <div className="cardBody">
                        <div className="settings-subscription-summary">
                            <div className="settings-subscription-head"><div><span>Plano atual</span><strong>{subscription ? 'Assinatura' : '—'}</strong><small>{subscription ? `Status: ${subscription.status}` : 'Nenhuma assinatura encontrada para este espaço.'}</small></div><span className="billing-plan-mark">ANUAL</span></div>
                            <p>Acesso válido até: <strong>{subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR') : '—'}</strong></p>
                        </div>
                        <p className="billing-note">O plano é anual e a renovação acontece por um novo checkout. Nenhuma cobrança recorrente é iniciada por esta tela.</p>
                    </div>
                </div>

                <div className="card">
                    <div className="cardHeader">
                        <h2 className="cardTitle">Histórico de Faturas</h2>
                    </div>
                    <div className="table-scroll">
                        <table className="data-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Valor</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {billingOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={4}>
                                        <EmptyState compact image="/empty-states/empty-finance.png" title="Nenhum pagamento registrado" description="Os pedidos e comprovantes aparecerão aqui depois do primeiro checkout." />
                                    </td>
                                </tr>
                            ) : billingOrders.map((order) => {
                                const receiptUrl = configuredExternalLink(order.receiptUrl)
                                const status = order.status.toUpperCase()
                                const statusLabel = status === 'PAID' ? 'Pago' : status === 'PENDING' ? 'Pendente' : status === 'FAILED' ? 'Falhou' : order.status
                                const statusClass = status === 'PAID' ? 'status-success' : status === 'PENDING' ? 'status-pending' : 'status-warning'
                                return (
                                    <tr key={order.orderNsu}>
                                        <td>{new Date(order.paidAt || order.createdAt).toLocaleDateString('pt-BR')}</td>
                                        <td>{formatBRL(order.amountCents / 100)}</td>
                                        <td><span className={`status-badge ${statusClass}`}>{statusLabel}</span></td>
                                        <td>{receiptUrl ? <a className="table-link" href={receiptUrl} target="_blank" rel="noopener noreferrer">Comprovante</a> : '—'}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        <CustomDomainsSettings />
        </div>
    )
}
