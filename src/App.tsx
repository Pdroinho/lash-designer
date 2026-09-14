import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { api } from './api'
import type { SessionUser, TenantDev, TenantPublic, AppointmentConfirmationStatus } from './types'
import { applyTenantTheme, getDevTheme, initDevTheme, setAppMode, toggleDevTheme, type DevThemeMode, getDevPrimaryColor, setDevPrimaryColor } from './theme'
import { ColorPicker } from './components/ColorPicker'
import { ProductTour, shouldAutoStartTour, type ProductTourStep } from './components/ProductTour'
import { CustomDomainsSettings } from './components/CustomDomainsSettings'
import { BillingCenter } from './components/BillingCenter'
import { BusinessAssistant } from './components/BusinessAssistant'
import { ReferralCenter } from './components/ReferralCenter'
import { DevReferrals } from './components/DevReferrals'
import { LumaChatLauncher } from './components/LumaChatLauncher'
import { WorkspaceSetup } from './components/WorkspaceSetup'
import { WhatsAppCenter } from './components/WhatsAppCenter'
import { ProductSelect } from './components/ProductSelect'
import { AdminCalendar } from './features/calendar/AdminCalendar'
import { AdminServices } from './features/services/AdminServices'
import { AdminClients } from './features/clients/AdminClients'
import { appointmentPresenceMeta } from './features/calendar/appointmentPresence'
import { PasswordChecklist } from './components/PasswordChecklist'
import { FinanceFlowChart } from './components/FinanceFlowChart'
import { optimizeImageFile } from './imageProcessing'
import { formatBrazilPhoneInput, normalizeBrazilPhone } from './phone'
import { confirmAction, notify } from './components/FeedbackCenter'
import { ModalRoot } from './components/ModalRoot'
import { LandingPage, WorkspaceAccessPage } from './LandingPage'
import { LegalPage } from './LegalPage'
import {
  addDaysToYmd,
  formatDateInZone,
  formatDateTimeInZone,
  formatTimeInZone,
  formatYmdPtBr,
  minutesInTimeZone,
  weekdayIndexForYmd,
  ymdInTimeZone,
  zonedDateTimeToUtc,
} from './dateTime'
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
  X,
  XCircle,
  MoreHorizontal,
  Edit2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Image as ImageIcon,
  Check,
  Trash2,
  ShieldCheck,
  Eye,
  EyeOff,
  Smartphone,
  Copy,
  Moon,
  Sun,
  Palette,
  Globe,
  Webhook,
  BellRing,
  CreditCard,
  MessageSquare,
  Lock,
  Database,
  Compass,
  HeartHandshake,
  SidebarSimple,
  Download,
  BarChart3,
} from './components/Icons'

async function fileToOptimizedDataUrl(file: File) {
  return optimizeImageFile(file, { maxBytes: 255_000, maxDimension: 768, quality: .84 })
}

function configuredPlatformBaseUrl() {
  const raw = String(import.meta.env.VITE_APP_BASE_URL ?? '').trim()
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

function configuredPlatformHostname() {
  return configuredPlatformBaseUrl()?.hostname ?? 'seu-dominio.com.br'
}

async function copyTextToClipboard(value: string) {
  if (!value) return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = value
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const copied = document.execCommand('copy')
      area.remove()
      return copied
    } catch {
      return false
    }
  }
}

function configuredExternalLink(raw: unknown) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

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

    const toggle = (e: ReactMouseEvent) => {
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

    useEffect(() => {
        if (!isOpen) return
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                setIsOpen(false)
            }
        }
        document.addEventListener('keydown', closeOnEscape)
        return () => document.removeEventListener('keydown', closeOnEscape)
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
                    role="menu"
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

const bundledServiceCovers = {
  classico: '/services/service-classico.webp',
  hibrido: '/services/service-hibrido.webp',
  brasileiro: '/services/service-volume-brasileiro.webp',
  mega: '/services/service-mega-volume.webp',
  lifting: '/services/service-lash-lifting.webp',
  manutencao: '/services/service-manutencao.webp',
} as const

function bundledServiceCover(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('mega')) return bundledServiceCovers.mega
  if (normalized.includes('lifting') || normalized.includes('lift')) return bundledServiceCovers.lifting
  if (normalized.includes('manut') || normalized.includes('retorno')) return bundledServiceCovers.manutencao
  if (normalized.includes('brasileir')) return bundledServiceCovers.brasileiro
  if (normalized.includes('hibrid')) return bundledServiceCovers.hibrido
  return bundledServiceCovers.classico
}

function EmptyState(props: { image: string; title: string; description?: string; compact?: boolean }) {
  return (
    <div className={`empty-state ${props.compact ? 'compact' : ''}`}>
      <img decoding="async" src={props.image} alt="" aria-hidden="true" loading="lazy" />
      <strong>{props.title}</strong>
      {props.description ? <span>{props.description}</span> : null}
    </div>
  )
}

type CssVarStyle = CSSProperties & { ['--auth-accent']?: string }

