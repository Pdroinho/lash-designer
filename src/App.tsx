import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'
import type { SessionUser, TenantDev, TenantPublic, CalendarEvent } from './types'
import { applyTenantTheme, getDevTheme, initDevTheme, setAppMode, toggleDevTheme, type DevThemeMode, getDevPrimaryColor, setDevPrimaryColor } from './theme'
import { ColorPicker } from './components/ColorPicker'
import {
  Calendar,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Sparkles,
  Users,
  Wallet,
  Settings,
  Bell,
  Search,
  Plus,
  Clock,
  XCircle,
  MoreHorizontal,
  Edit2,
  TestTube,
  ChevronLeft,
  ChevronRight,
  Chrome,
  Image as ImageIcon,
  Link2,
  Upload,
  Check,
  Trash2,
  ShieldCheck,
  Eye,
  EyeOff,
  Megaphone,
  QrCode,
  Smartphone,
  Copy,
  Moon,
  Sun,
  Palette,
  Globe,
  Key,
  Webhook,
  BellRing,
  CreditCard,
  MessageSquare,
  Lock,
  Database,
  Download,
  FileText,
  Filter
} from 'lucide-react'

function PortalMenu({ 
    trigger, 
    children 
}: { 
    trigger: (isOpen: boolean) => ReactNode, 
    children: (close: () => void) => ReactNode 
}) {
    const [isOpen, setIsOpen] = useState(false)
    const triggerRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState({ top: 0, left: 0 })

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!isOpen) {
            const rect = triggerRef.current?.getBoundingClientRect()
            if (rect) {
                setPos({ 
                    top: rect.bottom + window.scrollY + 4, 
                    left: rect.right + window.scrollX 
                })
            }
            setIsOpen(true)
        } else {
            setIsOpen(false)
        }
    }

    useEffect(() => {
        if (!isOpen) return
        
        function handleClickOutside(event: MouseEvent) {
            // If click is inside menu, don't close (unless specific action closes it)
            if (menuRef.current && menuRef.current.contains(event.target as Node)) {
                return
            }
            // If click is inside trigger, it's handled by toggle (stopPropagation there helps, but 
            // since we use document listener, it fires before React onClick if we use capture? 
            // No, React events are delegated. Native document listener fires first? 
            // Actually standard document listener fires after bubbling.
            // So: Click Trigger -> Trigger onClick (stops prop) -> Document listener NOT fired?
            // If we stop prop in React onClick, it stops bubbling to document React listeners, 
            // but native document listeners might still fire if not handled correctly.
            // Let's keep it simple: Just check if target is trigger.
            if (triggerRef.current && triggerRef.current.contains(event.target as Node)) {
                return
            }
            setIsOpen(false)
        }
        
        function updatePos() {
             const rect = triggerRef.current?.getBoundingClientRect()
             if (rect) {
                 setPos({ 
                     top: rect.bottom + window.scrollY + 4, 
                     left: rect.right + window.scrollX 
                 })
             } else {
                 setIsOpen(false)
             }
        }

        document.addEventListener('mousedown', handleClickOutside)
        window.addEventListener('resize', updatePos)
        window.addEventListener('scroll', updatePos, true)
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            window.removeEventListener('resize', updatePos)
            window.removeEventListener('scroll', updatePos, true)
        }
    }, [isOpen])

    return (
        <>
            <div ref={triggerRef} onClick={toggle} style={{display: 'inline-block', cursor: 'pointer'}}>
                {trigger(isOpen)}
            </div>
            {isOpen && createPortal(
                <div 
                    ref={menuRef}
                    onClick={e => e.stopPropagation()}
                    className="portal-menu-content"
                    style={{
                        top: pos.top,
                        left: pos.left,
                        transform: 'translateX(-100%)'
                    }}
                >
                    {children(() => setIsOpen(false))}
                </div>,
                document.body
            )}
        </>
    )
}

function withBasePath(basePath: string, path: string) {
  const p = path.startsWith('/') ? path : `/${path}`
  if (!basePath) return p
  return `${basePath}${p}`
}

type CssVarStyle = CSSProperties & { ['--auth-accent']?: string }

type AdminStats = {
  today?: { appointmentsCount?: number; expectedRevenueCents?: number }
  newClients30d?: number
  pendingAppointments?: number
  upcoming?: Array<{
    id: string
    startsAt: string
    status: string
    serviceName: string
    priceCents: number
    clientEmail: string
    clientName: string | null
  }>
  recentActivity?: Array<{
    kind: string
    at: string
    clientName: string | null
    clientEmail: string | null
    serviceName: string | null
    priceCents: number | null
    amountCents: number | null
    note: string | null
  }>
}

type AdminService = {
  id: string
  name: string
  durationMinutes: number
  priceCents: number
  coverUrl?: string | null
}

type AdminAppointment = {
  id: string
  serviceId: string
  startsAt: string
  endsAt: string
  status: string
  clientEmail: string
  clientName: string | null
  clientPhone: string | null
  serviceName: string
  priceCents: number
}

type AdminClientRow = {
  id: string
  name: string
  phone: string | null
  email: string
  totalSpentCents: number
  lastVisitAt: string | null
}

type AdminFinanceData = {
  totals: {
    entriesCents: number
    expensesCents: number
    profitCents: number
  }
  goals: {
    revenueCents: number
    newClients: number
    currentRevenueCents: number
    currentNewClients: number
  }
  lastCashTransactions: Array<{ id: string; type: 'INCOME' | 'EXPENSE'; amountCents: number; method: string; note: string | null; createdAt: string }>
  lastEntries: Array<{ id: string; startsAt: string; status: string; serviceName: string; priceCents: number; clientEmail: string; clientName: string | null }>
  monthly: Array<{ ym: string; entriesCents: number; expensesCents: number }>
}

function formatBRL(n: number) {
  return 'R$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type ClientAppointment = {
  id: string
  serviceName: string
  startsAt: string
  status: string
}

function WhatsAppIcon({ size = 18, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={style}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <label className="switch-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-toggle-slider" />
    </label>
  )
}

function SidebarItem(props: { active?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <div className={`nav-item ${props.active ? 'active' : ''}`} onClick={props.onClick}>
      <span className="nav-icon">{props.icon}</span>
      <span className="nav-label-text">{props.label}</span>
    </div>
  )
}

function NotificationsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<Array<{id: string; title: string; desc: string; time: string; type: string}>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
        setLoading(true)
        api<{notifications: Array<{id: string; title: string; desc: string; time: string; type: string}>}>('/api/dev/notifications')
            .then(res => {
                if(res.ok) setNotifications(res.data.notifications)
            })
            .finally(() => setLoading(false))
    }
  }, [isOpen])
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const getIcon = (type: string) => {
      const t = type.toLowerCase()
      if (t.includes('payment') || t.includes('approved')) return <CreditCard size={16}/>
      if (t.includes('message')) return <MessageSquare size={16}/>
      if (t.includes('fail') || t.includes('refused')) return <XCircle size={16}/>
      return <BellRing size={16}/>
  }

  const getColor = (type: string) => {
      const t = type.toLowerCase()
      if (t.includes('payment') || t.includes('approved')) return { bg: '#dcfce7', text: '#166534' }
      if (t.includes('message')) return { bg: '#e0f2fe', text: '#0369a1' }
      if (t.includes('fail') || t.includes('refused')) return { bg: '#fee2e2', text: '#991b1b' }
      return { bg: 'var(--bg-subtle)', text: 'var(--text-muted)' }
  }

  const relativeTime = (iso: string) => {
      try {
          const date = new Date(iso)
          if (isNaN(date.getTime())) return iso
          const diff = Date.now() - date.getTime()
          const mins = Math.floor(diff / 60000)
          if (mins < 1) return 'Agora'
          if (mins < 60) return `Há ${mins} min`
          const hours = Math.floor(mins / 60)
          if (hours < 24) return `Há ${hours} h`
          return date.toLocaleDateString('pt-BR')
      } catch {
          return iso
      }
  }

  return (
    <div ref={ref} className="notifications-popover" style={{
        position: 'absolute',
        top: 60,
        right: 80,
        width: 360,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-lg)',
        zIndex: 100,
        overflow: 'hidden'
    }}>
        <div style={{padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <h3 style={{fontSize: '0.95rem', fontWeight: 600, margin: 0}}>Notificações</h3>
            <button className="btn btn-ghost" style={{fontSize: '0.75rem', height: 24, padding: '0 8px'}}>Marcar todas como lidas</button>
        </div>
        <div style={{maxHeight: 400, overflowY: 'auto'}}>
            {loading ? (
                <div style={{padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem'}}>Carregando...</div>
            ) : notifications.length === 0 ? (
                <div style={{padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem'}}>Nenhuma notificação recente.</div>
            ) : (
                notifications.map(n => {
                    const style = getColor(n.type)
                    return (
                        <div key={n.id} style={{padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, cursor: 'pointer', transition: 'background 0.2s'}} 
                             onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'}
                             onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <div style={{width: 32, height: 32, borderRadius: '50%', background: style.bg, color: style.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0}}>
                                {getIcon(n.type)}
                            </div>
                            <div>
                                <div style={{fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)'}}>{n.title}</div>
                                <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2}}>{n.desc}</div>
                                <div style={{fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4}}>{relativeTime(n.time)}</div>
                            </div>
                        </div>
                    )
                })
            )}
        </div>
        <div style={{padding: 12, background: 'var(--bg-subtle)', textAlign: 'center', borderTop: '1px solid var(--border)'}}>
            <button className="btn btn-ghost btn-sm" style={{width: '100%'}}>Ver todas</button>
        </div>
    </div>
  )
}

function SubscriptionPopup({ isOpen, user, isTestMode }: { isOpen: boolean; user: SessionUser | null; isTestMode: boolean }) {
    // Force live check of local storage to ensure test mode is detected
    const [localTestMode, setLocalTestMode] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('lash_test_mode') === 'true'
        return false
    })

    // Poll for changes in test mode (every 1s) to react immediately
    useEffect(() => {
        const interval = setInterval(() => {
            const val = localStorage.getItem('lash_test_mode') === 'true'
            setLocalTestMode(v => v !== val ? val : v)
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    const effectiveTestMode = isTestMode || localTestMode

    const [loading, setLoading] = useState(false)
    const [testLoading, setTestLoading] = useState(false)
    const [view, setView] = useState<'blocked' | 'checkout'>('blocked')
    
    // Form state for simulated checkout
    const [cardNumber, setCardNumber] = useState('')
    const [cardName, setCardName] = useState('')
    const [cardExpiry, setCardExpiry] = useState('')
    const [cardCvc, setCardCvc] = useState('')

    // Reset view when closed or opened
    useEffect(() => {
        if (isOpen) {
            setView('blocked')
            setCardNumber('')
            setCardName('')
            setCardExpiry('')
            setCardCvc('')
        }
    }, [isOpen])

    // Auto-fill effect when entering checkout view
    useEffect(() => {
        if (view === 'checkout') {
            const timer1 = setTimeout(() => setCardNumber('4242 4242 4242 4242'), 500)
            const timer2 = setTimeout(() => setCardName(user?.email?.split('@')[0].toUpperCase() || 'USUARIO TESTE'), 800)
            const timer3 = setTimeout(() => setCardExpiry('12/30'), 1100)
            const timer4 = setTimeout(() => setCardCvc('123'), 1400)
            return () => {
                clearTimeout(timer1)
                clearTimeout(timer2)
                clearTimeout(timer3)
                clearTimeout(timer4)
            }
        }
    }, [view, user])

    if (!isOpen) return null

    const handleCheckout = async () => {
        // Double check at click time
        const currentTestMode = effectiveTestMode || (typeof window !== 'undefined' && localStorage.getItem('lash_test_mode') === 'true')
        
        if (currentTestMode) {
            setView('checkout')
            return
        }

        setLoading(true)
        try {
            const res = await api<{url: string}>('/api/admin/subscription/checkout-url')
            if (res.ok && res.data?.url) {
                window.open(res.data.url, '_blank')
            } else {
                alert('Erro ao gerar link de pagamento')
            }
        } catch (err) {
            console.error(err)
            alert('Erro ao conectar com servidor')
        } finally {
            setLoading(false)
        }
    }

    const handleTestPay = async (e?: React.FormEvent) => {
        e?.preventDefault()
        setTestLoading(true)
        
        // Simulate processing delay
        await new Promise(r => setTimeout(r, 1500))

        try {
            const res = await api<{ok: boolean}>('/api/admin/subscription/test-pay', { method: 'POST' })
            if (res.ok) {
                alert('Pagamento aprovado! Liberando acesso...')
                window.location.reload()
            } else {
                alert('Erro ao simular pagamento')
            }
        } catch (err) {
            console.error(err)
            alert('Erro ao conectar com servidor')
        } finally {
            setTestLoading(false)
        }
    }

    if (view === 'checkout') {
        return (
             <div className="modal-overlay" style={{zIndex: 9999, backdropFilter: 'blur(5px)'}}>
                <div className="modal-content" style={{maxWidth: 450, padding: 32}}>
                    <div style={{display: 'flex', alignItems: 'center', marginBottom: 24, gap: 12}}>
                        <button onClick={() => setView('blocked')} className="icon-btn" style={{border: 'none', background: 'transparent', marginLeft: -8}}>
                            <ChevronLeft size={20} />
                        </button>
                        <h2 style={{fontSize: '1.25rem', fontWeight: 700, margin: 0}}>Checkout Seguro (Teste)</h2>
                    </div>

                    <form onSubmit={handleTestPay} style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                        <div className="input-group">
                            <label className="label">Número do Cartão</label>
                            <div style={{position: 'relative'}}>
                                <CreditCard size={18} style={{position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)'}} />
                                <input 
                                    className="input" 
                                    style={{paddingLeft: 40}} 
                                    value={cardNumber} 
                                    onChange={e => setCardNumber(e.target.value)}
                                    placeholder="0000 0000 0000 0000"
                                    required
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="label">Nome no Cartão</label>
                            <input 
                                className="input" 
                                value={cardName} 
                                onChange={e => setCardName(e.target.value)}
                                placeholder="NOME COMO NO CARTAO"
                                required
                            />
                        </div>

                        <div style={{display: 'flex', gap: 16}}>
                            <div className="input-group" style={{flex: 1}}>
                                <label className="label">Validade</label>
                                <input 
                                    className="input" 
                                    value={cardExpiry} 
                                    onChange={e => setCardExpiry(e.target.value)}
                                    placeholder="MM/AA"
                                    required
                                />
                            </div>
                            <div className="input-group" style={{flex: 1}}>
                                <label className="label">CVC</label>
                                <div style={{position: 'relative'}}>
                                    <Lock size={16} style={{position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)'}} />
                                    <input 
                                        className="input" 
                                        style={{paddingLeft: 36}} 
                                        value={cardCvc} 
                                        onChange={e => setCardCvc(e.target.value)}
                                        placeholder="123"
                                        required
                                        type="password"
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{background: 'var(--bg-subtle)', padding: 16, borderRadius: 8, marginTop: 8}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 8}}>
                                <span>Plano Pro</span>
                                <span>R$ 99,90</span>
                            </div>
                            <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', borderTop: '1px solid var(--border)', paddingTop: 8}}>
                                <span>Total</span>
                                <span>R$ 99,90</span>
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            className="btn btnPrimary" 
                            style={{height: 48, fontSize: '1rem', marginTop: 8}}
                            disabled={testLoading}
                        >
                            {testLoading ? 'Processando...' : 'Pagar R$ 99,90'}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="modal-overlay" style={{zIndex: 9999, backdropFilter: 'blur(5px)'}}>
            <div className="modal-content" style={{maxWidth: 450, textAlign: 'center', padding: 40}}>
                <div style={{
                    width: 64, height: 64, 
                    background: '#fee2e2', color: '#dc2626', 
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 24px'
                }}>
                    <Lock size={32} />
                </div>
                
                <h2 style={{fontSize: '1.5rem', fontWeight: 700, marginBottom: 12, color: 'var(--gray-900)'}}>
                    Assinatura Necessária
                </h2>
                
                <p style={{fontSize: '1rem', color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.6}}>
                    Sua assinatura está inativa ou expirada. Para continuar gerenciando seu espaço e agendamentos, por favor, realize o pagamento.
                </p>

                <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                        <button 
                            className="btn btnPrimary" 
                            style={{height: 48, fontSize: '1rem'}}
                            onClick={handleCheckout}
                            disabled={loading || testLoading}
                        >
                            {loading ? 'Carregando...' : (effectiveTestMode ? 'Realizar Pagamento (Teste)' : 'Realizar Pagamento')}
                        </button>
                </div>
                
                <div style={{marginTop: 24, fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                    Precisa de ajuda? Entre em contato com o suporte.
                    <div style={{height: 1, background: 'var(--border)', margin: '24px 0'}} />


                </div>
            </div>
        </div>
    )
}

function Shell(props: {
  title: string
  subtitle: string
  badge?: ReactNode
  sidebar: ReactNode
  children: ReactNode
  user?: SessionUser | null
  actions?: ReactNode
  onSearch?: (query: string) => void
  searchValue?: string
  isTestMode?: boolean
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-icon">
            <Sparkles size={18} />
          </div>
          <span>Lash Space</span>
        </div>
        
        <div className="sidebar-content" style={{flex: 1}}>
          {props.sidebar}
        </div>

        <div className="sidebar-footer">
          <div className="user-avatar-mini">
            {props.user?.email?.[0].toUpperCase() ?? 'U'}
          </div>
          <div style={{flex: 1, minWidth: 0}}>
            <div style={{fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
              {props.user?.email ?? 'Usuário'}
            </div>
            <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>
              {props.user?.role === 'ADMIN' ? 'Administradora' : props.user?.role === 'DEV' ? 'Developer' : 'Cliente'}
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}

      <main className="app-main">
        <header className="app-header">
          <div className="header-left" style={{display: 'flex', alignItems: 'center', gap: 16}}>
            <button className="icon-btn mobile-toggle" onClick={() => setMobileOpen(true)}>
              <Menu size={20} />
            </button>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <div className="header-breadcrumb">
                <span className="breadcrumb-root">Lash Space</span>
                <ChevronRight size={12} className="breadcrumb-separator"/>
                <span className="breadcrumb-current">{props.title}</span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            {props.actions}
            
            <div className="search-trigger">
                {/* Autofill Trap: Hidden inputs to capture browser autofill attempts */}
                <div style={{position: 'absolute', opacity: 0, pointerEvents: 'none', height: 0, width: 0, overflow: 'hidden'}}>
                    <input type="text" tabIndex={-1} autoComplete="off" />
                    <input type="password" tabIndex={-1} autoComplete="off" />
                </div>
                <Search size={14} />
                {props.onSearch ? (
                    <form 
                        onSubmit={(e) => e.preventDefault()} 
                        autoComplete="off" 
                        style={{flex: 1, display: 'flex'}}
                    >
                        <input 
                            className="search-input"
                            placeholder="Buscar..."
                            value={props.searchValue ?? ''}
                            onChange={(e) => props.onSearch?.(e.target.value)}
                            autoComplete="new-password"
                            name="search_query_safe"
                            type="search"
                            data-lpignore="true"
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
                    </form>
                ) : (
                    <span style={{flex: 1}}>Buscar...</span>
                )}
                {!props.onSearch && <span style={{fontSize: '0.7rem', background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4, color: 'var(--gray-500)'}}>⌘K</span>}
            </div>
            
            <div className="icon-btn" style={{position: 'relative', border: 'none', background: 'transparent'}} onClick={() => setShowNotifications(!showNotifications)}>
              <Bell size={20} />
              <div style={{position: 'absolute', top: 8, right: 8, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '2px solid white'}} />
            </div>
            
            <NotificationsModal isOpen={showNotifications} onClose={() => setShowNotifications(false)} />

            <div style={{width: 1, height: 24, background: 'var(--gray-200)', margin: '0 8px'}} />

            <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.8rem', cursor: 'pointer'}}>
                {props.user?.email?.[0].toUpperCase() ?? 'U'}
            </div>
          </div>
        </header>

        <div className="app-content">
          {props.children}
        </div>
      </main>

      <SubscriptionPopup 
        isOpen={props.user?.role === 'ADMIN' && props.user?.subscriptionStatus !== 'ACTIVE'} 
        user={props.user ?? null} 
        isTestMode={props.isTestMode ?? false}
      />
    </div>
  )
}

// --- Admin Components ---

function AdminDashboard({ me, stats, onRefresh }: { me: SessionUser | null; stats: AdminStats | null; onRefresh?: () => void }) {
  const [updating, setUpdating] = useState(false)

  async function handleStatusChange(id: string, status: string) {
    if (updating) return
    setUpdating(true)
    await api(`/api/admin/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    })
    setUpdating(false)
    if (onRefresh) onRefresh()
  }

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Bom dia'
    if (hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }, [])

  const bookingLink = typeof window !== 'undefined' ? `${window.location.origin}/agendar` : ''
  const [copied, setCopied] = useState(false)

  const copyLink = () => {
    if (typeof navigator !== 'undefined') {
        navigator.clipboard.writeText(bookingLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }
  }

  const palette = [
    { bg: undefined as string | undefined, fg: undefined as string | undefined },
    { bg: '#e0f2fe', fg: '#0369a1' },
    { bg: '#fef3c7', fg: '#b45309' },
    { bg: '#f3e8ff', fg: '#6b21a8' },
    { bg: '#ffe4e6', fg: '#9d174d' },
  ]

  const initials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    const a = parts[0]?.[0] ?? 'U'
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : (parts[0]?.[1] ?? '')
    return (a + b).toUpperCase()
  }

  const colorFor = (name: string) => {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return palette[h % palette.length]
  }

  const labelForStatus = (s: string) => {
    const v = s.trim().toUpperCase()
    if (v === 'CONFIRMED') return { label: 'Confirmado', className: 'status-success' }
    if (v === 'PENDING') return { label: 'Pendente', className: 'status-pending' }
    if (v === 'CANCELLED') return { label: 'Cancelado', className: 'status-warning' }
    return { label: v || '—', className: 'status-warning' }
  }

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const relative = (iso: string) => {
    const now = Date.now()
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return '—'
    const diffMs = Math.max(0, now - t)
    const mins = Math.floor(diffMs / 60_000)
    if (mins <= 0) return 'Agora'
    if (mins < 60) return `Há ${mins} min`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `Há ${hrs} h`
    const days = Math.floor(hrs / 24)
    return `Há ${days} d`
  }

  const upcoming = (stats?.upcoming ?? []).slice(0, 12).map((a) => {
    const displayName = (a.clientName ?? a.clientEmail).trim() || 'Cliente'
    const col = colorFor(displayName)
    const st = labelForStatus(a.status)
    return {
      id: a.id,
      name: displayName,
      avatar: initials(displayName),
      avatarBg: col.bg,
      avatarColor: col.fg,
      service: a.serviceName,
      time: fmtTime(a.startsAt),
      status: st.label,
      statusClass: st.className,
      rawStatus: a.status,
    }
  })

  const activity = (stats?.recentActivity ?? []).slice(0, 10).map((a) => {
    const kind = (a.kind || '').trim().toUpperCase()
    if (kind === 'APPOINTMENT_CREATED') {
      const who = (a.clientName ?? a.clientEmail ?? 'Cliente').trim() || 'Cliente'
      const svc = a.serviceName ?? 'serviço'
      return {
        key: `${a.at}_${kind}_${who}`,
        dot: 'var(--primary)',
        title: 'Novo agendamento',
        desc: `${who} agendou ${svc}`,
        when: relative(a.at),
      }
    }
    if (kind === 'EXPENSE_CREATED') {
      const note = a.note?.trim() ? a.note.trim() : 'Despesa'
      const amount = typeof a.amountCents === 'number' ? formatBRL(a.amountCents / 100) : ''
      const desc = amount ? `${note} (${amount})` : note
      return {
        key: `${a.at}_${kind}_${note}`,
        dot: 'var(--danger)',
        title: 'Despesa lançada',
        desc,
        when: relative(a.at),
      }
    }
    return {
      key: `${a.at}_${kind}`,
      dot: 'var(--gray-400)',
      title: kind || 'Atividade',
      desc: '—',
      when: relative(a.at),
    }
  })

  return (
    <>
      <div className="welcome-banner">
        <h1 style={{margin: 0, fontSize: '2rem', fontWeight: 800}}>{greeting}, {me?.email?.split('@')[0]}!</h1>
        <p style={{margin: '8px 0 0', opacity: 0.9, fontSize: '1.1rem'}}>
          Você tem {stats?.today?.appointmentsCount ?? 0} agendamentos hoje.
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Calendar size={24} /></div>
          <div className="stat-info">
            <h4>Agendamentos Hoje</h4>
            <div className="value">{stats?.today?.appointmentsCount ?? 0}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Wallet size={24} /></div>
          <div className="stat-info">
            <h4>Faturamento Estimado</h4>
            <div className="value">R$ {(((stats?.today?.expectedRevenueCents ?? 0) / 100).toFixed(2) ?? '0,00')}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Users size={24} /></div>
          <div className="stat-info">
            <h4>Novos Clientes</h4>
            <div className="value">{stats?.newClients30d ?? 0}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock size={24} /></div>
          <div className="stat-info">
            <h4>Pendentes</h4>
            <div className="value">{stats?.pendingAppointments ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-2-1">
        <div className="column" style={{gap: '2rem'}}>
        <div className="card">
          <div className="cardHeader">
            <h3 className="cardTitle">Próximos Agendamentos</h3>
            <button className="btn btn-ghost" style={{fontSize: '0.85rem'}}>Ver todos</button>
          </div>
          
          {/* Desktop Table View */}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Horário</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(appt => (
                    <tr key={appt.id}>
                    <td>
                        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                        <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem', background: appt.avatarBg, color: appt.avatarColor}}>{appt.avatar}</div>
                        <span style={{fontWeight: 600}}>{appt.name}</span>
                        </div>
                    </td>
                    <td>{appt.service}</td>
                    <td>{appt.time}</td>
                    <td><span className={`status-badge ${appt.statusClass}`}>{appt.status}</span></td>
                    <td>
                        <PortalMenu
                            trigger={(isOpen) => (
                                <button className="icon-btn" style={{width: 32, height: 32, background: isOpen ? 'var(--gray-100)' : 'transparent', border: 'none'}}>
                                    <MoreHorizontal size={16}/>
                                </button>
                            )}
                        >
                            {(close) => (
                                <>
                                    {appt.rawStatus !== 'CONFIRMED' && (
                                        <button 
                                            className="btn-menu-item" 
                                            onClick={() => { handleStatusChange(appt.id, 'CONFIRMED'); close() }}
                                        >
                                            <Check size={16} color="var(--success)" /> Confirmar
                                        </button>
                                    )}
                                    {appt.rawStatus !== 'CANCELLED' && (
                                        <button 
                                            className="btn-menu-item danger" 
                                            onClick={() => { handleStatusChange(appt.id, 'CANCELLED'); close() }}
                                        >
                                            <XCircle size={16} /> Cancelar
                                        </button>
                                    )}
                                </>
                            )}
                        </PortalMenu>
                    </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile List View */}
          <div className="mobile-appointment-list" style={{padding: '1rem'}}>
            {upcoming.map(appt => (
                <div className="mobile-appointment-card" key={appt.id}>
                    <div className="mobile-appointment-header">
                        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                            <div className="user-avatar-mini" style={{width: 40, height: 40, fontSize: '0.9rem', background: appt.avatarBg, color: appt.avatarColor}}>{appt.avatar}</div>
                            <div>
                                <div style={{fontWeight: 700, color: 'var(--gray-900)'}}>{appt.name}</div>
                                <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{appt.service}</div>
                            </div>
                        </div>
                        <PortalMenu
                            trigger={(isOpen) => (
                                <button className="icon-btn" style={{width: 32, height: 32, background: isOpen ? 'var(--gray-100)' : 'transparent', border: 'none'}}>
                                    <MoreHorizontal size={16}/>
                                </button>
                            )}
                        >
                            {(close) => (
                                <>
                                    {appt.rawStatus !== 'CONFIRMED' && (
                                        <button 
                                            className="btn-menu-item" 
                                            onClick={() => { handleStatusChange(appt.id, 'CONFIRMED'); close() }}
                                        >
                                            <Check size={16} color="var(--success)" /> Confirmar
                                        </button>
                                    )}
                                    {appt.rawStatus !== 'CANCELLED' && (
                                        <button 
                                            className="btn-menu-item danger" 
                                            onClick={() => { handleStatusChange(appt.id, 'CANCELLED'); close() }}
                                        >
                                            <XCircle size={16} /> Cancelar
                                        </button>
                                    )}
                                </>
                            )}
                        </PortalMenu>
                    </div>
                    <div className="mobile-appointment-row">
                        <div style={{display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gray-600)', fontWeight: 500}}>
                            <Clock size={14} />
                            {appt.time}
                        </div>
                        <span className={`status-badge ${appt.statusClass}`}>{appt.status}</span>
                    </div>
                </div>
            ))}
          </div>
        </div>
        
        <div className="card">
            <div className="cardHeader">
                <h3 className="cardTitle" style={{fontSize: '1rem'}}>Link de Agendamento</h3>
            </div>
            <div className="cardBody">
                <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12}}>
                    Envie este link para suas clientes agendarem:
                </p>
                <div style={{
                    background: 'var(--bg-subtle)', 
                    padding: 12, 
                    borderRadius: 'var(--radius-md)', 
                    fontSize: '0.85rem', 
                    marginBottom: 16, 
                    border: '1px solid var(--gray-200)', 
                    color: 'var(--primary-600)', 
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8
                }}>
                    <span style={{wordBreak: 'break-all'}}>{bookingLink}</span>
                    <button onClick={copyLink} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)', padding: 4, display: 'flex'}}>
                        {copied ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
                    </button>
                </div>
                <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
                    <button className="btn w-full" style={{flex: 1}} onClick={copyLink}>
                        {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                    <button className="btn btnPrimary w-full" style={{flex: 1}} onClick={() => window.open(bookingLink, '_blank')}>
                        Abrir Link
                    </button>
                </div>
            </div>
        </div>
        </div>

        <div className="column" style={{gap: '1.5rem'}}>
            <div className="card">
            <div className="cardHeader">
                <h3 className="cardTitle" style={{fontSize: '1rem'}}>Atividade Recente</h3>
            </div>
            <div className="cardBody">
                {activity.map((a, idx) => (
                    <div key={a.key} style={{display: 'flex', gap: 16, marginBottom: idx === activity.length - 1 ? 0 : 20, position: 'relative'}}>
                        {idx === 0 ? (
                            <div style={{position: 'absolute', left: 5, top: 10, bottom: -20, width: 2, background: 'var(--gray-100)'}}></div>
                        ) : null}
                        <div style={{width: 12, height: 12, borderRadius: '50%', background: a.dot, marginTop: 4, zIndex: 1, border: '2px solid white', boxShadow: `0 0 0 2px color-mix(in srgb, ${a.dot} 18%, transparent)`}} />
                        <div>
                            <div style={{fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-800)'}}>{a.title}</div>
                            <div style={{fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: 2}}>{a.desc}</div>
                            <div style={{fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4}}>{a.when}</div>
                        </div>
                    </div>
                ))}
                {activity.length === 0 ? (
                    <div style={{color: 'var(--text-muted)', fontSize: '0.9rem'}}>Sem atividade recente.</div>
                ) : null}
            </div>
            </div>
        </div>
      </div>
    </>
  )
}

function AdminServices() {
    const [services, setServices] = useState<AdminService[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [newService, setNewService] = useState({ name: '', duration: 60, price: 0, coverUrl: '' })
    const [saving, setSaving] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    const coverFileInputRef = useRef<HTMLInputElement | null>(null)
    const [coverBusy, setCoverBusy] = useState(false)
    const [coverFileName, setCoverFileName] = useState<string | null>(null)
    const [coverError, setCoverError] = useState<string | null>(null)
    const [coverDragOver, setCoverDragOver] = useState(false)

    useEffect(() => {
        load()
    }, [])

    async function load() {
        setLoading(true)
        const res = await api<{services: AdminService[]}>('/api/admin/services')
        if(res.ok) setServices(res.data.services)
        setLoading(false)
    }

    function openCreateModal() {
        setCoverBusy(false)
        setCoverFileName(null)
        setCoverError(null)
        setEditingId(null)
        setNewService({ name: '', duration: 60, price: 0, coverUrl: '' })
        if (coverFileInputRef.current) coverFileInputRef.current.value = ''
        setModalOpen(true)
    }

    function openEditModal(s: AdminService) {
        setCoverBusy(false)
        setCoverFileName(null)
        setCoverError(null)
        setEditingId(s.id)
        setNewService({ 
            name: s.name, 
            duration: s.durationMinutes, 
            price: s.priceCents / 100, 
            coverUrl: s.coverUrl || '' 
        })
        if (coverFileInputRef.current) coverFileInputRef.current.value = ''
        setModalOpen(true)
    }

    async function handleDelete() {
        if (!editingId || !confirm('Tem certeza que deseja excluir este serviço?')) return
        setSaving(true)
        await api(`/api/admin/services/${editingId}`, { method: 'DELETE' })
        setSaving(false)
        setModalOpen(false)
        load()
    }

    function loadImageFromObjectUrl(src: string) {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error('Falha ao carregar imagem'))
            img.src = src
        })
    }

    function drawToCanvas(img: HTMLImageElement, maxDim: number) {
        const w = img.naturalWidth || img.width
        const h = img.naturalHeight || img.height
        const largest = Math.max(w, h)
        const scale = largest > maxDim ? maxDim / largest : 1
        const cw = Math.max(1, Math.round(w * scale))
        const ch = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas indisponível')
        ctx.clearRect(0, 0, cw, ch)
        ctx.drawImage(img, 0, 0, cw, ch)
        return canvas
    }

    function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality?: number) {
        try {
            return canvas.toDataURL(type, quality)
        } catch {
            return canvas.toDataURL('image/png')
        }
    }

    async function fileToOptimizedDataUrl(file: File) {
        const objectUrl = URL.createObjectURL(file)
        try {
            const img = await loadImageFromObjectUrl(objectUrl)
            const attempts: Array<{ maxDim: number; quality: number }> = [
                { maxDim: 768, quality: 0.86 },
                { maxDim: 640, quality: 0.8 },
                { maxDim: 512, quality: 0.78 },
                { maxDim: 512, quality: 0.7 },
                { maxDim: 384, quality: 0.7 }
            ]

            for (const a of attempts) {
                const canvas = drawToCanvas(img, a.maxDim)
                const webp = canvasToDataUrl(canvas, 'image/webp', a.quality)
                if (webp.startsWith('data:image/') && webp.length <= 350_000) return webp
                const png = canvasToDataUrl(canvas, 'image/png')
                if (png.startsWith('data:image/') && png.length <= 350_000) return png
            }

            return canvasToDataUrl(drawToCanvas(img, 384), 'image/png')
        } finally {
            URL.revokeObjectURL(objectUrl)
        }
    }

    async function handleCoverFile(file: File) {
        setCoverBusy(true)
        setCoverError(null)
        try {
            if (!file.type.startsWith('image/')) {
                setCoverError('Arquivo inválido (envie uma imagem)')
                return
            }
            const dataUrl = await fileToOptimizedDataUrl(file)
            if (!dataUrl.startsWith('data:image/')) {
                setCoverError('Falha ao processar a imagem')
                return
            }
            if (dataUrl.length > 350_000) {
                setCoverError('Imagem muito grande. Use uma menor.')
                return
            }
            setCoverFileName(file.name)
            setNewService((s) => ({ ...s, coverUrl: dataUrl }))
        } catch {
            setCoverError('Falha ao processar a imagem')
        } finally {
            setCoverBusy(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        const payload: { name: string; durationMinutes: number; priceCents: number; coverUrl?: string | null } = {
            name: newService.name,
            durationMinutes: Number(newService.duration),
            priceCents: Math.round(Number(newService.price) * 100)
        }
        if (newService.coverUrl) payload.coverUrl = newService.coverUrl
        else if (editingId && !newService.coverUrl) payload.coverUrl = null

        if (editingId) {
            await api(`/api/admin/services/${editingId}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            })
        } else {
            await api('/api/admin/services', {
                method: 'POST',
                body: JSON.stringify(payload)
            })
        }
        
        setSaving(false)
        setModalOpen(false)
        load()
    }

    return (
        <>
            <div className="card">
                <div className="cardHeader">
                    <div>
                        <h2 className="cardTitle">Serviços</h2>
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4}}>Gerencie os serviços oferecidos no seu espaço.</p>
                    </div>
                    <button className="btn btnPrimary" onClick={openCreateModal}>
                        <Plus size={16} style={{marginRight: 8}}/> Novo Serviço
                    </button>
                </div>

                {loading ? <div style={{padding: 20}}>Carregando...</div> : (
                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Duração</th>
                                    <th>Preço</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {services.map(s => (
                                    <tr key={s.id}>
                                        <td style={{fontWeight: 600, color: 'var(--gray-800)'}}>{s.name}</td>
                                        <td><span className="pill" style={{fontSize: '0.8rem'}}>{s.durationMinutes} min</span></td>
                                        <td style={{fontWeight: 500}}>R$ {(s.priceCents/100).toFixed(2)}</td>
                                        <td>
                                            <button className="icon-btn" style={{width: 32, height: 32}} onClick={() => openEditModal(s)}><Edit2 size={16}/></button>
                                        </td>
                                    </tr>
                                ))}
                                {services.length === 0 && (
                                    <tr><td colSpan={4} style={{textAlign: 'center', padding: 40, color: 'var(--text-muted)'}}>Nenhum serviço cadastrado.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modalOpen && (
                <div className="modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="cardHeader" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                            <h3 className="cardTitle">{editingId ? 'Editar Serviço' : 'Novo Serviço'}</h3>
                            <button className="icon-btn" onClick={() => setModalOpen(false)} style={{width: 32, height: 32, border: 'none'}}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="cardBody">
                            <div className="form-stack">
                                <div className="input-group">
                                    <label className="label">Capa do Serviço (Opcional)</label>
                                    <div 
                                        className={`cover-uploader ${coverDragOver ? 'dragover' : ''}`}
                                        onDragOver={(e) => { e.preventDefault(); setCoverDragOver(true) }}
                                        onDragLeave={() => setCoverDragOver(false)}
                                        onDrop={(e) => {
                                            e.preventDefault()
                                            setCoverDragOver(false)
                                            const f = e.dataTransfer.files?.[0]
                                            if (f) handleCoverFile(f)
                                        }}
                                        style={{
                                            border: `2px dashed ${coverDragOver ? 'var(--primary-500)' : 'var(--gray-300)'}`,
                                            borderRadius: 'var(--radius-md)',
                                            background: coverDragOver ? 'var(--primary-50)' : 'var(--bg-subtle)',
                                            transition: 'all 0.2s ease',
                                            cursor: coverBusy ? 'wait' : 'pointer',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            height: 200,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            textAlign: 'center'
                                        }}
                                        onClick={() => !coverBusy && coverFileInputRef.current?.click()}
                                    >
                                        {coverBusy && (
                                            <div style={{
                                                position: 'absolute', 
                                                inset: 0, 
                                                background: 'rgba(255,255,255,0.8)', 
                                                zIndex: 10, 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center'
                                            }}>
                                                <div className="spinner" />
                                            </div>
                                        )}

                                        {newService.coverUrl ? (
                                            <>
                                                <img
                                                    src={newService.coverUrl}
                                                    alt="Capa do serviço"
                                                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                                                    onError={() => setCoverError('Imagem inválida')}
                                                />
                                                <div 
                                                    className="cover-actions-overlay"
                                                    style={{
                                                        position: 'absolute',
                                                        inset: 0,
                                                        background: 'rgba(0,0,0,0.4)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: 12,
                                                        opacity: 0,
                                                        transition: 'opacity 0.2s',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                    onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                                                >
                                                    <button 
                                                        type="button" 
                                                        className="btn" 
                                                        style={{background: 'white', border: 'none', color: 'var(--gray-900)', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            coverFileInputRef.current?.click()
                                                        }}
                                                    >
                                                        <Upload size={16} style={{marginRight: 8}} /> Trocar
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        className="btn"
                                                        style={{background: '#fee2e2', color: '#ef4444', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'}}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setCoverError(null)
                                                            setCoverFileName(null)
                                                            setNewService((s) => ({ ...s, coverUrl: '' }))
                                                            if (coverFileInputRef.current) coverFileInputRef.current.value = ''
                                                        }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{padding: 24, pointerEvents: 'none'}}>
                                                <div style={{
                                                    width: 48, 
                                                    height: 48, 
                                                    background: 'var(--gray-100)', 
                                                    borderRadius: '50%', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center', 
                                                    margin: '0 auto 12px',
                                                    color: 'var(--primary-600)'
                                                }}>
                                                    <ImageIcon size={24} />
                                                </div>
                                                <div style={{fontWeight: 600, color: 'var(--gray-700)', marginBottom: 4}}>
                                                    Adicionar capa
                                                </div>
                                                <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                                                    Arraste ou clique para enviar
                                                </div>
                                            </div>
                                        )}
                                        
                                        <input
                                            ref={coverFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            style={{display: 'none'}}
                                            onChange={(e) => {
                                                const f = e.target.files?.[0]
                                                if (!f) return
                                                handleCoverFile(f)
                                            }}
                                        />
                                    </div>
                                    {coverError && (
                                        <div style={{marginTop: 10, color: 'var(--danger)', fontSize: '0.85rem'}}>{coverError}</div>
                                    )}
                                </div>

                                <div className="input-group">
                                    <label className="label">Nome do Serviço</label>
                                    <div className="input-wrapper">
                                        <Sparkles size={16} className="input-icon" />
                                        <input
                                            className="input has-icon"
                                            value={newService.name}
                                            onChange={e => setNewService({...newService, name: e.target.value})}
                                            placeholder="Ex: Cílios Volume Russo"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="row">
                                    <div className="input-group">
                                        <label className="label">Duração (min)</label>
                                        <div className="input-wrapper">
                                            <Clock size={16} className="input-icon" />
                                            <input
                                                className="input has-icon"
                                                type="number"
                                                value={newService.duration}
                                                onChange={e => setNewService({...newService, duration: Number(e.target.value)})}
                                                min={1}
                                            />
                                        </div>
                                    </div>
                                    <div className="input-group">
                                        <label className="label">Preço (R$)</label>
                                        <div className="input-wrapper">
                                            <Wallet size={16} className="input-icon" />
                                            <input
                                                className="input has-icon"
                                                type="text"
                                                inputMode="decimal"
                                                autoComplete="off"
                                                placeholder="R$0,00"
                                                value={formatBRL(newService.price)}
                                                onChange={e => {
                                                    const digits = e.target.value.replace(/\D/g, '')
                                                    const units = digits ? parseInt(digits, 10) / 100 : 0
                                                    setNewService({ ...newService, price: units })
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="row" style={{marginTop: 10}}>
                                    {editingId && (
                                        <button className="btn" style={{color: 'var(--danger)', borderColor: 'var(--danger-border)', marginRight: 'auto'}} onClick={handleDelete} disabled={saving}>
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                    <button className="btn" onClick={() => setModalOpen(false)}>Cancelar</button>
                                    <button className="btn btnPrimary" onClick={handleSave} disabled={saving}>
                                        {saving ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Criar')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

function CustomSelect({ 
    value, 
    onChange, 
    options, 
    placeholder, 
    icon 
}: { 
    value: string; 
    onChange: (value: string) => void; 
    options: { value: string; label: string; subLabel?: string }[]; 
    placeholder?: string;
    icon?: ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const selectedOption = options.find(o => o.value === value)

    return (
        <div className={`custom-select ${isOpen ? 'open' : ''}`} ref={containerRef}>
            <div 
                className="custom-select-trigger" 
                onClick={() => setIsOpen(!isOpen)}
                style={{paddingLeft: icon ? 44 : 16}}
            >
                {icon && <span className="input-icon" style={{left: 16, top: '50%', transform: 'translateY(-50%)', position: 'absolute', color: 'var(--gray-400)', pointerEvents: 'none'}}>{icon}</span>}
                <span style={{color: selectedOption ? 'var(--gray-900)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {selectedOption ? selectedOption.label : placeholder || 'Selecione...'}
                </span>
                <ChevronRight 
                    size={16} 
                    className="custom-select-arrow"
                />
            </div>
            
            <div className="custom-select-menu">
                {options.map(option => (
                    <div 
                        key={option.value} 
                        className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
                        onClick={() => {
                            onChange(option.value)
                            setIsOpen(false)
                        }}
                    >
                        <div style={{display: 'flex', flexDirection: 'column'}}>
                            <div style={{fontWeight: 500}}>{option.label}</div>
                            {option.subLabel && (
                                <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{option.subLabel}</div>
                            )}
                        </div>
                        {option.value === value && <Check size={16} className="check-icon" style={{color: 'var(--primary-600)'}} />}
                    </div>
                ))}
                {options.length === 0 && (
                    <div style={{padding: 12, color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem'}}>
                        Nenhum item disponível
                    </div>
                )}
            </div>
        </div>
    )
}

function NewAppointmentModal({
    isOpen,
    onClose,
    onSuccess,
    initialDate
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (event: CalendarEvent) => void;
    initialDate: Date;
}) {
    const [clientName, setClientName] = useState('')
    const [serviceId, setServiceId] = useState('')
    const [date, setDate] = useState('')
    const [time, setTime] = useState('09:00')
    const [loading, setLoading] = useState(false)
    const [services, setServices] = useState<AdminService[]>([])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if(isOpen) {
            // Set default date to initialDate (which is currentDate from calendar)
            setDate(initialDate.toISOString().split('T')[0])
            loadServices()
        }
    }, [isOpen, initialDate])

    async function loadServices() {
        // In real app, we might want to cache this or pass from parent
        // But fetching ensures fresh data
        const res = await api<{services: AdminService[]}>('/api/admin/services')
        if(res.ok) {
            setServices(res.data.services)
            if(res.data.services.length > 0 && !serviceId) {
                setServiceId(res.data.services[0].id)
            }
        }
    }

    const handleSubmit = async () => {
        if(!clientName || !serviceId || !date || !time) {
            setError('Preencha todos os campos')
            return
        }

        setLoading(true)
        setError(null)

        // Find selected service to get duration/name
        const service = services.find(s => s.id === serviceId)
        if(!service) {
            setError('Serviço inválido')
            setLoading(false)
            return
        }

        const startDateTime = new Date(`${date}T${time}`)
        const res = await api<{ appointment: AdminAppointment }>('/api/admin/appointments', {
            method: 'POST',
            body: JSON.stringify({
                clientName,
                serviceId,
                startsAt: startDateTime.toISOString(),
                status: 'CONFIRMED'
            })
        })

        if (!res.ok) {
            setError(res.error.message)
            setLoading(false)
            return
        }

        const a = res.data.appointment
        const status = a.status === 'CONFIRMED' ? 'confirmed' : a.status === 'PENDING' ? 'pending' : 'cancelled'
        const colors =
            status === 'confirmed'
                ? { color: '#dcfce7', textColor: '#166534' }
                : status === 'pending'
                  ? { color: '#fef9c3', textColor: '#854d0e' }
                  : { color: '#e5e7eb', textColor: '#374151' }

        onSuccess({
            id: a.id,
            clientName: a.clientName ?? clientName,
            title: a.serviceName,
            start: a.startsAt,
            end: a.endsAt,
            status,
            ...colors,
        })

        onClose()
        setLoading(false)
        
        // Reset form
        setClientName('')
        setTime('09:00')
    }

    if (!isOpen) return null

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="cardHeader">
                    <h3 className="cardTitle">Novo Agendamento</h3>
                    <button className="icon-btn" onClick={onClose} style={{width: 32, height: 32, border: 'none'}}>
                        <XCircle size={20} />
                    </button>
                </div>
                <div className="cardBody">
                    <div className="form-stack">
                        <div className="input-group">
                            <label className="label">Cliente</label>
                            <div className="input-wrapper">
                                <Users size={16} className="input-icon" />
                                <input 
                                    className="input has-icon" 
                                    value={clientName} 
                                    onChange={e => setClientName(e.target.value)} 
                                    placeholder="Nome da cliente" 
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="label">Serviço</label>
                            <CustomSelect 
                                value={serviceId}
                                onChange={setServiceId}
                                options={services.map(s => ({
                                    value: s.id,
                                    label: s.name,
                                    subLabel: `${s.durationMinutes} min - R$ ${(s.priceCents/100).toFixed(2)}`
                                }))}
                                placeholder="Selecione um serviço"
                                icon={<Sparkles size={16} />}
                            />
                        </div>

                        <div className="row">
                            <div className="input-group">
                                <label className="label">Data</label>
                                <input 
                                    type="date" 
                                    className="input" 
                                    value={date} 
                                    onChange={e => setDate(e.target.value)} 
                                />
                            </div>
                            <div className="input-group">
                                <label className="label">Horário</label>
                                <div className="input-wrapper">
                                    <Clock size={16} className="input-icon" />
                                    <input 
                                        type="time" 
                                        className="input has-icon" 
                                        value={time} 
                                        onChange={e => setTime(e.target.value)} 
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="pill" style={{color: 'var(--danger)', background: '#fee2e2', justifyContent: 'center'}}>
                                {error}
                            </div>
                        )}

                        <div className="row" style={{marginTop: 10}}>
                            <button className="btn w-full" onClick={onClose}>Cancelar</button>
                            <button className="btn btnPrimary w-full" onClick={handleSubmit} disabled={loading}>
                                {loading ? 'Salvando...' : 'Agendar'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function AppointmentDetailsModal({
    isOpen,
    onClose,
    event,
    onDelete
}: {
    isOpen: boolean;
    onClose: () => void;
    event: CalendarEvent | null;
    onDelete: (id: string) => Promise<void>;
}) {
    if (!isOpen || !event) return null

    return (
        <div className="modal-overlay" onClick={onClose} style={{zIndex: 100}}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="cardHeader">
                    <h3 className="cardTitle">Detalhes do Agendamento</h3>
                    <button className="icon-btn" onClick={onClose} style={{width: 32, height: 32, border: 'none'}}>
                        <XCircle size={20} />
                    </button>
                </div>
                <div className="cardBody">
                    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                        <div>
                            <label className="label">Cliente</label>
                            <div style={{fontSize: '1.1rem', fontWeight: 600}}>{event.clientName}</div>
                        </div>
                        <div>
                            <label className="label">Serviço</label>
                            <div>{event.title}</div>
                        </div>
                        <div className="row">
                            <div>
                                <label className="label">Data</label>
                                <div>{new Date(event.start).toLocaleDateString()}</div>
                            </div>
                            <div>
                                <label className="label">Horário</label>
                                <div>
                                    {new Date(event.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                                    {new Date(event.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="label">Status</label>
                            <span 
                                className="pill" 
                                style={{
                                    backgroundColor: event.color, 
                                    color: event.textColor,
                                    alignSelf: 'flex-start',
                                    display: 'inline-flex'
                                }}
                            >
                                {event.status === 'confirmed' ? 'Confirmado' : event.status === 'pending' ? 'Pendente' : 'Cancelado'}
                            </span>
                        </div>
                    </div>

                    <div style={{marginTop: 32, display: 'flex', justifyContent: 'flex-end'}}>
                        <button 
                            className="btn" 
                            style={{
                                backgroundColor: '#fee2e2', 
                                color: '#991b1b',
                                border: '1px solid #fecaca'
                            }}
                            onClick={async () => {
                                if(confirm('Tem certeza que deseja excluir este agendamento?')) {
                                    await onDelete(event.id)
                                    onClose()
                                }
                            }}
                        >
                            <Trash2 size={16} style={{marginRight: 8}} />
                            Excluir Agendamento
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function AdminCalendar() {
    const [view, setView] = useState<'week' | 'month'>('week')
    const [currentDate, setCurrentDate] = useState(new Date())
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

    type AdminBusinessHour = { id: string; weekday: number; startMinute: number; endMinute: number }
    type AdminTimeOff = { id: string; startsAt: string; endsAt: string; reason: string | null; createdAt: string }

    const [agendaTab, setAgendaTab] = useState<'appointments' | 'hours' | 'blocks'>('appointments')

    const [tenantTimeZone, setTenantTimeZone] = useState('America/Sao_Paulo')

    const [businessHours, setBusinessHours] = useState<AdminBusinessHour[]>([])
    const [businessHoursLoading, setBusinessHoursLoading] = useState(false)
    const [businessHoursError, setBusinessHoursError] = useState<string | null>(null)
    const [businessHoursEdits, setBusinessHoursEdits] = useState<Record<number, { startTime: string; endTime: string; lunchEnabled: boolean; lunchStart: string; lunchEnd: string }>>({})

    const [timeOff, setTimeOff] = useState<AdminTimeOff[]>([])
    const [timeOffLoading, setTimeOffLoading] = useState(false)
    const [timeOffError, setTimeOffError] = useState<string | null>(null)
    const [timeOffAdd, setTimeOffAdd] = useState<{ startsLocal: string; endsLocal: string; reason: string }>(() => {
        const now = new Date()
        const pad = (v: number) => String(v).padStart(2, '0')
        const y = String(now.getFullYear())
        const m = pad(now.getMonth() + 1)
        const d = pad(now.getDate())
        return { startsLocal: `${y}-${m}-${d}T09:00`, endsLocal: `${y}-${m}-${d}T18:00`, reason: '' }
    })
    
    // Responsive Days Logic
    const [daysToShow, setDaysToShow] = useState(7)
    
    useEffect(() => {
        const handleResize = () => {
            const w = window.innerWidth
            if (w < 640) setDaysToShow(1)
            else if (w < 1024) setDaysToShow(3)
            else setDaysToShow(7)
        }
        handleResize() // init
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Helpers for Date Manipulation
    const getWeekDays = (date: Date) => {
        const start = new Date(date)
        
        if (daysToShow === 7) {
            // Standard week view (Sunday to Saturday)
            const day = start.getDay()
            const diff = start.getDate() - day
            start.setDate(diff)
        } else {
            // Rolling view (starts from current date)
            // No adjustment needed, start from 'date'
        }
        start.setHours(0,0,0,0)
        
        return Array.from({ length: daysToShow }, (_, i) => {
            const d = new Date(start)
            d.setDate(start.getDate() + i)
            return d
        })
    }

    const getMonthDays = (date: Date) => {
        const year = date.getFullYear()
        const month = date.getMonth()
        
        const firstDayOfMonth = new Date(year, month, 1)
        const startDay = firstDayOfMonth.getDay() // 0 (Sun) to 6 (Sat)
        
        // Start date of the grid (previous month padding)
        const start = new Date(firstDayOfMonth)
        start.setDate(1 - startDay)
        start.setHours(0,0,0,0)

        // Generate 42 days (6 weeks) to ensure full month coverage
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(start)
            d.setDate(start.getDate() + i)
            return d
        })
    }

    const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate, daysToShow])
    const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate])

    useEffect(() => {
        let mounted = true
        api<{ timezone: string }>('/api/public/booking').then((res) => {
            if (!mounted) return
            if (res.ok && res.data?.timezone) setTenantTimeZone(res.data.timezone)
        })
        return () => {
            mounted = false
        }
    }, [])

    const weekdayNamesFull = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    const weekdayNamesShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

    const minuteToTime = (minute: number) => {
        const m = Math.max(0, Math.min(1440, Math.floor(minute)))
        const hh = String(Math.floor(m / 60)).padStart(2, '0')
        const mm = String(m % 60).padStart(2, '0')
        return `${hh}:${mm}`
    }

    const timeToMinute = (t: string) => {
        const m = /^([0-9]{2}):([0-9]{2})$/.exec(t)
        if (!m) return null
        const hh = Number(m[1])
        const mm = Number(m[2])
        if (![hh, mm].every(Number.isFinite)) return null
        if (hh < 0 || hh > 23) return null
        if (mm < 0 || mm > 59) return null
        return hh * 60 + mm
    }

    const timeOptions = useMemo(() => {
        const opts: string[] = []
        for (let i = 0; i < 24 * 60; i += 15) {
            const h = Math.floor(i / 60).toString().padStart(2, '0')
            const m = (i % 60).toString().padStart(2, '0')
            opts.push(`${h}:${m}`)
        }
        // Add end of day if needed, usually business hours go up to a certain point.
        // But 23:45 is the last 15m slot start.
        return opts
    }, [])

    const TimeSelect = ({ value, onChange, disabled }: { value: string, onChange: (val: string) => void, disabled?: boolean }) => {
        const [isOpen, setIsOpen] = useState(false)
        const wrapperRef = useRef<HTMLDivElement>(null)

        useEffect(() => {
            function handleClickOutside(event: MouseEvent) {
                if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                    setIsOpen(false)
                }
            }
            if (isOpen) {
                document.addEventListener('mousedown', handleClickOutside)
            }
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }, [isOpen])

        // Scroll to selected option when opened
        useEffect(() => {
            if (isOpen && wrapperRef.current) {
                const selected = wrapperRef.current.querySelector('.time-option.selected')
                if (selected) {
                    selected.scrollIntoView({ block: 'center' })
                }
            }
        }, [isOpen])

        return (
            <div className="time-select-custom" ref={wrapperRef}>
                <div 
                    className={`time-select-trigger ${disabled ? 'disabled' : ''}`}
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                >
                    <span style={{flex: 1, textAlign: 'center'}}>{value}</span>
                    <Clock size={14} className="time-select-icon" />
                </div>
                {isOpen && (
                    <div className="time-select-dropdown">
                        {timeOptions.map(t => (
                            <div 
                                key={t} 
                                className={`time-option ${t === value ? 'selected' : ''}`}
                                onClick={() => {
                                    onChange(t)
                                    setIsOpen(false)
                                }}
                            >
                                {t}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    const sortBusinessHours = (list: AdminBusinessHour[]) => {
        return [...list].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
    }

    const suggestLunch = (startMinute: number, endMinute: number) => {
        const span = endMinute - startMinute
        const base = Math.max(startMinute + 60, startMinute + Math.floor(span / 2) - 30)
        const lunchStart = Math.min(endMinute - 90, base)
        const lunchEnd = Math.min(endMinute - 30, lunchStart + 60)
        return { lunchStart, lunchEnd }
    }

    const buildDayEditState = (ranges: AdminBusinessHour[]) => {
        if (ranges.length === 0) {
            return { startTime: '09:00', endTime: '18:00', lunchEnabled: false, lunchStart: '12:00', lunchEnd: '13:00' }
        }
        if (ranges.length === 1) {
            const r = ranges[0]
            const lunch = suggestLunch(r.startMinute, r.endMinute)
            return {
                startTime: minuteToTime(r.startMinute),
                endTime: minuteToTime(r.endMinute),
                lunchEnabled: false,
                lunchStart: '12:00',
                lunchEnd: '13:00',
            }
        }
        const r1 = ranges[0]
        const r2 = ranges[1]
        return {
            startTime: minuteToTime(r1.startMinute),
            endTime: minuteToTime(r2.endMinute),
            lunchEnabled: true,
            lunchStart: minuteToTime(r1.endMinute),
            lunchEnd: minuteToTime(r2.startMinute),
        }
    }

    const syncDayRanges = async (weekday: number, nextState: { startTime: string; endTime: string; lunchEnabled: boolean; lunchStart: string; lunchEnd: string }) => {
        const dayRanges = sortBusinessHours(businessHours.filter((b) => b.weekday === weekday))
        const startMinute = timeToMinute(nextState.startTime)
        const endMinute = timeToMinute(nextState.endTime)
        if (startMinute === null || endMinute === null) return
        if (endMinute <= startMinute) {
            setBusinessHoursError('Intervalo inválido')
            return
        }

        const upsert = (bh: AdminBusinessHour) => {
            setBusinessHours((prev) => {
                const exists = prev.some((p) => p.id === bh.id)
                const next = exists ? prev.map((p) => (p.id === bh.id ? bh : p)) : [...prev, bh]
                return sortBusinessHours(next)
            })
        }

        const createRange = async (start: number, end: number) => {
            const res = await api<{ businessHour: AdminBusinessHour }>('/api/admin/business-hours', {
                method: 'POST',
                body: JSON.stringify({ weekday, startMinute: start, endMinute: end }),
            })
            if (res.ok) upsert(res.data.businessHour)
        }

        const patchRange = async (id: string, start: number, end: number) => {
            const res = await api<{ businessHour: AdminBusinessHour }>(`/api/admin/business-hours/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ weekday, startMinute: start, endMinute: end }),
            })
            if (res.ok) upsert(res.data.businessHour)
        }

        const deleteRange = async (id: string) => {
            const res = await api<{ ok: true }>(`/api/admin/business-hours/${id}`, { method: 'DELETE' })
            if (res.ok) setBusinessHours((prev) => prev.filter((p) => p.id !== id))
        }

        if (!nextState.lunchEnabled) {
            if (dayRanges.length === 0) {
                await createRange(startMinute, endMinute)
            } else {
                await patchRange(dayRanges[0].id, startMinute, endMinute)
                for (const r of dayRanges.slice(1)) await deleteRange(r.id)
            }
            return
        }

        const lunchStart = timeToMinute(nextState.lunchStart)
        const lunchEnd = timeToMinute(nextState.lunchEnd)
        if (lunchStart === null || lunchEnd === null) return
        if (!(startMinute < lunchStart && lunchStart < lunchEnd && lunchEnd < endMinute)) {
            setBusinessHoursError('Intervalo de almoço inválido')
            return
        }

        const morningStart = startMinute
        const morningEnd = lunchStart
        const afternoonStart = lunchEnd
        const afternoonEnd = endMinute

        if (morningEnd <= morningStart || afternoonEnd <= afternoonStart) {
            setBusinessHoursError('Intervalo inválido')
            return
        }

        if (dayRanges.length === 0) {
            await createRange(morningStart, morningEnd)
            await createRange(afternoonStart, afternoonEnd)
            return
        }

        if (dayRanges.length === 1) {
            await patchRange(dayRanges[0].id, morningStart, morningEnd)
            await createRange(afternoonStart, afternoonEnd)
            return
        }

        await patchRange(dayRanges[0].id, morningStart, morningEnd)
        await patchRange(dayRanges[1].id, afternoonStart, afternoonEnd)
        for (const r of dayRanges.slice(2)) await deleteRange(r.id)
    }

    const utcForLocalTime = (input: {
        timeZone: string
        year: number
        month: number
        day: number
        hour: number
        minute: number
        second?: number
    }) => {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: input.timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })

        const targetUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second ?? 0)
        let utc = new Date(targetUtc)

        for (let i = 0; i < 4; i++) {
            const parts = fmt.formatToParts(utc)
            const y = Number(parts.find(p => p.type === 'year')?.value)
            const m = Number(parts.find(p => p.type === 'month')?.value)
            const d = Number(parts.find(p => p.type === 'day')?.value)
            const hh = Number(parts.find(p => p.type === 'hour')?.value)
            const mm = Number(parts.find(p => p.type === 'minute')?.value)
            const ss = Number(parts.find(p => p.type === 'second')?.value)
            if (![y, m, d, hh, mm, ss].every(Number.isFinite)) break

            const desired = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second ?? 0)
            const got = Date.UTC(y, m - 1, d, hh, mm, ss)
            const diff = desired - got
            if (diff === 0) break
            utc = new Date(utc.getTime() + diff)
        }
        return utc
    }

    const parseLocalDateTimeInputToUtc = (value: string, timeZone: string) => {
        const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})$/.exec(value)
        if (!m) return null
        const year = Number(m[1])
        const month = Number(m[2])
        const day = Number(m[3])
        const hour = Number(m[4])
        const minute = Number(m[5])
        if (![year, month, day, hour, minute].every(Number.isFinite)) return null
        try {
            return utcForLocalTime({ timeZone, year, month, day, hour, minute, second: 0 })
        } catch {
            return null
        }
    }
    
    const nextPeriod = () => {
        const d = new Date(currentDate)
        if (view === 'week') d.setDate(d.getDate() + daysToShow)
        else d.setMonth(d.getMonth() + 1)
        setCurrentDate(d)
    }

    const prevPeriod = () => {
        const d = new Date(currentDate)
        if (view === 'week') d.setDate(d.getDate() - daysToShow)
        else d.setMonth(d.getMonth() - 1)
        setCurrentDate(d)
    }

    const handleNewEvent = (newEvent: CalendarEvent) => {
        setEvents(prev => [...prev, newEvent].sort((a, b) => a.start.localeCompare(b.start)))
    }

    useEffect(() => {
        if (agendaTab !== 'appointments') return
        fetchEvents()
    }, [currentDate, view, agendaTab])

    useEffect(() => {
        if (agendaTab !== 'hours') return
        fetchBusinessHours()
    }, [agendaTab])

    useEffect(() => {
        if (agendaTab !== 'blocks') return
        fetchTimeOff()
    }, [agendaTab, tenantTimeZone])

    async function fetchBusinessHours() {
        setBusinessHoursLoading(true)
        setBusinessHoursError(null)
        const res = await api<{ businessHours: AdminBusinessHour[] }>('/api/admin/business-hours')
        if (!res.ok) {
            setBusinessHoursError(res.error.message)
            setBusinessHoursLoading(false)
            return
        }
        const list = res.data.businessHours ?? []
        setBusinessHours(list)
        setBusinessHoursEdits(() => {
            const next: Record<number, { startTime: string; endTime: string; lunchEnabled: boolean; lunchStart: string; lunchEnd: string }> = {}
            for (let weekday = 0; weekday <= 6; weekday += 1) {
                const ranges = sortBusinessHours(list.filter((h) => h.weekday === weekday))
                next[weekday] = buildDayEditState(ranges)
            }
            return next
        })
        setBusinessHoursLoading(false)
    }

    async function fetchTimeOff() {
        setTimeOffLoading(true)
        setTimeOffError(null)

        const now = new Date()
        const start = new Date(now)
        start.setDate(start.getDate() - 7)
        const end = new Date(now)
        end.setDate(end.getDate() + 120)

        const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), limit: '800' })
        const res = await api<{ timeOff: AdminTimeOff[] }>(`/api/admin/time-off?${qs.toString()}`)
        if (!res.ok) {
            setTimeOffError(res.error.message)
            setTimeOffLoading(false)
            return
        }
        const list = res.data.timeOff ?? []
        setTimeOff(list)
        setTimeOffLoading(false)
    }

    async function fetchEvents() {
        setLoading(true)
        const rangeStart = view === 'week' ? weekDays[0] : monthDays[0]
        const rangeEnd = view === 'week' ? weekDays[weekDays.length - 1] : monthDays[monthDays.length - 1]

        const start = new Date(rangeStart)
        start.setHours(0, 0, 0, 0)
        const end = new Date(rangeEnd)
        end.setHours(0, 0, 0, 0)
        end.setDate(end.getDate() + 1)

        const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), limit: '800' })
        const res = await api<{ appointments: AdminAppointment[] }>(`/api/admin/appointments?${qs.toString()}`)

        if (res.ok) {
            const mapped: CalendarEvent[] = res.data.appointments.map(a => {
                const status = a.status === 'CONFIRMED' ? 'confirmed' : a.status === 'PENDING' ? 'pending' : 'cancelled'
                const colors =
                    status === 'confirmed'
                        ? { color: '#dcfce7', textColor: '#166534' }
                        : status === 'pending'
                          ? { color: '#fef9c3', textColor: '#854d0e' }
                          : { color: '#e5e7eb', textColor: '#374151' }

                return {
                    id: a.id,
                    title: a.serviceName,
                    clientName: a.clientName ?? a.clientEmail,
                    start: a.startsAt,
                    end: a.endsAt,
                    status,
                    ...colors,
                }
            })
            setEvents(mapped)
        }
        setLoading(false)
    }

    async function handleDeleteEvent(id: string) {
        const res = await api<{ ok: true }>(`/api/admin/appointments/${id}`, { method: 'DELETE' })
        if (res.ok) {
            setEvents(prev => prev.filter(e => e.id !== id))
        } else {
            alert('Erro ao excluir agendamento: ' + res.error.message)
        }
    }

    const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() => {
        const now = new Date()
        return now.getHours() * 60 + now.getMinutes()
    })

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date()
            setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes())
        }, 60000)
        return () => clearInterval(interval)
    }, [])

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
    const weekDayNames = weekdayNamesShort
    // Hours from 08:00 to 23:00 (16 hours total) to fill the screen better
    const hours = Array.from({ length: 16 }, (_, i) => i + 8) 

    return (
        <div className="agenda-layout animate-entry">
            <div className="agenda-tabs-container">
                <button 
                    className={`agenda-tab ${agendaTab === 'appointments' ? 'active' : ''}`} 
                    onClick={() => setAgendaTab('appointments')}
                >
                    Calendário
                </button>
                <button 
                    className={`agenda-tab ${agendaTab === 'hours' ? 'active' : ''}`} 
                    onClick={() => setAgendaTab('hours')}
                >
                    Horários
                </button>
                <button 
                    className={`agenda-tab ${agendaTab === 'blocks' ? 'active' : ''}`} 
                    onClick={() => setAgendaTab('blocks')}
                >
                    Bloqueios
                </button>
            </div>
            
            {agendaTab === 'appointments' && (
                <div className="calendar-layout">
                    <div className="calendar-toolbar">
                        <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                            <div style={{display: 'flex', gap: 8}}>
                                <button className="calendar-nav-btn" onClick={prevPeriod}><ChevronLeft size={20}/></button>
                                <button className="calendar-nav-btn" onClick={nextPeriod}><ChevronRight size={20}/></button>
                            </div>
                            <h2 style={{fontSize: '1.25rem', fontWeight: 800, color: 'var(--gray-900)', margin: 0}}>
                                {monthNames[currentDate.getMonth()]}, {currentDate.getFullYear()}
                            </h2>
                        </div>
                        
                        <div style={{display: 'flex', gap: 16}}>
                            <div className="calendar-view-toggle">
                                <button 
                                    className={`view-btn ${view === 'week' ? 'active' : ''}`} 
                                    onClick={() => setView('week')}
                                >
                                    Semana
                                </button>
                                <button 
                                    className={`view-btn ${view === 'month' ? 'active' : ''}`} 
                                    onClick={() => setView('month')}
                                >
                                    Mês
                                </button>
                            </div>
                            <button className="btn btnPrimary" onClick={() => setIsNewAppointmentOpen(true)}>
                                <Plus size={16} /> <span style={{marginLeft: 8}} className="desktop-only">Novo Agendamento</span>
                            </button>
                        </div>
                    </div>

                    <div className="calendar-grid-wrapper" style={{opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', flexDirection: view === 'month' ? 'column' : 'row', overflow: view === 'week' ? 'auto' : 'hidden'}}>
                        {view === 'week' ? (
                            <div style={{ flex: 1, minWidth: daysToShow > 3 ? 'fit-content' : '100%' }}>
                                {/* Sticky Header Row */}
                                <div className="calendar-days-header" style={{ position: 'sticky', top: 0, zIndex: 30, width: '100%', minWidth: daysToShow > 3 ? 'fit-content' : '100%' }}>
                                    <div className="calendar-header-cell empty" style={{ position: 'sticky', left: 0, zIndex: 40, background: 'white', borderRight: '1px solid var(--gray-100)' }}></div>
                                    {weekDays.map((date) => {
                                        const isToday = new Date().toDateString() === date.toDateString()
                                        return (
                                            <div key={date.toISOString()} className="calendar-header-cell">
                                                <div className="calendar-day-name">{weekDayNames[date.getDay()]}</div>
                                                <div className={`calendar-day-number ${isToday ? 'today' : ''}`}>{date.getDate()}</div>
                                            </div>
                                        )
                                    })}
                                </div>
                                
                                {/* Body Row */}
                                <div style={{ display: 'flex', minWidth: daysToShow > 3 ? 'fit-content' : '100%' }}>
                                    {/* Sticky Time Column */}
                                    <div className="calendar-time-column" style={{ position: 'sticky', left: 0, zIndex: 20, background: 'white', borderRight: '1px solid var(--gray-100)' }}>
                                        {hours.map(h => (
                                            <div key={h} className="calendar-time-slot">
                                                {h}:00
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {/* Days Columns */}
                                    {weekDays.map((date) => {
                                        const isToday = new Date().toDateString() === date.toDateString()
                                        
                                        return (
                                            <div key={date.toISOString()} className="calendar-day-column">
                                                {hours.map(h => (
                                                    <div key={h} className="calendar-grid-cell"></div>
                                                ))}
                                                
                                                {/* Current Time Indicator */}
                                                {isToday && (
                                                    <div 
                                                        className="current-time-line"
                                                        style={{
                                                            top: `${(currentTimeMinutes / 60 - 8) * 60 + 10}px`
                                                        }}
                                                    >
                                                        <div className="current-time-dot" />
                                                    </div>
                                                )}
                                                
                                                {events.filter(ev => {
                                                    const evDate = new Date(ev.start)
                                                    return evDate.getDate() === date.getDate() && 
                                                        evDate.getMonth() === date.getMonth() && 
                                                        evDate.getFullYear() === date.getFullYear()
                                                }).map(ev => {
                                                    const start = new Date(ev.start)
                                                        const end = new Date(ev.end)
                                                        const startHour = start.getHours() + (start.getMinutes() / 60)
                                                        const endHour = end.getHours() + (end.getMinutes() / 60)
                                                        const durationHours = endHour - startHour
                                                        
                                                        const top = (startHour - 8) * 60 + 10 // 60px per hour + offset
                                                        const height = Math.max(durationHours * 60, 24) // Minimum height
                                                        
                                                        return (
                                                            <div 
                                                                key={ev.id}
                                                                className="calendar-event"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setSelectedEvent(ev)
                                                                }}
                                                                style={{
                                                                    top: `${top}px`,
                                                                    height: `${height}px`,
                                                                    backgroundColor: ev.color,
                                                                    borderLeft: `3px solid ${ev.textColor}`
                                                                }}
                                                            >
                                                                <div className="event-title" style={{color: ev.textColor}}>{ev.title}</div>
                                                                <div className="event-time" style={{color: ev.textColor, opacity: 0.8}}>
                                                                    {start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {ev.clientName}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                        ) : (
                            <>
                                <div className="calendar-days-header" style={{paddingLeft: 0, borderBottom: 'none', height: 'auto', minHeight: 40}}>
                                    {weekDayNames.map((name) => (
                                        <div key={name} className="calendar-header-cell" style={{height: 40, minWidth: 0, borderBottom: '1px solid var(--gray-100)'}}>
                                            <div className="calendar-day-name" style={{margin: 0}}>{name}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="calendar-month-grid">
                                    {monthDays.map((date) => {
                                        const isToday = new Date().toDateString() === date.toDateString()
                                        const isCurrentMonth = date.getMonth() === currentDate.getMonth()
                                        
                                        return (
                                            <div key={date.toISOString()} className={`calendar-month-cell ${!isCurrentMonth ? 'different-month' : ''}`}>
                                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                                                    <div className={`calendar-month-day-number ${isToday ? 'today' : ''}`}>
                                                        {date.getDate()}
                                                    </div>
                                                </div>
                                                {events.filter(ev => {
                                                    const evDate = new Date(ev.start)
                                                    return evDate.getDate() === date.getDate() && 
                                                        evDate.getMonth() === date.getMonth() && 
                                                        evDate.getFullYear() === date.getFullYear()
                                                }).map(ev => (
                                                    <div 
                                                        key={ev.id} 
                                                        className="calendar-month-event"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedEvent(ev)
                                                        }}
                                                        style={{backgroundColor: ev.color, color: ev.textColor}}
                                                    >
                                                        {new Date(ev.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} {ev.clientName}
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {agendaTab === 'hours' && (
                <div className="animate-entry">
                    {businessHoursLoading && (
                        <div className="pill" style={{color: 'var(--gray-700)', background: 'var(--gray-100)', justifyContent: 'center', margin: '0 24px 16px'}}>
                            Carregando horários...
                        </div>
                    )}
                    {businessHoursError && (
                        <div className="pill" style={{color: 'var(--danger)', background: '#fee2e2', justifyContent: 'center', margin: '0 24px 16px'}}>
                            {businessHoursError}
                        </div>
                    )}
                    <div className="schedule-grid">
                        {weekdayNamesFull.map((dayName, idx) => {
                        const dayRanges = sortBusinessHours(businessHours.filter(b => b.weekday === idx))
                        const isOpen = dayRanges.length > 0
                        const editState = businessHoursEdits[idx] ?? buildDayEditState(dayRanges)
                        const startTime = editState.startTime
                        const endTime = editState.endTime
                        const lunchEnabled = editState.lunchEnabled
                        const lunchStart = editState.lunchStart
                        const lunchEnd = editState.lunchEnd

                        return (
                            <div key={dayName} className={`schedule-day-card ${!isOpen ? 'closed' : ''}`}>
                                <div className="schedule-day-header">
                                    <div className="schedule-day-title">
                                        {dayName}
                                    </div>
                                    <div 
                                        className={`toggle-switch ${isOpen ? 'checked' : ''}`}
                                        onClick={async () => {
                                            setBusinessHoursError(null)
                                            if (isOpen) {
                                                if (!confirm(`Fechar ${dayName}?`)) return
                                                for (const r of dayRanges) {
                                                    const res = await api<{ ok: true }>(`/api/admin/business-hours/${r.id}`, { method: 'DELETE' })
                                                    if (res.ok) setBusinessHours(prev => prev.filter(x => x.id !== r.id))
                                                }
                                                return
                                            }
                                            await syncDayRanges(idx, editState)
                                        }}
                                    >
                                        <div className="toggle-thumb" />
                                    </div>
                                </div>
                                
                                <div style={{display: 'flex', alignItems: 'center', gap: 12, opacity: isOpen ? 1 : 0.4, pointerEvents: isOpen ? 'auto' : 'none', transition: 'opacity 0.2s'}}>
                                    <div className="time-input-wrapper" style={{flex: 1}}>
                                        <TimeSelect 
                                            value={startTime}
                                            onChange={async (newTime) => {
                                                setBusinessHoursEdits(prev => ({
                                                    ...prev,
                                                    [idx]: { ...editState, startTime: newTime }
                                                }))
                                                if (!isOpen) return
                                                await syncDayRanges(idx, { ...editState, startTime: newTime })
                                            }}
                                        />
                                    </div>
                                    <span style={{color: 'var(--gray-400)', fontWeight: 600}}>-</span>
                                    <div className="time-input-wrapper" style={{flex: 1}}>
                                        <TimeSelect 
                                            value={endTime}
                                            onChange={async (newTime) => {
                                                setBusinessHoursEdits(prev => ({
                                                    ...prev,
                                                    [idx]: { ...editState, endTime: newTime }
                                                }))
                                                if (!isOpen) return
                                                await syncDayRanges(idx, { ...editState, endTime: newTime })
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="schedule-lunch-row" style={{opacity: isOpen ? 1 : 0.4, pointerEvents: isOpen ? 'auto' : 'none', display: 'block'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8}}>
                                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                            <div 
                                                className={`checkbox-circle ${lunchEnabled ? 'checked' : ''}`}
                                                onClick={async () => {
                                                    const next = { ...editState, lunchEnabled: !lunchEnabled }
                                                    setBusinessHoursEdits(prev => ({ ...prev, [idx]: next }))
                                                    if (!isOpen) return
                                                    await syncDayRanges(idx, next)
                                                }}
                                            >
                                                {lunchEnabled && <Check size={12} strokeWidth={4} />}
                                            </div>
                                            <div className="schedule-lunch-label" style={{margin: 0}}>Almoço</div>
                                        </div>
                                    </div>
                                    
                                    {lunchEnabled && (
                                        <div className="schedule-lunch-times" style={{display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 0, width: '100%', animation: 'fadeIn 0.2s'}}>
                                            <div className="time-input-wrapper compact" style={{flex: 1}}>
                                                <TimeSelect
                                                    value={lunchStart}
                                                    onChange={async (newTime) => {
                                                        const next = { ...editState, lunchStart: newTime }
                                                        setBusinessHoursEdits(prev => ({ ...prev, [idx]: next }))
                                                        if (!isOpen || !next.lunchEnabled) return
                                                        await syncDayRanges(idx, next)
                                                    }}
                                                />
                                            </div>
                                            <span style={{color: 'var(--gray-400)', fontWeight: 600}}>-</span>
                                            <div className="time-input-wrapper compact" style={{flex: 1}}>
                                                <TimeSelect
                                                    value={lunchEnd}
                                                    onChange={async (newTime) => {
                                                        const next = { ...editState, lunchEnd: newTime }
                                                        setBusinessHoursEdits(prev => ({ ...prev, [idx]: next }))
                                                        if (!isOpen || !next.lunchEnabled) return
                                                        await syncDayRanges(idx, next)
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className={`schedule-day-status ${isOpen ? 'status-open' : 'status-closed'}`} style={{alignSelf: 'flex-start'}}>
                                    {isOpen ? 'Aberto' : 'Fechado'}
                                </div>
                            </div>
                        )
                    })}
                    </div>
                </div>
            )}

            {agendaTab === 'blocks' && (
                <div className="animate-entry">
                     <div className="blocks-list">
                        <div className="card" style={{padding: 20, marginBottom: 12, border: '1px dashed var(--gray-300)', boxShadow: 'none'}}>
                            <h4 style={{margin: '0 0 16px', fontSize: '1rem'}}>Novo Bloqueio</h4>
                            <div className="grid grid-3" style={{gap: 12}}>
                                <div className="agenda-input-group">
                                    <label className="agenda-label">Início</label>
                                    <div className="time-input-wrapper">
                                        <input
                                            type="datetime-local"
                                            className="time-input"
                                            value={timeOffAdd.startsLocal}
                                            onChange={(e) => setTimeOffAdd(prev => ({ ...prev, startsLocal: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="agenda-input-group">
                                    <label className="agenda-label">Fim</label>
                                    <div className="time-input-wrapper">
                                        <input
                                            type="datetime-local"
                                            className="time-input"
                                            value={timeOffAdd.endsLocal}
                                            onChange={(e) => setTimeOffAdd(prev => ({ ...prev, endsLocal: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="agenda-input-group">
                                    <label className="agenda-label">Motivo</label>
                                    <div className="time-input-wrapper">
                                        <input
                                            className="time-input"
                                            value={timeOffAdd.reason}
                                            onChange={(e) => setTimeOffAdd(prev => ({ ...prev, reason: e.target.value }))}
                                            placeholder="Ex: Feriado"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div style={{marginTop: 16, display: 'flex', justifyContent: 'flex-end'}}>
                                <button
                                    className="btn btnPrimary"
                                    onClick={async () => {
                                        setTimeOffError(null)
                                        const s = parseLocalDateTimeInputToUtc(timeOffAdd.startsLocal, tenantTimeZone)
                                        const e = parseLocalDateTimeInputToUtc(timeOffAdd.endsLocal, tenantTimeZone)
                                        if (!s || !e) {
                                            setTimeOffError('Data inválida')
                                            return
                                        }
                                        const res = await api<{ timeOff: AdminTimeOff }>('/api/admin/time-off', {
                                            method: 'POST',
                                            body: JSON.stringify({ startsAt: s.toISOString(), endsAt: e.toISOString(), reason: timeOffAdd.reason.trim() || null }),
                                        })
                                        if (!res.ok) {
                                            setTimeOffError(res.error.message)
                                            return
                                        }
                                        const created = res.data.timeOff
                                        setTimeOff(prev => [...prev, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)))
                                    }}
                                    disabled={timeOffLoading}
                                >
                                    <Plus size={18} /> Adicionar Bloqueio
                                </button>
                            </div>
                            {timeOffError && <div style={{color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8}}>{timeOffError}</div>}
                        </div>

                        {timeOff.map((b) => {
                             const dateObj = new Date(b.startsAt)
                             const monthShort = dateObj.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.', '')
                             const dayNum = dateObj.getDate()
                             
                             return (
                                <div key={b.id} className="block-card">
                                    <div className="block-date-badge">
                                        <span style={{fontSize: '0.75rem', opacity: 0.7}}>{monthShort}</span>
                                        <span style={{fontSize: '1.5rem', lineHeight: 1}}>{dayNum}</span>
                                    </div>
                                    <div className="block-info">
                                        <div className="block-title">{b.reason || 'Bloqueio de Agenda'}</div>
                                        <div className="block-meta">
                                            <Clock size={14} />
                                            {new Date(b.startsAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                                            {new Date(b.endsAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            <span style={{margin: '0 6px'}}>•</span>
                                            {new Date(b.endsAt).toLocaleDateString('pt-BR') !== new Date(b.startsAt).toLocaleDateString('pt-BR') ? 
                                                `Até ${new Date(b.endsAt).toLocaleDateString('pt-BR')}` : 'Mesmo dia'}
                                        </div>
                                    </div>
                                    <button 
                                        className="icon-btn" 
                                        style={{color: 'var(--danger)', borderColor: 'transparent'}}
                                        onClick={async () => {
                                            if(!confirm('Remover bloqueio?')) return
                                            const res = await api<{ ok: true }>(`/api/admin/time-off/${b.id}`, { method: 'DELETE' })
                                            if(res.ok) {
                                                setTimeOff(prev => prev.filter(x => x.id !== b.id))
                                            }
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                             )
                        })}
                     </div>
                </div>
            )}

            <NewAppointmentModal 
                isOpen={isNewAppointmentOpen} 
                onClose={() => setIsNewAppointmentOpen(false)} 
                onSuccess={handleNewEvent}
                initialDate={currentDate}
            />

            <AppointmentDetailsModal 
                isOpen={!!selectedEvent}
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
                onDelete={handleDeleteEvent}
            />
        </div>
    )
}

function AdminClients() {
    const [clients, setClients] = useState<AdminClientRow[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true
        setLoading(true)
        api<{ clients: AdminClientRow[] }>('/api/admin/clients').then(res => {
            if (!mounted) return
            if (res.ok) setClients(res.data.clients)
            setLoading(false)
        })
        return () => {
            mounted = false
        }
    }, [])

    const palette = [
        { bg: undefined as string | undefined, fg: undefined as string | undefined },
        { bg: '#e0f2fe', fg: '#0369a1' },
        { bg: '#fef3c7', fg: '#b45309' },
        { bg: '#f3e8ff', fg: '#6b21a8' },
        { bg: '#ffe4e6', fg: '#9d174d' },
    ]

    const initials = (name: string) => {
        const parts = name.trim().split(/\s+/).filter(Boolean)
        const a = parts[0]?.[0] ?? 'U'
        const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : (parts[0]?.[1] ?? '')
        return (a + b).toUpperCase()
    }

    const colorFor = (name: string) => {
        let h = 0
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
        return palette[h % palette.length]
    }

    return (
        <div className="card">
            <div className="cardHeader">
                <div>
                    <h2 className="cardTitle">Clientes</h2>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4}}>Base de clientes do seu espaço.</p>
                </div>
            </div>
            {loading ? (
                <div style={{display: 'flex', justifyContent: 'center', padding: 40}}>
                    <div className="spinner" />
                </div>
            ) : (
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Telefone</th>
                                <th>Última Visita</th>
                                <th>Total Gasto</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {clients.map(c => {
                                const col = colorFor(c.name)
                                return (
                                    <tr key={c.id}>
                                        <td>
                                            <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                                                <div
                                                    className="user-avatar-mini"
                                                    style={{
                                                        width: 36,
                                                        height: 36,
                                                        fontSize: '0.8rem',
                                                        background: col.bg,
                                                        color: col.fg,
                                                    }}
                                                >
                                                    {initials(c.name)}
                                                </div>
                                                <span style={{fontWeight: 600, color: 'var(--gray-800)'}}>{c.name}</span>
                                            </div>
                                        </td>
                                        <td style={{color: 'var(--gray-600)'}}>{c.phone || '-'}</td>
                                        <td>
                                            {c.lastVisitAt ? (
                                                <span className="pill">{new Date(c.lastVisitAt).toLocaleDateString('pt-BR')}</span>
                                            ) : (
                                                <span style={{color: 'var(--text-muted)'}}>—</span>
                                            )}
                                        </td>
                                        <td style={{fontWeight: 600}}>{formatBRL(c.totalSpentCents / 100)}</td>
                                        <td>
                                            <button className="icon-btn" style={{width: 32, height: 32}}>
                                                <MoreHorizontal size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                            {clients.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{textAlign: 'center', padding: 20, color: 'var(--text-muted)'}}>
                                        Nenhum cliente ainda
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function AdminEvolutionAPI() {
    type WhatsAppInstance = {
        id: string
        provider: string
        baseUrl: string | null
        instanceName: string | null
        status: string
        updatedAt: string
        hasApiKey: boolean
    }

    type WhatsAppSettings = {
        remindersEnabled: boolean
        reminderOffsetHours: number
        reminderMessage: string
        promoEnabled: boolean
        promoMessage: string
        updatedAt?: string
    }

    const [status, setStatus] = useState<'disconnected' | 'qr_scan' | 'connected'>('disconnected')
    const [connectionState, setConnectionState] = useState<string | null>(null)
    const [qrCode, setQrCode] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [instance, setInstance] = useState<WhatsAppInstance | null>(null)

    const [provider, setProvider] = useState('EVOLUTION')
    const [baseUrl, setBaseUrl] = useState('')
    const [instanceName, setInstanceName] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [showApiKey, setShowApiKey] = useState(false)

    const [settingsBusy, setSettingsBusy] = useState(false)
    const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(null)

    const [testPhone, setTestPhone] = useState('')
    const [testBusy, setTestBusy] = useState(false)
    const [testResult, setTestResult] = useState<null | { kind: 'reminder' | 'promo'; ok: boolean }>(null)

    const [remindersEnabled, setRemindersEnabled] = useState(true)
    const [reminderOffset, setReminderOffset] = useState('24')
    const [reminderMessage, setReminderMessage] = useState(
        'Oi {{nome}}, tudo bem? Só passando para lembrar do seu horário amanhã às {{hora}} aqui no {{espaco}}. Até lá!'
    )
    const [promoEnabled, setPromoEnabled] = useState(false)
    const [promoMessage, setPromoMessage] = useState(
        'Oi {{nome}}, temos uma novidade especial para você esta semana no {{espaco}}. Responda esta mensagem para saber mais.'
    )
    const [broadcastLimit, setBroadcastLimit] = useState('300')
    const [broadcastBusy, setBroadcastBusy] = useState(false)
    const [broadcastResult, setBroadcastResult] = useState<null | { sent: number; failed: number; total: number }>(null)

    const formatPreview = (msg: string) => {
        return msg
            .replace(/{{nome}}/g, 'Maria')
            .replace(/{{data}}/g, '15/10')
            .replace(/{{hora}}/g, '14:00')
            .replace(/{{espaco}}/g, 'Studio Bella')
    }

    const mapStateToUi = (raw: string | null) => {
        if (!raw) return 'disconnected' as const
        const s = raw.trim().toLowerCase()
        if (!s) return 'disconnected' as const
        if (s.includes('open') || s.includes('connected')) return 'connected' as const
        if (s.includes('qr') || s.includes('pair') || s.includes('scan') || s.includes('connecting')) return 'qr_scan' as const
        if (s.includes('not_configured')) return 'disconnected' as const
        return 'disconnected' as const
    }

    async function loadConfig() {
        const res = await api<{ instance: WhatsAppInstance | null }>('/api/admin/whatsapp')
        if (!res.ok) {
            setError(res.error.message)
            return
        }
        setInstance(res.data.instance)
        const nextProvider = res.data.instance?.provider || 'EVOLUTION'
        setProvider(nextProvider)
        setBaseUrl(res.data.instance?.baseUrl || '')
        setInstanceName(res.data.instance?.instanceName || '')
    }

    async function refreshStatus() {
        const res = await api<{ state: string; raw?: unknown }>('/api/admin/whatsapp/status')
        if (!res.ok) {
            setError(res.error.message)
            return
        }
        setConnectionState(res.data.state)
        setStatus(mapStateToUi(res.data.state))
        if (mapStateToUi(res.data.state) !== 'qr_scan') setQrCode(null)
    }

    async function loadSettings() {
        const res = await api<{ settings: WhatsAppSettings }>('/api/admin/whatsapp/settings')
        if (!res.ok) {
            setError(res.error.message)
            return
        }
        const s = res.data.settings
        setRemindersEnabled(Boolean(s.remindersEnabled))
        setReminderOffset(String(s.reminderOffsetHours ?? 24))
        setReminderMessage(s.reminderMessage)
        setPromoEnabled(Boolean(s.promoEnabled))
        setPromoMessage(s.promoMessage)
        setSettingsUpdatedAt(typeof s.updatedAt === 'string' ? s.updatedAt : null)
    }

    async function handleSaveSettings() {
        setSettingsBusy(true)
        setError(null)
        setTestResult(null)
        try {
            const offsetNum = Number(reminderOffset)
            const reminderOffsetHours = Number.isFinite(offsetNum) ? Math.max(1, Math.min(168, Math.floor(offsetNum))) : 24
            const res = await api<{ ok: true }>('/api/admin/whatsapp/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    remindersEnabled,
                    reminderOffsetHours,
                    reminderMessage: reminderMessage.trim(),
                    promoEnabled,
                    promoMessage: promoMessage.trim(),
                }),
            })
            if (!res.ok) {
                setError(res.error.message)
                return
            }
            await loadSettings()
        } finally {
            setSettingsBusy(false)
        }
    }

    async function handleTestSend(kind: 'reminder' | 'promo') {
        setTestBusy(true)
        setError(null)
        setTestResult(null)
        try {
            const toPhone = testPhone.trim()
            if (toPhone.length < 6) {
                setError('Informe um telefone válido para teste.')
                return
            }
            const msg = kind === 'reminder' ? reminderMessage : promoMessage
            const text = formatPreview(msg)
            const res = await api<{ ok: true }>('/api/admin/whatsapp/send', {
                method: 'POST',
                body: JSON.stringify({ toPhone, text }),
            })
            if (!res.ok) {
                setError(res.error.message)
                setTestResult({ kind, ok: false })
                return
            }
            setTestResult({ kind, ok: true })
        } finally {
            setTestBusy(false)
        }
    }

    async function handleSaveConfig() {
        setBusy(true)
        setError(null)
        setBroadcastResult(null)
        try {
            const payload: Record<string, string> = {}
            if (provider.trim()) payload.provider = provider.trim()
            if (baseUrl.trim()) payload.baseUrl = baseUrl.trim()
            if (instanceName.trim()) payload.instanceName = instanceName.trim()
            if (apiKey.trim()) payload.apiKey = apiKey.trim()

            const res = await api<{ ok: true }>('/api/admin/whatsapp', {
                method: 'PUT',
                body: JSON.stringify(payload),
            })
            if (!res.ok) {
                setError(res.error.message)
                return
            }
            setApiKey('')
            await loadConfig()
            await refreshStatus()
        } finally {
            setBusy(false)
        }
    }

    async function handleConnect() {
        setBusy(true)
        setError(null)
        setBroadcastResult(null)
        try {
            const qr = await api<{ qrCode: string | null; raw?: unknown; state?: string }>('/api/admin/whatsapp/qrcode')
            if (!qr.ok) {
                setError(qr.error.message)
                return
            }
            setQrCode(qr.data.qrCode)
            setStatus('qr_scan')
            await refreshStatus()
        } finally {
            setBusy(false)
        }
    }

    async function handleBroadcast() {
        setBroadcastBusy(true)
        setError(null)
        setBroadcastResult(null)
        try {
            const hasVars = /{{\s*(nome|data|hora|espaco)\s*}}/.test(promoMessage)
            if (hasVars) {
                setError('Remova variáveis {{...}} para enviar em massa (mensagem única).')
                return
            }
            const limitNum = Number(broadcastLimit)
            const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(2000, Math.floor(limitNum)) : 300

            const res = await api<{ sent: number; failed: number; total: number }>('/api/admin/whatsapp/broadcast', {
                method: 'POST',
                body: JSON.stringify({ text: promoMessage.trim(), limit }),
            })
            if (!res.ok) {
                setError(res.error.message)
                return
            }
            setBroadcastResult(res.data)
        } finally {
            setBroadcastBusy(false)
        }
    }

    useEffect(() => {
        let mounted = true
        setError(null)
        Promise.resolve()
            .then(async () => {
                await loadConfig()
                if (!mounted) return
                await loadSettings()
                if (!mounted) return
                await refreshStatus()
            })
            .catch(() => {
                if (!mounted) return
                setError('Falha ao carregar WhatsApp')
            })
        return () => {
            mounted = false
        }
    }, [])

    useEffect(() => {
        if (status !== 'qr_scan') return
        let alive = true
        const t = window.setInterval(() => {
            if (!alive) return
            refreshStatus()
        }, 3000)
        return () => {
            alive = false
            window.clearInterval(t)
        }
    }, [status])

    return (
        <div className="grid grid-1-400">
            {/* Left Column: Configuration */}
            <div className="column" style={{gap: '1.5rem'}}>
                {/* Connection Status Card */}
                <div className="card">
                    <div className="cardHeader" style={{background: status === 'connected' ? '#dcfce7' : '#fee2e2'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                             <div style={{
                                 width: 40, height: 40, borderRadius: '50%', 
                                 background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                 color: status === 'connected' ? '#166534' : '#991b1b'
                             }}>
                                 {status === 'connected' ? <Smartphone size={20} /> : <LogOut size={20} />}
                             </div>
                             <div>
                                 <h3 className="cardTitle" style={{color: status === 'connected' ? '#14532d' : '#7f1d1d'}}>
                                     {status === 'connected' ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
                                 </h3>
                                 <div style={{fontSize: '0.8rem', color: status === 'connected' ? '#166534' : '#991b1b'}}>
                                     {status === 'connected'
                                         ? `Pronto para enviar mensagens.${connectionState ? ` (${connectionState})` : ''}`
                                         : instance?.baseUrl && instance?.instanceName && instance?.hasApiKey
                                           ? 'Escaneie o QR Code para conectar.'
                                           : 'Configure o provedor para conectar.'}
                                 </div>
                             </div>
                        </div>
                        <div style={{display: 'flex', gap: 10}}>
                            <button className="btn btn-ghost" style={{background: 'white'}} onClick={refreshStatus} disabled={busy}>
                                Atualizar
                            </button>
                            <button
                                className="btn btnPrimary"
                                onClick={handleConnect}
                                disabled={busy || !(instance?.baseUrl && instance?.instanceName && instance?.hasApiKey)}
                            >
                                {status === 'qr_scan' ? 'Recarregar QR' : 'Conectar'}
                            </button>
                        </div>
                    </div>
                    {error ? (
                        <div className="cardBody" style={{display: 'flex', alignItems: 'center', gap: 10, color: '#991b1b'}}>
                            <XCircle size={18} />
                            <div style={{fontSize: '0.9rem'}}>{error}</div>
                        </div>
                    ) : null}
                    {status === 'qr_scan' && (
                        <div className="cardBody" style={{textAlign: 'center'}}>
                            <div style={{background: '#1f2937', padding: 16, borderRadius: 12, display: 'inline-block', marginBottom: 16}}>
                                {qrCode ? (
                                    <img src={qrCode} alt="QR Code" style={{width: 180, height: 180, objectFit: 'contain'}} />
                                ) : (
                                    <QrCode size={120} color="white" />
                                )}
                            </div>
                            <p style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar Aparelho</p>
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="cardHeader">
                        <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                            <div style={{width: 32, height: 32, borderRadius: 8, background: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <Link2 size={18} />
                            </div>
                            <div>
                                <h3 className="cardTitle">Provedor (Evolution)</h3>
                                <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                                    {instance?.updatedAt ? `Última atualização: ${new Date(instance.updatedAt).toLocaleString('pt-BR')}` : 'Configure a instância para habilitar QR.'}
                                </div>
                            </div>
                        </div>
                        <button className="btn btnPrimary" onClick={handleSaveConfig} disabled={busy}>
                            {busy ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                    <div className="cardBody">
                        <div className="form-stack">
                            <div className="input-group">
                                <label className="label">Provider</label>
                                <input className="input" value={provider} onChange={e => setProvider(e.target.value)} placeholder="EVOLUTION" />
                            </div>
                            <div className="input-group">
                                <label className="label">Base URL</label>
                                <input className="input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://sua-evolution.example" />
                            </div>
                            <div className="input-group">
                                <label className="label">Instance Name</label>
                                <input className="input" value={instanceName} onChange={e => setInstanceName(e.target.value)} placeholder="lashsaas" />
                            </div>
                            <div className="input-group">
                                <label className="label">API Key</label>
                                <div className="authRefInputWrapper">
                                    <input
                                        className="input authRefInput"
                                        type={showApiKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={e => setApiKey(e.target.value)}
                                        placeholder={instance?.hasApiKey ? '•••••••• (já configurada)' : 'Cole sua API Key'}
                                    />
                                    <button type="button" className="authRefPasswordToggle" onClick={() => setShowApiKey(v => !v)} tabIndex={-1}>
                                        {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Reminders Config */}
                <div className="card">
                    <div className="cardHeader">
                        <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                            <div style={{width: 32, height: 32, borderRadius: 8, background: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <Bell size={18} />
                            </div>
                            <h3 className="cardTitle">Lembretes Automáticos</h3>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                            <button className="btn btn-ghost" onClick={handleSaveSettings} disabled={settingsBusy}>
                                {settingsBusy ? 'Salvando...' : 'Salvar'}
                            </button>
                            <Switch checked={remindersEnabled} onChange={setRemindersEnabled} />
                        </div>
                    </div>
                    {remindersEnabled && (
                        <div className="cardBody" style={{animation: 'fadeIn 0.3s ease'}}>
                             <div className="input-group" style={{marginBottom: 16}}>
                                <label className="label">Enviar lembrete com antecedência de:</label>
                                <div style={{display: 'flex', gap: 8}}>
                                    {['3', '24', '48'].map(h => (
                                        <button 
                                            key={h}
                                            className={`btn ${reminderOffset === h ? 'btnPrimary' : 'btn-ghost'}`}
                                            onClick={() => setReminderOffset(h)}
                                            style={{flex: 1, border: reminderOffset === h ? 'none' : '1px solid var(--gray-200)'}}
                                        >
                                            {h} horas
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="label">Mensagem Personalizada</label>
                                <textarea 
                                    className="input" 
                                    style={{height: 'auto', minHeight: 100, padding: 12, lineHeight: 1.5}}
                                    value={reminderMessage}
                                    onChange={e => setReminderMessage(e.target.value)}
                                />
                                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                                    <span style={{fontWeight: 600}}>Variáveis:</span>
                                    {['{{nome}}', '{{data}}', '{{hora}}', '{{espaco}}'].map(v => (
                                        <span key={v} className="pill" style={{fontSize: '0.7rem', cursor: 'pointer'}} onClick={() => setReminderMessage(prev => prev + ' ' + v)}>{v}</span>
                                    ))}
                                </div>
                            </div>

                            <div style={{display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap'}}>
                                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                    <span className="pill" style={{fontSize: '0.75rem'}}>Teste</span>
                                    <input
                                        className="input"
                                        style={{width: 220}}
                                        value={testPhone}
                                        onChange={e => setTestPhone(e.target.value)}
                                        placeholder="Telefone (ex: 5511999999999)"
                                    />
                                </div>
                                <button className="btn btnPrimary" onClick={() => handleTestSend('reminder')} disabled={testBusy || status !== 'connected'}>
                                    {testBusy ? 'Enviando...' : 'Enviar teste'}
                                </button>
                                {settingsUpdatedAt ? (
                                    <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                                        Atualizado: {new Date(settingsUpdatedAt).toLocaleString('pt-BR')}
                                    </div>
                                ) : null}
                                {testResult?.kind === 'reminder' ? (
                                    <div style={{fontSize: '0.85rem', color: testResult.ok ? '#166534' : '#991b1b'}}>
                                        {testResult.ok ? 'Teste enviado' : 'Falha no envio'}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>

                {/* Campaigns Config */}
                <div className="card">
                    <div className="cardHeader">
                        <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                            <div style={{width: 32, height: 32, borderRadius: 8, background: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                <Megaphone size={18} />
                            </div>
                            <h3 className="cardTitle">Campanhas de Marketing</h3>
                        </div>
                        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                            <button className="btn btn-ghost" onClick={handleSaveSettings} disabled={settingsBusy}>
                                {settingsBusy ? 'Salvando...' : 'Salvar'}
                            </button>
                            <Switch checked={promoEnabled} onChange={setPromoEnabled} />
                        </div>
                    </div>
                    {promoEnabled && (
                        <div className="cardBody" style={{animation: 'fadeIn 0.3s ease'}}>
                            <div className="input-group">
                                <label className="label">Conteúdo da Promoção</label>
                                <textarea 
                                    className="input" 
                                    style={{height: 'auto', minHeight: 100, padding: 12, lineHeight: 1.5}}
                                    value={promoMessage}
                                    onChange={e => setPromoMessage(e.target.value)}
                                />
                            </div>
                            <div style={{display: 'flex', gap: 10, alignItems: 'center', marginTop: 12}}>
                                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                    <span className="pill" style={{fontSize: '0.75rem'}}>Limite</span>
                                    <input
                                        className="input"
                                        style={{width: 110}}
                                        value={broadcastLimit}
                                        onChange={e => setBroadcastLimit(e.target.value)}
                                        inputMode="numeric"
                                    />
                                </div>
                                <button className="btn btnPrimary" onClick={handleBroadcast} disabled={broadcastBusy || status !== 'connected'}>
                                    {broadcastBusy ? 'Enviando...' : 'Enviar campanha'}
                                </button>
                                {broadcastResult ? (
                                    <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>
                                        Enviado: {broadcastResult.sent} | Falhas: {broadcastResult.failed} | Total: {broadcastResult.total}
                                    </div>
                                ) : null}
                            </div>

                            <div style={{display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap'}}>
                                <button className="btn" onClick={() => handleTestSend('promo')} disabled={testBusy || status !== 'connected'}>
                                    {testBusy ? 'Enviando...' : 'Testar no WhatsApp'}
                                </button>
                                {testResult?.kind === 'promo' ? (
                                    <div style={{fontSize: '0.85rem', color: testResult.ok ? '#166534' : '#991b1b'}}>
                                        {testResult.ok ? 'Teste enviado' : 'Falha no envio'}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Phone Preview */}
            <div className="column">
                <div className="sticky-panel">
                    <h3 style={{fontSize: '1rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700}}>
                        Visualização em Tempo Real
                    </h3>
                    
                    <div className="phone-mockup">
                        <div className="phone-notch" />
                        <div className="phone-header">
                            <ChevronLeft size={24} style={{marginRight: 4}} />
                            <div style={{width: 36, height: 36, borderRadius: '50%', background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#475569', fontSize: '0.8rem'}}>
                                MJ
                            </div>
                            <div style={{flex: 1, marginLeft: 8}}>
                                <div style={{fontWeight: 600, fontSize: '0.95rem'}}>Maria Julia</div>
                                <div style={{fontSize: '0.75rem', opacity: 0.8}}>Online</div>
                            </div>
                            <Smartphone size={20} style={{marginRight: 16}} />
                            <MoreHorizontal size={20} />
                        </div>
                        <div className="phone-body">
                            <div className="wa-date-divider">
                                <span className="wa-date-pill">Ontem</span>
                            </div>
                            
                            <div className="wa-bubble in">
                                Oi, gostaria de marcar um horário para cílios.
                                <div className="wa-time">10:30</div>
                            </div>
                            
                            <div className="wa-bubble out">
                                Olá Maria! Claro, temos horário para amanhã às 14h. Pode ser?
                                <div className="wa-time">10:35 <span className="wa-ticks"><Check size={12} strokeWidth={3} /></span></div>
                            </div>

                            <div className="wa-bubble in">
                                Pode sim! Confirmado.
                                <div className="wa-time">10:40</div>
                            </div>

                            <div className="wa-date-divider">
                                <span className="wa-date-pill">Hoje</span>
                            </div>

                            {remindersEnabled && (
                                <div className="wa-bubble out" style={{animation: 'fadeIn 0.3s ease'}}>
                                    {formatPreview(reminderMessage)}
                                    <div className="wa-time">09:00 <span className="wa-ticks"><Check size={12} strokeWidth={3} /></span></div>
                                </div>
                            )}

                            {promoEnabled && (
                                <div className="wa-bubble out" style={{animation: 'fadeIn 0.3s ease'}}>
                                    {formatPreview(promoMessage)}
                                    <div className="wa-time">12:00 <span className="wa-ticks"><Check size={12} strokeWidth={3} /></span></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// --- Image Helpers (Shared) ---

async function loadImageFromObjectUrl(objectUrl: string) {
    const img = new Image()
    img.decoding = 'async'
    img.src = objectUrl
    await img.decode()
    return img
}

function drawToCanvas(img: HTMLImageElement, maxDim: number) {
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    const largest = Math.max(w, h)
    const scale = largest > maxDim ? maxDim / largest : 1
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível')
    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(img, 0, 0, cw, ch)
    return canvas
}

function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality?: number) {
    try {
        return canvas.toDataURL(type, quality)
    } catch {
        return canvas.toDataURL('image/png')
    }
}

async function fileToOptimizedDataUrl(file: File) {
    const objectUrl = URL.createObjectURL(file)
    try {
        const img = await loadImageFromObjectUrl(objectUrl)
        const attempts: Array<{ maxDim: number; quality: number }> = [
            { maxDim: 512, quality: 0.86 },
            { maxDim: 512, quality: 0.78 },
            { maxDim: 384, quality: 0.78 },
            { maxDim: 384, quality: 0.7 },
            { maxDim: 256, quality: 0.7 }
        ]

        for (const a of attempts) {
            const canvas = drawToCanvas(img, a.maxDim)
            const webp = canvasToDataUrl(canvas, 'image/webp', a.quality)
            if (webp.startsWith('data:image/') && webp.length <= 250_000) return webp
            const png = canvasToDataUrl(canvas, 'image/png')
            if (png.startsWith('data:image/') && png.length <= 250_000) return png
        }

        const fallback = canvasToDataUrl(drawToCanvas(img, 256), 'image/png')
        return fallback
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

function AdminSettings({ tenant, onUpdate }: { tenant: TenantPublic | null; onUpdate?: () => void }) {
    const [name, setName] = useState(tenant?.name ?? '')
    const [primaryColor, setPrimaryColor] = useState(tenant?.primaryColor ?? '#ec4899')
    const [logoUrl, setLogoUrl] = useState(tenant?.logoUrl ?? '')
    const [saving, setSaving] = useState(false)
    
    // Logo state
    const [logoBusy, setLogoBusy] = useState(false)
    const [logoError, setLogoError] = useState<string | null>(null)
    const logoInputRef = useRef<HTMLInputElement>(null)

    const [billingLoading, setBillingLoading] = useState(true)
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
        api<{ subscription: typeof subscription }>('/api/admin/billing/overview').then((res) => {
            if (!mounted) return
            if (res.ok) setSubscription(res.data.subscription)
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
            if (onUpdate) onUpdate()
            alert('Configurações salvas com sucesso!')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="grid grid-1-1">
            <div className="column" style={{gap: '1.5rem'}}>
                <div className="card">
                    <div className="cardHeader">
                        <h2 className="cardTitle">Identidade Visual</h2>
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Personalize a aparência do seu espaço.</p>
                    </div>
                    <div className="cardBody">
                        <div className="form-stack">
                            <div className="input-group">
                                <label className="label">Nome do Espaço</label>
                                <input className="input" value={name} onChange={e => setName(e.target.value)} />
                            </div>

                            <div className="input-group">
                                <label className="label">Logo</label>
                                <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                                    <div style={{
                                        width: 80, height: 80, borderRadius: 16, border: '1px solid var(--gray-200)',
                                        background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        overflow: 'hidden', position: 'relative'
                                    }}>
                                        {logoUrl ? (
                                            <img src={logoUrl} alt="Logo" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                                        ) : (
                                            <ImageIcon size={24} color="var(--gray-400)" />
                                        )}
                                        {logoBusy && <div className="spinner" style={{position: 'absolute'}} />}
                                    </div>
                                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                                        <div style={{display: 'flex', gap: 8}}>
                                            <button className="btn" onClick={() => logoInputRef.current?.click()} disabled={logoBusy}>
                                                <Upload size={16} style={{marginRight: 8}} /> Trocar Logo
                                            </button>
                                            {logoUrl && (
                                                <button className="btn" onClick={() => setLogoUrl('')} style={{color: 'var(--danger)', borderColor: 'var(--danger)'}}>
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                        <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>Recomendado: 512x512px (PNG/JPG)</div>
                                        {logoError && <div style={{fontSize: '0.75rem', color: 'var(--danger)'}}>{logoError}</div>}
                                    </div>
                                    <input 
                                        type="file" 
                                        ref={logoInputRef} 
                                        style={{display: 'none'}} 
                                        accept="image/*"
                                        onChange={e => {
                                            const f = e.target.files?.[0]
                                            if(f) handleLogoFile(f)
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="label">Cor Principal</label>
                                <ColorPicker 
                                    value={primaryColor} 
                                    onChange={setPrimaryColor} 
                                />
                            </div>
                            
                            <div style={{marginTop: 16}}>
                                <button className="btn btnPrimary" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="column" style={{gap: '1.5rem'}}>
                <div className="card">
                    <div className="cardHeader">
                        <h2 className="cardTitle">Assinatura</h2>
                        {billingLoading ? (
                            <span className="status-badge status-pending">Carregando</span>
                        ) : subscription?.status?.toUpperCase?.() === 'ACTIVE' ? (
                            <span className="status-badge status-success">Ativa</span>
                        ) : subscription ? (
                            <span className="status-badge status-warning">{subscription.status}</span>
                        ) : (
                            <span className="status-badge status-warning">Sem assinatura</span>
                        )}
                    </div>
                    <div className="cardBody">
                        <div style={{background: 'linear-gradient(135deg, var(--gray-900), var(--gray-800))', borderRadius: 12, padding: 20, color: 'white', marginBottom: 20}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                                <div>
                                    <div style={{fontSize: '0.85rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Plano Atual</div>
                                    <div style={{fontSize: '1.5rem', fontWeight: 700, margin: '4px 0'}}>{subscription ? 'Assinatura' : '—'}</div>
                                    <div style={{fontSize: '0.9rem', opacity: 0.9}}>{subscription ? `Status: ${subscription.status}` : 'Nenhuma assinatura encontrada para este espaço.'}</div>
                                </div>
                                <div style={{background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 8}}>
                                    <Sparkles size={24} color="#f472b6" />
                                </div>
                            </div>
                            <div style={{marginTop: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', opacity: 0.8}}>
                                <Check size={14} /> Próxima cobrança: {subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR') : '—'}
                            </div>
                        </div>
                        <button className="btn w-full" style={{border: '1px solid var(--danger)', color: 'var(--danger)'}} disabled>
                            Cancelar Assinatura
                        </button>
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
                            <tr>
                                <td colSpan={4} style={{textAlign: 'center', padding: 20, color: 'var(--text-muted)'}}>
                                    Nenhuma fatura disponível.
                                </td>
                            </tr>
                        </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}

function AdminFinance() {
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
    const [finance, setFinance] = useState<AdminFinanceData | null>(null)
    const [showTransactionModal, setShowTransactionModal] = useState(false)
    const [showExtractModal, setShowExtractModal] = useState(false)
    const [showGoalsModal, setShowGoalsModal] = useState(false)
    const filters = ['all', 'income', 'expense'] as const

    const loadData = () => {
        setLoading(true)
        api<AdminFinanceData>('/api/admin/finance').then(res => {
            if (res.ok) setFinance(res.data)
            setLoading(false)
        })
    }

    useEffect(() => {
        loadData()
    }, [])

    if (loading && !finance) {
        return (
            <div style={{display: 'flex', justifyContent: 'center', padding: 40}}>
                <div className="spinner" />
            </div>
        )
    }

    const stats = {
        revenue: finance?.totals.entriesCents ?? 0,
        expenses: finance?.totals.expensesCents ?? 0,
        profit: finance?.totals.profitCents ?? 0,
        growth: (() => {
            const m = finance?.monthly ?? []
            const n = m.length
            if (n < 2) return 0
            const prev = m[n - 2]?.entriesCents ?? 0
            const cur = m[n - 1]?.entriesCents ?? 0
            if (prev <= 0) return cur > 0 ? 100 : 0
            return Number((((cur - prev) / prev) * 100).toFixed(1))
        })(),
    }

    const monthlyRevenue = (finance?.monthly ?? []).map(m => {
        const d = new Date(`${m.ym}-01T00:00:00.000Z`)
        const month = d.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
        return { month: month.charAt(0).toUpperCase() + month.slice(1), value: m.entriesCents / 100 }
    })

    const maxRevenue = Math.max(1, ...monthlyRevenue.map(m => m.value))

    const transactions = [
        ...(finance?.lastEntries ?? []).map(a => ({
            id: `in_${a.id}`,
            title: `Pagamento - ${a.clientName ?? a.clientEmail}`,
            type: 'income' as const,
            amount: a.priceCents,
            at: a.startsAt,
            dateText: new Date(a.startsAt).toLocaleString('pt-BR'),
            category: 'Serviço'
        })),
        ...(finance?.lastCashTransactions ?? []).map(e => ({
            id: `cash_${e.id}`,
            title: e.note?.trim() ? e.note.trim() : (e.type === 'INCOME' ? 'Receita' : 'Despesa'),
            type: e.type.toLowerCase() as 'income' | 'expense',
            amount: e.amountCents,
            at: e.createdAt,
            dateText: new Date(e.createdAt).toLocaleString('pt-BR'),
            category: e.method
        })),
    ].sort((a, b) => b.at.localeCompare(a.at))

    const filteredTransactions = transactions.filter(t => {
        if (filter === 'all') return true
        return t.type === filter
    })

    const handleDeleteTransaction = async (id: string) => {
        if (!id.startsWith('cash_')) return
        if (!confirm('Tem certeza que deseja excluir esta movimentação?')) return
        
        const rawId = id.replace('cash_', '')
        const res = await api<{ ok: true }>(`/api/admin/finance/transactions/${rawId}`, {
            method: 'DELETE'
        })
        
        if (res.ok) {
            loadData()
        } else {
            alert('Erro ao excluir: ' + (res.error?.message || 'Desconhecido'))
        }
    }

    return (
        <div className="finance-grid">
            {/* Summary Cards */}
            <div className="finance-col-full">
                <div className="grid" style={{gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'}}>
                    <div className="finance-stat-card">
                        <div className="finance-stat-icon" style={{background: '#dcfce7', color: '#166534'}}>
                            <Wallet size={24} />
                        </div>
                        <div className="finance-stat-info">
                            <div className="finance-stat-label">Faturamento (Jan)</div>
                            <div className="finance-stat-value" style={{color: '#166534'}}>{formatBRL(stats.revenue / 100)}</div>
                            <div className="finance-stat-trend" style={{color: '#166534'}}>
                                <Sparkles size={14} />
                                +{stats.growth}% vs. mês anterior
                            </div>
                        </div>
                    </div>
                    <div className="finance-stat-card">
                        <div className="finance-stat-icon" style={{background: '#fee2e2', color: '#991b1b'}}>
                            <Trash2 size={24} />
                        </div>
                        <div className="finance-stat-info">
                            <div className="finance-stat-label">Despesas (Jan)</div>
                            <div className="finance-stat-value" style={{color: '#991b1b'}}>{formatBRL(stats.expenses / 100)}</div>
                        </div>
                    </div>
                    <div className="finance-stat-card">
                        <div className="finance-stat-icon" style={{background: '#e0f2fe', color: '#0369a1'}}>
                            <Wallet size={24} />
                        </div>
                        <div className="finance-stat-info">
                            <div className="finance-stat-label">Lucro Líquido</div>
                            <div className="finance-stat-value" style={{color: '#0369a1'}}>{formatBRL(stats.profit / 100)}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="finance-col-main" style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                {/* Revenue Chart */}
                <div className="card">
                    <div className="cardHeader">
                        <h3 className="cardTitle">Faturamento Semestral</h3>
                    </div>
                    <div className="cardBody">
                        <div className="finance-chart-container">
                            {monthlyRevenue.map((item, i) => (
                                <div key={i} className="finance-chart-col">
                                    <div 
                                        className="finance-chart-bar"
                                        style={{
                                            height: `${(item.value / maxRevenue) * 100}%`, 
                                            background: i === monthlyRevenue.length - 1 ? 'var(--primary-600)' : 'var(--primary-200)',
                                        }}
                                    >
                                        <div className="tooltip">{formatBRL(item.value)}</div>
                                    </div>
                                    <div className="finance-chart-label">{item.month}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Transactions */}
                <div className="card">
                    <div className="cardHeader" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                        <h3 className="cardTitle">Transações Recentes</h3>
                        <div className="finance-filter-group" style={{display: 'flex', gap: 8}}>
                            {filters.map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`finance-filter-btn ${filter === f ? 'active' : ''}`}
                                >
                                    {f === 'all' ? 'Todas' : f === 'income' ? 'Entradas' : 'Saídas'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="table-scroll">
                        <table className="data-table finance-transaction-table">
                            <thead>
                                <tr>
                                    <th>Descrição</th>
                                    <th>Categoria</th>
                                    <th>Data</th>
                                    <th style={{textAlign: 'right'}}>Valor</th>
                                    <th style={{width: 40}}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransactions.map(t => (
                                    <tr key={t.id}>
                                        <td>
                                            <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                                                <div className="finance-transaction-icon" style={{
                                                    background: t.type === 'income' ? '#dcfce7' : '#fee2e2',
                                                    color: t.type === 'income' ? '#166534' : '#991b1b',
                                                }}>
                                                    {t.type === 'income' ? <Check size={20} /> : <Trash2 size={20} />}
                                                </div>
                                                <span style={{fontWeight: 600, color: 'var(--gray-900)'}}>{t.title}</span>
                                            </div>
                                        </td>
                                        <td><span className="pill">{t.category}</span></td>
                                        <td style={{color: 'var(--gray-500)'}}>{t.dateText}</td>
                                        <td style={{
                                            textAlign: 'right', 
                                            fontWeight: 700, 
                                            color: t.type === 'income' ? '#166534' : '#991b1b'
                                        }}>
                                            {t.type === 'income' ? '+' : '-'}{formatBRL(t.amount / 100)}
                                        </td>
                                        <td>
                                            {t.id.startsWith('cash_') && (
                                                <button 
                                                    className="icon-btn" 
                                                    style={{color: 'var(--gray-400)', width: 32, height: 32, opacity: 0.6}}
                                                    onClick={() => handleDeleteTransaction(t.id)}
                                                    title="Excluir movimentação"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Side Column */}
            <div className="finance-col-side" style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                <div className="finance-cashflow-card">
                    <h3 style={{fontSize: '1.2rem', marginBottom: 8, fontWeight: 700, position: 'relative', zIndex: 1}}>Fluxo de Caixa</h3>
                    <p style={{opacity: 0.9, fontSize: '0.95rem', marginBottom: 24, position: 'relative', zIndex: 1}}>
                        Saldo disponível para saque imediato.
                    </p>
                    <div style={{fontSize: '2.5rem', fontWeight: 800, marginBottom: 24, position: 'relative', zIndex: 1}}>
                        {formatBRL(stats.profit / 100)}
                    </div>
                    <div className="grid grid-2" style={{position: 'relative', zIndex: 1}}>
                        <button 
                            className="btn" 
                            style={{background: 'white', color: 'var(--primary-600)', border: 'none', fontWeight: 600, height: 48}}
                            onClick={() => setShowTransactionModal(true)}
                        >
                            Nova Movimentação
                        </button>
                        <button 
                            className="btn" 
                            style={{background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', fontWeight: 600, height: 48}}
                            onClick={() => setShowExtractModal(true)}
                        >
                            Extrato
                        </button>
                    </div>
                </div>

                <div className="card">
                    <div className="cardHeader" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <h3 className="cardTitle">Metas do Mês</h3>
                        <button className="icon-btn" onClick={() => setShowGoalsModal(true)} style={{width: 32, height: 32}}>
                            <Edit2 size={14} />
                        </button>
                    </div>
                    <div className="cardBody">
                        <div style={{marginBottom: 20}}>
                            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 8}}>
                                <span style={{fontWeight: 500, color: 'var(--gray-700)'}}>Faturamento</span>
                                <span style={{fontWeight: 700, color: 'var(--success)'}}>
                                    {Math.round((finance?.goals?.currentRevenueCents || 0) / (finance?.goals?.revenueCents || 1) * 100)}%
                                </span>
                            </div>
                            <div style={{height: 10, background: 'var(--gray-100)', borderRadius: 5, overflow: 'hidden'}}>
                                <div style={{
                                    width: `${Math.min(100, (finance?.goals?.currentRevenueCents || 0) / (finance?.goals?.revenueCents || 1) * 100)}%`, 
                                    height: '100%', 
                                    background: 'var(--success)', 
                                    borderRadius: 5,
                                    transition: 'width 0.5s ease-out'
                                }} />
                            </div>
                            <div style={{marginTop: 4, fontSize: '0.75rem', color: 'var(--gray-500)', textAlign: 'right'}}>
                                {formatBRL((finance?.goals?.currentRevenueCents || 0) / 100)} / {formatBRL((finance?.goals?.revenueCents || 0) / 100)}
                            </div>
                        </div>
                        <div>
                            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 8}}>
                                <span style={{fontWeight: 500, color: 'var(--gray-700)'}}>Novos Clientes</span>
                                <span style={{fontWeight: 700, color: 'var(--primary-600)'}}>
                                    {Math.round((finance?.goals?.currentNewClients || 0) / (finance?.goals?.newClients || 1) * 100)}%
                                </span>
                            </div>
                            <div style={{height: 10, background: 'var(--gray-100)', borderRadius: 5, overflow: 'hidden'}}>
                                <div style={{
                                    width: `${Math.min(100, (finance?.goals?.currentNewClients || 0) / (finance?.goals?.newClients || 1) * 100)}%`, 
                                    height: '100%', 
                                    background: 'var(--primary-500)', 
                                    borderRadius: 5,
                                    transition: 'width 0.5s ease-out'
                                }} />
                            </div>
                            <div style={{marginTop: 4, fontSize: '0.75rem', color: 'var(--gray-500)', textAlign: 'right'}}>
                                {finance?.goals?.currentNewClients || 0} / {finance?.goals?.newClients || 0} clientes
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showTransactionModal && <NewTransactionModal isOpen={true} onClose={() => setShowTransactionModal(false)} onSuccess={loadData} />}
            {showExtractModal && <ExtractModal isOpen={true} onClose={() => setShowExtractModal(false)} />}
            {showGoalsModal && finance?.goals && (
                <GoalsModal 
                    isOpen={true} 
                    onClose={() => setShowGoalsModal(false)} 
                    onSuccess={loadData}
                    initialRevenue={finance.goals.revenueCents}
                    initialNewClients={finance.goals.newClients}
                />
            )}
        </div>
    )
}

function Admin(props: { tenant?: TenantPublic; tenantSlug?: string; basePath?: string } = {}) {
  const { tenantSlug } = useParams()
  const nav = useNavigate()
  const slug = (props.tenantSlug ?? tenantSlug ?? '').trim().toLowerCase()
  const [me, setMe] = useState<SessionUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [tenant, setTenant] = useState<TenantPublic | null>(null)
  const [isTestMode, setIsTestMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('lash_test_mode') === 'true'
    return false
  })
  const [tab, setTab] = useState<'dashboard' | 'calendar' | 'services' | 'clients' | 'finance' | 'settings' | 'evolution'>('dashboard')

  const [stats, setStats] = useState<AdminStats | null>(null)

  function loadStats() {
    api<AdminStats>('/api/admin/dashboard').then(res => {
        if(res.ok) setStats(res.data)
    })
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
            // Fix: Sync with server but prefer 'true' if either source is active
            if (typeof res.data.isTestMode === 'boolean') {
                const serverMode = res.data.isTestMode
                const localMode = localStorage.getItem('lash_test_mode') === 'true'
                const effectiveMode = serverMode || localMode
                
                setIsTestMode(effectiveMode)
                localStorage.setItem('lash_test_mode', String(effectiveMode))
            }
        }
        else {
             // Redirect immediately if not logged in to avoid hanging state
             nav('/login')
             return
        }
        setAuthLoading(false)
    })
    
    loadStats()
  }, [])

  if (authLoading) {
      return (
          <div className="authContainer">
              <div className="text-center">Carregando painel...</div>
          </div>
      )
  }

  if (!me || me.role !== 'ADMIN') {
      return (
          <div className="authContainer">
              <div className="authCard">
                  <div className="text-center">
                      <h1 className="authTitle">Acesso Negado</h1>
                      <p className="authDesc">Área restrita para administradores.</p>
                      <button className="btn btnPrimary w-full" onClick={() => nav('/login')}>Ir para Login</button>
                  </div>
              </div>
          </div>
      )
  }

  return (
    <Shell
        title={tab === 'dashboard' ? 'Visão Geral' : tab.charAt(0).toUpperCase() + tab.slice(1)}
        subtitle="Gestão do Espaço"
        user={me}
        isTestMode={isTestMode}
        sidebar={
            <div className="nav-group">
                <div className="nav-label">Principal</div>
                <SidebarItem active={tab === 'dashboard'} icon={<LayoutDashboard size={18}/>} label="Dashboard" onClick={() => setTab('dashboard')} />
                <SidebarItem active={tab === 'calendar'} icon={<Calendar size={18}/>} label="Agenda" onClick={() => setTab('calendar')} />
                <SidebarItem active={tab === 'clients'} icon={<Users size={18}/>} label="Clientes" onClick={() => setTab('clients')} />
                
                <div className="nav-label" style={{marginTop: 16}}>Gestão</div>
                <SidebarItem active={tab === 'services'} icon={<Sparkles size={18}/>} label="Serviços" onClick={() => setTab('services')} />
                <SidebarItem active={tab === 'finance'} icon={<Wallet size={18}/>} label="Financeiro" onClick={() => setTab('finance')} />
                
                <div className="nav-label" style={{marginTop: 16}}>Sistema</div>
                <SidebarItem active={tab === 'evolution'} icon={<WhatsAppIcon size={18}/>} label="WhatsApp" onClick={() => setTab('evolution')} />
                <SidebarItem active={tab === 'settings'} icon={<Settings size={18}/>} label="Configurações" onClick={() => setTab('settings')} />
                <SidebarItem icon={<LogOut size={18}/>} label="Sair" onClick={async () => {
                     await api('/api/auth/logout', {method: 'POST'})
                     // Force reload to clear all states and re-check auth
                     window.location.href = '/'
                }} />
            </div>
        }
    >
        {tab === 'dashboard' ? <AdminDashboard me={me} stats={stats} onRefresh={loadStats} /> : null}
        
        {tab === 'services' ? <AdminServices /> : null}

        {tab === 'clients' ? <AdminClients /> : null}
        
        {/* Placeholders for other tabs */}
        {tab === 'finance' ? <AdminFinance /> : null}

        {tab === 'calendar' ? <AdminCalendar /> : null}

        {tab === 'evolution' ? <AdminEvolutionAPI /> : null}

        {tab === 'settings' ? (
            <AdminSettings tenant={tenant} onUpdate={() => {
                if(slug) {
                    api<{ tenant: TenantPublic }>(`/api/public/tenant/${slug}`).then(res => {
                        if(res.ok) {
                            setTenant(res.data.tenant)
                            applyTenantTheme(res.data.tenant)
                        }
                    })
                }
            }} />
        ) : null}
    </Shell>
  )
}

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
        adminPassword: '',
        primaryColor: '#ec4899', // Pink default
        logoUrl: ''
    })

    if (!isOpen) return null

    async function loadImageFromObjectUrl(objectUrl: string) {
        const img = new Image()
        img.decoding = 'async'
        img.src = objectUrl
        await img.decode()
        return img
    }

    function drawToCanvas(img: HTMLImageElement, maxDim: number) {
        const w = img.naturalWidth || img.width
        const h = img.naturalHeight || img.height
        const largest = Math.max(w, h)
        const scale = largest > maxDim ? maxDim / largest : 1
        const cw = Math.max(1, Math.round(w * scale))
        const ch = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas indisponível')
        ctx.clearRect(0, 0, cw, ch)
        ctx.drawImage(img, 0, 0, cw, ch)
        return canvas
    }

    function canvasToDataUrl(canvas: HTMLCanvasElement, type: string, quality?: number) {
        try {
            return canvas.toDataURL(type, quality)
        } catch {
            return canvas.toDataURL('image/png')
        }
    }

    async function fileToOptimizedDataUrl(file: File) {
        const objectUrl = URL.createObjectURL(file)
        try {
            const img = await loadImageFromObjectUrl(objectUrl)
            const attempts: Array<{ maxDim: number; quality: number }> = [
                { maxDim: 512, quality: 0.86 },
                { maxDim: 512, quality: 0.78 },
                { maxDim: 384, quality: 0.78 },
                { maxDim: 384, quality: 0.7 },
                { maxDim: 256, quality: 0.7 }
            ]

            for (const a of attempts) {
                const canvas = drawToCanvas(img, a.maxDim)
                const webp = canvasToDataUrl(canvas, 'image/webp', a.quality)
                if (webp.startsWith('data:image/') && webp.length <= 250_000) return webp
                const png = canvasToDataUrl(canvas, 'image/png')
                if (png.startsWith('data:image/') && png.length <= 250_000) return png
            }

            const fallback = canvasToDataUrl(drawToCanvas(img, 256), 'image/png')
            return fallback
        } finally {
            URL.revokeObjectURL(objectUrl)
        }
    }

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
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" style={{maxWidth: 500}} onClick={e => e.stopPropagation()}>
                <div style={{padding: '2rem 2rem 1.5rem', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}}>
                        <h3 className="cardTitle" style={{fontSize: '1.25rem'}}>Novo Espaço</h3>
                        <div className="pill" style={{fontSize: '0.75rem'}}>Passo {step} de 2</div>
                    </div>
                    <p style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>
                        {step === 1 ? 'Informações básicas e acesso' : 'Personalização da marca'}
                    </p>
                </div>

                <div style={{padding: '2rem'}}>
                    {step === 1 ? (
                        <div className="form-stack">
                            <div className="input-group">
                                <label className="label">Nome do Espaço</label>
                                <div className="input-wrapper">
                                    <Sparkles size={16} className="input-icon" />
                                    <input 
                                        className="input has-icon" 
                                        value={data.name} 
                                        onChange={e => setData({...data, name: e.target.value})} 
                                        placeholder="Ex: Studio Bella" 
                                        autoFocus
                                    />
                                </div>
                            </div>
                            
                            <div className="input-group">
                                <label className="label">URL (Slug)</label>
                                <div className="input-wrapper">
                                    <Search size={16} className="input-icon" />
                                    <input 
                                        className="input has-icon" 
                                        value={data.slug} 
                                        onChange={e => setData({...data, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})} 
                                        placeholder="studiobella" 
                                    />
                                    <div className="input-suffix">.lashspace.com.br</div>
                                </div>
                            </div>

                            <div className="row">
                                <div className="input-group">
                                    <label className="label">Email Admin</label>
                                    <input className="input" value={data.adminEmail} onChange={e => setData({...data, adminEmail: e.target.value})} />
                                </div>
                                <div className="input-group">
                                    <label className="label">Senha Admin</label>
                                    <input className="input" type="password" value={data.adminPassword} onChange={e => setData({...data, adminPassword: e.target.value})} />
                                    <div className="passwordRequirements">
                                        <div className={`passwordReqItem ${data.adminPassword.length >= 8 ? 'ok' : 'bad'}`}>
                                            {data.adminPassword.length >= 8 ? <Check size={14} /> : <XCircle size={14} />}
                                            <span>Mínimo de 8 caracteres</span>
                                        </div>
                                    </div>
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
                                        <Upload size={16} style={{marginRight: 8}} /> Upload
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
                                        <Link2 size={16} style={{marginRight: 8}} /> URL
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
                                            <Trash2 size={16} style={{marginRight: 8}} /> Remover
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
                                                <ImageIcon size={16} style={{marginRight: 8}} />
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
                                            <ImageIcon size={16} className="input-icon" />
                                            <input
                                                className="input has-icon"
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
                                            <img
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
                                        <div style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>{data.slug ? `${data.slug}.lashspace.com.br` : 'dominio.lashspace.com.br'}</div>
                                    </div>
                                </div>
                                <button className="btn btnPrimary" style={{background: data.primaryColor, borderColor: data.primaryColor}}>Botão Principal</button>
                            </div>
                        </div>
                    )}

                    {submitError && (
                        <div className="pill" style={{marginTop: 16, color: 'var(--danger)'}}>
                            {submitError}
                        </div>
                    )}
                </div>

                <div style={{padding: '1.5rem 2rem', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between'}}>
                    {step === 2 ? (
                        <button className="btn" onClick={() => setStep(1)}>Voltar</button>
                    ) : (
                        <button className="btn" onClick={onClose}>Cancelar</button>
                    )}
                    
                    {step === 1 ? (
                        <button className="btn btnPrimary" onClick={() => setStep(2)} disabled={!data.name || !data.slug || !data.adminEmail || data.adminPassword.length < 8}>
                            Próximo <ChevronRight size={16} style={{marginLeft: 8}}/>
                        </button>
                    ) : (
                        <button className="btn btnPrimary" onClick={handleSubmit} disabled={loading}>
                            {loading ? 'Criando...' : 'Criar Espaço'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

function DevUsers() {
    const [users, setUsers] = useState<{id: string, email: string, createdAt: string}[]>([])
    const [loading, setLoading] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        load()
    }, [])

    async function load() {
        setLoading(true)
        const res = await api<{users: {id: string, email: string, createdAt: string}[]}>('/api/dev/users')
        if(res.ok) setUsers(res.data.users)
        setLoading(false)
    }

    async function create() {
        if(!email || !password) return
        setCreating(true)
        setError(null)
        const res = await api<{user: {id: string, email: string, createdAt: string}}>('/api/dev/users', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        })
        if(res.ok) {
            setUsers(prev => [res.data.user, ...prev])
            setEmail('')
            setPassword('')
        } else {
            setError(res.error.message)
        }
        setCreating(false)
    }

    async function remove(id: string) {
        if(!confirm('Remover este usuário?')) return
        const res = await api<{ok: boolean}>(`/api/dev/users/${id}`, { method: 'DELETE' })
        if(res.ok) {
            setUsers(prev => prev.filter(u => u.id !== id))
        } else {
            alert(res.error.message)
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
                                <input className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                            </div>
                            <div className="input-group">
                                <label className="label">Senha</label>
                                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mín. 8 caracteres" />
                            </div>
                        </div>
                        {error && <div className="pill" style={{color: 'var(--danger)'}}>{error}</div>}
                        <button className="btn btnPrimary" onClick={create} disabled={creating || !email || password.length < 8} style={{alignSelf: 'flex-start'}}>
                            {creating ? 'Criando...' : 'Adicionar Usuário'}
                        </button>
                    </div>

                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Criado em</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={3} style={{textAlign: 'center', padding: 20}}>Carregando...</td></tr>
                                ) : users.map(u => (
                                    <tr key={u.id}>
                                        <td>{u.email}</td>
                                        <td>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                                        <td style={{textAlign: 'right'}}>
                                            <button className="icon-btn" onClick={() => remove(u.id)} style={{color: 'var(--danger)', marginLeft: 'auto'}}>
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
    const [settings, setSettings] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        api<{settings: Record<string, string>}>('/api/dev/integrations').then(res => {
            if(res.ok) setSettings(res.data.settings)
            setLoading(false)
        })
    }, [])

    async function save() {
        setSaving(true)
        await api('/api/dev/integrations', {
            method: 'POST',
            body: JSON.stringify(settings)
        })
        setSaving(false)
        if (typeof window !== 'undefined') window.alert('Configurações salvas!')
    }

    const handleChange = (key: string, val: string) => {
        setSettings(s => ({...s, [key]: val}))
    }

    if(loading) return <div style={{padding: 40, textAlign: 'center', color: 'var(--text-muted)'}}>Carregando integrações...</div>

    return (
        <div style={{maxWidth: 800, margin: '0 auto', width: '100%'}}>
            <div className="card">
                <div className="cardHeader">
                    <div>
                        <h2 className="cardTitle">Integrações Globais</h2>
                        <p className="cardDesc">Configure as chaves de API para os serviços externos.</p>
                    </div>
                    <button className="btn btnPrimary" onClick={save} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
                <div className="cardBody">
                    <h4 style={{fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 20, marginTop: 0}}>Appmax</h4>
                    <div className="form-stack">
                        <div className="input-group">
                            <label className="label">API Key</label>
                            <input className="input" type="password" value={settings['appmax_api_key'] || ''} onChange={e => handleChange('appmax_api_key', e.target.value)} placeholder="sk_..." />
                        </div>
                        <div className="input-group">
                            <label className="label">Webhook Secret</label>
                            <input className="input" type="password" value={settings['appmax_webhook_secret'] || ''} onChange={e => handleChange('appmax_webhook_secret', e.target.value)} />
                        </div>
                    </div>

                    <div style={{height: 1, background: 'var(--border)', margin: '24px 0'}} />

                    <h4 style={{fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 20}}>Evolution API</h4>
                    <div className="form-stack">
                        <div className="input-group">
                            <label className="label">Base URL</label>
                            <input className="input" value={settings['evolution_api_url'] || ''} onChange={e => handleChange('evolution_api_url', e.target.value)} placeholder="https://api.evolution..." />
                        </div>
                        <div className="input-group">
                            <label className="label">Global API Key</label>
                            <input className="input" type="password" value={settings['evolution_api_key'] || ''} onChange={e => handleChange('evolution_api_key', e.target.value)} />
                        </div>
                    </div>

                    <div style={{height: 1, background: 'var(--border)', margin: '24px 0'}} />

                    <h4 style={{fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 20}}>Hostinger & IA</h4>
                    <div className="form-stack">
                        <div className="input-group">
                            <label className="label">Hostinger API Token</label>
                            <input className="input" type="password" value={settings['hostinger_api_token'] || ''} onChange={e => handleChange('hostinger_api_token', e.target.value)} placeholder="Token do hPanel" />
                            <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4}}>Usado para criar subdomínios automaticamente.</p>
                        </div>
                        <div className="input-group">
                            <label className="label">DeepSeek API Key</label>
                            <input className="input" type="password" value={settings['deepseek_api_key'] || ''} onChange={e => handleChange('deepseek_api_key', e.target.value)} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function DevBackup() {
    const [importing, setImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleExport = () => {
        const link = document.createElement('a')
        link.href = '/api/dev/backup/export'
        link.setAttribute('download', 'lash-saas-backup.db')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        
        if (!confirm('ATENÇÃO: Importar um backup irá SOBRESCREVER todos os dados atuais. Um backup automático do estado atual será criado antes, mas o processo é arriscado. Deseja continuar?')) {
            if (fileInputRef.current) fileInputRef.current.value = ''
            return
        }

        setImporting(true)
        try {
            const reader = new FileReader()
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1]
                const res = await api('/api/dev/backup/import', {
                    method: 'POST',
                    body: JSON.stringify({ fileData: base64 })
                })
                
                if (res.ok) {
                    alert('Backup importado com sucesso! O sistema pode precisar ser reiniciado.')
                    window.location.reload()
                } else {
                    alert('Erro ao importar backup: ' + (res.error?.message || 'Erro desconhecido'))
                }
            }
            reader.readAsDataURL(file)
        } catch (err) {
            console.error(err)
            alert('Erro ao processar arquivo')
        } finally {
            setImporting(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return (
        <div style={{maxWidth: 800, margin: '0 auto', width: '100%'}}>
            <div className="card">
                <div className="cardHeader">
                    <h2 className="cardTitle">Backup & Restauração</h2>
                    <p className="cardDesc">Exporte e importe o banco de dados completo do sistema.</p>
                </div>
                <div className="cardBody">
                    <div className="grid grid-2 backup-grid" style={{gap: 24}}>
                        <div style={{
                            padding: 24, 
                            background: 'var(--bg-subtle)', 
                            borderRadius: 16, 
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12, 
                                    background: 'var(--primary-100)', color: 'var(--primary-700)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16
                                }}>
                                    <Database size={24} />
                                </div>
                                <h3 style={{fontSize: '1.1rem', marginTop: 0, marginBottom: 8, fontWeight: 700, color: 'var(--text-main)'}}>Exportar Dados</h3>
                                <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0}}>
                                    Baixe uma cópia completa do banco de dados (SQLite) atual para segurança.
                                </p>
                            </div>
                            <button className="btn btnPrimary" onClick={handleExport} style={{width: '100%', height: 44}}>
                                <Database size={18} style={{marginRight: 8}} />
                                Baixar Backup (.db)
                            </button>
                        </div>

                        <div style={{
                            padding: 24, 
                            background: 'var(--bg-subtle)', 
                            borderRadius: 16, 
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12, 
                                    background: 'var(--primary-100)', color: 'var(--primary-700)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16
                                }}>
                                    <Upload size={24} />
                                </div>
                                <h3 style={{fontSize: '1.1rem', marginTop: 0, marginBottom: 8, fontWeight: 700, color: 'var(--text-main)'}}>Importar Dados</h3>
                                <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0}}>
                                    Restaure o sistema a partir de um arquivo de backup (.db) anterior.
                                </p>
                            </div>
                            <input 
                                type="file" 
                                accept=".db,.sqlite" 
                                ref={fileInputRef}
                                style={{display: 'none'}} 
                                onChange={handleImport}
                            />
                            <button 
                                className="btn" 
                                onClick={() => fileInputRef.current?.click()} 
                                disabled={importing}
                                style={{width: '100%', height: 44, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)'}}
                            >
                                <Upload size={18} style={{marginRight: 8}} />
                                {importing ? 'Importando...' : 'Carregar Backup'}
                            </button>
                        </div>
                    </div>
                    
                    <div style={{marginTop: 24, padding: 16, background: 'rgba(254, 226, 226, 0.5)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#991b1b', borderRadius: 12, fontSize: '0.9rem', display: 'flex', gap: 12, alignItems: 'flex-start'}}>
                        <div style={{marginTop: 2}}><ShieldCheck size={20} /></div>
                        <div>
                            <strong style={{display: 'block', marginBottom: 4}}>Atenção</strong>
                            A importação substitui todo o banco de dados atual. 
                            Certifique-se de ter um backup recente antes de prosseguir.
                            O sistema fará um backup automático de segurança (`.bak`) antes da substituição.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Dev() {
    const nav = useNavigate()
    const [me, setMe] = useState<SessionUser | null>(null)
    const [tenants, setTenants] = useState<TenantDev[]>([])
    const [loading, setLoading] = useState(true)
    const [testMode, setTestMode] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('lash_test_mode') === 'true'
        return false
    })
    const [showNew, setShowNew] = useState(false)
    const [tab, setTab] = useState<'tenants' | 'settings' | 'integrations' | 'backups'>('tenants')
    const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
    const [devTheme, setDevTheme] = useState<DevThemeMode>(() => getDevTheme())
    const [devColor, setDevColor] = useState<string>(() => getDevPrimaryColor() ?? '#6366f1')
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        setAppMode('dev')
        initDevTheme('dark')
        setDevTheme(getDevTheme())
        api<{user: SessionUser | null; isTestMode?: boolean}>('/api/auth/me').then(res => {
            if(res.ok && res.data.user?.role === 'DEV') {
                setMe(res.data.user)
                // Fix: Sync with server but prefer 'true' if either source is active
                if (typeof res.data.isTestMode === 'boolean') {
                    const serverMode = res.data.isTestMode
                    const localMode = localStorage.getItem('lash_test_mode') === 'true'
                    const effectiveMode = serverMode || localMode

                    setTestMode(effectiveMode)
                    localStorage.setItem('lash_test_mode', String(effectiveMode))
                }
            }
            else nav('/login')
        })
        loadTenants()
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

    const statusMeta = (raw?: string) => {
        const v = (raw ?? 'ACTIVE').trim().toUpperCase()
        if (v === 'ACTIVE') return { label: 'Ativo', className: 'status-success' }
        if (v === 'SUSPENDED') return { label: 'Suspenso', className: 'status-pending' }
        if (v === 'DISABLED') return { label: 'Desativado', className: 'status-warning' }
        return { label: v || '—', className: 'status-warning' }
    }

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
                style: { background: '#eff6ff', color: '#1e40af' } as CSSProperties
            }
        }
        if (isActive) {
            return {
                label: `Ativa${endText}`,
                className: 'status-success',
                style: { background: '#dcfce7', color: '#166534' } as CSSProperties
            }
        }
        if (isPastDue) {
            return {
                label: `Atrasada`,
                className: 'status-warning',
                style: { background: '#fef9c3', color: '#854d0e' } as CSSProperties
            }
        }
        if (isInactive) {
            return {
                label: `Cancelada`,
                className: 'status-warning',
                style: { background: '#fee2e2', color: '#991b1b' } as CSSProperties
            }
        }
        return {
            label: `${raw || 'Sem plano'}`,
            className: 'status-warning',
            style: { background: 'var(--bg-subtle)', color: 'var(--text-muted)' } as CSSProperties
        }
    }

    if (!me) return <div className="authContainer"><div className="text-center">Carregando Console...</div></div>

    return (
        <Shell
            title="Developer Console"
            subtitle="Gestão da Plataforma"
            user={me}
            isTestMode={testMode}
            onSearch={setSearchTerm}
            searchValue={searchTerm}
            actions={
                <div style={{display: 'flex', gap: 20, alignItems: 'center', marginRight: 8}}>
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
                            Test Mode
                        </div>
                        <Switch 
                            checked={testMode} 
                            onChange={(val) => {
                                setTestMode(val)
                                localStorage.setItem('lash_test_mode', String(val))
                                api('/api/dev/test-mode', {
                                    method: 'POST',
                                    body: JSON.stringify({ enabled: val })
                                }).then(res => {
                                    if (!res.ok) {
                                        // Revert on failure
                                        setTestMode(!val)
                                        localStorage.setItem('lash_test_mode', String(!val))
                                        alert('Erro ao atualizar modo de teste no servidor')
                                    }
                                })
                            }} 
                        />
                    </label>

                    <div style={{width: 1, height: 24, background: 'var(--border)'}} />

                    <button 
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
                <div className="nav-group">
                    <SidebarItem active={tab === 'tenants'} icon={<LayoutDashboard size={18}/>} label="Tenants" onClick={() => setTab('tenants')} />
                    <SidebarItem active={tab === 'integrations'} icon={<Webhook size={18}/>} label="Integrações" onClick={() => setTab('integrations')} />
                    <SidebarItem active={tab === 'backups'} icon={<Database size={18}/>} label="Backups" onClick={() => setTab('backups')} />
                    <SidebarItem active={tab === 'settings'} icon={<Settings size={18}/>} label="Configurações" onClick={() => setTab('settings')} />
                    <div className="navDivider" />
                    <SidebarItem icon={<LogOut size={18}/>} label="Sair" onClick={async () => {
                         await api('/api/auth/logout', {method: 'POST'})
                         window.location.href = '/'
                    }} />
                </div>
            }
        >
            {tab === 'tenants' ? (
                <>
                    <div className="welcome-banner" style={{background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)', color: 'white'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
                            <div>
                                <h1 style={{margin: 0, fontSize: '2rem', fontWeight: 800}}>Painel Developer</h1>
                                <p style={{margin: '8px 0 0', opacity: 0.8}}>Gerencie todos os espaços e assinaturas.</p>
                            </div>
                            <ShieldCheck size={48} style={{opacity: 0.2}} />
                        </div>
                    </div>

                    <div className="card">
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
                                    <button className="btn btnPrimary mobile-only icon-btn-primary" onClick={() => setShowNew(true)} style={{padding: 0, width: 36, height: 36, borderRadius: '50%', minWidth: 36, display: 'none'}}>
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>
                            <button className="btn btnPrimary desktop-only" onClick={() => setShowNew(true)}>
                                <Plus size={16} style={{marginRight: 8 }}/> Novo Espaço
                            </button>
                        </div>
                        
                        {loading ? <div style={{padding: 20}}>Carregando...</div> : (
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
                                                    }}
                                                >
                                                    <Globe size={14} />
                                                    {t.slug}.lashspace.com.br
                                                </a>
                                            </td>
                                            <td>
                                                {(() => {
                                                    const m = subscriptionMeta(t)
                                                    return <span className={`status-badge ${m.className}`} style={m.style}>{m.label}</span>
                                                })()}
                                            </td>
                                            <td style={{textAlign: 'right', paddingRight: 24}}>
                                                <button className="icon-btn" onClick={() => setEditingTenantId(t.id)} aria-label="Editar tenant" style={{marginLeft: 'auto'}}>
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
                                                    style={{fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2}}
                                                >
                                                    <Globe size={10} />
                                                    {t.slug}.lashspace.com.br
                                                </a>
                                            </div>
                                        </div>
                                        
                                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                             {(() => {
                                                const m = subscriptionMeta(t)
                                                // Simplified badge for mobile
                                                return <span className={`status-badge ${m.className}`} style={{fontSize: '0.65rem', padding: '2px 6px', height: 20, display: 'flex', alignItems: 'center'}}>{m.label.split(' ')[0]}</span>
                                            })()}
                                            <button className="icon-btn" onClick={() => setEditingTenantId(t.id)} aria-label="Editar tenant" style={{width: 32, height: 32, background: 'var(--bg-subtle)', border: 'none'}}>
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
            ) : tab === 'integrations' ? (
                <DevIntegrations />
            ) : tab === 'backups' ? (
                <DevBackup />
            ) : (
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
                </div>
            )}

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
        <div className="modal-overlay" style={{zIndex: 200}} onClick={loading ? undefined : onCancel}>
            <div className="modal-content" style={{maxWidth: 400}} onClick={e => e.stopPropagation()}>
                <div style={{padding: 24}}>
                    <div style={{display: 'flex', gap: 12, marginBottom: 16}}>
                        <div style={{
                            width: 40, height: 40, borderRadius: '50%', 
                            background: variant === 'danger' ? '#fee2e2' : 'var(--bg-subtle)', 
                            color: variant === 'danger' ? '#991b1b' : 'var(--primary-600)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                            {variant === 'danger' ? <Trash2 size={20} /> : <Check size={20} />}
                        </div>
                        <div>
                            <h3 className="cardTitle" style={{fontSize: '1.1rem', marginBottom: 8}}>{title}</h3>
                            <div style={{fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5}}>
                                {description}
                            </div>
                        </div>
                    </div>
                    <div style={{display: 'flex', gap: 10, justifyContent: 'flex-end'}}>
                        <button className="btn" onClick={onCancel} disabled={loading}>{cancelText}</button>
                        <button 
                            className={`btn ${variant === 'danger' ? '' : 'btnPrimary'}`}
                            style={variant === 'danger' ? {background: '#dc2626', color: 'white', border: 'none'} : {}}
                            onClick={onConfirm}
                            disabled={loading}
                        >
                            {loading ? 'Processando...' : confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
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
    const [error, setError] = useState<string | null>(null)
    const [form, setForm] = useState({
        name: '',
        slug: '',
        status: 'ACTIVE' as 'ACTIVE' | 'SUSPENDED' | 'DISABLED',
        primaryColor: '#6366f1',
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
            setError('Falha ao excluir tenant')
        } finally {
            setDeleting(false)
            setShowConfirmDelete(false)
        }
    }

    if (!isOpen) return null

    return (
        <>
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" style={{maxWidth: 560}} onClick={(e) => e.stopPropagation()}>
                <div style={{padding: '1.5rem 2rem', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div>
                        <div className="cardTitle" style={{fontSize: '1.25rem'}}>Configurar Espaço</div>
                        <div style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>{tenantId}</div>
                    </div>
                    <button className="icon-btn" onClick={onClose} aria-label="Fechar"><XCircle size={16} /></button>
                </div>
                <div style={{padding: '2rem'}}>
                    {loading ? (
                        <div>Carregando...</div>
                    ) : (
                        <div className="form-stack">
                            <div className="row">
                                <div className="input-group">
                                    <label className="label">Nome</label>
                                    <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                                </div>
                                <div className="input-group">
                                    <label className="label">Status</label>
                                    <select className="input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'ACTIVE' | 'SUSPENDED' | 'DISABLED' }))}>
                                        <option value="ACTIVE">Ativo</option>
                                        <option value="SUSPENDED">Suspenso</option>
                                        <option value="DISABLED">Desativado</option>
                                    </select>
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="label">Slug</label>
                                <div className="input-wrapper">
                                    <Link2 size={16} className="input-icon" />
                                    <input className="input has-icon" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
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
                                    <ImageIcon size={16} className="input-icon" />
                                    <input className="input has-icon" value={form.logoUrl} onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))} placeholder="https://..." />
                                </div>
                            </div>

                            {error && <div className="pill" style={{color: 'var(--danger)'}}>{error}</div>}
                        </div>
                    )}
                </div>
                <div style={{padding: '1.25rem 2rem', background: 'var(--bg-subtle)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12}}>
                    <button className="btn" onClick={() => setShowConfirmDelete(true)} disabled={loading || saving || deleting} style={{borderColor: 'rgba(239,68,68,0.35)', color: 'var(--danger)'}}>
                        <Trash2 size={16} /> Excluir
                    </button>
                    <div style={{display: 'flex', gap: 10}}>
                        <button className="btn" onClick={onClose} disabled={saving || deleting}>Cancelar</button>
                        <button className="btn btnPrimary" onClick={save} disabled={loading || saving || deleting || !form.name.trim() || !form.slug.trim()}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <ConfirmModal 
            isOpen={showConfirmDelete}
            title="Excluir Espaço?"
            description="Esta ação removerá permanentemente o espaço e todos os seus dados (agendamentos, clientes, configurações). Não pode ser desfeita."
            confirmText="Sim, excluir espaço"
            onConfirm={remove}
            onCancel={() => setShowConfirmDelete(false)}
            loading={deleting}
            variant="danger"
        />
        </>
    )
}

function UnifiedLogin(props: { hostTenant?: TenantPublic | null; isDevHost?: boolean } = {}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keepSigned, setKeepSigned] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)

  const [allowDevBootstrap, setAllowDevBootstrap] = useState(false)
  const [bootstrapEmail, setBootstrapEmail] = useState('')
  const [bootstrapPassword, setBootstrapPassword] = useState('')
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [bootstrapLoading, setBootstrapLoading] = useState(false)
  const [bootstrapSuccess, setBootstrapSuccess] = useState(false)

  const isTenant = !!props.hostTenant
  const accent = props.hostTenant?.primaryColor ?? 'var(--primary-600)'
  const brandName = props.hostTenant?.name ?? 'Lash Space'
  const brandHandle = props.hostTenant?.slug ? `@${props.hostTenant.slug}` : 'Agendamentos e gestão'
  const pageStyle: CssVarStyle = { '--auth-accent': accent }

  useEffect(() => {
    if (props.isDevHost) {
        setAppMode('dev')
    } else {
        setAppMode(isTenant ? 'tenant' : 'public')
        if (props.hostTenant) applyTenantTheme(props.hostTenant)
    }
  }, [props.hostTenant, props.isDevHost])

  useEffect(() => {
    if (isTenant) return
    let mounted = true
    api<{ user: SessionUser | null; allowDevBootstrap?: boolean }>('/api/auth/me').then((res) => {
      if (!mounted) return
      if (!res.ok) return
      setAllowDevBootstrap(Boolean(res.data.allowDevBootstrap))
    })
    return () => {
      mounted = false
    }
  }, [isTenant])

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const res = await api<{ user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setLoading(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }

    setLoginSuccess(true)
    const u = res.data.user

    setTimeout(() => {
      if (u.role === 'DEV') {
        window.location.href = '/'
        return
      }
      if (u.role === 'ADMIN') {
        window.location.href = '/admin'
        return
      }
      if (u.role === 'CLIENT') {
        window.location.href = '/agendar'
        return
      }
    }, 1500)
  }

  async function handleBootstrap() {
    setBootstrapLoading(true)
    setBootstrapError(null)
    setBootstrapSuccess(false)
    try {
      const res = await api<{ ok: true }>('/api/dev/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ email: bootstrapEmail, password: bootstrapPassword }),
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
            <div className="authRefMark">
              {props.hostTenant?.logoUrl ? (
                <img className="authRefLogo" src={props.hostTenant.logoUrl} alt={brandName} />
              ) : (
                <Sparkles size={18} />
              )}
            </div>
            <div className="authRefBrandText">
              <div className="authRefBrandName">{brandName}</div>
              <div className="authRefBrandSub">{brandHandle}</div>
            </div>
          </div>

          <div className="authRefQuote">
            <div className="authRefQuoteText">“Simplesmente todas as ferramentas que eu preciso para atender melhor e vender mais.”</div>
            <div className="authRefQuoteMeta">
              <div className="authRefQuoteName">Juliana Souza</div>
              <div className="authRefQuoteRole">Lash Designer</div>
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
            ) : (
              <>
                <h1 className="authRefTitle">Entrar na sua conta</h1>
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
                    type={showPassword ? 'text' : 'password'}
                    value={bootstrapPassword}
                    onChange={(e) => setBootstrapPassword(e.target.value)}
                    placeholder="Senha (mín. 8 caracteres)"
                    autoComplete="new-password"
                  />
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
                    disabled={bootstrapLoading || !bootstrapEmail || bootstrapPassword.length < 8}
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
                    tabIndex={-1}
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

              <button className="authRefPrimary" onClick={handleLogin} disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <div className="authRefDivider">
                <span>OU</span>
              </div>

              <button className="authRefSocial" type="button" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Entrar com Google</span>
              </button>

              <div className="authRefFooter">
                <span>Não tem uma conta?</span>
                <a
                  className="authRefLink"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                  }}
                >
                  Fale com o suporte
                </a>
              </div>
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-unused-vars */
function BookingStepper(props: { current: number; total: number }) {
  return (
    <div className="stepper">
      {Array.from({ length: props.total }).map((_, i) => {
        const step = i + 1
        const active = step === props.current
        const completed = step < props.current
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`stepDot ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}>
              {completed ? '✓' : step}
            </div>
            {step < props.total && (
              <div className={`stepLine ${completed ? 'active' : ''}`} style={{ margin: '0 4px' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function DateScroller({ 
  value, 
  onChange, 
  min, 
  max,
  getDateStatus,
}: { 
  value: string; 
  onChange: (val: string) => void;
  min: string;
  max: string;
  getDateStatus?: (ymd: string) => { disabled: boolean; label?: string };
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      setShowLeftArrow(el.scrollLeft > 10)
    }

    el.addEventListener('scroll', handleScroll)
    // Check initially
    handleScroll()
    
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])
  
  const dates = useMemo(() => {
    const arr = []
    // Parse YYYY-MM-DD manually to avoid UTC conversion issues
    const [minY, minM, minD] = min.split('-').map(Number)
    const [maxY, maxM, maxD] = max.split('-').map(Number)
    
    const curr = new Date(minY, minM - 1, minD)
    const end = new Date(maxY, maxM - 1, maxD)
    
    while (curr <= end) {
      arr.push(new Date(curr))
      curr.setDate(curr.getDate() + 1)
    }
    return arr
  }, [min, max])

  const scroll = (dir: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = 200
      scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
    }
  }

  // Weekday labels
  // Use formatting consistent with PT-BR
  const getWeekDay = (d: Date) => {
    const s = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '')
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const getMonth = (d: Date) => {
    const s = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).replace('.', '')
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  
  return (
    <div className="dateScrollerWrapper">
      <button 
        className="dateScrollBtn left" 
        onClick={() => scroll('left')}
        style={{ opacity: showLeftArrow ? 1 : 0, pointerEvents: showLeftArrow ? 'auto' : 'none', transition: 'opacity 0.2s' }}
      >
        <ChevronLeft size={20} />
      </button>
      
      <div className="dateScrollerContainer" ref={scrollRef}>
        {dates.map(d => {
          // Format as YYYY-MM-DD using local time components
          const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const isSelected = value === dStr
          const isToday = new Date().toDateString() === d.toDateString()
          const status = getDateStatus ? getDateStatus(dStr) : { disabled: false }
          
          return (
            <div 
              key={dStr} 
              className={`dateCard ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${status.disabled ? 'disabled' : ''}`}
              onClick={() => {
                if (!status.disabled) onChange(dStr)
              }}
            >
              <span className="dateCardWeek">{getWeekDay(d)}</span>
              <span className="dateCardDay">{d.getDate()}</span>
              <span className="dateCardMonth">{getMonth(d)}</span>
              {status.disabled && <span className="dateCardStatus">{status.label ?? 'Fechado'}</span>}
            </div>
          )
        })}
      </div>

      <button 
        className="dateScrollBtn right" 
        onClick={() => scroll('right')}
      >
        <ChevronRight size={20} />
      </button>
      
      <div 
        className="dateScrollerBlur left" 
        style={{ opacity: showLeftArrow ? 1 : 0, transition: 'opacity 0.2s' }}
      />
      <div className="dateScrollerBlur right" />
    </div>
  )
}

function BookingPage(props: { tenant?: TenantPublic; tenantSlug?: string; basePath?: string } = {}) {
  const { tenantSlug } = useParams()
  const nav = useNavigate()
  const slug = (props.tenantSlug ?? tenantSlug ?? '').trim().toLowerCase()
  const basePath = props.basePath ?? (slug ? `/${slug}` : '')

  useEffect(() => {
    setAppMode('tenant')
  }, [])

  const [me, setMe] = useState<SessionUser | null>(null)
  const [tenant, setTenant] = useState<TenantPublic | null>(null)
  const [services, setServices] = useState<Array<{ id: string; name: string; durationMinutes: number; priceCents: number; coverUrl?: string | null }>>([])
  const [booking, setBooking] = useState<{
    timezone: string
    currency: string
    bookingRules: { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number }
    businessHours: Array<{ weekday: number; startMinute: number; endMinute: number }>
  } | null>(null)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [step, setStep] = useState(1)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Auth State for inline login
  const [authName, setAuthName] = useState('')
  const [authPhone, setAuthPhone] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [blocks, setBlocks] = useState<Array<{ startsAt: string; endsAt: string; kind: 'appointment' | 'time_off' }>>([])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setLoadError(null)
    const tenantPromise = props.tenant
      ? Promise.resolve({ ok: true as const, data: { tenant: props.tenant } })
      : api<{ tenant: TenantPublic }>(slug ? `/api/public/tenant/${encodeURIComponent(slug)}` : '/api/public/tenant')

    const servicesPromise = api<{ services: typeof services }>(
      slug ? `/api/public/tenant/${encodeURIComponent(slug)}/services` : '/api/public/services',
    )
    const bookingPromise = api<typeof booking>(
      slug ? `/api/public/tenant/${encodeURIComponent(slug)}/booking` : '/api/public/booking',
    )

    Promise.all([tenantPromise, servicesPromise, bookingPromise, api<{ user: SessionUser | null }>('/api/auth/me')])
      .then(([tenantRes, servicesRes, bookingRes, meRes]) => {
        if (!mounted) return
        if (!tenantRes.ok) {
          setLoadError(tenantRes.error.message)
          return
        }
        setTenant(tenantRes.data.tenant)
        applyTenantTheme(tenantRes.data.tenant)
        if (servicesRes.ok) setServices(servicesRes.data.services)
        if (bookingRes.ok) setBooking(bookingRes.data)
        if (meRes.ok) setMe(meRes.data.user)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [slug, props.tenant])

  const utcForLocalTime = (input: {
    timeZone: string
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second?: number
  }) => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: input.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })

    const targetUtc = Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      input.second ?? 0,
    )

    let utc = new Date(targetUtc)
    for (let i = 0; i < 4; i++) {
      const parts = fmt.formatToParts(utc)
      const get = (type: string) => parts.find((p) => p.type === type)?.value
      const y = Number(get('year'))
      const m = Number(get('month'))
      const d = Number(get('day'))
      const hh = Number(get('hour'))
      const mm = Number(get('minute'))
      const ss = Number(get('second'))
      if (![y, m, d, hh, mm, ss].every(Number.isFinite)) return utc

      const seenUtc = Date.UTC(y, m - 1, d, hh, mm, ss)
      const diff = targetUtc - seenUtc
      if (diff === 0) break
      utc = new Date(utc.getTime() + diff)
    }

    return utc
  }

  const parseYmd = (ymd: string) => {
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(ymd)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    if (![year, month, day].every(Number.isFinite)) return null
    return { year, month, day }
  }

  const weekdayIndexForDate = (ymd: string, timeZone: string) => {
    const p = parseYmd(ymd)
    if (!p) return null
    const dt = utcForLocalTime({ timeZone, year: p.year, month: p.month, day: p.day, hour: 12, minute: 0, second: 0 })
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    const token = fmt.format(dt)
    const idx = weekdayMap[token]
    return typeof idx === 'number' ? idx : null
  }

  const utcForYmdTime = (ymd: string, time: string, timeZone: string) => {
    const p = parseYmd(ymd)
    if (!p) return null
    const m = /^([0-9]{2}):([0-9]{2})$/.exec(time)
    if (!m) return null
    const hour = Number(m[1])
    const minute = Number(m[2])
    if (![hour, minute].every(Number.isFinite)) return null
    return utcForLocalTime({ timeZone, year: p.year, month: p.month, day: p.day, hour, minute, second: 0 })
  }

  useEffect(() => {
    if (!selectedDate) {
      setBlocks([])
      return
    }
    let mounted = true
    const url = slug
      ? `/api/public/tenant/${encodeURIComponent(slug)}/availability?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`
      : `/api/public/availability?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`

    api<{ blocks: Array<{ startsAt: string; endsAt: string; kind: 'appointment' | 'time_off' }> }>(url).then((res) => {
      if (!mounted) return
      if (!res.ok) {
        setBlocks([])
        return
      }
      console.log('Availability blocks:', res.data.blocks)
      setBlocks(res.data.blocks)
    })
    return () => {
      mounted = false
    }
  }, [slug, selectedDate])

  const selectedService = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) ?? null
  }, [services, selectedServiceId])

  const dateLimits = useMemo(() => {
    const rules = booking?.bookingRules
    const now = new Date()
    const min = new Date(now)
    const max = new Date(now)
    max.setDate(max.getDate() + (rules?.maxFutureDays ?? 60))
    const toYmd = (d: Date) => {
      const y = String(d.getFullYear())
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    return { min: toYmd(min), max: toYmd(max) }
  }, [booking])

  const dateStatusFor = useMemo(() => {
    if (!booking) return () => ({ disabled: false, label: undefined as string | undefined })
    return (ymd: string) => {
      const day = weekdayIndexForDate(ymd, booking.timezone)
      if (day === null) return { disabled: true, label: 'Indisponível' }
      const ranges = booking.businessHours.filter((h) => h.weekday === day)
      if (ranges.length === 0) return { disabled: true, label: 'Fechado' }
      return { disabled: false, label: undefined }
    }
  }, [booking])

  const timeSlotsForSelectedDate = useMemo(() => {
    if (!booking || !selectedService || !selectedDate) return [] as Array<{ time: string; status: 'available' | 'blocked' | 'notice'; reason: string }>
    const timeZone = booking.timezone
    const day = weekdayIndexForDate(selectedDate, timeZone)
    if (day === null) return []
    const ranges = booking.businessHours.filter((h) => h.weekday === day)
    const stepMinutes = Math.max(30, booking.bookingRules.slotStepMinutes)
    const times: string[] = []
    for (const r of ranges) {
      const lastStart = r.endMinute - selectedService.durationMinutes
      for (let m = r.startMinute; m <= lastStart; m += stepMinutes) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0')
        const mm = String(m % 60).padStart(2, '0')
        times.push(`${hh}:${mm}`)
      }
    }

    const minNoticeMinutes = booking.bookingRules.minNoticeMinutes
    const now = new Date()
    const cutoff = new Date(now.getTime() + minNoticeMinutes * 60_000)

    const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => {
      return !(bEnd.getTime() <= aStart.getTime() || bStart.getTime() >= aEnd.getTime())
    }

    const parsedBlocks = blocks
      .map((b) => {
        const s = new Date(b.startsAt)
        const e = new Date(b.endsAt)
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
        return { s, e, kind: b.kind }
      })
      .filter(Boolean) as Array<{ s: Date; e: Date; kind: 'appointment' | 'time_off' }>

    // Dynamic Gap Filling: Add slots immediately after each block ends
    for (const b of parsedBlocks) {
      // Get end time of block in local minutes
      // We need to convert UTC block end to local minutes to check against business hours
      // This is tricky because we have UTC dates but need local minutes for validation
      // Let's use the formatter approach
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
      
      const parts = fmt.formatToParts(b.e)
      const h = Number(parts.find(p => p.type === 'hour')?.value)
      const m = Number(parts.find(p => p.type === 'minute')?.value)
      
      if (Number.isFinite(h) && Number.isFinite(m)) {
        const minutes = h * 60 + m
        // Check if this time is within any business range
        const validRange = ranges.find(r => 
          minutes >= r.startMinute && 
          minutes <= r.endMinute - selectedService.durationMinutes // Must fit service
        )
        
        if (validRange) {
          const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
          if (!times.includes(timeStr)) {
            times.push(timeStr)
          }
        }
      }
    }
    
    // Sort times
    times.sort()

    return times.map((t) => {
      const startUtc = utcForYmdTime(selectedDate, t, timeZone)
      if (!startUtc) return { time: t, status: 'blocked', reason: 'Indisponível' }
      if (startUtc.getTime() < cutoff.getTime()) return { time: t, status: 'notice', reason: 'Aviso mínimo' }
      const endUtc = new Date(startUtc.getTime() + selectedService.durationMinutes * 60_000)
      if (parsedBlocks.length === 0) return { time: t, status: 'available', reason: '' }
      
      // Check if this slot is directly occupied (start matches exactly or is inside a block)
      const occupied = parsedBlocks.find(b => startUtc.getTime() >= b.s.getTime() && startUtc.getTime() < b.e.getTime())
      if (occupied) {
        const reason = occupied.kind === 'time_off' ? 'Bloqueado' : 'Reservado'
        return { time: t, status: 'blocked', reason }
      }

      // Check if duration conflicts (slot is free, but service doesn't fit)
      const conflict = parsedBlocks.find((b) => overlaps(startUtc, endUtc, b.s, b.e))
      if (conflict) {
        // Slot is technically free, but duration causes overlap. Mark as blocked but without "Reserved" text.
        return { time: t, status: 'blocked', reason: 'duration_conflict' }
      }

      return { time: t, status: 'available', reason: '' }
    }).filter(s => s.status === 'available' || s.reason === 'Reservado' || s.reason === 'Bloqueado')
  }, [booking, selectedDate, selectedService, blocks])

  const availableSlots = useMemo(() => timeSlotsForSelectedDate.filter((t) => t.status === 'available'), [timeSlotsForSelectedDate])
  const hasDisabledSlots = useMemo(() => timeSlotsForSelectedDate.some((t) => t.status !== 'available'), [timeSlotsForSelectedDate])

  useEffect(() => {
    if (!selectedTime) return
    const ok = timeSlotsForSelectedDate.some((s) => s.time === selectedTime && s.status === 'available')
    if (!ok) setSelectedTime(null)
  }, [selectedTime, timeSlotsForSelectedDate])

  async function handleAuth() {
    setAuthLoading(true)
    setActionError(null)
    
    // Simple validation
    if (!authName || authName.length < 2) {
      setActionError('Nome muito curto')
      setAuthLoading(false)
      return
    }
    if (!authPhone || authPhone.replace(/\D/g, '').length < 8) {
      setActionError('Telefone inválido')
      setAuthLoading(false)
      return
    }

    const payload = { 
      name: authName, 
      phone: authPhone,
      tenantSlug: slug
    }

    const res = await api<{ user: SessionUser }>('/api/auth/client-fast-login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    setAuthLoading(false)
    if (!res.ok) {
      setActionError(res.error.message)
      return
    }
    setMe(res.data.user)
  }

  async function confirmBooking() {
    if (!selectedService || !selectedTime || !selectedDate) return
    setActionError(null)
    setSaving(true)
    const timeZone = booking?.timezone ?? 'America/Sao_Paulo'
    const startsAt = utcForYmdTime(selectedDate, selectedTime, timeZone)
    if (!startsAt) {
      setSaving(false)
      setActionError('Data inválida')
      return
    }
    const res = await api<{ appointment: { id: string } }>('/api/client/appointments', {
      method: 'POST',
      body: JSON.stringify({ serviceId: selectedService.id, startsAt: startsAt.toISOString() }),
    })
    setSaving(false)
    if (!res.ok) {
      setActionError(res.error.message)
      return
    }
    // Refresh client appointments cache or data if needed, but nav will remount
    nav(withBasePath(basePath, '/cliente'))
  }

  const money = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
  const selectedDateStatus = selectedDate ? dateStatusFor(selectedDate) : null

  if (loading) {
    return <div className="bookingRefLayout"><div className="bookingRefCard" style={{alignItems: 'center', justifyContent: 'center'}}>Carregando...</div></div>
  }

  if (loadError) {
    return <div className="bookingRefLayout"><div className="bookingRefCard" style={{alignItems: 'center', justifyContent: 'center'}}>{loadError}</div></div>
  }

  // Steps: 1=Service, 2=Date, 3=Time, 4=Confirm(Auth+Action)
  const totalSteps = 4

  const stepTitles = {
    1: 'Escolha o Serviço',
    2: 'Escolha a Data',
    3: 'Escolha o Horário',
    4: 'Confirmação'
  }

  return (
    <div className="bookingRefLayout">
      <div className="bookingRefCard">
        <div className="bookingRefLeft">
          <div className="bookingRefBrand">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} className="bookingRefLogo" alt="Logo" />
            ) : (
              <div className="bookingRefLogo">{tenant?.name.substring(0, 2).toUpperCase()}</div>
            )}
            <div style={{fontWeight: 700, fontSize: '1.1rem'}}>{tenant?.name}</div>
          </div>

          <div className="bookingRefSummary">
            <div className="bookingSummaryItem">
              <div className="bookingSummaryLabel">Serviço Selecionado</div>
              <div className="bookingSummaryValue">{selectedService ? selectedService.name : '...'}</div>
              {selectedService && <div style={{fontSize: '0.9rem', opacity: 0.8}}>{money(selectedService.priceCents)} • {selectedService.durationMinutes} min</div>}
            </div>

            {selectedDate && (
              <div className="bookingSummaryItem" style={{animationDelay: '0.1s'}}>
                <div className="bookingSummaryLabel">Data</div>
                <div className="bookingSummaryValue">{new Date(selectedDate).toLocaleDateString('pt-BR')}</div>
              </div>
            )}

            {selectedTime && (
              <div className="bookingSummaryItem" style={{animationDelay: '0.2s'}}>
                <div className="bookingSummaryLabel">Horário</div>
                <div className="bookingSummaryValue">{selectedTime}</div>
              </div>
            )}
          </div>
        </div>

        <div className="bookingRefRight">
          <div className="bookingRefHeader">
            <div className="bookingRefTitle">{stepTitles[step as keyof typeof stepTitles]}</div>
            <div className="bookingRefStepIndicator">Passo {step} de {totalSteps}</div>
          </div>

          <div className="bookingRefContent">
            {step === 1 && (
              <div className="bookingServicesGrid">
                {services.map((s) => (
                  <div
                    key={s.id}
                    className={`bookingServiceCard ${selectedServiceId === s.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedServiceId(s.id)
                      setStep(2)
                    }}
                  >
                    <div className="bookingServiceImgPlaceholder">
                      {s.coverUrl ? (
                        <img src={s.coverUrl} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Sparkles size={32} strokeWidth={1.5} />
                      )}
                    </div>
                    <div className="bookingServiceInfo">
                      <div className="bookingServiceName">{s.name}</div>
                      <div className="bookingServiceMeta">
                        <span className="bookingServicePrice">{money(s.priceCents)}</span>
                        <span>{s.durationMinutes} min</span>
                      </div>
                    </div>
                  </div>
                ))}
                {services.length === 0 && <div>Nenhum serviço disponível.</div>}
              </div>
            )}

            {step === 2 && (
              <div className="bookingCalendarWrapper">
                <DateScroller
                  value={selectedDate}
                  min={dateLimits.min}
                  max={dateLimits.max}
                  onChange={(val) => {
                    setSelectedDate(val)
                    setSelectedTime(null)
                    setStep(3)
                  }}
                  getDateStatus={dateStatusFor}
                />
                <div className="dateScrollerHint">
                  Selecione uma data para visualizar a disponibilidade
                </div>
                {selectedDateStatus?.disabled && (
                  <div className="bookingDateWarning">Esse dia está indisponível.</div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="bookingCalendarWrapper">
                 {timeSlotsForSelectedDate.length === 0 ? (
                  <div className="text-center text-muted">Sem horários disponíveis para este dia.</div>
                ) : (
                  <>
                    {availableSlots.length === 0 && (
                      <div className="bookingTimeAlert">Todos os horários desse dia estão indisponíveis.</div>
                    )}
                    {hasDisabledSlots && availableSlots.length > 0 && (
                      <div className="bookingTimeNotice">Alguns horários estão indisponíveis.</div>
                    )}
                    <div className="bookingTimeGrid">
                      {timeSlotsForSelectedDate.map((slot) => (
                        <button
                          key={slot.time}
                          className={`bookingTimeBtn ${selectedTime === slot.time ? 'selected' : ''} ${slot.status !== 'available' ? 'disabled' : ''} ${slot.status === 'notice' ? 'notice' : ''} ${slot.status === 'blocked' ? 'blocked' : ''}`}
                          onClick={() => {
                            if (slot.status !== 'available') return
                            setSelectedTime(slot.time)
                            setStep(4)
                          }}
                          disabled={slot.status !== 'available'}
                          style={slot.status === 'blocked' ? { opacity: 0.5, cursor: 'not-allowed', background: 'var(--gray-100)', color: 'var(--gray-400)', borderColor: 'transparent' } : {}}
                        >
                          <span>{slot.time}</span>
                          {slot.status !== 'available' && (
                            <span className="bookingTimeReason"></span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="bookingAuthForm">
                {!me ? (
                  <>
                    <div style={{textAlign: 'center', marginBottom: 20}}>
                      <h3 style={{fontSize: '1.25rem', marginBottom: 8}}>Seus Dados</h3>
                      <p style={{color: 'var(--text-muted)'}}>
                        Informe seu nome e WhatsApp para confirmar.
                      </p>
                    </div>

                    <input className="authRefInput" placeholder="Seu nome" value={authName} onChange={e => setAuthName(e.target.value)} />
                    <input className="authRefInput" placeholder="WhatsApp (DDD + Número)" value={authPhone} onChange={e => setAuthPhone(e.target.value)} inputMode="tel" />

                    {actionError && <div className="pill" style={{color: 'var(--danger)', justifyContent: 'center'}}>{actionError}</div>}

                    <button className="btn btnPrimary w-full" style={{padding: 14}} onClick={handleAuth} disabled={authLoading}>
                      {authLoading ? 'Verificando...' : 'Confirmar e Agendar'}
                    </button>
                  </>
                ) : (
                  <>
                     <div style={{textAlign: 'center', marginBottom: 20}}>
                      <div style={{width: 64, height: 64, background: 'var(--primary-50)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--primary-600)'}}>
                         <ShieldCheck size={32} />
                      </div>
                      <h3 style={{fontSize: '1.25rem', marginBottom: 8}}>Confirmar Agendamento</h3>
                      <p style={{color: 'var(--text-muted)'}}>Logado como <strong>{me.name || me.email}</strong></p>
                    </div>
                    
                    {actionError && <div className="pill" style={{color: 'var(--danger)', justifyContent: 'center'}}>{actionError}</div>}
                    
                    <button className="btn btnPrimary w-full" style={{padding: 14, fontSize: '1.1rem'}} onClick={confirmBooking} disabled={saving}>
                      {saving ? 'Confirmando...' : 'Confirmar Agendamento'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bookingRefFooter">
            {step === 1 ? (
              <button className="btn btn-ghost" onClick={() => nav(withBasePath(basePath, '/'))}>Cancelar</button>
            ) : (
              <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Voltar</button>
            )}
            
            {step < 4 && (
              <button 
                className="btn btnPrimary" 
                disabled={
                  (step === 1 && !selectedServiceId) || 
                  (step === 2 && !selectedDate) ||
                  (step === 3 && !selectedTime)
                }
                onClick={() => setStep(step + 1)}
              >
                Continuar <ChevronRight size={16} style={{marginLeft: 6}} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


function ClientPortal(props: { tenant?: TenantPublic; tenantSlug?: string; basePath?: string } = {}) {
    const { tenantSlug } = useParams()
    const nav = useNavigate()
    const slug = (props.tenantSlug ?? tenantSlug ?? '').trim().toLowerCase()
    const basePath = props.basePath ?? (slug ? `/${slug}` : '')
    const [me, setMe] = useState<SessionUser | null>(null)
    const [authLoading, setAuthLoading] = useState(true)
    const [appointments, setAppointments] = useState<ClientAppointment[]>([])
    
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
            applyTenantTheme(res.data.tenant)
        })
    }, [slug, props.tenant])

    useEffect(() => {
        if (!me) return
        api<{appointments: ClientAppointment[]}>('/api/client/appointments').then(res => {
            if(res.ok) setAppointments(res.data.appointments)
        })
    }, [me])

    if (authLoading) {
        return (
            <Shell title="Minha Área" subtitle="Carregando..." sidebar={<div className="nav" />}>
                <div className="container text-center" style={{paddingTop: 50}}>Carregando...</div>
            </Shell>
        )
    }

    if (!me || me.role !== 'CLIENT') {
        return (
            <Shell title="Minha Área" subtitle="Acesso restrito" sidebar={<div className="nav" />}>
                <div className="card" style={{maxWidth: 400, margin: '50px auto'}}>
                    <div className="cardHeader">
                        <h2 className="cardTitle">Faça Login</h2>
                        <p className="cardDesc">Você precisa entrar para ver seus agendamentos.</p>
                    </div>
                    <div className="cardBody">
                        <button className="btn btnPrimary w-full" onClick={() => nav(withBasePath(basePath, '/login'))}>Entrar</button>
                        <button className="btn w-full" style={{marginTop: 10}} onClick={() => nav(withBasePath(basePath, '/'))}>Voltar</button>
                    </div>
                </div>
            </Shell>
        )
    }

    return (
        <Shell
            title="Minha Área"
            subtitle="Painel do Cliente"
            sidebar={
                <div className="nav-group">
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
            <div className="card">
                <div className="cardHeader"><h2 className="cardTitle">Meus Agendamentos</h2></div>
                
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
                                <tr><td colSpan={3} className="text-center text-muted" style={{padding: 40}}>Nenhum agendamento encontrado.</td></tr>
                            ) : (
                                appointments.map(a => {
                                    let statusLabel = a.status
                                    let statusClass = 'status-warning'
                                    if (a.status === 'CONFIRMED') { statusLabel = 'Confirmado'; statusClass = 'status-success' }
                                    else if (a.status === 'PENDING') { statusLabel = 'Pendente'; statusClass = 'status-pending' }
                                    else if (a.status === 'CANCELLED') { statusLabel = 'Cancelado'; statusClass = 'status-warning' }

                                    return (
                                        <tr key={a.id}>
                                            <td style={{fontWeight: 600, paddingLeft: 24}}>{a.serviceName}</td>
                                            <td>{new Date(a.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
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
                    {appointments.length === 0 ? <div className="text-center text-muted">Nenhum agendamento.</div> : null}
                    {appointments.map(a => {
                            let statusLabel = a.status
                            let statusClass = 'status-warning'
                            if (a.status === 'CONFIRMED') { statusLabel = 'Confirmado'; statusClass = 'status-success' }
                            else if (a.status === 'PENDING') { statusLabel = 'Pendente'; statusClass = 'status-pending' }
                            else if (a.status === 'CANCELLED') { statusLabel = 'Cancelado'; statusClass = 'status-warning' }

                            return (
                                <div className="mobile-appointment-card" key={a.id}>
                                    <div className="mobile-appointment-header">
                                        <div style={{fontWeight: 700, color: 'var(--gray-900)'}}>{a.serviceName}</div>
                                        <span className={`status-badge ${statusClass}`}>{statusLabel}</span>
                                    </div>
                                    <div className="mobile-appointment-row">
                                        <div style={{display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gray-600)'}}>
                                            <Clock size={14} />
                                            {new Date(a.startsAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                        </div>
                                    </div>
                                </div>
                            )
                    })}
                </div>
            </div>
        </Shell>
    )
}

function SlugToSubdomainRedirect() {
  const params = useParams()
  const loc = useLocation()
  const slug = String(params.tenantSlug ?? '').trim().toLowerCase()
  const rest = String((params as Record<string, unknown>)['*'] ?? '').trim()

  useEffect(() => {
    if (!slug) return
    const host = typeof window !== 'undefined' ? window.location.host : ''
    const rootHost = host.toLowerCase().startsWith('www.') ? host.slice(4) : host
    const path = rest ? `/${rest}` : '/'
    window.location.assign(`${window.location.protocol}//${slug}.${rootHost}${path}${loc.search}${loc.hash}`)
  }, [slug, rest, loc.search, loc.hash])

  return (
    <div className="container">
      <div className="text-center">Redirecionando...</div>
    </div>
  )
}

function RootEntry(props: {
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
    return <div className="container text-center" style={{ paddingTop: 100 }}>Carregando...</div>
  }

  if (!me) return props.loginElement

  if (props.renderWhenAuthenticated) {
    return <>{props.renderWhenAuthenticated(me)}</>
  }

  const next = me.role === 'CLIENT' ? '/cliente' : '/admin'
  return <Navigate to={next} replace />
}

function NewTransactionModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  // Custom select state
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const selectRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsSelectOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, '')
    if (!value) {
      setAmount('')
      return
    }
    const numberValue = Number(value) / 100
    setAmount(numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const parsedAmount = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100)
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        alert('Valor inválido')
        setLoading(false)
        return
      }

      const res = await api('/api/admin/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type,
          amountCents: parsedAmount,
          method,
          note,
          createdAt: new Date(date).toISOString()
        })
      })
      
      if (!res.ok) {
        throw new Error(res.error?.message || 'Erro ao salvar')
      }

      onSuccess()
      onClose()
      // Reset form
      setAmount('')
      setMethod('')
      setNote('')
      setDate(new Date().toISOString().slice(0, 10))
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar movimentação: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">Nova Movimentação</h3>
          <button className="icon-btn" onClick={onClose}><XCircle size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
            <div className="form-stack">
                <div className="row">
                    <div className="input-group">
                        <label className="label">Tipo</label>
                        <div className={`custom-select ${isSelectOpen ? 'open' : ''}`} ref={selectRef}>
                            <div className="custom-select-trigger" onClick={() => setIsSelectOpen(!isSelectOpen)}>
                                <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                    {type === 'INCOME' ? 'Receita (Entrada)' : 'Despesa (Saída)'}
                                </span>
                                <ChevronRight size={16} style={{transform: 'rotate(90deg)', color: 'var(--gray-400)'}} />
                            </div>
                            <div className="custom-select-menu">
                                <div 
                                    className={`custom-select-option ${type === 'INCOME' ? 'selected' : ''}`} 
                                    onClick={() => {
                                        setType('INCOME')
                                        setIsSelectOpen(false)
                                    }}
                                >
                                    Receita (Entrada)
                                </div>
                                <div 
                                    className={`custom-select-option ${type === 'EXPENSE' ? 'selected' : ''}`} 
                                    onClick={() => {
                                        setType('EXPENSE')
                                        setIsSelectOpen(false)
                                    }}
                                >
                                    Despesa (Saída)
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="input-group">
                        <label className="label">Data</label>
                        <input 
                            className="input" 
                            type="date" 
                            value={date} 
                            onChange={e => setDate(e.target.value)} 
                            required 
                            lang="pt-BR"
                        />
                    </div>
                </div>
                <div className="input-group">
                    <label className="label">Valor (R$)</label>
                    <input className="input" value={amount} onChange={handleAmountChange} placeholder="0,00" required />
                </div>
                <div className="input-group">
                    <label className="label">Categoria/Método</label>
                    <input className="input" value={method} onChange={e => setMethod(e.target.value)} placeholder="Ex: Pix, Aluguel, Produtos..." />
                </div>
                <div className="input-group">
                    <label className="label">Descrição</label>
                    <textarea className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Detalhes da movimentação..." rows={3} />
                </div>
            </div>
            <div className="modal-footer" style={{marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12}}>
                <button type="button" className="btn" onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btnPrimary" disabled={loading}>
                    {loading ? 'Salvando...' : 'Salvar'}
                </button>
            </div>
        </form>
      </div>
    </div>
  )
}

function ExtractModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [start, setStart] = useState(() => {
    const d = new Date()
    d.setDate(1) // 1st of current month
    return d.toISOString().slice(0, 10)
  })
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState('all')

  useEffect(() => {
      if (isOpen) load()
  }, [isOpen, start, end, type])

  async function load() {
      setLoading(true)
      try {
          const res = await api<{transactions: any[]}>(`/api/admin/finance/extract?start=${new Date(start).toISOString()}&end=${new Date(end + 'T23:59:59').toISOString()}&type=${type}`)
          if(res.ok) setTransactions(res.data.transactions)
      } catch (err) {
          console.error(err)
      } finally {
          setLoading(false)
      }
  }

  function handleExport() {
      if (transactions.length === 0) return
      
      const csvContent = [
          ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status'],
          ...transactions.map(t => [
              new Date(t.date).toLocaleString('pt-BR'),
              t.description || '-',
              t.category || '-',
              t.type === 'INCOME' ? 'Entrada' : 'Saída',
              (t.amountCents / 100).toFixed(2).replace('.', ','),
              t.status
          ])
      ].map(e => e.join(';')).join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `extrato_${start}_${end}.csv`
      link.click()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{maxWidth: 800}}>
        <div className="modal-header">
          <h3 className="modal-title">Extrato Financeiro</h3>
          <button className="icon-btn" onClick={onClose}><XCircle size={24} /></button>
        </div>
        <div className="modal-body">
            <div className="finance-filter-group" style={{marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end'}}>
                <div className="input-group" style={{marginBottom: 0}}>
                    <label className="label" style={{fontSize: '0.75rem'}}>Início</label>
                    <input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} style={{padding: '6px 10px'}} />
                </div>
                <div className="input-group" style={{marginBottom: 0}}>
                    <label className="label" style={{fontSize: '0.75rem'}}>Fim</label>
                    <input className="input" type="date" value={end} onChange={e => setEnd(e.target.value)} style={{padding: '6px 10px'}} />
                </div>
                <div className="input-group" style={{marginBottom: 0}}>
                    <label className="label" style={{fontSize: '0.75rem'}}>Tipo</label>
                    <select className="input" value={type} onChange={e => setType(e.target.value)} style={{padding: '6px 10px'}}>
                        <option value="all">Todos</option>
                        <option value="income">Entradas</option>
                        <option value="expense">Saídas</option>
                    </select>
                </div>
                <button className="btn" onClick={handleExport} disabled={transactions.length === 0} style={{marginLeft: 'auto', gap: 8}}>
                    <Download size={16} /> Exportar CSV
                </button>
            </div>

            <div className="table-scroll" style={{maxHeight: 400, border: '1px solid var(--border)', borderRadius: 8}}>
                <table className="data-table">
                    <thead style={{position: 'sticky', top: 0, zIndex: 1}}>
                        <tr>
                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Categoria</th>
                            <th style={{textAlign: 'right'}}>Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} style={{textAlign: 'center', padding: 20}}>Carregando...</td></tr>
                        ) : transactions.length === 0 ? (
                            <tr><td colSpan={4} style={{textAlign: 'center', padding: 20, color: 'var(--text-muted)'}}>Nenhum registro encontrado</td></tr>
                        ) : transactions.map(t => (
                            <tr key={t.id}>
                                <td style={{fontSize: '0.85rem'}}>{new Date(t.date).toLocaleDateString('pt-BR')} <span style={{color: 'var(--text-muted)'}}>{new Date(t.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span></td>
                                <td style={{fontWeight: 500}}>{t.description || 'Sem descrição'}</td>
                                <td><span className="pill">{t.category}</span></td>
                                <td style={{textAlign: 'right', fontWeight: 600, color: t.type === 'INCOME' ? 'var(--success)' : 'var(--danger)'}}>
                                    {t.type === 'INCOME' ? '+' : '-'}{formatBRL(t.amountCents / 100)}
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

function GoalsModal({ isOpen, onClose, onSuccess, initialRevenue, initialNewClients }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; initialRevenue: number; initialNewClients: number }) {
    const [loading, setLoading] = useState(false)
    const [revenue, setRevenue] = useState(String(initialRevenue / 100))
    const [newClients, setNewClients] = useState(String(initialNewClients))

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        try {
            await api('/api/admin/finance/goals', {
                method: 'PATCH',
                body: JSON.stringify({
                    revenueGoalCents: Math.round(Number(revenue.replace(',', '.')) * 100),
                    newClientsGoal: Number(newClients)
                })
            })
            onSuccess()
            onClose()
        } catch (err) {
            console.error(err)
            alert('Erro ao salvar metas')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{maxWidth: 400}}>
                <div className="modal-header">
                    <h3 className="modal-title">Definir Metas do Mês</h3>
                    <button className="icon-btn" onClick={onClose}><XCircle size={24} /></button>
                </div>
                <form onSubmit={handleSubmit} className="modal-body">
                    <div className="form-stack">
                        <div className="input-group">
                            <label className="label">Meta de Faturamento (R$)</label>
                            <input className="input" value={revenue} onChange={e => setRevenue(e.target.value)} required />
                        </div>
                        <div className="input-group">
                            <label className="label">Meta de Novos Clientes</label>
                            <input className="input" type="number" value={newClients} onChange={e => setNewClients(e.target.value)} required />
                        </div>
                    </div>
                    <div className="modal-footer" style={{marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12}}>
                        <button type="button" className="btn" onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btnPrimary" disabled={loading}>
                            {loading ? 'Salvar' : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default function App() {
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
  const isDevHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('dev.') ||
    host.endsWith('.dev') ||
    host.includes('.dev.')
  const [hostTenant, setHostTenant] = useState<TenantPublic | null | undefined>(() => (isDevHost ? null : undefined))

  useEffect(() => {
    if (isDevHost) return
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
  }, [isDevHost])

  if (isDevHost) {
    return (
      <Routes>
        <Route path="/" element={<RootEntry loginElement={<UnifiedLogin isDevHost />} renderWhenAuthenticated={() => <Dev />} />} />
        <Route path="/dev" element={<Dev />} />
        <Route path="/login" element={<UnifiedLogin isDevHost />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  if (hostTenant === undefined) {
    return <div className="container text-center" style={{paddingTop: 100}}>Carregando...</div>
  }

  if (hostTenant === null) {
      const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
      const isSubdomain = host.split('.').length > (host.includes('localhost') ? 1 : 2) 
          && !host.startsWith('www.') 
          && !host.startsWith('dev.')
      
      if (isSubdomain) {
          return (
              <div className="container text-center" style={{paddingTop: 100}}>
                  <h1>Espaço não encontrado</h1>
                  <p>O endereço <strong>{host}</strong> não está cadastrado.</p>
                  <button className="btn btnPrimary" onClick={() => {
                      const rootHost = host.split('.').slice(1).join('.')
                      window.location.assign(`${window.location.protocol}//${rootHost}/`)
                  }}>Voltar para início</button>
              </div>
          )
      }
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<RootEntry hostTenant={hostTenant} loginElement={<UnifiedLogin hostTenant={hostTenant} />} />}
      />
      <Route path="/login" element={<UnifiedLogin hostTenant={hostTenant} />} />

      {hostTenant ? (
        <>
          <Route path="/agendar" element={<BookingPage tenant={hostTenant} tenantSlug={hostTenant.slug} basePath="" />} />
          <Route path="/admin" element={<Admin tenant={hostTenant} tenantSlug={hostTenant.slug} basePath="" />} />
          <Route path="/cliente" element={<ClientPortal tenant={hostTenant} tenantSlug={hostTenant.slug} basePath="" />} />
          <Route path="/cliente/entrar" element={<Navigate to="/" replace />} />
          <Route path="/cliente/cadastro" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <Route path="/:tenantSlug/*" element={<SlugToSubdomainRedirect />} />
      )}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
