import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { SessionUser, TenantDev, TenantPublic } from '../../types'
import { getDevTheme, initDevTheme, setAppMode, toggleDevTheme, type DevThemeMode, getDevPrimaryColor, setDevPrimaryColor } from '../../theme'
import { ColorPicker } from '../../components/ColorPicker'
import { shellTourSteps } from '../../lib/tourSteps'
import { DevReferrals } from '../../components/DevReferrals'
import { ProductSelect } from '../../components/ProductSelect'
import { PasswordChecklist } from '../../components/PasswordChecklist'
import { formatBrazilPhoneInput, normalizeBrazilPhone } from '../../phone'
import { configuredPlatformHostname, fileToOptimizedDataUrl } from '../../lib/runtime'
import { confirmAction, notify } from '../../components/FeedbackCenter'
import { ModalRoot } from '../../components/ModalRoot'
import { SidebarItem, Switch } from '../../components/SharedUi'
import { Shell } from '../../layouts/Shell'
import { SecuritySettingsCard } from '../settings/AdminSettings'
import {
  LayoutDashboard,
  LogOut,
  Settings,
  Search,
  Plus,
  X,
  ChevronRight,
  Image as ImageIcon,
  Trash2,
  ShieldCheck,
  Moon,
  Sun,
  Palette,
  Globe,
  Webhook,
  Database,
  HeartHandshake,
  MessageSquare,
} from '../../components/Icons'

const SupportCenter = lazy(() => import('../support/SupportCenter').then(module => ({ default: module.SupportCenter })))

function NewTenantModal({
    isOpen,
    onClose,
    onSuccess
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [logoError, setLogoError] = useState<string | null>(null)
    const [logoBusy, setLogoBusy] = useState(false)
    const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload')
    const [logoFileName, setLogoFileName] = useState<string | null>(null)
    const logoFileInputRef = useRef<HTMLInputElement | null>(null)
    const [data, setData] = useState({
        name: '',
        slug: '',
        adminEmail: '',
        adminPhone: '',
        adminPassword: '',
        primaryColor: '#b43a68', // Lash Designer default
        logoUrl: ''
    })

    useEffect(() => {
        if (isOpen) return
        setStep(1)
        setLoading(false)
        setSubmitError(null)
        setLogoError(null)
        setLogoBusy(false)
        setLogoMode('upload')
        setLogoFileName(null)
        setData({ name: '', slug: '', adminEmail: '', adminPhone: '', adminPassword: '', primaryColor: '#b43a68', logoUrl: '' })
        if (logoFileInputRef.current) logoFileInputRef.current.value = ''
    }, [isOpen])

    if (!isOpen) return null

    async function handleLogoFile(file: File) {
        setLogoBusy(true)
        setLogoError(null)
        setSubmitError(null)
        try {
            if (!file.type.startsWith('image/')) {
                setLogoError('Arquivo inválido (envie uma imagem)')
                return
            }
            const dataUrl = await fileToOptimizedDataUrl(file)
            if (!dataUrl.startsWith('data:image/')) {
                setLogoError('Falha ao processar a imagem')
                return
            }
            if (dataUrl.length > 250_000) {
                setLogoError('Imagem muito grande. Use uma menor.')
                return
            }
            setLogoFileName(file.name)
            setData((d) => ({ ...d, logoUrl: dataUrl }))
        } catch {
            setLogoError('Falha ao processar a imagem')
        } finally {
            setLogoBusy(false)
        }
    }

    async function handleSubmit() {
        setLoading(true)
        setSubmitError(null)
        try {
            const res = await api<{ tenant: TenantPublic } | { tenant: TenantDev }>('/api/dev/tenants', {
                method: 'POST',
                body: JSON.stringify({
                    name: data.name,
                    slug: data.slug,
                    adminEmail: data.adminEmail,
                    adminPhone: data.adminPhone,
                    adminPassword: data.adminPassword,
                    primaryColor: data.primaryColor,
                    logoUrl: data.logoUrl
                })
            })

            if (!res.ok) {
                setSubmitError(res.error.message)
                return
            }
            onSuccess()
            onClose()
        } catch {
            setSubmitError('Erro ao criar espaço')
        } finally {
            setLoading(false)
        }
    }

    return (
        <ModalRoot className="modal-overlay" onClick={loading ? undefined : onClose}>
            <div className="ld-dialog ld-dialog--tenant" role="dialog" aria-modal="true" aria-labelledby="new-tenant-title" onClick={e => e.stopPropagation()}>
                <header className="ld-dialog-header tenant-create-header">
                    <div className="tenant-create-heading">
                        <h3 id="new-tenant-title" className="cardTitle">Novo Espaço</h3>
                        <div className="modal-heading-actions"><div className="pill tenant-step-pill">Passo {step} de 2</div><button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Fechar" disabled={loading}><X size={18}/></button></div>
                    </div>
                    <p className="tenant-create-subtitle">
                        {step === 1 ? 'Informações básicas e acesso' : 'Personalização da marca'}
                    </p>
                </header>

                <div className="ld-dialog-body tenant-create-body">
                    {step === 1 ? (
                        <div className="form-stack">
                            <div className="input-group">
                                <label className="label">Nome do Espaço</label>
                                <div className="input-wrapper">
                                    <input
                                        className="input"
                                        value={data.name}
                                        onChange={e => setData({...data, name: e.target.value})}
                                        placeholder="Ex: Studio Bella"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="label">URL (Slug)</label>
                                <div className="tenant-slug-field">
                                    <input className="input" value={data.slug} onChange={e => setData({...data, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})} placeholder="studiobella" />
                                    <span aria-label="Domínio final">.{configuredPlatformHostname()}</span>
                                </div>
                            </div>

                            <div className="tenant-access-grid">
                                <div className="input-group">
                                    <label className="label">Email Admin</label>
                                    <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={data.adminEmail} onChange={e => setData({...data, adminEmail: e.target.value})} />
                                </div>
                                <div className="input-group">
                                    <label className="label">WhatsApp Admin</label>
                                    <input className="input" inputMode="tel" autoComplete="tel" value={data.adminPhone} onChange={e => setData({...data, adminPhone: formatBrazilPhoneInput(e.target.value)})} placeholder="(11) 99999-9999" aria-invalid={Boolean(data.adminPhone && !normalizeBrazilPhone(data.adminPhone))} />
                                </div>
                                <div className="input-group">
                                    <label className="label">Senha Admin</label>
                                    <input className="input" type="password" autoComplete="new-password" minLength={8} aria-describedby="tenant-admin-password-requirements" value={data.adminPassword} onChange={e => setData({...data, adminPassword: e.target.value})} />
                                    <PasswordChecklist id="tenant-admin-password-requirements" password={data.adminPassword} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="form-stack">
                            <div className="input-group">
                                <label className="label">Cor Principal</label>
                                <ColorPicker
                                    value={data.primaryColor}
                                    onChange={(c) => setData({...data, primaryColor: c})}
                                />
                            </div>

                            <div className="input-group">
                                <label className="label">Logo (Opcional)</label>
                                <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => {
                                            setLogoMode('upload')
                                            setLogoError(null)
                                        }}
                                        style={{
                                            borderColor: logoMode === 'upload' ? 'var(--text-muted)' : 'var(--border)',
                                            background: logoMode === 'upload' ? 'var(--bg-subtle)' : 'transparent'
                                        }}
                                    >
                                        Enviar arquivo
                                    </button>
                                    <button
                                        type="button"
                                        className="btn"
                                        onClick={() => {
                                            setLogoMode('url')
                                            setLogoError(null)
                                        }}
                                        style={{
                                            borderColor: logoMode === 'url' ? 'var(--text-muted)' : 'var(--border)',
                                            background: logoMode === 'url' ? 'var(--bg-subtle)' : 'transparent'
                                        }}
                                    >
                                        Usar URL
                                    </button>
                                    {(data.logoUrl || logoFileName) && (
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => {
                                                setLogoError(null)
                                                setLogoFileName(null)
                                                setData((d) => ({ ...d, logoUrl: '' }))
                                                if (logoFileInputRef.current) logoFileInputRef.current.value = ''
                                            }}
                                        >
                                            Remover
                                        </button>
                                    )}
                                </div>

                                {logoMode === 'upload' ? (
                                    <div style={{marginTop: 10}}>
                                        <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
                                            <button
                                                type="button"
                                                className="btn"
                                                disabled={logoBusy}
                                                onClick={() => logoFileInputRef.current?.click()}
                                            >
                                                {logoBusy ? 'Processando...' : 'Escolher imagem'}
                                            </button>
                                            <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                                                {logoFileName ? logoFileName : data.logoUrl?.startsWith('data:image/') ? 'Imagem carregada' : 'PNG/JPG/WebP'}
                                            </div>
                                        </div>
                                        <input
                                            ref={logoFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            style={{display: 'none'}}
                                            onChange={(e) => {
                                                const f = e.target.files?.[0]
                                                if (!f) return
                                                handleLogoFile(f)
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div style={{marginTop: 10}}>
                                        <div className="input-wrapper">
                                            <input
                                                className="input"
                                                value={data.logoUrl}
                                                onChange={(e) => {
                                                    setLogoError(null)
                                                    setLogoFileName(null)
                                                    setData({ ...data, logoUrl: e.target.value })
                                                }}
                                                placeholder="https://..."
                                            />
                                        </div>
                                    </div>
                                )}

                                {logoError && (
                                    <div style={{marginTop: 10, color: 'var(--danger)', fontSize: '0.85rem'}}>{logoError}</div>
                                )}
                            </div>

                            <div className="preview-card" style={{marginTop: 16, padding: 16, borderRadius: 8, background: 'var(--bg-subtle)', border: '1px dashed var(--border)'}}>
                                <div style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, color: 'var(--text-muted)'}}>Preview</div>
                                <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12}}>
                                    <div
                                        style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: 12,
                                            border: '1px solid var(--border)',
                                            background: 'var(--bg-main)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {data.logoUrl ? (
                                            <img decoding="async"
                                                src={data.logoUrl}
                                                alt="Logo"
                                                style={{width: '100%', height: '100%', objectFit: 'cover'}}
                                                onError={() => setLogoError('Logo inválida (URL ou imagem)')}
                                            />
                                        ) : (
                                            <ImageIcon size={18} style={{color: 'var(--text-muted)'}} />
                                        )}
                                    </div>
                                    <div style={{minWidth: 0}}>
                                        <div style={{fontWeight: 700, lineHeight: 1.1}}>{data.name || 'Seu Espaço'}</div>
                                        <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{data.slug ? `${data.slug}.${configuredPlatformHostname()}` : `espaco.${configuredPlatformHostname()}`}</div>
                                    </div>
                                </div>
                                <span className="btn btnPrimary" style={{background: data.primaryColor, borderColor: data.primaryColor}} aria-hidden="true">Botão Principal</span>
                            </div>
                        </div>
                    )}

                    {submitError && (
                        <div className="pill" style={{marginTop: 16, color: 'var(--danger)'}}>
                            {submitError}
                        </div>
                    )}
                </div>

                <footer className="ld-dialog-footer tenant-create-footer">
                    {step === 2 ? (
                        <button type="button" className="btn" onClick={() => setStep(1)} disabled={loading}>Voltar</button>
                    ) : (
                        <button type="button" className="btn" data-modal-close onClick={onClose} disabled={loading}>Cancelar</button>
                    )}

                    {step === 1 ? (
                        <button type="button" className="btn btnPrimary" onClick={() => setStep(2)} disabled={!data.name || !data.slug || !data.adminEmail || !normalizeBrazilPhone(data.adminPhone) || data.adminPassword.length < 8}>
                            Próximo <ChevronRight size={16} style={{marginLeft: 8}}/>
                        </button>
                    ) : (
                        <button type="button" className="btn btnPrimary" onClick={handleSubmit} disabled={loading}>
                            {loading ? 'Criando...' : 'Criar Espaço'}
                        </button>
                    )}
                </footer>
            </div>
        </ModalRoot>
    )
}