type AdminStats = {
  timeZone?: string
  publicBaseUrl?: string | null
  today?: { appointmentsCount?: number; expectedRevenueCents?: number }
  newClients30d?: number
  pendingAppointments?: number
  confirmationSummary?: { confirmed: number; awaiting: number; noResponse: number; deliveryFailed: number; declined: number; notRequested: number }
  confirmationAttention?: Array<{
    id: string
    startsAt: string
    status: string
    confirmationStatus: AppointmentConfirmationStatus
    confirmationSentAt?: string | null
    serviceName: string
    clientName: string | null
    clientPhone: string | null
  }>
  upcoming?: Array<{
    id: string
    startsAt: string
    status: string
    confirmationStatus?: AppointmentConfirmationStatus
    confirmationSentAt?: string | null
    confirmationRespondedAt?: string | null
    serviceName: string
    priceCents: number
    clientEmail: string
    clientName: string | null
    clientPhone?: string | null
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

type FinanceMonthSnapshot = {
  ym: string
  serviceEntriesCents: number
  manualIncomeCents: number
  entriesCents: number
  expensesCents: number
  balanceCents: number
  confirmedAppointments: number
}

type AdminFinanceData = {
  timeZone: string
  todayYmd: string
  currentMonthYm: string
  currentMonth: FinanceMonthSnapshot
  previousMonth: FinanceMonthSnapshot
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
  expenseCategories: Array<{ label: string; amountCents: number; transactions: number }>
  lastCashTransactions: Array<{ id: string; type: 'INCOME' | 'EXPENSE'; amountCents: number; method: string; note: string | null; createdAt: string }>
  lastEntries: Array<{ id: string; startsAt: string; status: string; serviceName: string; priceCents: number; clientEmail: string; clientName: string | null }>
  monthly: FinanceMonthSnapshot[]
}

const FINANCE_MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const financeMonthLabel = (ym: string) => {
  const month = Number(ym.split('-')[1])
  return Number.isInteger(month) && month >= 1 && month <= 12 ? FINANCE_MONTH_LABELS[month - 1] : ym
}

function formatBRL(n: number) {
  return 'R$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type ClientAppointment = {
  id: string
  serviceName: string
  startsAt: string
  status: string
  confirmationStatus?: AppointmentConfirmationStatus
  confirmationSentAt?: string | null
  confirmationRespondedAt?: string | null
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
  const icon = isValidElement(props.icon)
    ? cloneElement(props.icon as ReactElement<{ weight?: 'regular' | 'duotone' }>, { weight: props.active ? 'duotone' : 'regular' })
    : props.icon

  return (
    <button
      type="button"
      className={`ld-nav-item ${props.active ? 'is-active' : ''}`}
      onClick={props.onClick}
      aria-current={props.active ? 'page' : undefined}
      aria-label={props.label}
      title={props.label}
      data-label={props.label}
    >
      <span className="ld-nav-icon" aria-hidden="true">{icon}</span>
      <span className="ld-nav-text">{props.label}</span>
    </button>
  )
}

function NotificationsModal({ isOpen, onClose, role }: { isOpen: boolean; onClose: () => void; role?: SessionUser['role'] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<Array<{id: string; title: string; desc: string; time: string; type: string}>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)

    const load = async () => {
      if (role === 'DEV') {
        const res = await api<{notifications: Array<{id: string; title: string; desc: string; time: string; type: string}>}>('/api/dev/notifications')
        if (res.ok) setNotifications(res.data.notifications)
        return
      }
      if (role === 'ADMIN') {
        const res = await api<AdminStats>('/api/admin/dashboard')
        if (res.ok) {
          const items = (res.data.upcoming ?? []).slice(0, 5).map((item) => {
            const presence = appointmentPresenceMeta(item.status, item.confirmationStatus)
            return {
              id: item.id,
              title: item.status === 'CANCELLED' ? 'Agendamento cancelado' : presence.label,
              desc: `${item.clientName ?? item.clientEmail} • ${item.serviceName}`,
              time: item.startsAt,
              type: item.status === 'CANCELLED' || ['DECLINED','NO_RESPONSE','DELIVERY_FAILED'].includes(item.confirmationStatus ?? '') ? 'fail' : ['CONFIRMED','MANUALLY_CONFIRMED'].includes(item.confirmationStatus ?? '') ? 'approved' : 'message',
            }
          })
          setNotifications(items)
        }
        return
      }
      if (role === 'CLIENT') {
        const res = await api<{ appointments: ClientAppointment[] }>('/api/client/appointments')
        if (res.ok) {
          setNotifications(res.data.appointments.slice(0, 5).map((item) => {
            const presence = appointmentPresenceMeta(item.status, item.confirmationStatus)
            return {
              id: item.id,
              title: item.status === 'CANCELLED' ? 'Agendamento cancelado' : presence.label,
              desc: item.serviceName,
              time: item.startsAt,
              type: item.status === 'CANCELLED' || item.confirmationStatus === 'DECLINED' ? 'fail' : ['CONFIRMED','MANUALLY_CONFIRMED'].includes(item.confirmationStatus ?? '') ? 'approved' : 'message',
            }
          }))
        }
      }
    }

    void load().finally(() => setLoading(false))
  }, [isOpen, role])

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

  const getTone = (type: string) => {
      const t = type.toLowerCase()
      if (t.includes('payment') || t.includes('approved')) return 'success'
      if (t.includes('message')) return 'message'
      if (t.includes('fail') || t.includes('refused')) return 'error'
      return 'neutral'
  }

  const relativeTime = (iso: string) => {
      try {
          const date = new Date(iso)
          if (isNaN(date.getTime())) return iso
          const diff = Date.now() - date.getTime()
          if (diff < 0) {
            return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          }
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
    <div
      ref={ref}
      className="notifications-popover"
      role="dialog"
      aria-label="Notificações"
    >
        <div style={{padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <h3 style={{fontSize: '0.95rem', fontWeight: 600, margin: 0}}>Notificações</h3>
            <button type="button" className="btn btn-ghost" style={{fontSize: '0.75rem', height: 24, padding: '0 8px'}} onClick={() => setNotifications([])} disabled={notifications.length === 0}>Marcar todas como lidas</button>
        </div>
        <div style={{maxHeight: 400, overflowY: 'auto'}}>
            {loading ? (
                <div style={{padding: 16}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                        <div className="skeleton skeleton-card" style={{height: 48, borderRadius: 12}} />
                        <div className="skeleton skeleton-card" style={{height: 48, borderRadius: 12}} />
                        <div className="skeleton skeleton-card" style={{height: 48, borderRadius: 12}} />
                    </div>
                </div>
            ) : notifications.length === 0 ? (
                <div style={{padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem'}}>Nenhuma notificação recente.</div>
            ) : (
                notifications.map(n => {
                    const tone = getTone(n.type)
                    return (
                        <div key={n.id} className="notification-item">
                            <div className={`notification-mark ${tone}`} aria-hidden="true">
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
  tourKey?: string
  tourSteps?: ProductTourStep[]
  tourEnabled?: boolean
  autoStartTour?: boolean
  brand?: Pick<TenantPublic, 'name' | 'logoUrl'> | null
  mobileNav?: Array<{ key: string; label: string; icon: ReactNode; active: boolean; onClick: () => void }>
  mobileMoreActive?: boolean
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const mobileToggleRef = useRef<HTMLButtonElement>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('lashdesigner:sidebar-collapsed') === 'true'
  })

  const tourEnabled = props.tourEnabled !== false && Boolean(props.tourKey && props.tourSteps?.length)

  const openTour = () => {
    const blockingOverlay = document.querySelector('.ld-overlay, .modal-overlay, .confirm-layer, [data-blocking-overlay="true"], dialog[open]')
    if (blockingOverlay) return
    setShowNotifications(false)
    setMobileOpen(false)
    setShowTour(true)
  }

  useEffect(() => {
    setShowTour(false)
    if (!tourEnabled || !props.autoStartTour || !props.tourKey || !shouldAutoStartTour(props.tourKey)) return
    const timer = window.setTimeout(() => {
      const blockingOverlay = document.querySelector('.ld-overlay, .modal-overlay, .confirm-layer, [data-blocking-overlay="true"], dialog[open], [role="dialog"][aria-modal="true"]:not(.ld-tour-card)')
      if (!blockingOverlay) setShowTour(true)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [props.autoStartTour, props.tourKey, tourEnabled])

  useEffect(() => {
    if (showNotifications || mobileOpen) setShowTour(false)
  }, [mobileOpen, showNotifications])

  useEffect(() => {
    if (!mobileOpen) return
    const sidebar = sidebarRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : mobileToggleRef.current
    const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusFirst = () => sidebar?.querySelector<HTMLElement>(focusableSelector)?.focus({ preventScroll: true })
    const frame = window.requestAnimationFrame(focusFirst)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileOpen(false)
        return
      }
      if (event.key !== 'Tab' || !sidebar) return
      const focusable = [...sidebar.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => element.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.body.classList.add('nav-open')
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.classList.remove('nav-open')
      window.removeEventListener('keydown', onKeyDown, true)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [mobileOpen])

  useEffect(() => {
    window.localStorage.setItem('lashdesigner:sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  return (
    <div className={`ld-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${props.mobileNav?.length ? 'has-mobile-tabbar' : ''}`}>
      <aside ref={sidebarRef} className={`ld-sidebar ${mobileOpen ? 'is-open' : ''}`} data-tour="sidebar" aria-label="Navegação principal" onClick={(event) => { if ((event.target as HTMLElement).closest('.ld-nav-item')) setMobileOpen(false) }}>
        <div className="ld-sidebar-brand" data-tour="brand">
          <img
            decoding="async"
            className={`logo-icon ${props.brand?.logoUrl ? 'is-tenant-logo' : ''}`}
            src={props.brand?.logoUrl || '/brand/logo-symbol.png'}
            alt=""
            aria-hidden="true"
          />
          <span className="ld-sidebar-brand-name">{props.brand?.name || 'Lash Designer'}</span>
          <button type="button" className="ld-sidebar-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu lateral">
            <X size={18} />
          </button>
          <button
            type="button"
            className="ld-sidebar-collapse"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <SidebarSimple size={18} weight="regular" />
          </button>
        </div>

        <div className="ld-sidebar-nav">
          {props.sidebar}
        </div>

        <div className="ld-sidebar-account">
          <div className="user-avatar-mini">
            {props.user?.email?.[0].toUpperCase() ?? 'U'}
          </div>
          <div className="ld-sidebar-account-copy">
            <div style={{fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
              {props.user?.email ?? 'Usuário'}
            </div>
            <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>
              {props.user?.role === 'ADMIN' ? 'Administradora' : props.user?.role === 'DEV' ? 'Developer' : 'Cliente'}
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          className="ld-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu lateral"
        />
      )}

      <main className="ld-main">
        <header className="ld-topbar" data-tour="header">
          <div className="ld-topbar-left">
            <button
              type="button"
              ref={mobileToggleRef}
              className="icon-btn ld-mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu lateral"
              aria-expanded={mobileOpen}
            >
              <Menu size={20} />
            </button>
            {props.mobileNav?.length ? (
              <img
                className={`ld-mobile-topbar-brand ${props.brand?.logoUrl ? 'is-tenant-logo' : ''}`}
                src={props.brand?.logoUrl || '/brand/logo-symbol.png'}
                alt=""
                aria-hidden="true"
              />
            ) : null}
            <div className="ld-page-heading">
              <div className="ld-breadcrumb" aria-hidden="true">
                <span className="ld-breadcrumb-root">Lash Designer</span>
                <ChevronRight size={12} className="ld-breadcrumb-separator"/>
                <span className="ld-breadcrumb-current">{props.title}</span>
              </div>
              <h1 className="ld-page-title">{props.title}</h1>
              <p className="ld-page-subtitle">{props.subtitle}</p>
            </div>
          </div>

          <div className="ld-topbar-actions">
            {props.actions}

            {tourEnabled ? (
              <button type="button"
                className="icon-btn tour-launcher"
                style={{border: 'none', background: 'transparent'}}
                onClick={openTour}
                title="Abrir tour guiado"
                aria-label="Abrir tour guiado"
              >
                <Compass size={20} weight="regular" />
              </button>
            ) : null}

            {props.onSearch ? (
              <div className="search-trigger" data-tour="search">
                <Search size={14} />
                <form onSubmit={(event) => event.preventDefault()} autoComplete="off" style={{flex: 1, display: 'flex'}}>
                  <input
                    className="search-input"
                    placeholder="Buscar..."
                    value={props.searchValue ?? ''}
                    onChange={(event) => props.onSearch?.(event.target.value)}
                    autoComplete="off"
                    name="search_query"
                    type="search"
                    style={{
                      border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem',
                      width: '100%', color: 'var(--text-main)', padding: 0,
                    }}
                  />
                </form>
              </div>
            ) : null}

            <button type="button" className="icon-btn" data-tour="notifications" style={{position: 'relative', border: 'none', background: 'transparent'}} onClick={() => setShowNotifications(!showNotifications)} aria-label="Abrir notificações" aria-expanded={showNotifications}>
              <Bell size={20} />
            </button>

            <NotificationsModal isOpen={showNotifications} onClose={() => setShowNotifications(false)} role={props.user?.role} />

            <div className="ld-topbar-divider" aria-hidden="true" />

            <div className="user-avatar-mini ld-topbar-avatar">
                {props.user?.email?.[0].toUpperCase() ?? 'U'}
            </div>
          </div>
        </header>

        <div id="main-content" className="ld-page" tabIndex={-1}>
          <div className="ld-page-inner" data-tour="content">{props.children}</div>
        </div>
      </main>

      {props.mobileNav?.length ? (
        <nav className="ld-mobile-tabbar" aria-label="Navegação principal mobile">
          {props.mobileNav.slice(0, 4).map((item) => (
            <button
              key={item.key}
              type="button"
              className={`ld-mobile-tabbar-item ${item.active ? 'is-active' : ''}`}
              onClick={() => { setShowNotifications(false); setMobileOpen(false); item.onClick() }}
              aria-current={item.active ? 'page' : undefined}
            >
              <span className="ld-mobile-tabbar-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            className={`ld-mobile-tabbar-item ${props.mobileMoreActive ? 'is-active' : ''}`}
            onClick={() => { setShowNotifications(false); setMobileOpen(true) }}
            aria-label="Abrir mais áreas"
            aria-expanded={mobileOpen}
          >
            <span className="ld-mobile-tabbar-icon" aria-hidden="true"><MoreHorizontal size={21} /></span>
            <span>Mais</span>
          </button>
        </nav>
      ) : null}

      {tourEnabled ? (
        <ProductTour
          open={showTour}
          tourKey={props.tourKey ?? 'disabled-tour'}
          steps={props.tourSteps ?? []}
          enabled={tourEnabled}
          onClose={() => setShowTour(false)}
        />
      ) : null}
    </div>
  )
}

const shellTourSteps = (area: 'admin' | 'dev' | 'client', screen: string): ProductTourStep[] => {
  const audience = area === 'dev' ? 'plataforma' : area === 'client' ? 'sua área' : 'seu negócio'
  const screenLabels: Record<string, string> = {
    dashboard: 'visão geral',
    calendar: 'agenda',
    clients: 'clientes',
    services: 'serviços',
    finance: 'financeiro',
    evolution: 'WhatsApp',
    settings: 'configurações',
    tenants: 'espaços',
    integrations: 'integrações',
    backups: 'backups',
    appointments: 'agendamentos',
  }
  const screenDescriptions: Record<string, string> = {
    dashboard: 'Acompanhe agenda, faturamento previsto, clientes e atividades recentes sem precisar montar relatórios manualmente.',
    calendar: 'Crie, confirme, reagende e acompanhe os atendimentos em uma visão organizada por data.',
    clients: 'Consulte o histórico das clientes e identifique relacionamento, retorno e valor gerado.',
    services: 'Mantenha catálogo, duração, preço, imagem e disponibilidade dos serviços sempre atualizados.',
    finance: 'Acompanhe entradas, despesas, metas e evolução mensal do espaço.',
    evolution: 'Configure automações e mensagens do WhatsApp com atenção às credenciais e ao consentimento das clientes.',
    settings: 'Personalize a marca, gerencie assinatura, segurança e os domínios conectados ao espaço.',
    tenants: 'Gerencie os espaços cadastrados, assinaturas e acessos da plataforma em um só lugar.',
    integrations: 'Revise integrações externas, credenciais e estado operacional dos provedores.',
    backups: 'Exporte e restaure cópias de segurança com um fluxo administrativo controlado.',
    appointments: 'Veja seus próximos atendimentos e o status de cada solicitação.',
  }

  const steps: ProductTourStep[] = [
    {
      selector: '[data-tour="brand"]',
      eyebrow: 'Bem-vinda',
      title: `Seu centro de controle de ${audience}`,
      description: 'A interface foi organizada para deixar as ações mais importantes acessíveis e reduzir o tempo gasto com tarefas repetitivas.',
    },
    {
      selector: '[data-tour="sidebar"]',
      title: 'Navegação por contexto',
      description: 'Use o menu lateral para alternar entre as áreas. No celular, as áreas principais ficam na barra inferior e o restante em Mais.',
    },
    {
      selector: '[data-tour="content"]',
      title: `Tela de ${screenLabels[screen] ?? screen}`,
      description: screenDescriptions[screen] ?? 'Aqui ficam as informações e ações principais desta tela.',
    },
    {
      selector: '[data-tour="search"]',
      title: 'Encontre mais rápido',
      description: 'Pesquise espaços pelo nome ou identificador sem percorrer toda a lista.',
    },
    {
      selector: '[data-tour="notifications"]',
      title: 'Atualizações importantes',
      description: 'Consulte alertas operacionais e financeiros sem interromper o fluxo de trabalho.',
    },
  ]
  const filtered = area === 'dev' && screen === 'tenants' ? steps : steps.filter((step) => step.selector !== '[data-tour="search"]')
  if (area === 'admin' && screen === 'settings') {
    filtered.splice(3, 0, {
      selector: '[data-tour="custom-domains"]',
      title: 'Seu endereço profissional',
      description: 'Conecte um domínio próprio com verificação DNS e HTTPS automático. O painel mostra cada registro e o estado da propagação.',
    })
  }
  return filtered
}

// --- Admin Components ---

function AdminDashboard({ me, stats, onRefresh, onOpenAgenda }: { me: SessionUser | null; stats: AdminStats | null; onRefresh?: () => void; onOpenAgenda: () => void }) {
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

  async function handlePresenceAction(id: string, action: 'manual' | 'resend') {
    if (updating) return
    setUpdating(true)
    const res = await api(`/api/admin/appointments/${id}/confirmation/${action}`, { method: 'POST' })
    setUpdating(false)
    if (!res.ok) notify(res.error.message, 'error')
    else notify(action === 'manual' ? 'Presença confirmada manualmente.' : 'Confirmação enviada pelo WhatsApp.', 'success')
    if (onRefresh) onRefresh()
  }

  const dashboardTimeZone = stats?.timeZone ?? 'America/Sao_Paulo'
  const greeting = useMemo(() => {
    const hour = Math.floor((minutesInTimeZone(new Date(), dashboardTimeZone) ?? 0) / 60)
    if (hour < 12) return 'Bom dia'
    if (hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }, [dashboardTimeZone])

  const bookingBaseUrl = stats?.publicBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  const bookingLink = bookingBaseUrl ? `${bookingBaseUrl.replace(/\/$/, '')}/agendar` : ''
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    const didCopy = await copyTextToClipboard(bookingLink)
    if (!didCopy) {
      notify('Não foi possível copiar o link neste navegador.', 'error')
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const palette = [
    { bg: undefined as string | undefined, fg: undefined as string | undefined },
    { bg: '#e0f2fe', fg: 'var(--status-info-ink)' },
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

  const fmtTime = (iso: string) => formatTimeInZone(iso, dashboardTimeZone)

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
    const st = appointmentPresenceMeta(a.status, a.confirmationStatus)
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
      confirmationStatus: a.confirmationStatus,
      clientPhone: a.clientPhone,
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

  const ownerName = (me?.email?.split('@')[0] || 'profissional').replace(/[._-]+/g, ' ')
  const nextAppointment = upcoming[0] ?? null
  const attentionCount = (stats?.confirmationSummary?.noResponse ?? 0) + (stats?.confirmationSummary?.deliveryFailed ?? 0) + (stats?.confirmationSummary?.declined ?? 0)
  const todayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: dashboardTimeZone }).format(new Date())

  return (
    <div className="ld-dashboard-page">
      <section className="ld-mobile-dashboard-stage" aria-label="Resumo do dia">
        <header className="ld-mobile-dashboard-intro">
          <div>
            <span>{todayLabel}</span>
            <h1>{greeting}, <em>{ownerName}</em>.</h1>
            <p>{stats?.today?.appointmentsCount ? `Você tem ${stats.today.appointmentsCount} atendimento${stats.today.appointmentsCount === 1 ? '' : 's'} hoje.` : 'Sua agenda está livre por enquanto.'}</p>
          </div>
          <button type="button" onClick={onOpenAgenda} aria-label="Abrir agenda"><Calendar size={20} /></button>
        </header>

        <button type="button" className={`ld-mobile-next-card ${nextAppointment ? 'has-appointment' : 'is-empty'}`} onClick={onOpenAgenda}>
          <span className="ld-mobile-next-card-media" aria-hidden="true"><img src="/dashboard/human-studio.webp" alt="" /></span>
          <span className="ld-mobile-next-card-content">
            <small>{nextAppointment ? 'Próxima cliente' : 'Sua próxima janela'}</small>
            <strong className="ld-mobile-next-time">{nextAppointment?.time || 'Livre'}</strong>
            <span className="ld-mobile-next-person">{nextAppointment?.name || 'Nenhum atendimento próximo'}</span>
            <span className="ld-mobile-next-service">{nextAppointment?.service || 'Um bom momento para organizar o dia'}</span>
          </span>
          <span className="ld-mobile-next-card-action"><ArrowRight size={17} /></span>
        </button>

        <section className="ld-mobile-business-pulse" aria-label="Pulso do negócio">
          <div className="ld-mobile-business-pulse-main">
            <span>Previsão de hoje</span>
            <strong>{formatBRL((stats?.today?.expectedRevenueCents ?? 0) / 100)}</strong>
          </div>
          <div className="ld-mobile-business-pulse-meta">
            <span><b>{stats?.newClients30d ?? 0}</b><small>novas clientes<br />em 30 dias</small></span>
            <span><b>{stats?.confirmationSummary?.confirmed ?? 0}</b><small>presenças<br />confirmadas</small></span>
            <span className={attentionCount ? 'has-attention' : ''}><b>{attentionCount}</b><small>pedem sua<br />atenção</small></span>
          </div>
        </section>
      </section>
      <section className="ld-dashboard-hero">
        <div className="ld-dashboard-hero-copy"><span className="eyebrow">Seu dia em movimento</span><h2>{greeting}, {me?.email?.split('@')[0]}!</h2><p><strong>{stats?.today?.appointmentsCount ?? 0} agendamentos</strong> hoje. Agenda, clientes e financeiro seguem organizados logo abaixo.</p></div>
        <div className="ld-dashboard-hero-visual" aria-hidden="true"><img src="/dashboard/human-studio.webp" alt="" /></div>
      </section>

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
            <h4>Precisam de atenção</h4>
            <div className="value">{(stats?.confirmationSummary?.noResponse ?? 0) + (stats?.confirmationSummary?.deliveryFailed ?? 0) + (stats?.confirmationSummary?.declined ?? 0)}</div>
          </div>
        </div>
      </div>

      <section className="appointment-confirmation-overview">
        <div className="appointment-confirmation-overview__copy">
          <span className="eyebrow">Confirmações de hoje</span>
          <strong>O fluxo normal acontece sozinho. Você entra apenas quando alguém não responde ou informa que não poderá ir.</strong>
        </div>
        <div className="appointment-confirmation-overview__metrics">
          <span><i className="is-confirmed" /><strong>{stats?.confirmationSummary?.confirmed ?? 0}</strong> confirmados</span>
          <span><i className="is-awaiting" /><strong>{stats?.confirmationSummary?.awaiting ?? 0}</strong> aguardando</span>
          <span><i className="is-attention" /><strong>{(stats?.confirmationSummary?.noResponse ?? 0) + (stats?.confirmationSummary?.deliveryFailed ?? 0) + (stats?.confirmationSummary?.declined ?? 0)}</strong> atenção</span>
        </div>
      </section>

      {(stats?.confirmationAttention?.length ?? 0) > 0 ? (
        <section className="appointment-attention-panel">
          <div className="appointment-attention-panel__head">
            <div><span className="eyebrow">Exceções</span><h3>Confirmações não resolvidas</h3></div>
            <button type="button" className="btn btn-ghost" onClick={onOpenAgenda}>Abrir agenda</button>
          </div>
          <div className="appointment-attention-list">
            {(stats?.confirmationAttention ?? []).map((item) => {
              const presence = appointmentPresenceMeta(item.status, item.confirmationStatus)
              return <div className="appointment-attention-row" key={item.id}>
                <div className="appointment-attention-row__main"><strong>{item.clientName || 'Cliente'}</strong><span>{item.serviceName} · {formatDateInZone(item.startsAt, dashboardTimeZone)} às {fmtTime(item.startsAt)}</span></div>
                <span className={`status-badge ${presence.className}`}>{presence.label}</span>
                <div className="appointment-attention-row__actions">
                  {(item.confirmationStatus === 'NO_RESPONSE' || item.confirmationStatus === 'DELIVERY_FAILED') && item.clientPhone ? <button type="button" className="btn btn-ghost" disabled={updating} onClick={() => void handlePresenceAction(item.id, 'resend')}>Reenviar</button> : null}
                  <button type="button" className="btn btnPrimary" disabled={updating} onClick={() => void handlePresenceAction(item.id, 'manual')}>Confirmar manualmente</button>
                </div>
              </div>
            })}
          </div>
        </section>
      ) : null}

      <div className="grid grid-2-1">
        <div className="column" style={{gap: '2rem'}}>
        <div className="card ld-dashboard-upcoming">
          <div className="cardHeader">
            <h3 className="cardTitle">Próximos Agendamentos</h3>
            <button type="button" className="btn btn-ghost" style={{fontSize: '0.85rem'}} onClick={onOpenAgenda}>Ver todos</button>
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
                                <button type="button" className="icon-btn" style={{width: 32, height: 32, background: isOpen ? 'var(--gray-100)' : 'transparent', border: 'none'}} aria-label="Abrir ações do agendamento" aria-haspopup="menu" aria-expanded={isOpen}>
                                    <MoreHorizontal size={16}/>
                                </button>
                            )}
                        >
                            {(close) => (
                                <>
                                    {appt.rawStatus !== 'CANCELLED' && appt.confirmationStatus !== 'CONFIRMED' && appt.confirmationStatus !== 'MANUALLY_CONFIRMED' ? (
                                        <button type="button" className="btn-menu-item" onClick={() => { void handlePresenceAction(appt.id, 'manual'); close() }}>Confirmar presença</button>
                                    ) : null}
                                    {appt.rawStatus !== 'CANCELLED' && appt.clientPhone ? (
                                        <button type="button" className="btn-menu-item" onClick={() => { void handlePresenceAction(appt.id, 'resend'); close() }}>{appt.confirmationStatus === 'NOT_REQUESTED' ? 'Enviar confirmação' : 'Reenviar confirmação'}</button>
                                    ) : null}
                                    {appt.rawStatus !== 'CANCELLED' && (
                                        <button type="button"
                                            className="btn-menu-item danger"
                                            onClick={() => { handleStatusChange(appt.id, 'CANCELLED'); close() }}
                                        >
                                            Cancelar
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
                                <button type="button" className="icon-btn" style={{width: 32, height: 32, background: isOpen ? 'var(--gray-100)' : 'transparent', border: 'none'}} aria-label="Abrir ações do agendamento" aria-haspopup="menu" aria-expanded={isOpen}>
                                    <MoreHorizontal size={16}/>
                                </button>
                            )}
                        >
                            {(close) => (
                                <>
                                    {appt.rawStatus !== 'CANCELLED' && appt.confirmationStatus !== 'CONFIRMED' && appt.confirmationStatus !== 'MANUALLY_CONFIRMED' ? (
                                        <button type="button" className="btn-menu-item" onClick={() => { void handlePresenceAction(appt.id, 'manual'); close() }}>Confirmar presença</button>
                                    ) : null}
                                    {appt.rawStatus !== 'CANCELLED' && appt.clientPhone ? (
                                        <button type="button" className="btn-menu-item" onClick={() => { void handlePresenceAction(appt.id, 'resend'); close() }}>{appt.confirmationStatus === 'NOT_REQUESTED' ? 'Enviar confirmação' : 'Reenviar confirmação'}</button>
                                    ) : null}
                                    {appt.rawStatus !== 'CANCELLED' && (
                                        <button type="button"
                                            className="btn-menu-item danger"
                                            onClick={() => { handleStatusChange(appt.id, 'CANCELLED'); close() }}
                                        >
                                            Cancelar
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

        <div className="card ld-dashboard-booking-link">
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
                    <button type="button" onClick={() => void copyLink()} aria-label={copied ? 'Link copiado' : 'Copiar link de agendamento'} style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)', padding: 4, display: 'flex'}}>
                        {copied ? <Check size={16} color="var(--success)" /> : <Copy size={16} />}
                    </button>
                </div>
                <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
                    <button type="button" className="btn w-full" style={{flex: 1}} onClick={() => void copyLink()}>
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                    <button type="button" className="btn btnPrimary w-full" style={{flex: 1}} onClick={() => window.open(bookingLink, '_blank', 'noopener,noreferrer')}>
                        <Globe size={16} />
                        <span>Abrir Link</span>
                    </button>
                </div>
            </div>
        </div>
        </div>

        <div className="column" style={{gap: '1.5rem'}}>
            <div className="card ld-dashboard-activity">
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
    </div>
  )
}

function AdminEvolutionAPI() {
    return <WhatsAppCenter />
}

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

type LegalPreferencesState = {
    whatsappPromotions: boolean
    marketingConsentText: string
    currentDocuments: { termsVersion: string; privacyVersion: string; bundleHash: string }
    latestAcceptance: { termsVersion: string; privacyVersion: string; bundleHash: string; acceptedAt: string } | null
}

function SecuritySettingsCard({ title = 'Segurança da conta' }: { title?: string }) {
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

function AdminSettings({ tenant, onUpdate }: { tenant: TenantPublic | null; onUpdate?: (tenant: TenantPublic) => void }) {
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
            <CustomDomainsSettings />
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
                                        <p className="form-help">PNG, JPG ou WebP. A imagem é redimensionada e comprimida antes do envio.</p>
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
            <div className="finance36-loading">
                <div className="spinner" />
            </div>
        )
    }

    if (!finance) {
        return <EmptyState image="/empty-states/empty-finance.png" title="Financeiro indisponível" description="Não foi possível carregar os dados financeiros agora." />
    }

    const current = finance.currentMonth
    const previous = finance.previousMonth
    const growth = previous.entriesCents > 0
        ? Number((((current.entriesCents - previous.entriesCents) / previous.entriesCents) * 100).toFixed(1))
        : current.entriesCents > 0 ? 100 : 0
    const expenseRatio = current.entriesCents > 0 ? (current.expensesCents / current.entriesCents) * 100 : 0
    const averageTicket = current.confirmedAppointments > 0 ? current.serviceEntriesCents / current.confirmedAppointments : 0
    const revenueGoalPercent = Math.min(100, (finance.goals.currentRevenueCents / Math.max(1, finance.goals.revenueCents)) * 100)
    const clientGoalPercent = Math.min(100, (finance.goals.currentNewClients / Math.max(1, finance.goals.newClients)) * 100)
    const activeMonthLabel = financeMonthLabel(finance.currentMonthYm)
    const monthlyFlow = finance.monthly.map((month) => ({
        ...month,
        label: financeMonthLabel(month.ym),
    }))

    const formatFinanceDate = (value: string) => {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return value
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: finance.timeZone,
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date).replace('.', '')
    }

    const transactions = [
        ...finance.lastEntries.map(a => ({
            id: `in_${a.id}`,
            title: a.clientName ?? a.clientEmail,
            subtitle: a.serviceName,
            type: 'income' as const,
            amount: a.priceCents,
            at: a.startsAt,
            dateText: formatFinanceDate(a.startsAt),
            category: 'Serviço',
        })),
        ...finance.lastCashTransactions.map(e => ({
            id: `cash_${e.id}`,
            title: e.note?.trim() ? e.note.trim() : (e.type === 'INCOME' ? 'Entrada manual' : 'Saída manual'),
            subtitle: e.type === 'INCOME' ? 'Movimentação adicionada' : 'Despesa registrada',
            type: e.type.toLowerCase() as 'income' | 'expense',
            amount: e.amountCents,
            at: e.createdAt,
            dateText: formatFinanceDate(e.createdAt),
            category: e.method || 'Manual',
        })),
    ].sort((a, b) => b.at.localeCompare(a.at))

    const filteredTransactions = transactions.filter(t => filter === 'all' || t.type === filter).slice(0, 20)

    const handleDeleteTransaction = async (id: string) => {
        if (!id.startsWith('cash_')) return
        if (!(await confirmAction({ title: 'Excluir movimentação', message: 'A movimentação será removida do financeiro e dos totais apresentados.', confirmLabel: 'Excluir movimentação', danger: true }))) return
        const rawId = id.replace('cash_', '')
        const res = await api<{ ok: true }>(`/api/admin/finance/transactions/${rawId}`, { method: 'DELETE' })
        if (res.ok) loadData()
        else notify('Erro ao excluir: ' + (res.error?.message || 'Desconhecido'), 'error')
    }

    const askLuma = (prompt: string) => {
        window.dispatchEvent(new CustomEvent('lashdesigner:luma-open', { detail: { prompt } }))
    }

    return (
        <div className="finance36">
            <section className="finance36-hero">
                <div className="finance36-hero-copy">
                    <span className="finance36-eyebrow">Controle financeiro · {activeMonthLabel}</span>
                    <h2>Entenda o mês sem fazer conta na cabeça.</h2>
                    <p>Entradas confirmadas, movimentações manuais, despesas e metas reunidas na mesma leitura.</p>
                </div>
                <div className="finance36-actions">
                    <button type="button" className="finance36-btn is-primary" onClick={() => setShowTransactionModal(true)}>
                        <Plus size={16} /> Nova movimentação
                    </button>
                    <button type="button" className="finance36-btn" onClick={() => setShowExtractModal(true)}>
                        <Download size={16} /> Extrato
                    </button>
                    <button type="button" className="finance36-btn is-luma" onClick={() => askLuma('Analise meu financeiro deste mês. Compare com o mês anterior, destaque o que merece atenção e me dê no máximo 3 próximos passos práticos.')}>
                        <Sparkles size={16} /> Analisar com Luma
                    </button>
                </div>
            </section>

            <section className="finance36-kpis" aria-label="Resumo financeiro do mês">
                <article className="finance36-kpi is-income">
                    <span>Entradas do mês</span>
                    <strong>{formatBRL(current.entriesCents / 100)}</strong>
                    <small className={growth >= 0 ? 'is-positive' : 'is-negative'}>{growth >= 0 ? '+' : ''}{growth}% vs. {financeMonthLabel(previous.ym)}</small>
                </article>
                <article className="finance36-kpi is-expense">
                    <span>Saídas do mês</span>
                    <strong>{formatBRL(current.expensesCents / 100)}</strong>
                    <small>{expenseRatio.toFixed(1).replace('.', ',')}% das entradas registradas</small>
                </article>
                <article className="finance36-kpi is-balance">
                    <span>Saldo do mês</span>
                    <strong>{formatBRL(current.balanceCents / 100)}</strong>
                    <small>Entradas registradas − saídas registradas</small>
                </article>
                <article className="finance36-kpi is-goal">
                    <span>Meta de faturamento</span>
                    <strong>{Math.round(revenueGoalPercent)}%</strong>
                    <div className="finance36-mini-progress"><i style={{ width: `${revenueGoalPercent}%` }} /></div>
                    <small>{formatBRL(finance.goals.currentRevenueCents / 100)} de {formatBRL(finance.goals.revenueCents / 100)}</small>
                </article>
            </section>

            <div className="finance36-primary-grid">
                <section className="finance36-panel finance36-flow-panel">
                    <header className="finance36-panel-head">
                        <div>
                            <span className="finance36-panel-kicker">Últimos 6 meses</span>
                            <h3>Entradas x saídas</h3>
                        </div>
                        <div className="finance36-legend" aria-label="Legenda do gráfico">
                            <span><i className="is-entry" />Entradas</span>
                            <span><i className="is-expense" />Saídas</span>
                            <span><i className="is-balance" />Saldo</span>
                        </div>
                    </header>
                    <FinanceFlowChart
                        data={monthlyFlow}
                        currentMonthYm={finance.currentMonthYm}
                        formatCurrency={formatBRL}
                    />
                </section>

                <aside className="finance36-panel finance36-reading">
                    <header className="finance36-panel-head">
                        <div>
                            <span className="finance36-panel-kicker">Leitura do mês</span>
                            <h3>De onde o número vem</h3>
                        </div>
                        <BarChart3 size={19} />
                    </header>
                    <div className="finance36-reading-list">
                        <div><span>Serviços confirmados</span><strong>{formatBRL(current.serviceEntriesCents / 100)}</strong></div>
                        <div><span>Entradas manuais</span><strong>{formatBRL(current.manualIncomeCents / 100)}</strong></div>
                        <div><span>Ticket médio dos serviços</span><strong>{formatBRL(averageTicket / 100)}</strong></div>
                        <div><span>Agendamentos confirmados</span><strong>{current.confirmedAppointments}</strong></div>
                    </div>
                    <button type="button" className="finance36-luma-card" onClick={() => askLuma('Explique de forma simples a composição do meu financeiro deste mês: serviços confirmados, entradas manuais, despesas e saldo. Aponte qualquer sinal fora do normal.') }>
                        <span><Sparkles size={16} /> Perguntar à Luma sobre estes números</span>
                        <ArrowRight size={15} />
                    </button>
                    <p className="finance36-definition">Saldo não é lucro contábil: ele representa as entradas e saídas que estão registradas no Lash Designer.</p>
                </aside>
            </div>

            <div className="finance36-secondary-grid">
                <section className="finance36-panel finance36-transactions">
                    <header className="finance36-panel-head finance36-transactions-head">
                        <div>
                            <span className="finance36-panel-kicker">Movimentação</span>
                            <h3>Últimos registros</h3>
                        </div>
                        <div className="finance36-filter-group">
                            {filters.map(f => (
                                <button type="button" key={f} onClick={() => setFilter(f)} className={filter === f ? 'is-active' : ''}>
                                    {f === 'all' ? 'Tudo' : f === 'income' ? 'Entradas' : 'Saídas'}
                                </button>
                            ))}
                        </div>
                    </header>
                    <div className="finance36-transaction-list">
                        {filteredTransactions.length === 0 ? (
                            <EmptyState compact image="/empty-states/empty-finance.png" title="Nada por aqui ainda" description="Os registros financeiros do período aparecerão nesta lista." />
                        ) : filteredTransactions.map((transaction) => (
                            <article className="finance36-transaction" key={transaction.id}>
                                <div className={`finance36-transaction-sign ${transaction.type}`} aria-hidden="true">{transaction.type === 'income' ? '+' : '−'}</div>
                                <div className="finance36-transaction-copy">
                                    <strong>{transaction.title}</strong>
                                    <span>{transaction.subtitle} · {transaction.category}</span>
                                </div>
                                <time>{transaction.dateText}</time>
                                <strong className={`finance36-transaction-value ${transaction.type}`}>{transaction.type === 'income' ? '+' : '−'}{formatBRL(transaction.amount / 100)}</strong>
                                {transaction.id.startsWith('cash_') ? (
                                    <button type="button" className="finance36-delete" onClick={() => handleDeleteTransaction(transaction.id)} aria-label="Excluir movimentação" title="Excluir movimentação">
                                        <Trash2 size={15} />
                                    </button>
                                ) : <span className="finance36-delete-placeholder" />}
                            </article>
                        ))}
                    </div>
                    <button type="button" className="finance36-inline-action" onClick={() => setShowExtractModal(true)}>Abrir extrato completo <ArrowRight size={14} /></button>
                </section>

                <aside className="finance36-side-stack">
                    <section className="finance36-panel finance36-goals">
                        <header className="finance36-panel-head">
                            <div>
                                <span className="finance36-panel-kicker">Metas</span>
                                <h3>Ritmo do mês</h3>
                            </div>
                            <button type="button" className="finance36-icon-btn" onClick={() => setShowGoalsModal(true)} aria-label="Editar metas"><Edit2 size={15} /></button>
                        </header>
                        <div className="finance36-goal">
                            <div><span>Faturamento</span><strong>{Math.round(revenueGoalPercent)}%</strong></div>
                            <div className="finance36-progress"><i style={{ width: `${revenueGoalPercent}%` }} /></div>
                            <small>{formatBRL(finance.goals.currentRevenueCents / 100)} de {formatBRL(finance.goals.revenueCents / 100)}</small>
                        </div>
                        <div className="finance36-goal is-client">
                            <div><span>Novos clientes</span><strong>{Math.round(clientGoalPercent)}%</strong></div>
                            <div className="finance36-progress"><i style={{ width: `${clientGoalPercent}%` }} /></div>
                            <small>{finance.goals.currentNewClients} de {finance.goals.newClients} clientes</small>
                        </div>
                        <button type="button" className="finance36-inline-action" onClick={() => askLuma('Com base no meu financeiro atual e nas minhas metas deste mês, o que eu deveria priorizar para chegar mais perto da meta sem depender de descontos?')}>Como chegar na meta? <Sparkles size={14} /></button>
                    </section>

                    <section className="finance36-panel finance36-expenses">
                        <header className="finance36-panel-head">
                            <div>
                                <span className="finance36-panel-kicker">Saídas</span>
                                <h3>Principais categorias</h3>
                            </div>
                            <Wallet size={18} />
                        </header>
                        {finance.expenseCategories.length ? (
                            <div className="finance36-expense-list">
                                {finance.expenseCategories.map((category) => {
                                    const pct = current.expensesCents > 0 ? (category.amountCents / current.expensesCents) * 100 : 0
                                    return (
                                        <div key={category.label}>
                                            <div><span>{category.label}</span><strong>{formatBRL(category.amountCents / 100)}</strong></div>
                                            <div className="finance36-expense-track"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <p className="finance36-empty-copy">Nenhuma saída manual foi registrada em {activeMonthLabel}.</p>
                        )}
                    </section>
                </aside>
            </div>

            {showTransactionModal && <NewTransactionModal isOpen={true} onClose={() => setShowTransactionModal(false)} onSuccess={loadData} todayYmd={finance.todayYmd} />}
            {showExtractModal && <ExtractModal isOpen={true} onClose={() => setShowExtractModal(false)} todayYmd={finance.todayYmd} currentMonthYm={finance.currentMonthYm} timeZone={finance.timeZone} />}
            {showGoalsModal && (
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

function Admin(props: { tenant?: TenantPublic; tenantSlug?: string; basePath?: string } = {}) {
  const { tenantSlug } = useParams()
  const nav = useNavigate()
  const _slug = (props.tenantSlug ?? tenantSlug ?? '').trim().toLowerCase()
  const [me, setMe] = useState<SessionUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [legalGateLoading, setLegalGateLoading] = useState(true)
  const [adminLegalPreferences, setAdminLegalPreferences] = useState<LegalPreferencesState | null>(null)
  const [legalGateError, setLegalGateError] = useState<string | null>(null)
  const [tenant, setTenant] = useState<TenantPublic | null>(null)
  const [isTestMode, setIsTestMode] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('lashdesigner_test_mode') === 'true'
    return false
  })
  const [tab, setTab] = useState<'dashboard' | 'calendar' | 'services' | 'clients' | 'finance' | 'settings' | 'evolution' | 'billing' | 'assistant' | 'referrals'>(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lumaCredits') === 'return') return 'assistant'
    return 'dashboard'
  })

  const [stats, setStats] = useState<AdminStats | null>(null)
  const adminTourSteps = useMemo(() => shellTourSteps('admin', tab), [tab])

  function loadStats() {
    api<AdminStats>('/api/admin/dashboard').then(res => {
        if(res.ok) setStats(res.data)
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
        notify('Pagamento recebido. Os créditos serão liberados assim que a InfinitePay confirmar a transação.', 'info')
      }
    })
  }, [authLoading, me])

  const subscriptionActive = Boolean(me && (String(me.subscriptionStatus ?? '').toUpperCase() === 'ACTIVE' || isTestMode))
  const subscriptionInactive = Boolean(me?.role === 'ADMIN' && !subscriptionActive)

  useEffect(() => {
    if (subscriptionInactive && tab !== 'billing') setTab('billing')
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
          subtitle="Gestão do Espaço"
          user={me}
          brand={tenant}
          isTestMode={isTestMode}
          sidebar={
            <div className="ld-nav-group">
              <div className="ld-nav-section">Principal</div>
              <SidebarItem active icon={<LayoutDashboard size={18}/>} label="Dashboard" onClick={() => {}} />
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

  return (
    <Shell
        title={subscriptionInactive ? 'Assinatura' : ({dashboard: 'Visão Geral', calendar: 'Agenda', services: 'Serviços', clients: 'Clientes', finance: 'Financeiro', settings: 'Configurações', evolution: 'WhatsApp', billing: 'Assinatura', assistant: 'Luma', referrals: 'Indicações'} as const)[tab]}
        subtitle="Gestão do Espaço"
        user={me}
        brand={tenant}
        isTestMode={isTestMode}
        tourKey={`admin-${tab}`}
        tourSteps={adminTourSteps}
        tourEnabled={!subscriptionInactive && tab !== 'billing'}
        autoStartTour={!subscriptionInactive && tab === 'dashboard'}
        mobileNav={subscriptionInactive ? undefined : [
          { key: 'dashboard', label: 'Início', icon: <LayoutDashboard size={21}/>, active: tab === 'dashboard', onClick: () => setTab('dashboard') },
          { key: 'calendar', label: 'Agenda', icon: <Calendar size={21}/>, active: tab === 'calendar', onClick: () => setTab('calendar') },
          { key: 'clients', label: 'Clientes', icon: <Users size={21}/>, active: tab === 'clients', onClick: () => setTab('clients') },
          { key: 'evolution', label: 'WhatsApp', icon: <MessageSquare size={21}/>, active: tab === 'evolution', onClick: () => setTab('evolution') },
        ]}
        mobileMoreActive={!subscriptionInactive && !['dashboard', 'calendar', 'clients', 'evolution'].includes(tab)}
        sidebar={
            <div className="ld-nav-group">
                {subscriptionInactive ? (
                  <>
                    <div className="ld-nav-section">Conta</div>
                    <SidebarItem active icon={<CreditCard size={18}/>} label="Ativar assinatura" onClick={() => setTab('billing')} />
                  </>
                ) : (
                  <>
                    <div className="ld-nav-section">Principal</div>
                    <SidebarItem active={tab === 'dashboard'} icon={<LayoutDashboard size={18}/>} label="Dashboard" onClick={() => setTab('dashboard')} />
                    <SidebarItem active={tab === 'calendar'} icon={<Calendar size={18}/>} label="Agenda" onClick={() => setTab('calendar')} />
                    <SidebarItem active={tab === 'clients'} icon={<Users size={18}/>} label="Clientes" onClick={() => setTab('clients')} />
                    <div className="ld-nav-section ld-nav-section--spaced">Gestão</div>
                    <SidebarItem active={tab === 'services'} icon={<ImageIcon size={18}/>} label="Serviços" onClick={() => setTab('services')} />
                    <SidebarItem active={tab === 'finance'} icon={<Wallet size={18}/>} label="Financeiro" onClick={() => setTab('finance')} />
                    <SidebarItem active={tab === 'evolution'} icon={<MessageSquare size={18}/>} label="WhatsApp" onClick={() => setTab('evolution')} />
                    <SidebarItem active={tab === 'assistant'} icon={<Sparkles size={18}/>} label="Luma" onClick={() => setTab('assistant')} />
                    <div className="ld-nav-section ld-nav-section--spaced">Sistema</div>
                    <SidebarItem active={tab === 'referrals'} icon={<HeartHandshake size={18}/>} label="Indicações" onClick={() => setTab('referrals')} />
                    <SidebarItem active={tab === 'billing'} icon={<CreditCard size={18}/>} label="Assinatura" onClick={() => setTab('billing')} />
                    <SidebarItem active={tab === 'settings'} icon={<Settings size={18}/>} label="Configurações" onClick={() => setTab('settings')} />
                  </>
                )}
                <SidebarItem icon={<LogOut size={18}/>} label="Sair" onClick={async () => {
                     await api('/api/auth/logout', {method: 'POST'})
                     window.location.href = '/'
                }} />
            </div>
        }
    >
        {subscriptionInactive ? (
            <BillingCenter locked />
        ) : (
            <>
                {tab === 'dashboard' ? <AdminDashboard me={me} stats={stats} onRefresh={loadStats} onOpenAgenda={() => setTab('calendar')} /> : null}

                {tab === 'services' ? <AdminServices /> : null}

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
                <WorkspaceSetup tenant={tenant} onComplete={(updatedTenant) => {
                  if (updatedTenant) {
                    setTenant(updatedTenant)
                    applyTenantTheme(updatedTenant)
                  }
                  loadStats()
                }} />
                {tab !== 'assistant' ? <LumaChatLauncher /> : null}
            </>
        )}
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

function Dev() {
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
    const [tab, setTab] = useState<'tenants' | 'settings' | 'integrations' | 'backups' | 'referrals'>('tenants')
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
            title="Developer Console"
            subtitle="Gestão da Plataforma"
            user={me}
            isTestMode={testMode}
            tourKey={`dev-${tab}`}
            tourSteps={devTourSteps}
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

function UnifiedLogin(props: { hostTenant?: TenantPublic | null; isDevHost?: boolean } = {}) {
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
  const brandName = props.hostTenant?.name ?? 'Lash Designer'
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
            <div className="authRefMark">
              {props.hostTenant?.logoUrl ? (
                <img decoding="async" className="authRefLogo" src={props.hostTenant.logoUrl} alt={brandName} />
              ) : (
                <img decoding="async" className="authRefDefaultLogo" src="/brand/logo-symbol.png" alt="" aria-hidden="true" />
              )}
            </div>
            <div className="authRefBrandText">
              <div className="authRefBrandName">{brandName}</div>
              <div className="authRefBrandSub">{brandHandle}</div>
            </div>
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
      <button type="button"
        className="dateScrollBtn left"
        onClick={() => scroll('left')}
        aria-label="Ver datas anteriores"
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
              role="button"
              tabIndex={status.disabled ? -1 : 0}
              aria-pressed={isSelected}
              aria-disabled={status.disabled}
              aria-label={`${formatYmdPtBr(dStr)}${status.disabled ? `, ${status.label ?? 'fechado'}` : ''}`}
              onClick={() => {
                if (!status.disabled) onChange(dStr)
              }}
              onKeyDown={(event) => {
                if (!status.disabled && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onChange(dStr)
                }
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

      <button type="button"
        className="dateScrollBtn right"
        onClick={() => scroll('right')}
        aria-label="Ver próximas datas"
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

  useEffect(() => { setAppMode('tenant') }, [])

  const [tenant, setTenant] = useState<TenantPublic | null>(props.tenant ?? null)
  const [services, setServices] = useState<Array<{ id: string; name: string; durationMinutes: number; priceCents: number; coverUrl?: string | null }>>([])
  const [booking, setBooking] = useState<{
    timezone: string
    currency: string
    bookingRules: { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number }
    businessHours: Array<{ weekday: number; startMinute: number; endMinute: number }>
  } | null>(null)
  const [blocks, setBlocks] = useState<Array<{ startsAt: string; endsAt: string; kind: 'appointment' | 'time_off' }>>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [marketingDetailsOpen, setMarketingDetailsOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmedAppointment, setConfirmedAppointment] = useState<{ id: string; status: string } | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setLoadError(null)
    const tenantPromise = props.tenant
      ? Promise.resolve({ ok: true as const, data: { tenant: props.tenant } })
      : api<{ tenant: TenantPublic }>(slug ? `/api/public/tenant/${encodeURIComponent(slug)}` : '/api/public/tenant')
    const servicesPromise = api<{ services: typeof services }>(slug ? `/api/public/tenant/${encodeURIComponent(slug)}/services` : '/api/public/services')
    const bookingPromise = api<typeof booking>(slug ? `/api/public/tenant/${encodeURIComponent(slug)}/booking` : '/api/public/booking')
    Promise.all([tenantPromise, servicesPromise, bookingPromise]).then(([tenantRes, servicesRes, bookingRes]) => {
      if (!mounted) return
      if (!tenantRes.ok) { setLoadError(tenantRes.error.message); return }
      setTenant(tenantRes.data.tenant)
      applyTenantTheme(tenantRes.data.tenant)
      if (servicesRes.ok) setServices(servicesRes.data.services)
      if (bookingRes.ok) setBooking(bookingRes.data)
    }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [slug, props.tenant])

  useEffect(() => {
    if (!selectedDate) { setBlocks([]); return }
    let mounted = true
    const url = slug
      ? `/api/public/tenant/${encodeURIComponent(slug)}/availability?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`
      : `/api/public/availability?date=${encodeURIComponent(selectedDate)}&_=${Date.now()}`
    api<{ blocks: Array<{ startsAt: string; endsAt: string; kind: 'appointment' | 'time_off' }> }>(url).then((res) => {
      if (mounted) setBlocks(res.ok ? res.data.blocks : [])
    })
    return () => { mounted = false }
  }, [slug, selectedDate])

  const selectedService = useMemo(() => services.find((s) => s.id === selectedServiceId) ?? null, [services, selectedServiceId])
  const dateLimits = useMemo(() => {
    const timeZone = booking?.timezone ?? 'America/Sao_Paulo'
    const min = ymdInTimeZone(new Date(), timeZone)
    const max = addDaysToYmd(min, booking?.bookingRules.maxFutureDays ?? 60) ?? min
    return { min, max }
  }, [booking])
  const dateStatusFor = useMemo(() => {
    if (!booking) return () => ({ disabled: false, label: undefined as string | undefined })
    return (ymd: string) => {
      const day = weekdayIndexForYmd(ymd, booking.timezone)
      if (day === null) return { disabled: true, label: 'Indisponível' }
      const ranges = booking.businessHours.filter((h) => h.weekday === day)
      return ranges.length === 0 ? { disabled: true, label: 'Fechado' } : { disabled: false, label: undefined }
    }
  }, [booking])

  const timeSlotsForSelectedDate = useMemo(() => {
    if (!booking || !selectedService || !selectedDate) return [] as Array<{ time: string; status: 'available' | 'blocked' | 'notice'; reason: string }>
    const day = weekdayIndexForYmd(selectedDate, booking.timezone)
    if (day === null) return []
    const ranges = booking.businessHours.filter((h) => h.weekday === day)
    const stepMinutes = Math.max(5, booking.bookingRules.slotStepMinutes)
    const times: string[] = []
    for (const r of ranges) {
      const lastStart = r.endMinute - selectedService.durationMinutes
      for (let m = r.startMinute; m <= lastStart; m += stepMinutes) times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    }
    const cutoff = new Date(Date.now() + booking.bookingRules.minNoticeMinutes * 60_000)
    const parsedBlocks = blocks.map((b) => ({ s: new Date(b.startsAt), e: new Date(b.endsAt), kind: b.kind })).filter((b) => !Number.isNaN(b.s.getTime()) && !Number.isNaN(b.e.getTime()))
    return [...new Set(times)].sort().map((time) => {
      const startUtc = zonedDateTimeToUtc(selectedDate, time, booking.timezone)
      if (!startUtc || startUtc < cutoff) return { time, status: 'notice' as const, reason: 'Antecedência mínima' }
      const endUtc = new Date(startUtc.getTime() + selectedService.durationMinutes * 60_000)
      const conflict = parsedBlocks.find((b) => !(b.e <= startUtc || b.s >= endUtc))
      return conflict ? { time, status: 'blocked' as const, reason: conflict.kind === 'time_off' ? 'Bloqueado' : 'Reservado' } : { time, status: 'available' as const, reason: '' }
    })
  }, [booking, selectedDate, selectedService, blocks])

  const money = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
  const progress = Math.min(step, 4)

  async function confirmBooking() {
    if (!selectedService || !selectedTime || !selectedDate) return
    const name = clientName.trim()
    const phone = normalizeBrazilPhone(clientPhone)
    if (name.length < 2) { setActionError('Como podemos chamar você?'); return }
    if (!phone) { setActionError('Informe um WhatsApp brasileiro válido, com DDD.'); return }
    const startsAt = zonedDateTimeToUtc(selectedDate, selectedTime, booking?.timezone ?? 'America/Sao_Paulo')
    if (!startsAt) { setActionError('Não conseguimos validar este horário. Escolha novamente.'); return }
    setSaving(true); setActionError(null)
    const endpoint = slug ? `/api/public/tenant/${encodeURIComponent(slug)}/appointments` : '/api/public/appointments'
    const res = await api<{ appointment: { id: string; status: string } }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ serviceId: selectedService.id, startsAt: startsAt.toISOString(), name, phone, marketingConsent: marketingOptIn }),
    })
    setSaving(false)
    if (!res.ok) { setActionError(res.error.message); return }
    setConfirmedAppointment(res.data.appointment)
  }

  function resetBooking() {
    setConfirmedAppointment(null); setStep(1); setSelectedServiceId(null); setSelectedDate(''); setSelectedTime(null); setClientName(''); setClientPhone(''); setMarketingOptIn(false); setMarketingDetailsOpen(false); setActionError(null)
  }

  if (loading) return <div className="booking25 booking25-loading"><div className="booking25-skeleton" /></div>
  if (loadError) return <div className="booking25"><div className="booking25-error"><strong>Não conseguimos abrir esta agenda.</strong><span>{loadError}</span></div></div>

  const summary = [
    selectedService ? { label: 'Serviço', value: selectedService.name } : null,
    selectedDate ? { label: 'Data', value: formatYmdPtBr(selectedDate) } : null,
    selectedTime ? { label: 'Horário', value: selectedTime } : null,
  ].filter(Boolean) as Array<{label:string; value:string}>

  const stepLabels = ['Serviço', 'Data', 'Horário', 'Confirmar']
  const stepLabel = stepLabels[progress - 1]
  const sideImage = selectedService?.coverUrl || bundledServiceCover(selectedService?.name || '') || '/landing/result-640.webp'
  const availableTimeSlots = timeSlotsForSelectedDate.filter((slot) => slot.status === 'available')
  const mobileTimeGroups = [
    { label: 'Manhã', hint: 'até 11:59', slots: availableTimeSlots.filter((slot) => Number(slot.time.slice(0, 2)) < 12) },
    { label: 'Tarde', hint: '12:00 — 17:59', slots: availableTimeSlots.filter((slot) => { const hour = Number(slot.time.slice(0, 2)); return hour >= 12 && hour < 18 }) },
    { label: 'Noite', hint: 'a partir das 18:00', slots: availableTimeSlots.filter((slot) => Number(slot.time.slice(0, 2)) >= 18) },
  ].filter((group) => group.slots.length)
  const canVisitStep = (target: number) => {
    if (target <= 1) return true
    if (target === 2) return Boolean(selectedService)
    if (target === 3) return Boolean(selectedService && selectedDate)
    return Boolean(selectedService && selectedDate && selectedTime)
  }

  return <main className="booking30">
    <div className="booking30-shell">
      <header className="booking30-topbar">
        <button type="button" className="booking30-brand" onClick={() => nav(withBasePath(basePath, '/'))} aria-label={`Voltar para ${tenant?.name || 'o espaço'}`}>
          {tenant?.logoUrl ? <img src={tenant.logoUrl} alt="" /> : <img src="/placeholders/tenant-placeholder.png" alt="" />}
          <span><strong>{tenant?.name}</strong><small>Agendamento online</small></span>
        </button>

        {!confirmedAppointment ? <nav className="booking30-steps" aria-label="Etapas do agendamento">
          {stepLabels.map((label, index) => {
            const number = index + 1
            const available = canVisitStep(number)
            return <button
              type="button"
              key={label}
              className={`${number === progress ? 'is-current' : ''} ${number < progress ? 'is-complete' : ''}`}
              disabled={!available}
              aria-current={number === progress ? 'step' : undefined}
              aria-label={`${number}. ${label}`}
              onClick={() => available && setStep(number)}
            >
              <span>{String(number).padStart(2, '0')}</span>
              <strong>{label}</strong>
            </button>
          })}
        </nav> : <span className="booking30-complete-label">Reserva concluída</span>}

        {!confirmedAppointment ? <div className="booking30-step-count"><strong>{progress}</strong><span>/ 4</span></div> : null}
      </header>

      {!confirmedAppointment ? <div className="booking30-body">
        <section className="booking30-workspace">
          <div className="booking30-kicker"><span>{stepLabel}</span><i /></div>
          <div className="booking30-heading">
            <h1>{step === 1 ? 'Qual cuidado você quer hoje?' : step === 2 ? 'Quando fica melhor para você?' : step === 3 ? 'Escolha o seu horário.' : 'Últimos detalhes.'}</h1>
            <p>{step === 1 ? 'Escolha o atendimento e veja os horários disponíveis.' : step === 2 ? 'Selecione um dia disponível na agenda.' : step === 3 ? 'Estes horários estão livres agora.' : 'Seu nome e WhatsApp bastam para reservar.'}</p>
          </div>

          {step < 4 && summary.length ? <div className="booking30-mobile-summary">
            {summary.map((item) => <span key={item.label}><small>{item.label}</small><strong>{item.value}</strong></span>)}
          </div> : null}

          <div className="booking30-content">
            {step === 1 ? <div className="booking30-services">
              {services.map((service, index) => <button type="button" key={service.id} className="booking30-service" onClick={() => { setSelectedServiceId(service.id); setSelectedDate(''); setSelectedTime(null); setStep(2) }}>
                <div className="booking30-service-photo"><img src={service.coverUrl || bundledServiceCover(service.name)} alt="" onError={(e) => { e.currentTarget.src = '/placeholders/service-placeholder.webp' }} /><span className="booking30-service-index">{String(index + 1).padStart(2, '0')}</span></div>
                <div className="booking30-service-copy"><strong>{service.name}</strong><span>{service.durationMinutes} min</span></div>
                <div className="booking30-service-price"><strong>{money(service.priceCents)}</strong><span aria-hidden="true">↗</span></div>
              </button>)}
              {!services.length ? <EmptyState image="/empty-states/empty-calendar.png" title="Nenhum serviço disponível" description="Este espaço ainda não publicou serviços para agendamento." /> : null}
            </div> : null}

            {step === 2 ? <div className="booking30-date"><DateScroller value={selectedDate} min={dateLimits.min} max={dateLimits.max} onChange={(value) => { setSelectedDate(value); setSelectedTime(null); setStep(3) }} getDateStatus={dateStatusFor} /></div> : null}

            {step === 3 ? <div className="booking30-times">
              {availableTimeSlots.length ? <>
                <div className="booking30-time-grid booking30-time-grid-desktop">{availableTimeSlots.map((slot) => <button type="button" key={slot.time} onClick={() => { setSelectedTime(slot.time); setStep(4) }}><span>{slot.time}</span><small>disponível</small></button>)}</div>
                <div className="booking30-mobile-time-groups">{mobileTimeGroups.map((group) => <section key={group.label}><header><strong>{group.label}</strong><span>{group.hint}</span></header><div>{group.slots.map((slot) => <button type="button" key={slot.time} onClick={() => { setSelectedTime(slot.time); setStep(4) }}>{slot.time}<ArrowRight size={14} /></button>)}</div></section>)}</div>
              </> : <div className="booking30-empty-time"><Clock size={22} /><strong>Nenhum horário livre por aqui.</strong><p>Escolha outro dia e continuamos.</p><button type="button" onClick={() => setStep(2)}>Trocar a data</button></div>}
            </div> : null}

            {step === 4 ? <div className="booking30-confirm">
              <div className="booking30-mobile-review">
                <img src={sideImage} alt="" onError={(e) => { e.currentTarget.src = '/placeholders/service-placeholder.webp' }} />
                <div><small>Seu horário</small><strong>{selectedService?.name}</strong><span>{selectedDate ? formatYmdPtBr(selectedDate) : ''} · {selectedTime}</span></div>
                <b>{selectedService ? money(selectedService.priceCents) : ''}</b>
              </div>

              <div className="booking30-fields">
                <label><span>Seu nome</span><input value={clientName} onChange={(e) => { setClientName(e.target.value); setActionError(null) }} placeholder="Como podemos chamar você?" autoComplete="name" /></label>
                <label><span>WhatsApp</span><input value={clientPhone} onChange={(e) => { setClientPhone(formatBrazilPhoneInput(e.target.value)); setActionError(null) }} placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" maxLength={20} /></label>
              </div>

              <div className="booking30-meta-row">
                <p className="booking30-privacy"><ShieldCheck size={15} /> Número usado para identificar e confirmar a reserva.</p>
                <div className={`booking30-consent ${marketingOptIn ? 'is-checked' : ''}`}>
                  <label>
                    <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} />
                    <span>Receber novidades, horários especiais e ofertas</span>
                  </label>
                  <button type="button" aria-expanded={marketingDetailsOpen} onClick={() => setMarketingDetailsOpen((value) => !value)}>{marketingDetailsOpen ? 'Fechar' : 'Ler mais'}</button>
                </div>
              </div>
              {marketingDetailsOpen ? <p className="booking30-consent-detail">Opcional. Você autoriza este espaço a enviar promoções pelo WhatsApp. Isso não muda seu agendamento e pode ser desativado a qualquer momento em Meus horários ou respondendo SAIR. Consulte a <a href="/privacidade#marketing-whatsapp" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</p> : null}

              {actionError ? <div className="booking30-action-error">{actionError}</div> : null}
              <button type="button" className="booking30-confirm-button" onClick={confirmBooking} disabled={saving}>
                <span>{saving ? 'Reservando…' : `Reservar${selectedTime ? ` às ${selectedTime}` : ''}`}</span>
                <i><ArrowRight size={17} /></i>
              </button>
            </div> : null}
          </div>
        </section>

        <aside className="booking30-dossier" aria-label="Resumo da reserva">
          <div className="booking30-dossier-head"><span>Sua reserva</span><small>{progress < 4 ? 'Atualiza enquanto você escolhe' : 'Confira antes de reservar'}</small></div>
          <div className={`booking30-dossier-photo ${selectedService ? 'has-service' : ''}`}>
            <img src={sideImage} alt="" aria-hidden="true" onError={(e) => { e.currentTarget.src = '/landing/result-640.webp' }} />
            <div><small>{selectedService ? 'Serviço escolhido' : 'Seu momento'}</small><strong>{selectedService?.name || 'Um horário só seu.'}</strong></div>
          </div>
          <dl className="booking30-dossier-list">
            <div><dt>Serviço</dt><dd>{selectedService?.name || <em>A escolher</em>}</dd></div>
            <div><dt>Data</dt><dd>{selectedDate ? formatYmdPtBr(selectedDate) : <em>A escolher</em>}</dd></div>
            <div><dt>Horário</dt><dd>{selectedTime || <em>A escolher</em>}</dd></div>
            {selectedService ? <div className="is-total"><dt>Valor</dt><dd>{money(selectedService.priceCents)}</dd></div> : null}
          </dl>
          <div className="booking30-dossier-note"><span aria-hidden="true">✦</span><p><strong>Sem senha e sem cadastro complicado.</strong><br />Seu WhatsApp dá acesso aos seus horários.</p></div>
        </aside>
      </div> : <div className="booking30-success">
        <div className="booking30-success-copy">
          <span>Agendamento realizado</span>
          <h1>Seu horário está reservado, {clientName.split(' ')[0] || 'pronto'}.</h1>
          <p>{selectedService?.name} · {selectedDate ? formatYmdPtBr(selectedDate) : ''} · {selectedTime}</p>
          <small className="booking30-success-confirmation">Mais perto do atendimento, você recebe a confirmação pelo WhatsApp e responde por lá.</small>
          <div><button type="button" onClick={() => nav(withBasePath(basePath, '/cliente'))}>Ver meus horários <ArrowRight size={16} /></button><button type="button" onClick={resetBooking}>Fazer outra reserva</button></div>
        </div>
        <figure className="booking30-success-photo"><img src={sideImage} alt="" /></figure>
      </div>}

      {!confirmedAppointment ? <footer className="booking30-footer">
        <button type="button" onClick={() => step === 1 ? nav(withBasePath(basePath, '/')) : setStep((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> {step === 1 ? 'Voltar ao espaço' : 'Voltar'}</button>
        <span>Reserva online · atendimento continua humano</span>
      </footer> : null}
    </div>
  </main>

}

function ClientPortal(props: { tenant?: TenantPublic; tenantSlug?: string; basePath?: string } = {}) {
    const { tenantSlug } = useParams()
    const nav = useNavigate()
    const slug = (props.tenantSlug ?? tenantSlug ?? '').trim().toLowerCase()
    const basePath = props.basePath ?? (slug ? `/${slug}` : '')
    const [me, setMe] = useState<SessionUser | null>(null)
    const [authLoading, setAuthLoading] = useState(true)
    const [appointments, setAppointments] = useState<ClientAppointment[]>([])
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
            applyTenantTheme(res.data.tenant)
        })
        api<{ timezone: string }>(slug ? `/api/public/tenant/${encodeURIComponent(slug)}/booking` : '/api/public/booking').then((res) => {
            if (res.ok && res.data?.timezone) setTenantTimeZone(res.data.timezone)
        })
    }, [slug, props.tenant])

    useEffect(() => {
        if (!me) return
        api<{appointments: ClientAppointment[]}>('/api/client/appointments').then(res => {
            if(res.ok) setAppointments(res.data.appointments)
        })
        api<{preferences: { whatsappPromotions: boolean }}>('/api/client/marketing-preferences').then(res => {
            if(res.ok) setMarketingPreferences(res.data.preferences)
        })
    }, [me])

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
            if (!normalizeBrazilPhone(accessPhone)) { setAccessError('Informe um WhatsApp brasileiro válido, com DDD.'); return }
            setAccessBusy(true); setAccessError(null)
            const res = await api<{ sent: true }>('/api/public/client-access/request', { method: 'POST', body: JSON.stringify({ tenantSlug: slug, phone: normalizeBrazilPhone(accessPhone) ?? accessPhone }) })
            setAccessBusy(false)
            if (!res.ok) { setAccessError(res.error.message); return }
            setAccessStage('code')
        }
        async function verifyAccess() {
            if (!/^\d{6}$/.test(accessCode.trim())) { setAccessError('Digite o código de 6 números enviado no WhatsApp.'); return }
            setAccessBusy(true); setAccessError(null)
            const res = await api<{ user: SessionUser }>('/api/public/client-access/verify', { method: 'POST', body: JSON.stringify({ tenantSlug: slug, phone: normalizeBrazilPhone(accessPhone) ?? accessPhone, code: accessCode.trim() }) })
            setAccessBusy(false)
            if (!res.ok) { setAccessError(res.error.message); return }
            setMe(res.data.user)
        }
        return (
            <main className="client25-access">
              <section className="client25-access-card">
                <button type="button" className="client25-back" onClick={() => nav(withBasePath(basePath, '/'))}><ChevronLeft size={17}/> Voltar</button>
                <div className="client25-access-brand"><span><Smartphone size={20}/></span><div><strong>Meus horários</strong><small>{props.tenant?.name ?? 'Lash Designer'}</small></div></div>
                <div className="client25-access-copy"><span>Acesso simples</span><h1>{accessStage === 'phone' ? 'Entre com seu WhatsApp.' : 'Confira seu WhatsApp.'}</h1><p>{accessStage === 'phone' ? 'Sem e-mail e sem senha. Em um aparelho novo, confirmamos que o número é seu.' : 'Enviamos um código de 6 números. Ele expira em poucos minutos.'}</p></div>
                {accessStage === 'phone' ? <label className="client25-field"><span>WhatsApp com DDD</span><input value={accessPhone} onChange={(e) => { setAccessPhone(formatBrazilPhoneInput(e.target.value)); setAccessError(null) }} placeholder="(11) 99999-9999 ou +55…" inputMode="tel" autoComplete="tel" maxLength={20} autoFocus /></label> : <label className="client25-field"><span>Código de acesso</span><input value={accessCode} onChange={(e) => { setAccessCode(e.target.value.replace(/\D/g,'').slice(0,6)); setAccessError(null) }} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" autoFocus /></label>}
                {accessError ? <div className="client25-access-error">{accessError}</div> : null}
                <button type="button" className="client25-access-submit" disabled={accessBusy} onClick={accessStage === 'phone' ? requestAccess : verifyAccess}>{accessBusy ? 'Aguarde…' : accessStage === 'phone' ? 'Continuar pelo WhatsApp' : 'Entrar nos meus horários'} <ArrowRight size={17}/></button>
                {accessStage === 'code' ? <div className="client25-access-secondary"><button type="button" className="client25-change-phone" disabled={accessBusy} onClick={requestAccess}>Reenviar código</button><span aria-hidden="true">·</span><button type="button" className="client25-change-phone" onClick={() => { setAccessStage('phone'); setAccessCode(''); setAccessError(null) }}>Usar outro número</button></div> : null}
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
                                            <td style={{fontWeight: 600, paddingLeft: 24}}>{a.serviceName}</td>
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
            </div>
            {marketingPreferences ? <section className="client27-comms" aria-label="Preferências de comunicação">
                <div><span>Comunicação</span><strong>Novidades no WhatsApp</strong><small>{marketingPreferences.whatsappPromotions ? 'Você autorizou ofertas e novidades.' : 'Promoções desativadas.'}</small></div>
                <button type="button" disabled={marketingBusy} onClick={() => void updateMarketingPreference(!marketingPreferences.whatsappPromotions)}>{marketingBusy ? 'Salvando…' : marketingPreferences.whatsappPromotions ? 'Desativar' : 'Ativar'}</button>
                {marketingError ? <p role="alert">{marketingError}</p> : null}
            </section> : null}
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
    return (
      <div className="authContainer">
        <div className="authCard skeleton skeleton-card" style={{height: 260}} />
      </div>
    )
  }

  if (!me) return props.loginElement

  if (props.renderWhenAuthenticated) {
    return <>{props.renderWhenAuthenticated(me)}</>
  }

  const next = me.role === 'CLIENT' ? '/cliente' : '/admin'
  return <Navigate to={next} replace />
}

function NewTransactionModal({ isOpen, onClose, onSuccess, todayYmd }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; todayYmd: string }) {
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayYmd)


  useEffect(() => {
    if (isOpen) setDate(todayYmd)
  }, [isOpen, todayYmd])


  function handleAmountChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.replace(/\D/g, '')
    if (!value) {
      setAmount('')
      return
    }
    const numberValue = Number(value) / 100
    setAmount(numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const parsedAmount = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100)
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        notify('Informe um valor maior que zero.', 'warning')
        setLoading(false)
        return
      }

      const res = await api('/api/admin/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type,
          amountCents: parsedAmount,
          method: method.trim() || undefined,
          note: note.trim() || undefined,
          date
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
      setDate(todayYmd)
    } catch (err) {
      console.error(err)
      notify('Erro ao salvar movimentação: ' + (err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <ModalRoot className="modal-overlay" onClick={onClose}>
      <div className="ld-dialog finance36-dialog finance40-transaction-dialog" role="dialog" aria-modal="true" aria-labelledby="transaction-dialog-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="finance40-dialog-kicker">Financeiro</span>
            <h3 id="transaction-dialog-title" className="modal-title">Nova movimentação</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body finance40-transaction-form">
            <div className="finance40-form-stack">
                <div className="finance40-form-grid">
                    <div className="input-group">
                        <label className="label">Tipo</label>
                        <ProductSelect
                            value={type}
                            onChange={(next) => setType(next as 'INCOME' | 'EXPENSE')}
                            ariaLabel="Tipo da movimentação"
                            options={[
                                { value: 'INCOME', label: 'Receita (Entrada)' },
                                { value: 'EXPENSE', label: 'Despesa (Saída)' },
                            ]}
                        />
                    </div>
                    <div className="input-group">
                        <label className="label">Data</label>
                        <input
                            className="input finance40-control"
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
                    <input className="input finance40-control" inputMode="decimal" autoComplete="off" value={amount} onChange={handleAmountChange} placeholder="0,00" required />
                </div>
                <div className="input-group">
                    <label className="label">Categoria ou método</label>
                    <input className="input finance40-control" value={method} onChange={e => setMethod(e.target.value)} placeholder="Ex.: Pix, aluguel, produtos" />
                </div>
                <div className="input-group">
                    <label className="label">Descrição <span className="text-muted">(opcional)</span></label>
                    <textarea className="input finance40-control finance40-textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Detalhes da movimentação" rows={3} />
                </div>
            </div>
            <div className="modal-footer finance40-dialog-footer">
                <button type="button" className="btn" data-modal-close onClick={onClose}>Cancelar</button>
                <button type="submit" className="btn btnPrimary" disabled={loading}>
                    {loading ? 'Salvando…' : 'Salvar movimentação'}
                </button>
            </div>
        </form>
      </div>
    </ModalRoot>
  )
}

function ExtractModal({ isOpen, onClose, todayYmd, currentMonthYm, timeZone }: { isOpen: boolean; onClose: () => void; todayYmd: string; currentMonthYm: string; timeZone: string }) {
  const [loading, setLoading] = useState(false)
  type FinanceTransactionRow = {
    id: string
    date: string
    description: string | null
    category: string | null
    type: 'INCOME' | 'EXPENSE'
    amountCents: number
    status: string
  }
  const [transactions, setTransactions] = useState<FinanceTransactionRow[]>([])
  const [start, setStart] = useState(() => `${currentMonthYm}-01`)
  const [end, setEnd] = useState(todayYmd)
  const [type, setType] = useState('all')

  useEffect(() => {
      if (!isOpen) return
      setStart(`${currentMonthYm}-01`)
      setEnd(todayYmd)
  }, [isOpen, currentMonthYm, todayYmd])

  useEffect(() => {
      if (isOpen) load()
  }, [isOpen, start, end, type])

  async function load() {
      setLoading(true)
      try {
          const res = await api<{ transactions: FinanceTransactionRow[] }>(
            `/api/admin/finance/extract?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&type=${encodeURIComponent(type)}`,
          )
          if (res.ok) setTransactions(res.data.transactions)
      } catch (err) {
          console.error(err)
      } finally {
          setLoading(false)
      }
  }

  function handleExport() {
      if (transactions.length === 0) return

      const csvCell = (value: unknown) => {
          let text = String(value ?? '')
          if (/^[=+\-@]/.test(text)) text = `'${text}`
          return `"${text.replace(/"/g, '""')}"`
      }

      const csvContent = [
          ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor', 'Status'],
          ...transactions.map(t => [
              new Intl.DateTimeFormat('pt-BR', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(t.date)),
              t.description || '-',
              t.category || '-',
              t.type === 'INCOME' ? 'Entrada' : 'Saída',
              (t.amountCents / 100).toFixed(2).replace('.', ','),
              t.status
          ])
      ].map(row => row.map(csvCell).join(';')).join('\n')

      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `extrato_${start}_${end}.csv`
      link.click()
      URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  return (
    <ModalRoot className="modal-overlay" onClick={onClose}>
      <div className="ld-dialog finance36-dialog finance36-dialog-wide finance40-extract-dialog" role="dialog" aria-modal="true" aria-labelledby="statement-dialog-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div><span className="finance40-dialog-kicker">Financeiro</span><h3 id="statement-dialog-title" className="modal-title">Extrato financeiro</h3></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button>
        </div>
        <div className="modal-body">
            <div className="finance40-extract-filters">
                <div className="input-group">
                    <label className="label">Início</label>
                    <input className="input finance40-control is-compact" type="date" value={start} onChange={e => setStart(e.target.value)} />
                </div>
                <div className="input-group">
                    <label className="label">Fim</label>
                    <input className="input finance40-control is-compact" type="date" value={end} onChange={e => setEnd(e.target.value)} />
                </div>
                <div className="input-group">
                    <label className="label">Tipo</label>
                    <ProductSelect
                        value={type}
                        onChange={setType}
                        ariaLabel="Filtrar extrato por tipo"
                        size="compact"
                        options={[
                            { value: 'all', label: 'Todos' },
                            { value: 'income', label: 'Entradas' },
                            { value: 'expense', label: 'Saídas' },
                        ]}
                    />
                </div>
                <button type="button" className="btn finance40-export-btn" onClick={handleExport} disabled={transactions.length === 0}>
                    <Download size={15} /> Exportar CSV
                </button>
            </div>

            <div className="table-scroll finance40-extract-table">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Descrição</th>
                            <th>Categoria</th>
                            <th className="finance40-align-right">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="finance40-loading-cell">
                                    <div className="skeleton skeleton-text finance40-loading-line" />
                                </td>
                            </tr>
                        ) : transactions.length === 0 ? (
                            <tr><td colSpan={4}><EmptyState compact image="/empty-states/empty-finance.png" title="Nenhum registro financeiro" /></td></tr>
                        ) : transactions.map(t => (
                            <tr key={t.id}>
                                <td className="finance40-date-cell">{new Date(t.date).toLocaleDateString('pt-BR')} <span>{new Date(t.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span></td>
                                <td className="finance40-description-cell">{t.description || 'Sem descrição'}</td>
                                <td><span className="pill">{t.category || '—'}</span></td>
                                <td className={`finance40-value-cell ${t.type === 'INCOME' ? 'is-income' : 'is-expense'}`}>
                                    {t.type === 'INCOME' ? '+' : '-'}{formatBRL(t.amountCents / 100)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </ModalRoot>
  )
}

function GoalsModal({ isOpen, onClose, onSuccess, initialRevenue, initialNewClients }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; initialRevenue: number; initialNewClients: number }) {
    const [loading, setLoading] = useState(false)
    const [revenue, setRevenue] = useState(String(initialRevenue / 100))
    const [newClients, setNewClients] = useState(String(initialNewClients))

    async function handleSubmit(e: FormEvent) {
        e.preventDefault()
        setLoading(true)
        try {
            const revenueGoalCents = Math.round(Number(revenue.replace(',', '.')) * 100)
            const newClientsGoal = Number(newClients)
            if (!Number.isFinite(revenueGoalCents) || revenueGoalCents < 0 || !Number.isInteger(newClientsGoal) || newClientsGoal < 0) {
                throw new Error('Informe metas válidas e não negativas.')
            }
            const res = await api('/api/admin/finance/goals', {
                method: 'PATCH',
                body: JSON.stringify({ revenueGoalCents, newClientsGoal })
            })
            if (!res.ok) throw new Error(res.error?.message || 'Não foi possível salvar as metas.')
            onSuccess()
            onClose()
        } catch (err) {
            console.error(err)
            notify((err as Error).message || 'Erro ao salvar metas', 'error')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <ModalRoot className="modal-overlay" onClick={onClose}>
            <div className="ld-dialog finance36-dialog" role="dialog" aria-modal="true" aria-labelledby="goals-dialog-title" style={{maxWidth: 400}} onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h3 id="goals-dialog-title" className="modal-title">Definir Metas do Mês</h3>
                    <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar janela"><X size={20} /></button>
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
                        <button type="button" className="btn" data-modal-close onClick={onClose}>Cancelar</button>
                        <button type="submit" className="btn btnPrimary" disabled={loading}>
                            {loading ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </ModalRoot>
    )
}

export default function App() {
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
      <Routes>
        <Route path="/" element={<RootEntry loginElement={<UnifiedLogin isDevHost />} renderWhenAuthenticated={() => <Dev />} />} />
        <Route path="/dev" element={<Dev />} />
        <Route path="/login" element={<UnifiedLogin isDevHost />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/termos" element={<LegalPage kind="terms" />} />
        <Route path="/privacidade" element={<LegalPage kind="privacy" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  if (hostTenant === undefined) {
    return (
      <div className="container" style={{paddingTop: 80}}>
        <div className="card skeleton skeleton-card" style={{maxWidth: 480, margin: '0 auto', height: 160}} />
      </div>
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
