import { TenantBrand } from '../components/TenantBrand'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SessionUser, TenantPublic } from '../types'
import { ProductTour, shouldAutoStartTour, type ProductTourStep } from '../components/ProductTour'
import { useSupportNotifications } from '../features/support/useSupportNotifications'
import '../features/support/support.css'
import { NotificationsModal } from '../components/NotificationsModal'
import { Bell, ChevronRight, Compass, Menu, MoreHorizontal, SidebarSimple, Search, X } from '../components/Icons'

export function Shell(props: {
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
  brand?: Pick<TenantPublic, 'name' | 'logoUrl' | 'logoLayout' | 'logoSize'> | null
  mobileNav?: Array<{ key: string; label: string; icon: ReactNode; active: boolean; onClick: () => void }>
  mobileMoreActive?: boolean
}) {
  const supportUnread = useSupportNotifications(props.user)
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
          <TenantBrand brand={props.brand} className="tenant-brand-sidebar" />
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
              <TenantBrand brand={props.brand} className="tenant-brand-mobile" />
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

            <button type="button" className="icon-btn" data-tour="notifications" style={{position: 'relative', border: 'none', background: 'transparent'}} onClick={() => setShowNotifications(!showNotifications)} aria-label={supportUnread ? `Abrir notificações, ${supportUnread} de suporte não lidas` : 'Abrir notificações'} aria-expanded={showNotifications}>
              <Bell size={20} />
              {supportUnread > 0 ? <span className="support-notification-count" aria-hidden="true">{supportUnread > 99 ? '99+' : supportUnread}</span> : null}
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