function DevUsers() {
    const [users, setUsers] = useState<{id: string, email: string, phone: string | null, createdAt: string}[]>([])
    const [loading, setLoading] = useState(true)
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [password, setPassword] = useState('')
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        load()
    }, [])

    async function load() {
        setLoading(true)
        const res = await api<{users: {id: string, email: string, phone: string | null, createdAt: string}[]}>('/api/dev/users')
        if(res.ok) setUsers(res.data.users)
        setLoading(false)
    }

    async function create() {
        if(!email || !normalizeBrazilPhone(phone) || !password) return
        setCreating(true)
        setError(null)
        const res = await api<{user: {id: string, email: string, phone: string, createdAt: string}}>('/api/dev/users', {
            method: 'POST',
            body: JSON.stringify({ email, phone, password })
        })
        if(res.ok) {
            setUsers(prev => [res.data.user, ...prev])
            setEmail('')
            setPhone('')
            setPassword('')
        } else {
            setError(res.error.message)
        }
        setCreating(false)
    }

    async function remove(id: string) {
        if (!(await confirmAction({ title: 'Remover usuário DEV', message: 'O acesso será revogado imediatamente e não poderá ser recuperado.', confirmLabel: 'Remover usuário', danger: true }))) return
        const res = await api<{ok: boolean}>(`/api/dev/users/${id}`, { method: 'DELETE' })
        if(res.ok) {
            setUsers(prev => prev.filter(u => u.id !== id))
        } else {
            notify(res.error.message, 'error')
        }
    }

    return (
        <div style={{maxWidth: 800, margin: '0 auto', width: '100%'}}>
            <div className="card">
                <div className="cardHeader">
                    <h2 className="cardTitle">Usuários do Sistema</h2>
                </div>
                <div className="cardBody">
                    <div className="form-stack" style={{marginBottom: 24}}>
                        <div className="row">
                            <div className="input-group">
                                <label className="label">Novo Usuário (Email)</label>
                                <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                            </div>
                            <div className="input-group">
                                <label className="label">WhatsApp</label>
                                <input className="input" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(formatBrazilPhoneInput(e.target.value))} placeholder="(11) 99999-9999" aria-invalid={Boolean(phone && !normalizeBrazilPhone(phone))} />
                            </div>
                            <div className="input-group">
                                <label className="label">Senha</label>
                                <input className="input" type="password" autoComplete="new-password" minLength={8} aria-describedby="dev-user-password-requirements" value={password} onChange={e => setPassword(e.target.value)} placeholder="Crie uma senha" />
                                <PasswordChecklist id="dev-user-password-requirements" password={password} />
                            </div>
                        </div>
                        {error && <div className="pill" style={{color: 'var(--danger)'}}>{error}</div>}
                        <button type="button" className="btn btnPrimary" onClick={create} disabled={creating || !email || !normalizeBrazilPhone(phone) || password.length < 8} style={{alignSelf: 'flex-start'}}>
                            {creating ? 'Criando...' : 'Adicionar Usuário'}
                        </button>
                    </div>

                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>WhatsApp</th>
                                    <th>Criado em</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} style={{padding: 20}}>
                                            <div className="skeleton skeleton-text" style={{width: 120, margin: '0 auto'}} />
                                        </td>
                                    </tr>
                                ) : users.map(u => (
                                    <tr key={u.id}>
                                        <td>{u.email}</td>
                                        <td>{u.phone ? formatBrazilPhoneInput(u.phone) : '—'}</td>
                                        <td>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                                        <td style={{textAlign: 'right'}}>
                                            <button type="button" className="icon-btn" onClick={() => remove(u.id)} style={{color: 'var(--danger)', marginLeft: 'auto'}} aria-label={`Remover usuário ${u.email}`}>
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}

function DevIntegrations() {
    const [settings, setSettings] = useState({ url: '', apiKey: '' })
    const [hasApiKey, setHasApiKey] = useState(false)
    const [instanceName, setInstanceName] = useState('lashdesigner-global')
    const [connectionState, setConnectionState] = useState('UNKNOWN')
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [connectionBusy, setConnectionBusy] = useState(false)

    async function loadEvolution() {
        setLoading(true)
        const [configRes, statusRes] = await Promise.all([
            api<{ config: { url: string; instanceName: string; hasApiKey: boolean } }>('/api/dev/evolution/config'),
            api<{ state: string; instanceName: string }>('/api/dev/evolution/status'),
        ])
        if (configRes.ok) {
            setSettings({ url: configRes.data.config.url, apiKey: '' })
            setHasApiKey(configRes.data.config.hasApiKey)
            setInstanceName(configRes.data.config.instanceName)
        } else notify(configRes.error.message, 'error')
        if (statusRes.ok) {
            setConnectionState(statusRes.data.state)
            setInstanceName(statusRes.data.instanceName)
        }
        setLoading(false)
    }

    useEffect(() => { void loadEvolution() }, [])

    async function saveEvolution() {
        setSaving(true)
        const res = await api<{ ok: true }>('/api/dev/evolution/config', {
            method: 'PUT',
            body: JSON.stringify({
                ...(settings.url.trim() ? { url: settings.url.trim() } : {}),
                ...(settings.apiKey.trim() ? { apiKey: settings.apiKey.trim() } : {}),
            }),
        })
        setSaving(false)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        if (settings.apiKey.trim()) setHasApiKey(true)
        setSettings(current => ({ ...current, apiKey: '' }))
        notify('Evolution API Global atualizada.', 'success')
        void refreshEvolutionStatus()
    }

    async function refreshEvolutionStatus() {
        const res = await api<{ state: string; instanceName: string }>('/api/dev/evolution/status')
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        setConnectionState(res.data.state)
        setInstanceName(res.data.instanceName)
        if (res.data.state === 'OPEN' || res.data.state === 'CONNECTED') setQrCode(null)
    }

    async function connectEvolution() {
        setConnectionBusy(true)
        const res = await api<{ state: string; qrCode: string | null; instanceName: string }>('/api/dev/evolution/connect', { method: 'POST' })
        setConnectionBusy(false)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        setConnectionState(res.data.state)
        setInstanceName(res.data.instanceName)
        setQrCode(res.data.qrCode)
        if (!res.data.qrCode) window.setTimeout(() => void refreshEvolutionStatus(), 1200)
    }

    async function disconnectEvolution() {
        if (!(await confirmAction({ title: 'Desconectar Evolution API Global', message: 'O MFA por WhatsApp ficará indisponível até a instância global ser reconectada.', confirmLabel: 'Desconectar', danger: true }))) return
        setConnectionBusy(true)
        const res = await api<{ ok: true; state: string }>('/api/dev/evolution/disconnect', { method: 'DELETE' })
        setConnectionBusy(false)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        setConnectionState(res.data.state)
        setQrCode(null)
        notify('Instância global desconectada.', 'success')
    }

    const connected = ['OPEN', 'CONNECTED'].includes(connectionState.toUpperCase())
    const statusLabel = connectionState === 'NOT_CONFIGURED' ? 'Não configurada' : connected ? 'Online' : connectionState === 'QR_SCAN' ? 'Aguardando QR Code' : connectionState === 'OFFLINE' || connectionState === 'DISCONNECTED' ? 'Offline' : connectionState

    if (loading) {
        return (
            <div style={{maxWidth: 800, margin: '0 auto', width: '100%'}}>
                <div className="card skeleton skeleton-card" style={{height: 260}} />
            </div>
        )
    }

    return (
        <div style={{maxWidth: 800, margin: '0 auto', width: '100%'}}>
            <div className="card">
                <div className="cardHeader">
                    <div>
                        <h2 className="cardTitle">Integrações Globais</h2>
                        <p className="cardDesc">Serviços compartilhados pela plataforma e infraestrutura de autenticação.</p>
                    </div>
                </div>
                <div className="cardBody">
                    <h4 style={{fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 12, marginTop: 0}}>InfinitePay</h4>
                    <div className="integration-note">
                        O checkout é configurado no servidor pelas variáveis <code>INFINITEPAY_HANDLE</code>, <code>APP_BASE_URL</code> e <code>SUBSCRIPTION_PRICE_CENTS</code>. As chaves não ficam expostas no painel.
                    </div>

                    <div style={{height: 1, background: 'var(--border)', margin: '24px 0'}} />

                    <div className="settings-card-header">
                        <div>
                            <h4 style={{fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0}}>Evolution API Global</h4>
                            <p className="cardDesc" style={{marginTop: 6}}>Usada pelo MFA profissional e como credencial global da plataforma. Cada espaço mantém sua própria instância de WhatsApp para preservar isolamento das conversas.</p>
                        </div>
                        <span className={`status-badge ${connected ? 'status-success' : connectionState === 'NOT_CONFIGURED' ? 'status-warning' : 'status-danger'}`}>{statusLabel}</span>
                    </div>

                    <div className="form-stack" style={{marginTop: 18}}>
                        <div className="input-group">
                            <label className="label" htmlFor="dev-evolution-url">Base URL</label>
                            <input id="dev-evolution-url" className="input" value={settings.url} onChange={e => setSettings(current => ({ ...current, url: e.target.value }))} placeholder="https://api.evolution.exemplo.com" />
                        </div>
                        <div className="input-group">
                            <label className="label" htmlFor="dev-evolution-key">Global API Key</label>
                            <input id="dev-evolution-key" className="input" type="password" value={settings.apiKey} onChange={e => setSettings(current => ({ ...current, apiKey: e.target.value }))} placeholder={hasApiKey ? 'Chave configurada — digite somente para substituir' : 'Cole uma chave com pelo menos 16 caracteres'} autoComplete="new-password" />
                            <div className="form-hint">A API Key é criptografada no banco e nunca é retornada pela API.</div>
                        </div>
                        <div className="integration-note">Instância global: <code>{instanceName}</code>. Para o primeiro deploy, <code>EVOLUTION_API_URL</code> e <code>EVOLUTION_API_KEY</code> podem servir como fallback de bootstrap até a configuração ser salva aqui.</div>
                    </div>

                    <div className="form-actions" style={{marginTop: 18, flexWrap: 'wrap'}}>
                        <button type="button" className="btn btnPrimary" onClick={saveEvolution} disabled={saving || (!settings.url.trim() && !settings.apiKey.trim())}>{saving ? 'Salvando…' : 'Salvar configuração'}</button>
                        <button type="button" className="btn" onClick={connectEvolution} disabled={connectionBusy || !settings.url.trim() || !hasApiKey}>{connectionBusy ? 'Processando…' : connected ? 'Reconectar' : 'Conectar / mostrar QR'}</button>
                        <button type="button" className="btn" onClick={() => void refreshEvolutionStatus()} disabled={connectionBusy}>Atualizar status</button>
                        {connected || connectionState === 'QR_SCAN' ? <button type="button" className="btn" onClick={disconnectEvolution} disabled={connectionBusy}>Desconectar</button> : null}
                    </div>

                    {qrCode ? (
                        <div className="integration-note dev-evolution-qr">
                            <strong>Leia no WhatsApp da plataforma</strong>
                            <img className="dev-evolution-qr-image" src={qrCode} alt="QR Code para conectar a Evolution API Global" />
                            <span>Use o aparelho que enviará os códigos de verificação do Lash Designer.</span>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

function DevBackup() {
    const handleExport = () => {
        const link = document.createElement('a')
        link.href = '/api/dev/backup/export'
        link.setAttribute('download', 'lashdesigner-backup.db')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <div style={{maxWidth: 860, margin: '0 auto', width: '100%'}}>
            <div className="card">
                <div className="cardHeader">
                    <h2 className="cardTitle">Backup e recuperação</h2>
                    <p className="cardDesc">Exporte uma cópia consistente e siga o procedimento operacional para qualquer restauração.</p>
                </div>
                <div className="cardBody">
                    <div className="grid grid-2 backup-grid" style={{gap: 24}}>
                        <div className="backup-operation-card">
                            <div>
                                <div className="backup-operation-icon"><Database size={24} /></div>
                                <h3>Exportação manual</h3>
                                <p>Gera uma cópia consistente do SQLite usando a API de backup do banco. Guarde o arquivo em local criptografado e fora da VPS.</p>
                            </div>
                            <button type="button" className="btn btnPrimary" onClick={handleExport}>
                                Baixar backup (.db)
                            </button>
                        </div>

                        <div className="backup-operation-card">
                            <div>
                                <div className="backup-operation-icon"><ShieldCheck size={24} /></div>
                                <h3>Restauração segura</h3>
                                <p>A restauração não é executada pelo navegador. O script para o serviço, valida checksum e integridade, instala o banco e faz rollback se o health check falhar.</p>
                            </div>
                            <div className="integration-note backup-command">
                                <code>sudo /opt/lashdesigner/app/deploy/restore.sh /caminho/backup.sqlite.gz</code>
                            </div>
                        </div>
                    </div>

                    <div className="backup-warning">
                        <ShieldCheck size={20} />
                        <div>
                            <strong>Backup automático já previsto</strong>
                            <span>O timer systemd executa cópias diárias com checksum e retenção local. Configure também uma cópia externa criptografada e teste a restauração periodicamente em ambiente separado.</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function Dev() {
    const nav = useNavigate()
    const testModeAvailable = !import.meta.env.PROD
    const [me, setMe] = useState<SessionUser | null>(null)
    const [tenants, setTenants] = useState<TenantDev[]>([])
    const [loading, setLoading] = useState(true)
    const [testMode, setTestMode] = useState(() => {
        if (testModeAvailable && typeof window !== 'undefined') return localStorage.getItem('lashdesigner_test_mode') === 'true'
        return false
    })
    const [showNew, setShowNew] = useState(false)
    const location = useLocation()
    useEffect(() => { if (new URLSearchParams(location.search).get('view') === 'support') setTab('support') }, [location.search])
    const [tab, setTab] = useState<'tenants' | 'settings' | 'integrations' | 'backups' | 'referrals' | 'support'>(new URLSearchParams(window.location.search).get('view') === 'support' ? 'support' : 'tenants')
    const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
    const [devTheme, setDevTheme] = useState<DevThemeMode>(() => getDevTheme())
    const [devColor, setDevColor] = useState<string>(() => getDevPrimaryColor() ?? '#972d57')
    const [searchTerm, setSearchTerm] = useState('')
    const [platformOverview, setPlatformOverview] = useState<{ totals: { total: number; active: number; disabled: number }; activeSubscriptions: number; pendingOrders: number; ai30d: { requests: number; tokens: number } } | null>(null)
    const devTourSteps = useMemo(() => shellTourSteps('dev', tab), [tab])

    useEffect(() => {
        setAppMode('dev')
        initDevTheme('light')
        setDevTheme(getDevTheme())
        api<{user: SessionUser | null; isTestMode?: boolean}>('/api/auth/me').then(res => {
            if(res.ok && res.data.user?.role === 'DEV') {
                setMe(res.data.user)
                if (testModeAvailable && typeof res.data.isTestMode === 'boolean') {
                    const serverMode = res.data.isTestMode
                    setTestMode(serverMode)
                    localStorage.setItem('lashdesigner_test_mode', String(serverMode))
                } else {
                    setTestMode(false)
                    localStorage.removeItem('lashdesigner_test_mode')
                }
            }
            else nav('/login')
        })
        api<{ settings: Record<string, string> }>('/api/dev/settings').then(res => {
            if (res.ok) {
                const color = res.data.settings['dev_primary_color']
                if (typeof color === 'string' && color.trim()) {
                    setDevColor(color)
                    setDevPrimaryColor(color)
                }
            }
        })
        loadTenants()
        api<{ totals: { total: number; active: number; disabled: number }; activeSubscriptions: number; pendingOrders: number; ai30d: { requests: number; tokens: number } }>('/api/dev/platform-overview').then((res) => { if (res.ok) setPlatformOverview(res.data) })
    }, [])

    async function loadTenants() {
        setLoading(true)
        const res = await api<{tenants: TenantDev[]}>('/api/dev/tenants')
        if(res.ok) setTenants(res.data.tenants)
        setLoading(false)
    }

    const filteredTenants = useMemo(() => {
        if (!searchTerm) return tenants
        const lower = searchTerm.toLowerCase()
        return tenants.filter(t =>
            t.name.toLowerCase().includes(lower) ||
            t.slug.toLowerCase().includes(lower)
        )
    }, [tenants, searchTerm])

    const subscriptionMeta = (t: TenantDev) => {
        const raw = (t.subscriptionStatus ?? '').trim()
        if (!raw) {
            return {
                label: 'Sem assinatura',
                style: {
                    color: 'var(--text-muted)',
                    background: 'var(--bg-subtle)',
                    border: '1px dashed var(--border)'
                } as CSSProperties
            }
        }

        const v = raw.toUpperCase()
        const isActive = ['ACTIVE', 'PAID', 'TRIAL', 'TRIALING', 'APPROVED'].some((k) => v.includes(k))
        const isPastDue = ['PAST_DUE', 'OVERDUE', 'LATE'].some((k) => v.includes(k))
        const isInactive = ['CANCELLED', 'CANCELED', 'EXPIRED', 'INACTIVE'].some((k) => v.includes(k))
        const isTrial = ['TRIAL', 'TRIALING'].some((k) => v.includes(k))

        const endIso = (t.subscriptionPeriodEnd ?? '').trim()
        const endDate = endIso ? new Date(endIso) : null
        const endText = endDate && Number.isFinite(endDate.getTime()) ? ` até ${endDate.toLocaleDateString('pt-BR')}` : ''

        if (isTrial) {
            return {
                label: `Teste${endText}`,
                className: 'status-pending',
                style: { background: 'var(--status-info-bg)', color: 'var(--status-info-ink)' } as CSSProperties
            }
        }
        if (isActive) {
            return {
                label: `Ativa${endText}`,
                className: 'status-success',
                style: { background: 'var(--status-success-bg)', color: 'var(--status-success-ink)' } as CSSProperties
            }
        }
        if (isPastDue) {
            return {
                label: `Atrasada`,
                className: 'status-warning',
                style: { background: 'var(--status-warning-bg)', color: 'var(--status-warning-ink)' } as CSSProperties
            }
        }
        if (isInactive) {
            return {
                label: `Cancelada`,
                className: 'status-warning',
                style: { background: 'var(--status-danger-bg)', color: 'var(--status-danger-ink)' } as CSSProperties
            }
        }
        return {
            label: `${raw || 'Sem plano'}`,
            className: 'status-warning',
            style: { background: 'var(--bg-subtle)', color: 'var(--text-muted)' } as CSSProperties
        }
    }

    const loadingDev = !me

    return (
        <Shell
            title={tab === 'support' ? 'Atendimento' : 'Developer Console'}
            subtitle="Gestão da Plataforma"
            user={me}
            isTestMode={testMode}
            tourKey={`dev-${tab}`}
            tourSteps={devTourSteps}
            tourEnabled={tab !== 'support'}
            autoStartTour={tab === 'tenants'}
            onSearch={tab === 'tenants' ? setSearchTerm : undefined}
            searchValue={tab === 'tenants' ? searchTerm : undefined}
            actions={
                <div style={{display: 'flex', gap: 20, alignItems: 'center', marginRight: 8}}>
                    {testModeAvailable ? (
                        <>
                            <label
                                className="test-mode-toggle"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    cursor: 'pointer',
                                    opacity: testMode ? 1 : 0.7,
                                    transition: 'opacity 0.2s'
                                }}
                            >
                                <div className="test-mode-label" style={{
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: testMode ? 'var(--text-main)' : 'var(--text-muted)'
                                }}>
                                    Modo de teste
                                </div>
                                <Switch
                                    checked={testMode}
                                    onChange={(val) => {
                                        setTestMode(val)
                                        localStorage.setItem('lashdesigner_test_mode', String(val))
                                        api('/api/dev/test-mode', {
                                            method: 'POST',
                                            body: JSON.stringify({ enabled: val })
                                        }).then(res => {
                                            if (!res.ok) {
                                                setTestMode(!val)
                                                localStorage.setItem('lashdesigner_test_mode', String(!val))
                                                notify('Erro ao atualizar modo de teste no servidor', 'error')
                                            }
                                        })
                                    }}
                                />
                            </label>
                            <div style={{width: 1, height: 24, background: 'var(--border)'}} />
                        </>
                    ) : null}

                    <button type="button"
                        className="icon-btn"
                        style={{
                            width: 36,
                            height: 36,
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)'
                        }}
                        onClick={() => {
                            const next = toggleDevTheme()
                            setDevTheme(next)
                        }}
                        title={devTheme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
                    >
                        {devTheme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>
            }
            sidebar={
                <div className="ld-nav-group">
                    <SidebarItem active={tab === 'tenants'} icon={<LayoutDashboard size={18}/>} label="Tenants" onClick={() => setTab('tenants')} />
                    <SidebarItem active={tab === 'referrals'} icon={<HeartHandshake size={18}/>} label="Indicações" onClick={() => setTab('referrals')} />
                    <SidebarItem active={tab === 'integrations'} icon={<Webhook size={18}/>} label="Integrações" onClick={() => setTab('integrations')} />
                    <SidebarItem active={tab === 'backups'} icon={<Database size={18}/>} label="Backups" onClick={() => setTab('backups')} />
                    <SidebarItem active={tab === 'settings'} icon={<Settings size={18}/>} label="Configurações" onClick={() => setTab('settings')} />
                    <SidebarItem active={tab === 'support'} icon={<MessageSquare size={18}/>} label="Atendimento" onClick={() => setTab('support')} />
                    <div className="navDivider" />
                    <SidebarItem icon={<LogOut size={18}/>} label="Sair" onClick={async () => {
                         await api('/api/auth/logout', {method: 'POST'})
                         window.location.href = '/'
                    }} />
                </div>
            }
        >
            {tab === 'support' ? <Suspense fallback={<p role="status">Carregando atendimento…</p>}><SupportCenter role="DEV" /></Suspense> : null}
            {tab === 'tenants' ? (
                <>
                    <div className="welcome-banner">
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
                            <div>
                                <h1 style={{margin: 0, fontSize: '2rem', fontWeight: 800}}>Painel Developer</h1>
                                <p style={{margin: '8px 0 0', opacity: 0.8}}>Gerencie todos os espaços e assinaturas.</p>
                            </div>
                            <span className="empty-section-mark" aria-hidden="true">LD</span>
                        </div>
                    </div>

                    <div className="platform-metrics" aria-label="Resumo da plataforma">
                      <article><span>Espaços ativos</span><strong>{platformOverview?.totals.active ?? tenants.filter((tenant) => tenant.status === 'ACTIVE').length}</strong><small>de {platformOverview?.totals.total ?? tenants.length} cadastrados</small></article>
                      <article><span>Assinaturas ativas</span><strong>{platformOverview?.activeSubscriptions ?? 0}</strong><small>acesso vigente</small></article>
                      <article><span>Pagamentos pendentes</span><strong>{platformOverview?.pendingOrders ?? 0}</strong><small>aguardando confirmação</small></article>
                      <article><span>Luma · 30 dias</span><strong>{platformOverview?.ai30d.requests ?? 0}</strong><small>{platformOverview?.ai30d.tokens?.toLocaleString('pt-BR') ?? 0} tokens</small></article>
                    </div>

                    <div className="card tenant-directory">
                        <div className="cardHeader" style={{display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap'}}>
                            <div className="tenant-header-group">
                                <h2 className="cardTitle" style={{whiteSpace: 'nowrap'}}>Espaços Cadastrados</h2>
                                <div className="tenant-controls-mobile-row">
                                    <div className="search-trigger mobile-only tenant-search-wrapper">
                                        <Search size={14} />
                                        <input
                                            className="search-input"
                                            placeholder="Buscar espaço..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{
                                                border: 'none',
                                                background: 'transparent',
                                                outline: 'none',
                                                fontSize: '0.9rem',
                                                width: '100%',
                                                color: 'var(--text-main)',
                                                padding: 0
                                            }}
                                        />
                                    </div>
                                    <button type="button" className="btn btnPrimary mobile-only icon-btn-primary" onClick={() => setShowNew(true)} aria-label="Criar novo espaço" style={{padding: 0, width: 36, height: 36, borderRadius: '50%', minWidth: 36, display: 'none'}}>
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>
                            <button type="button" className="btn btnPrimary desktop-only" onClick={() => setShowNew(true)}>
                                <Plus size={16} style={{marginRight: 8 }}/> Novo Espaço
                            </button>
                        </div>

                        {loadingDev || loading ? (
                            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                                <div className="skeleton skeleton-text" style={{width: '40%', height: 12}} />
                                <div className="skeleton skeleton-card" style={{height: 220}} />
                            </div>
                        ) : (
                            <>
                            <div className="table-scroll desktop-only">
                                <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{paddingLeft: 24}}>Espaço</th>
                                        <th>Acesso</th>
                                        <th>Assinatura</th>
                                        <th style={{textAlign: 'right', paddingRight: 24}}>Gerenciar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTenants.map(t => (
                                        <tr key={t.id}>
                                            <td style={{paddingLeft: 24}}>
                                                <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                                                    <div className="user-avatar-mini" style={{
                                                        background: 'var(--primary-50)',
                                                        color: 'var(--primary-600)',
                                                        fontWeight: 700,
                                                        fontSize: '0.9rem',
                                                        width: 44,
                                                        height: 44,
                                                        borderRadius: '12px',
                                                        border: '1px solid var(--primary-100)'
                                                    }}>
                                                        {t.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div style={{display: 'flex', flexDirection: 'column'}}>
                                                        <span style={{fontWeight: 600, color: 'var(--text-main)', fontSize: '0.95rem'}}>{t.name}</span>
                                                        {t.adminEmail && (
                                                            <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{t.adminEmail}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <a
                                                    href={(() => {
                                                      if (typeof window === 'undefined') return `http://${t.slug}.localhost:5173`
                                                      const host = window.location.hostname
                                                      const port = window.location.port
                                                      const protocol = window.location.protocol
                                                      const rootHost = host.toLowerCase().startsWith('dev.') ? host.slice(4) : host
                                                      return `${protocol}//${t.slug}.${rootHost}${port ? `:${port}` : ''}`
                                                    })()}
                                                    target="_blank"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        color: 'var(--text-muted)',
                                                        fontSize: '0.85rem',
                                                        fontWeight: 500,
                                                        padding: '6px 12px',
                                                        background: 'var(--bg-subtle)',
                                                        borderRadius: '8px',
                                                        textDecoration: 'none',
                                                        transition: 'all 0.2s',
                                                        border: '1px solid transparent'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.color = 'var(--primary-600)'
                                                        e.currentTarget.style.background = 'var(--primary-50)'
                                                        e.currentTarget.style.borderColor = 'var(--primary-100)'
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.color = 'var(--text-muted)'
                                                        e.currentTarget.style.background = 'var(--bg-subtle)'
                                                        e.currentTarget.style.borderColor = 'transparent'
                                                    }} rel="noopener noreferrer"
                                                >
                                                    <Globe size={14} />
                                                    {t.slug}.{configuredPlatformHostname()}
                                                </a>
                                            </td>
                                            <td>
                                                {(() => {
                                                    const m = subscriptionMeta(t)
                                                    return <span className={`status-badge ${m.className}`} style={m.style}>{m.label}</span>
                                                })()}
                                            </td>
                                            <td style={{textAlign: 'right', paddingRight: 24}}>
                                                <button type="button" className="icon-btn" onClick={() => setEditingTenantId(t.id)} aria-label="Editar tenant" style={{marginLeft: 'auto'}}>
                                                    <Settings size={18}/>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                </table>
                            </div>

                            <div className="mobile-tenant-list">
                                {filteredTenants.map(t => (
                                    <div key={t.id} className="mobile-tenant-card">
                                        <div style={{display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0}}>
                                            <div className="user-avatar-mini" style={{
                                                background: 'var(--primary-50)',
                                                color: 'var(--primary-600)',
                                                fontSize: '0.85rem',
                                                width: 40,
                                                height: 40,
                                                borderRadius: '10px',
                                                border: '1px solid var(--primary-100)',
                                                fontWeight: 700
                                            }}>
                                                {t.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div style={{minWidth: 0, flex: 1}}>
                                                <div style={{fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{t.name}</div>
                                                <a
                                                    href={(() => {
                                                      if (typeof window === 'undefined') return `http://${t.slug}.localhost:5173`
                                                      const host = window.location.hostname
                                                      const port = window.location.port
                                                      const protocol = window.location.protocol
                                                      const rootHost = host.toLowerCase().startsWith('dev.') ? host.slice(4) : host
                                                      return `${protocol}//${t.slug}.${rootHost}${port ? `:${port}` : ''}`
                                                    })()}
                                                    target="_blank"
                                                    style={{fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2}} rel="noopener noreferrer"
                                                >
                                                    <Globe size={10} />
                                                    {t.slug}.{configuredPlatformHostname()}
                                                </a>
                                            </div>
                                        </div>

                                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                             {(() => {
                                                const m = subscriptionMeta(t)
                                                // Simplified badge for mobile
                                                return <span className={`status-badge ${m.className}`} style={{fontSize: '0.65rem', padding: '2px 6px', height: 20, display: 'flex', alignItems: 'center'}}>{m.label.split(' ')[0]}</span>
                                            })()}
                                            <button type="button" className="icon-btn" onClick={() => setEditingTenantId(t.id)} aria-label="Editar tenant" style={{width: 32, height: 32, background: 'var(--bg-subtle)', border: 'none'}}>
                                                <Settings size={16} color="var(--text-muted)"/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            </>
                        )}
                    </div>

                    <NewTenantModal
                        isOpen={showNew}
                        onClose={() => setShowNew(false)}
                        onSuccess={() => {
                            loadTenants()
                        }}
                    />
                </>
            ) : tab === 'referrals' ? (
                <DevReferrals />
            ) : tab === 'integrations' ? (
                <DevIntegrations />
            ) : tab === 'backups' ? (
                <DevBackup />
            ) : tab === 'settings' ? (
                <div style={{maxWidth: 800, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24}}>
                    <DevUsers />
                    <div className="card">
                        <div className="cardHeader">
                            <div>
                                <h2 className="cardTitle">Configurações</h2>
                                <p className="cardDesc">Personalize sua experiência no painel de desenvolvedor.</p>
                            </div>
                        </div>

                        <div className="cardBody">
                            <h4 style={{fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 20, marginTop: 0}}>Aparência</h4>

                            {/* Theme Toggle */}
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24}}>
                                <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
                                    <div style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '50%',
                                        background: 'var(--bg-subtle)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--text-main)'
                                    }}>
                                        {devTheme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                                    </div>
                                    <div>
                                        <div style={{fontWeight: 600, fontSize: '1rem'}}>Modo Escuro</div>
                                        <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                                            {devTheme === 'dark' ? 'Ativado' : 'Desativado'}
                                        </div>
                                    </div>
                                </div>
                                <Switch
                                    checked={devTheme === 'dark'}
                                    onChange={() => {
                                        const next = toggleDevTheme()
                                        setDevTheme(next)
                                    }}
                                />
                            </div>

                            {/* Color Picker */}
                            <div style={{marginBottom: 8}}>
                                <div style={{display: 'flex', gap: 16, flexDirection: 'column'}}>
                                    <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
                                        <div style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: '50%',
                                            background: 'var(--bg-subtle)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'var(--text-main)',
                                            flexShrink: 0
                                        }}>
                                            <Palette size={20} />
                                        </div>
                                        <div>
                                            <div style={{fontWeight: 600, fontSize: '1rem'}}>Cor de Destaque</div>
                                            <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                                                Escolha a cor principal para o painel administrativo.
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{flex: 1}}>
                                        <ColorPicker
                                            value={devColor}
                                            onChange={(c) => {
                                                setDevColor(c)
                                                setDevPrimaryColor(c)
                                                api<{ ok: boolean }>('/api/dev/settings', {
                                                    method: 'POST',
                                                    body: JSON.stringify({ dev_primary_color: c })
                                                }).then(res => {
                                                    if (!res.ok) {
                                                        console.error('Falha ao salvar cor global do painel admin/dev', res.error)
                                                    }
                                                })
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div style={{height: 1, background: 'var(--border)', margin: '24px 0'}} />

                            <h4 style={{fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 20}}>Sistema</h4>

                            <div style={{
                                padding: 16,
                                background: 'var(--bg-subtle)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                display: 'flex',
                                gap: 16
                            }}>
                                <div style={{color: 'var(--primary-600)', marginTop: 2}}>
                                    <ShieldCheck size={24} />
                                </div>
                                <div>
                                    <div style={{fontWeight: 600, marginBottom: 4, color: 'var(--text-main)'}}>Ambiente Seguro</div>
                                    <div style={{fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5}}>
                                        Você está no ambiente de desenvolvimento. O acesso administrativo é restrito ao subdomínio <code>dev.</code> para garantir a segurança da plataforma.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <SecuritySettingsCard title="Segurança da conta DEV" />
                </div>
            ) : null}

            <TenantEditModal
                tenantId={editingTenantId}
                isOpen={!!editingTenantId}
                onClose={() => setEditingTenantId(null)}
                onUpdated={() => loadTenants()}
            />
        </Shell>
    )
}

function ConfirmModal({
    isOpen,
    title,
    description,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    onConfirm,
    onCancel,
    variant = 'danger',
    loading = false
}: {
    isOpen: boolean
    title: string
    description: ReactNode
    confirmText?: string
    cancelText?: string
    onConfirm: () => void
    onCancel: () => void
    variant?: 'danger' | 'primary'
    loading?: boolean
}) {
    if (!isOpen) return null
    return (
        <ModalRoot className="modal-overlay" style={{zIndex: 200}} onClick={loading ? undefined : onCancel}>
            <div className="ld-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmation-dialog-title" style={{maxWidth: 400}} onClick={e => e.stopPropagation()}>
                <div style={{padding: 24}}>
                    <div style={{marginBottom: 16}}>
                        <div className={`confirm-tone ${variant === 'danger' ? 'danger' : 'neutral'}`} style={{marginBottom: 10}}>
                            {variant === 'danger' ? 'Atenção' : 'Confirmação'}
                        </div>
                        <div>
                            <h3 id="confirmation-dialog-title" className="cardTitle" style={{fontSize: '1.1rem', marginBottom: 8}}>{title}</h3>
                            <div style={{fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5}}>
                                {description}
                            </div>
                        </div>
                    </div>
                    <div style={{display: 'flex', gap: 10, justifyContent: 'flex-end'}}>
                        <button type="button" className="btn" data-modal-close onClick={onCancel} disabled={loading}>{cancelText}</button>
                        <button type="button"
                            className={`btn ${variant === 'danger' ? '' : 'btnPrimary'}`}
                            style={variant === 'danger' ? {background: 'var(--danger-strong)', color: '#fff', border: 'none'} : {}}
                            onClick={onConfirm}
                            disabled={loading}
                        >
                            {loading ? 'Processando...' : confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </ModalRoot>
    )
}

function TenantEditModal({
    tenantId,
    isOpen,
    onClose,
    onUpdated
}: {
    tenantId: string | null
    isOpen: boolean
    onClose: () => void
    onUpdated: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [showConfirmDelete, setShowConfirmDelete] = useState(false)
    const [showPermanentDelete, setShowPermanentDelete] = useState(false)
    const [permanentConfirmation, setPermanentConfirmation] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [form, setForm] = useState({
        name: '',
        slug: '',
        status: 'ACTIVE' as 'ACTIVE' | 'SUSPENDED' | 'DISABLED',
        primaryColor: '#972d57',
        logoUrl: ''
    })

    useEffect(() => {
        if (!isOpen || !tenantId) return
        setError(null)
        setLoading(true)
        api<{
            tenant: {
                id: string
                slug: string
                name: string
                primaryColor: string
                logoUrl: string | null
                status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'
            }
        }>(`/api/dev/tenants/${encodeURIComponent(tenantId)}`).then((res) => {
            if (!res.ok) {
                setError(res.error.message)
                return
            }
            setForm({
                name: res.data.tenant.name,
                slug: res.data.tenant.slug,
                status: res.data.tenant.status,
                primaryColor: res.data.tenant.primaryColor,
                logoUrl: res.data.tenant.logoUrl ?? ''
            })
        }).finally(() => {
            setLoading(false)
        })
    }, [isOpen, tenantId])

    async function save() {
        if (!tenantId) return
        setSaving(true)
        setError(null)
        try {
            const res = await api<{ tenant: TenantDev }>(`/api/dev/tenants/${encodeURIComponent(tenantId)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: form.name.trim(),
                    slug: form.slug.trim().toLowerCase(),
                    status: form.status,
                    primaryColor: form.primaryColor.trim(),
                    logoUrl: form.logoUrl.trim() ? form.logoUrl.trim() : null
                })
            })
            if (!res.ok) {
                setError(res.error.message)
                return
            }
            onUpdated()
            onClose()
        } catch {
            setError('Falha ao salvar tenant')
        } finally {
            setSaving(false)
        }
    }

    async function permanentDelete() {
        if (!tenantId) return
        setDeleting(true)
        setError(null)
        try {
            const res = await api<{ ok: true }>(`/api/dev/tenants/${encodeURIComponent(tenantId)}/permanent-delete`, {
                method: 'POST',
                body: JSON.stringify({ confirmation: permanentConfirmation, acknowledgeBackup: true })
            })
            if (!res.ok) { setError(res.error.message); return }
            onUpdated()
            onClose()
        } catch { setError('Falha ao excluir o espaço definitivamente') }
        finally { setDeleting(false); setShowPermanentDelete(false); setPermanentConfirmation('') }
    }

    async function remove() {
        if (!tenantId) return
        setDeleting(true)
        setError(null)
        try {
            const res = await api<{ ok: true }>(`/api/dev/tenants/${encodeURIComponent(tenantId)}`, { method: 'DELETE' })
            if (!res.ok) {
                setError(res.error.message)
                return
            }
            onUpdated()
            onClose()
        } catch {
            setError('Falha ao desativar o espaço')
        } finally {
            setDeleting(false)
            setShowConfirmDelete(false)
        }
    }

    if (!isOpen) return null

    return (
        <>
        <ModalRoot className="modal-overlay" onClick={onClose}>
            <div className="ld-dialog" role="dialog" aria-modal="true" aria-labelledby="tenant-settings-title" style={{maxWidth: 560}} onClick={(e) => e.stopPropagation()}>
                <div style={{padding: '1.5rem 2rem', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div>
                        <div id="tenant-settings-title" className="cardTitle" style={{fontSize: '1.25rem'}}>Configurar Espaço</div>
                        <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>{tenantId}</div>
                    </div>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
                </div>
                <div style={{padding: '2rem'}}>
                    {loading ? (
                        <div className="form-stack">
                            <div className="skeleton skeleton-text" style={{width: '60%', marginBottom: 16}} />
                            <div className="row">
                                <div className="skeleton skeleton-card" style={{height: 40, flex: 1}} />
                                <div className="skeleton skeleton-card" style={{height: 40, flex: 1}} />
                            </div>
                        </div>
                    ) : (
                        <div className="form-stack">
                            <div className="row">
                                <div className="input-group">
                                    <label className="label">Nome</label>
                                    <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                                </div>
                                <div className="input-group">
                                    <label className="label">Status</label>
                                    <ProductSelect
                                        value={form.status}
                                        onChange={(next) => setForm((f) => ({ ...f, status: next as 'ACTIVE' | 'SUSPENDED' | 'DISABLED' }))}
                                        ariaLabel="Status do espaço"
                                        options={[
                                            { value: 'ACTIVE', label: 'Ativo' },
                                            { value: 'SUSPENDED', label: 'Suspenso' },
                                            { value: 'DISABLED', label: 'Desativado' },
                                        ]}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="label">Slug</label>
                                <div className="input-wrapper">
                                    <input className="input" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
                                </div>
                            </div>

                            <div className="row">
                                <div className="input-group">
                                    <label className="label">Cor primária</label>
                                    <ColorPicker
                                        value={form.primaryColor}
                                        onChange={(c) => setForm({...form, primaryColor: c})}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="label">Logo (URL)</label>
                                <div className="input-wrapper">
                                    <input className="input" value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} placeholder="https://..." />
                                </div>
                            </div>

                            {error && <div className="pill" style={{color: 'var(--danger)'}}>{error}</div>}
                        </div>
                    )}
                </div>
                <div style={{padding: '1.25rem 2rem', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12}}>
                    <div className="tenant-danger-actions">
                      <button type="button" className="btn" onClick={() => setShowConfirmDelete(true)} disabled={loading || saving || deleting} style={{borderColor: 'rgba(239,68,68,0.35)', color: 'var(--danger)'}}>Desativar</button>
                      {form.status === 'DISABLED' ? <button type="button" className="btn btn-danger-quiet" onClick={() => setShowPermanentDelete(true)} disabled={loading || saving || deleting}>Excluir definitivamente</button> : null}
                    </div>
                    <div style={{display: 'flex', gap: 10}}>
                        <button type="button" className="btn" data-modal-close onClick={onClose} disabled={saving || deleting}>Cancelar</button>
                        <button type="button" className="btn btnPrimary" onClick={save} disabled={loading || saving || deleting || !form.name.trim() || !form.slug.trim()}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        </ModalRoot>

        <ConfirmModal
            isOpen={showConfirmDelete}
            title="Desativar espaço?"
            description="O acesso será bloqueado, as sessões serão revogadas e os domínios serão desativados. Os dados ficam preservados e o espaço pode ser reativado pelo status."
            confirmText="Sim, desativar espaço"
            onConfirm={remove}
            onCancel={() => setShowConfirmDelete(false)}
            loading={deleting}
            variant="danger"
        />
        {showPermanentDelete ? <ModalRoot className="modal-overlay" onClick={() => setShowPermanentDelete(false)}>
          <div className="ld-dialog ld-dialog--destructive" role="dialog" aria-modal="true" aria-labelledby="permanent-delete-title" onClick={(event) => event.stopPropagation()}>
            <div><div><span className="eyebrow">Zona de risco</span><h2 id="permanent-delete-title">Excluir este espaço definitivamente?</h2><p>Esta ação remove agenda, clientes, usuários, domínios, financeiro e configurações. Ela não pode ser desfeita pelo painel.</p></div><button type="button" className="icon-btn modal-close" onClick={() => setShowPermanentDelete(false)} aria-label="Fechar"><X size={18}/></button></div>
            <div><label className="label" htmlFor="permanent-confirmation">Digite <strong>EXCLUIR {form.slug}</strong> para confirmar</label><input id="permanent-confirmation" className="input" value={permanentConfirmation} onChange={(event) => setPermanentConfirmation(event.target.value)} autoComplete="off"/><p className="danger-note">Confirme que existe um backup válido antes de continuar.</p></div>
            <div><button type="button" className="btn" data-modal-close onClick={() => setShowPermanentDelete(false)}>Cancelar</button><button type="button" className="btn btnDanger" onClick={permanentDelete} disabled={deleting || permanentConfirmation !== `EXCLUIR ${form.slug}`}>{deleting ? 'Excluindo…' : 'Excluir definitivamente'}</button></div>
          </div>
        </ModalRoot> : null}

        </>
    )
}


