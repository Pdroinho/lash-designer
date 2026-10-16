import { PageLoading } from '../../components/PageLoading'
import { TenantBrand } from '../../components/TenantBrand'
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../../api'
import type { SessionUser, TenantPublic } from '../../types'
import { applyTenantTheme, setAppMode, setDevPrimaryColor } from '../../theme'
import { PasswordChecklist } from '../../components/PasswordChecklist'
import { formatBrazilPhoneInput, normalizeBrazilPhone } from '../../phone'
import { configuredExternalLink } from '../../lib/runtime'
import type { CssVarStyle } from '../shared/types'
import { Check, Eye, EyeOff, XCircle } from '../../components/Icons'

export function UnifiedLogin(props: { hostTenant?: TenantPublic | null; isDevHost?: boolean } = {}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keepSigned, setKeepSigned] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)
  const [authStep, setAuthStep] = useState<'PASSWORD' | 'PHONE_SETUP' | 'WHATSAPP_OTP'>('PASSWORD')
  const [otpCode, setOtpCode] = useState('')
  const [mfaPhone, setMfaPhone] = useState('')
  const [phoneMasked, setPhoneMasked] = useState('')
  const [trustDevice, setTrustDevice] = useState(true)

  const [allowDevBootstrap, setAllowDevBootstrap] = useState(false)
  const [bootstrapEmail, setBootstrapEmail] = useState('')
  const [bootstrapPhone, setBootstrapPhone] = useState('')
  const [bootstrapPassword, setBootstrapPassword] = useState('')
  const [bootstrapSecret, setBootstrapSecret] = useState('')
  const [bootstrapRequiresSecret, setBootstrapRequiresSecret] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [bootstrapLoading, setBootstrapLoading] = useState(false)
  const [bootstrapSuccess, setBootstrapSuccess] = useState(false)

  const isTenant = !!props.hostTenant
  const accent = props.hostTenant?.primaryColor ?? 'var(--primary-600)'
  const brandHandle = props.hostTenant?.slug ? `@${props.hostTenant.slug}` : 'Sua cliente agenda. Você continua atendendo.'
  const pageStyle: CssVarStyle = { '--auth-accent': accent }
  const supportUrl = configuredExternalLink(import.meta.env.VITE_SUPPORT_URL)
  const privacyUrl = configuredExternalLink(import.meta.env.VITE_PRIVACY_URL) ?? '/privacidade'
  const termsUrl = configuredExternalLink(import.meta.env.VITE_TERMS_URL) ?? '/termos'

  useEffect(() => {
    if (props.isDevHost) {
        setAppMode('dev')
        api<{ primaryColor: string | null }>('/api/public/dev-theme').then((res) => {
          if (!res.ok) return
          const color = res.data.primaryColor
          if (typeof color === 'string' && color.trim()) {
            setDevPrimaryColor(color)
          }
        })
    } else {
        setAppMode(isTenant ? 'tenant' : 'public')
        if (props.hostTenant) applyTenantTheme(props.hostTenant)
    }
  }, [props.hostTenant, props.isDevHost])

  useEffect(() => {
    if (isTenant) return
    let mounted = true
    api<{ user: SessionUser | null; allowDevBootstrap?: boolean; bootstrapRequiresSecret?: boolean }>('/api/auth/me').then((res) => {
      if (!mounted) return
      if (!res.ok) return
      setAllowDevBootstrap(Boolean(res.data.allowDevBootstrap))
      setBootstrapRequiresSecret(Boolean(res.data.bootstrapRequiresSecret))
    })
    return () => {
      mounted = false
    }
  }, [isTenant])

  function finishProfessionalLogin(user: SessionUser) {
    setLoginSuccess(true)
    setTimeout(() => {
      if (user.role === 'DEV') {
        window.location.href = '/'
        return
      }
      if (user.role === 'ADMIN') {
        window.location.href = '/admin'
      }
      if (user.role === 'STAFF') window.location.href = '/equipe'
    }, 800)
  }

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const res = await api<{
      user?: SessionUser
      whatsappOtpRequired?: boolean
      phoneEnrollmentRequired?: boolean
      phoneMasked?: string
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, keepSigned }),
    })
    setLoading(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }

    if (res.data.phoneEnrollmentRequired) {
      setMfaPhone('')
      setOtpCode('')
      setPhoneMasked('')
      setAuthStep('PHONE_SETUP')
      return
    }
    if (res.data.whatsappOtpRequired) {
      setOtpCode('')
      setPhoneMasked(res.data.phoneMasked ?? '')
      setAuthStep('WHATSAPP_OTP')
      return
    }
    if (res.data.user) finishProfessionalLogin(res.data.user)
  }

  async function sendWhatsappOtp(phone?: string) {
    setLoading(true)
    setError(null)
    const normalizedPhone = phone ? normalizeBrazilPhone(phone) : null
    if (phone && !normalizedPhone) {
      setLoading(false)
      setError('Informe um WhatsApp brasileiro válido, com DDD.')
      return
    }
    const res = await api<{ sent: true; phoneMasked: string }>('/api/auth/whatsapp-otp/send', {
      method: 'POST',
      body: JSON.stringify(normalizedPhone ? { phone: normalizedPhone } : {}),
    })
    setLoading(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setOtpCode('')
    setPhoneMasked(res.data.phoneMasked)
    setAuthStep('WHATSAPP_OTP')
  }

  async function verifyWhatsappOtp() {
    setLoading(true)
    setError(null)
    const res = await api<{ user: SessionUser }>('/api/auth/whatsapp-otp/verify', {
      method: 'POST',
      body: JSON.stringify({ code: otpCode.trim(), trustDevice }),
    })
    setLoading(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    finishProfessionalLogin(res.data.user)
  }

  async function handleBootstrap() {
    setBootstrapLoading(true)
    setBootstrapError(null)
    setBootstrapSuccess(false)
    try {
      const res = await api<{ ok: true }>('/api/dev/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ email: bootstrapEmail, phone: normalizeBrazilPhone(bootstrapPhone), password: bootstrapPassword, bootstrapSecret }),
      })
      if (!res.ok) {
        setBootstrapError(res.error.message)
        return
      }
      setBootstrapSuccess(true)
      setAllowDevBootstrap(false)
      setEmail(bootstrapEmail)
      setPassword(bootstrapPassword)
    } catch {
      setBootstrapError('Erro ao criar usuário DEV')
    } finally {
      setBootstrapLoading(false)
    }
  }

  return (
    <div className="authRef" style={pageStyle}>
      <div className="authRefCard">
        <div className="authRefLeft">
          <div className="authRefBrand">
            <TenantBrand brand={props.hostTenant} className="tenant-brand-auth" />
            <div className="authRefBrandSub">{brandHandle}</div>

          </div>

          <div className="authRefQuote">
            <div className="authRefQuoteText">“Menos mensagens perguntando por horário. Mais tempo para atender.”</div>
            <div className="authRefQuoteMeta">
              <div className="authRefQuoteName">Lash Designer</div>
              <div className="authRefQuoteRole">Agenda online para lash designers</div>
            </div>
          </div>
        </div>

        <div className="authRefRight">
          <div className="authRefRightInner">
            {loginSuccess ? (
              <div className="authRefSuccess">
                <div className="authRefSuccessIcon">
                  <Check size={32} strokeWidth={3} />
                </div>
                <h2 className="authRefSuccessTitle">Login realizado!</h2>
                <p className="authRefSuccessSub">Redirecionando você...</p>
              </div>
            ) : authStep !== 'PASSWORD' ? (
              <div className="authSecurityPanel">
                <span className="eyebrow">Verificação em duas etapas</span>
                <h1 className="authRefTitle">{authStep === 'PHONE_SETUP' ? 'Cadastre seu WhatsApp' : 'Digite o código recebido'}</h1>
                <p className="authRefSubtitle">
                  {authStep === 'PHONE_SETUP'
                    ? 'Este número será usado para confirmar novos dispositivos antes de liberar o acesso.'
                    : `Enviamos um código de 6 dígitos pelo WhatsApp${phoneMasked ? ` para ${phoneMasked}` : ''}.`}
                </p>

                <div className="authRefForm">
                  {authStep === 'PHONE_SETUP' ? (
                    <label className="authRefField">
                      <span className="authRefLabel">WhatsApp com DDD</span>
                      <input className="authRefInput" value={mfaPhone} onChange={(event) => setMfaPhone(formatBrazilPhoneInput(event.target.value))} autoFocus inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" />
                    </label>
                  ) : (
                    <label className="authRefField">
                      <span className="authRefLabel">Código de 6 dígitos</span>
                      <input className="authRefInput" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="000000" />
                    </label>
                  )}

                  {authStep === 'WHATSAPP_OTP' ? (
                    <label className="authRefCheckbox">
                      <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
                      <span>Confiar neste dispositivo por 365 dias</span>
                    </label>
                  ) : null}

                  {error ? <div className="authRefError"><XCircle size={16} /><span>{error}</span></div> : null}

                  <button
                    type="button"
                    className="authRefPrimary"
                    onClick={authStep === 'PHONE_SETUP' ? () => void sendWhatsappOtp(mfaPhone) : verifyWhatsappOtp}
                    disabled={loading || (authStep === 'PHONE_SETUP' ? !normalizeBrazilPhone(mfaPhone) : otpCode.length !== 6)}
                  >
                    {loading ? 'Processando...' : authStep === 'PHONE_SETUP' ? 'Enviar código' : 'Verificar e entrar'}
                  </button>

                  {authStep === 'WHATSAPP_OTP' ? <button type="button" className="authRefSecondaryAction" onClick={() => void sendWhatsappOtp()} disabled={loading}>Reenviar código</button> : null}
                  <button type="button" className="authRefSecondaryAction" onClick={() => { setError(null); setOtpCode(''); setAuthStep('PASSWORD') }}>Voltar ao login</button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="authRefTitle authRefTitle-login">Entrar na conta</h1>
            <p className="authRefSubtitle">Acesse o painel e continue de onde parou.</p>

            {allowDevBootstrap ? (
              <div style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: 14,
                background: 'var(--bg-subtle)',
                marginBottom: 14
              }}>
                <div style={{fontWeight: 800, color: 'var(--gray-900)', marginBottom: 6}}>Primeiro acesso (criar DEV)</div>
                <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 10}}>
                  Não existe usuário DEV ainda. Crie o primeiro para habilitar o console.
                </div>
                <div style={{display: 'grid', gap: 10}}>
                  <input
                    className="authRefInput"
                    value={bootstrapEmail}
                    onChange={(e) => setBootstrapEmail(e.target.value)}
                    placeholder="dev@seu-dominio.com"
                    inputMode="email"
                    autoComplete="email"
                  />
                  <input
                    className="authRefInput"
                    value={bootstrapPhone}
                    onChange={(e) => setBootstrapPhone(formatBrazilPhoneInput(e.target.value))}
                    placeholder="WhatsApp: (11) 99999-9999"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  <input
                    className="authRefInput"
                    type={showPassword ? 'text' : 'password'}
                    value={bootstrapPassword}
                    onChange={(e) => setBootstrapPassword(e.target.value)}
                    placeholder="Crie uma senha"
                    autoComplete="new-password"
                    minLength={8}
                    aria-describedby="bootstrap-password-requirements"
                  />
                  <PasswordChecklist id="bootstrap-password-requirements" password={bootstrapPassword} />
                  {bootstrapRequiresSecret ? (
                    <input
                      className="authRefInput"
                      type="password"
                      value={bootstrapSecret}
                      onChange={(e) => setBootstrapSecret(e.target.value)}
                      placeholder="Chave DEV_BOOTSTRAP_SECRET"
                      autoComplete="off"
                    />
                  ) : null}
                  {bootstrapError ? (
                    <div className="authRefError">
                      <XCircle size={16} />
                      <span>{bootstrapError}</span>
                    </div>
                  ) : null}
                  {bootstrapSuccess ? (
                    <div className="pill" style={{color: 'var(--success)', justifyContent: 'center'}}>
                      Usuário DEV criado. Faça login.
                    </div>
                  ) : null}
                  <button
                    className="authRefPrimary"
                    type="button"
                    onClick={handleBootstrap}
                    disabled={bootstrapLoading || !bootstrapEmail || !normalizeBrazilPhone(bootstrapPhone) || bootstrapPassword.length < 8 || (bootstrapRequiresSecret && !bootstrapSecret.trim())}
                  >
                    {bootstrapLoading ? 'Criando...' : 'Criar DEV'}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="authRefForm">
              <label className="authRefField">
                <span className="authRefLabel">Email</span>
                <input
                  className="authRefInput"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  autoFocus
                  inputMode="email"
                  autoComplete="email"
                />
              </label>

              <label className="authRefField">
                <span className="authRefLabel">Senha</span>
                <div className="authRefInputWrapper">
                  <input
                    className="authRefInput"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="authRefPasswordToggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label className="authRefCheckbox">
                <input
                  type="checkbox"
                  checked={keepSigned}
                  onChange={(e) => setKeepSigned(e.target.checked)}
                />
                <span>Continuar conectado</span>
              </label>

              {error && (
                <div className="authRefError">
                  <XCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button type="button" className="authRefPrimary" onClick={handleLogin} disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <div className="authRefFooter authRefAccountHelp">
                {isTenant ? (
                  <span>Ainda não tem conta? Ela é criada ao concluir seu primeiro agendamento.</span>
                ) : props.isDevHost ? (
                  <span>Acesso restrito à equipe técnica da plataforma.</span>
                ) : (
                  <span>Entre pelo endereço do seu espaço para acessar a conta.</span>
                )}
                {supportUrl ? (
                  <a className="authRefLink" href={supportUrl} target="_blank" rel="noopener noreferrer">
                    Falar com suporte
                  </a>
                ) : null}
              </div>

              {(privacyUrl || termsUrl) ? (
                <nav className="authRefLegal" aria-label="Documentos legais">
                  {privacyUrl ? <a href={privacyUrl} target="_blank" rel="noopener noreferrer">Privacidade</a> : null}
                  {termsUrl ? <a href={termsUrl} target="_blank" rel="noopener noreferrer">Termos de uso</a> : null}
                </nav>
              ) : null}
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


export function RootEntry(props: {
  hostTenant?: TenantPublic | null
  renderWhenAuthenticated?: (user: SessionUser) => ReactNode
  loginElement: ReactNode
}) {
  const [checking, setChecking] = useState(true)
  const [me, setMe] = useState<SessionUser | null>(null)

  useEffect(() => {
    let mounted = true
    api<{ user: SessionUser | null }>('/api/auth/me').then((res) => {
      if (!mounted) return
      if (res.ok) setMe(res.data.user)
      setChecking(false)
    })
    return () => {
      mounted = false
    }
  }, [])

  if (checking) {
    return (
      <PageLoading />
    )
  }

  if (!me) return props.loginElement

  if (props.renderWhenAuthenticated) {
    return <>{props.renderWhenAuthenticated(me)}</>
  }

  const next = me.role === 'CLIENT' ? '/cliente' : me.role === 'STAFF' ? '/equipe' : '/admin'
  return <Navigate to={next} replace />
}

