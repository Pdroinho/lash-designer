import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { api } from './api'
import type { SessionUser, TenantDev, TenantPublic } from './types'
import { applyTenantTheme, setAppMode } from './theme'
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
  ChevronRight,
  Chrome,
  Image as ImageIcon,
  Check,
  ShieldCheck
} from 'lucide-react'

function withBasePath(basePath: string, path: string) {
  const p = path.startsWith('/') ? path : `/${path}`
  if (!basePath) return p
  return `${basePath}${p}`
}

type CssVarStyle = CSSProperties & { ['--auth-accent']?: string }

type AdminStats = {
  today?: {
    appointmentsCount?: number
    expectedRevenueCents?: number
  }
}

type AdminService = {
  id: string
  name: string
  durationMinutes: number
  priceCents: number
}

type ClientAppointment = {
  id: string
  serviceName: string
  startsAt: string
  status: string
}

type RegisterClientPayload = {
  name: string
  phone: string
  email: string
  password: string
  tenantSlug?: string
}

function SidebarItem(props: { active?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <div className={`nav-item ${props.active ? 'active' : ''}`} onClick={props.onClick}>
      <span className="nav-icon">{props.icon}</span>
      <span className="nav-label-text">{props.label}</span>
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
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

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
          <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
            <button className="icon-btn mobile-toggle" style={{display: 'none'}} onClick={() => setMobileOpen(true)}>
              <Menu size={20} />
            </button>
            <div style={{display: 'flex', flexDirection: 'column'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase'}}>
                <span>Lash Space</span>
                <ChevronRight size={12}/>
                <span style={{color: 'var(--primary-600)'}}>{props.title}</span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            {props.actions}
            
            <div className="search-trigger" style={{
                display: 'flex', 
                alignItems: 'center', 
                gap: 10, 
                padding: '8px 16px', 
                background: 'white', 
                border: '1px solid var(--border)', 
                borderRadius: '99px',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s',
                width: 240
            }}
            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary-300)'}
            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
                <Search size={14} />
                <span style={{flex: 1}}>Buscar...</span>
                <span style={{fontSize: '0.7rem', background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4, color: 'var(--gray-500)'}}>⌘K</span>
            </div>
            
            <div className="icon-btn" style={{position: 'relative', border: 'none', background: 'transparent'}}>
              <Bell size={20} />
              <div style={{position: 'absolute', top: 8, right: 8, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', border: '2px solid white'}} />
            </div>

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
    </div>
  )
}

// --- Admin Components ---

function AdminDashboard({ me, stats, tenantSlug }: { me: SessionUser | null; stats: AdminStats | null; tenantSlug: string }) {
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Bom dia'
    if (hour < 18) return 'Boa tarde'
    return 'Boa noite'
  }, [])

  const bookingLink = typeof window !== 'undefined' ? `${window.location.protocol}//${tenantSlug}.${window.location.host.replace('www.', '')}/agendar` : ''

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
            <div className="value">12</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock size={24} /></div>
          <div className="stat-info">
            <h4>Pendentes</h4>
            <div className="value">3</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns: '2fr 1fr', gap: '2rem'}}>
        <div className="data-table-container">
          <div className="table-header">
            <div className="table-title">Próximos Agendamentos</div>
            <button className="btn btn-ghost" style={{fontSize: '0.85rem'}}>Ver todos</button>
          </div>
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
              {/* Mock Data for Surprise Factor */}
              <tr>
                <td>
                  <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                    <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem'}}>MJ</div>
                    <span style={{fontWeight: 500}}>Maria Julia</span>
                  </div>
                </td>
                <td>Cílios Volume Russo</td>
                <td>14:00</td>
                <td><span className="status-badge status-success">Confirmado</span></td>
                <td><button className="icon-btn" style={{width: 32, height: 32}}><MoreHorizontal size={16}/></button></td>
              </tr>
              <tr>
                <td>
                  <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                    <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1'}}>AS</div>
                    <span style={{fontWeight: 500}}>Ana Silva</span>
                  </div>
                </td>
                <td>Design de Sobrancelha</td>
                <td>15:30</td>
                <td><span className="status-badge status-pending">Pendente</span></td>
                <td><button className="icon-btn" style={{width: 32, height: 32}}><MoreHorizontal size={16}/></button></td>
              </tr>
              <tr>
                <td>
                  <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                    <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem', background: '#fef3c7', color: '#b45309'}}>CP</div>
                    <span style={{fontWeight: 500}}>Carla Perez</span>
                  </div>
                </td>
                <td>Manutenção</td>
                <td>16:45</td>
                <td><span className="status-badge status-success">Confirmado</span></td>
                <td><button className="icon-btn" style={{width: 32, height: 32}}><MoreHorizontal size={16}/></button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="column" style={{gap: '1.5rem'}}>
            <div className="card" style={{padding: 0, overflow: 'hidden'}}>
            <div className="cardHeader">
                <h3 className="cardTitle" style={{fontSize: '1rem'}}>Link de Agendamento</h3>
            </div>
            <div style={{padding: '0 1.5rem 1.5rem'}}>
                <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12}}>
                    Envie este link para suas clientes agendarem:
                </p>
                <div style={{background: 'var(--bg-subtle)', padding: 10, borderRadius: 'var(--radius-md)', fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: 10}}>
                    {bookingLink}
                </div>
                <button className="btn btnPrimary w-full" onClick={() => window.open(bookingLink, '_blank')}>Abrir Link</button>
            </div>
            </div>

            <div className="card" style={{padding: 0, overflow: 'hidden'}}>
            <div className="cardHeader">
                <h3 className="cardTitle" style={{fontSize: '1rem'}}>Atividade Recente</h3>
            </div>
            <div style={{padding: '0 1.5rem 1.5rem'}}>
                <div style={{display: 'flex', gap: 12, marginBottom: 16}}>
                <div style={{width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', marginTop: 6}} />
                <div>
                    <div style={{fontSize: '0.9rem', fontWeight: 500}}>Pagamento recebido</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Maria Julia pagou R$ 120,00</div>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4}}>Há 10 min</div>
                </div>
                </div>
                <div style={{display: 'flex', gap: 12, marginBottom: 16}}>
                <div style={{width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', marginTop: 6}} />
                <div>
                    <div style={{fontSize: '0.9rem', fontWeight: 500}}>Novo Agendamento</div>
                    <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Ana Silva agendou Design</div>
                    <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4}}>Há 32 min</div>
                </div>
                </div>
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
    const [newService, setNewService] = useState({ name: '', duration: 60, price: 0 })
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        load()
    }, [])

    async function load() {
        setLoading(true)
        const res = await api<{services: AdminService[]}>('/api/admin/services')
        if(res.ok) setServices(res.data.services)
        setLoading(false)
    }

    async function handleCreate() {
        setSaving(true)
        await api('/api/admin/services', {
            method: 'POST',
            body: JSON.stringify({
                name: newService.name,
                durationMinutes: Number(newService.duration),
                priceCents: Number(newService.price) * 100
            })
        })
        setSaving(false)
        setModalOpen(false)
        load()
    }

    return (
        <div className="card">
            <div className="cardHeader" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>
                    <h2 className="cardTitle">Serviços</h2>
                    <p className="cardDesc">Gerencie os serviços oferecidos no seu espaço.</p>
                </div>
                <button className="btn btnPrimary" onClick={() => setModalOpen(true)}>
                    <Plus size={16} style={{marginRight: 8}}/> Novo Serviço
                </button>
            </div>

            {loading ? <div style={{padding: 20}}>Carregando...</div> : (
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
                                <td style={{fontWeight: 500}}>{s.name}</td>
                                <td>{s.durationMinutes} min</td>
                                <td>R$ {(s.priceCents/100).toFixed(2)}</td>
                                <td>
                                    <button className="icon-btn"><Edit2 size={16}/></button>
                                </td>
                            </tr>
                        ))}
                        {services.length === 0 && (
                            <tr><td colSpan={4} style={{textAlign: 'center', padding: 20, color: 'var(--text-muted)'}}>Nenhum serviço cadastrado.</td></tr>
                        )}
                    </tbody>
                </table>
            )}

            {modalOpen && (
                <div className="sidebar-overlay" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                    <div className="card" style={{width: 400, maxWidth: '90%'}} onClick={e => e.stopPropagation()}>
                        <div className="cardHeader"><h3 className="cardTitle">Novo Serviço</h3></div>
                        <div className="cardBody">
                            <div className="input-group">
                                <label className="label">Nome do Serviço</label>
                                <input className="input" value={newService.name} onChange={e => setNewService({...newService, name: e.target.value})} placeholder="Ex: Cílios Volume Russo" />
                            </div>
                            <div className="row">
                                <div className="input-group">
                                    <label className="label">Duração (min)</label>
                                    <input className="input" type="number" value={newService.duration} onChange={e => setNewService({...newService, duration: Number(e.target.value)})} />
                                </div>
                                <div className="input-group">
                                    <label className="label">Preço (R$)</label>
                                    <input className="input" type="number" value={newService.price} onChange={e => setNewService({...newService, price: Number(e.target.value)})} />
                                </div>
                            </div>
                            <div className="row" style={{marginTop: 20}}>
                                <button className="btn w-full" onClick={() => setModalOpen(false)}>Cancelar</button>
                                <button className="btn btnPrimary w-full" onClick={handleCreate} disabled={saving}>{saving ? 'Salvando...' : 'Criar'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function AdminClients() {
    return (
        <div className="card">
            <div className="cardHeader">
                <h2 className="cardTitle">Clientes</h2>
                <p className="cardDesc">Base de clientes do seu espaço.</p>
            </div>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Telefone</th>
                        <th>Última Visita</th>
                        <th>Total Gasto</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                             <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                                <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem'}}>MJ</div>
                                <span style={{fontWeight: 500}}>Maria Julia</span>
                            </div>
                        </td>
                        <td>(11) 99999-9999</td>
                        <td>10/01/2026</td>
                        <td>R$ 450,00</td>
                    </tr>
                    <tr>
                        <td>
                             <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                                <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1'}}>AS</div>
                                <span style={{fontWeight: 500}}>Ana Silva</span>
                            </div>
                        </td>
                        <td>(11) 98888-8888</td>
                        <td>15/01/2026</td>
                        <td>R$ 120,00</td>
                    </tr>
                </tbody>
            </table>
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
  const [tab, setTab] = useState<'dashboard' | 'calendar' | 'services' | 'clients' | 'finance' | 'settings'>('dashboard')

  const [stats, setStats] = useState<AdminStats | null>(null)

  useEffect(() => {
    setAppMode('admin')
    if(props.tenant) {
        setTenant(props.tenant)
        applyTenantTheme(props.tenant)
    }
    api<{ user: SessionUser | null }>('/api/auth/me').then(res => {
        if(res.ok) setMe(res.data.user)
        else {
             // Redirect immediately if not logged in to avoid hanging state
             nav('/login')
             return
        }
        setAuthLoading(false)
    })
    // Mock stats load
    api<AdminStats>('/api/admin/dashboard').then(res => {
        if(res.ok) setStats(res.data)
    })
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
                <SidebarItem active={tab === 'settings'} icon={<Settings size={18}/>} label="Configurações" onClick={() => setTab('settings')} />
                <SidebarItem icon={<LogOut size={18}/>} label="Sair" onClick={async () => {
                     await api('/api/auth/logout', {method: 'POST'})
                     // Force reload to clear all states and re-check auth
                     window.location.href = '/'
                }} />
            </div>
        }
    >
        {tab === 'dashboard' ? <AdminDashboard me={me} stats={stats} tenantSlug={slug} /> : null}
        
        {tab === 'services' ? <AdminServices /> : null}

        {tab === 'clients' ? <AdminClients /> : null}
        
        {/* Placeholders for other tabs */}
        {tab === 'finance' ? (
            <div className="data-table-container">
                <div style={{padding: '2rem', textAlign: 'center', color: 'var(--text-muted)'}}>
                    Módulo Financeiro em desenvolvimento.
                </div>
            </div>
        ) : null}

        {tab === 'calendar' ? (
            <div className="card">
                <div className="cardHeader"><h2 className="cardTitle">Agenda</h2></div>
                <div style={{padding: '3rem', textAlign: 'center', color: 'var(--text-muted)'}}>
                    <Calendar size={48} style={{opacity: 0.2, marginBottom: 16}} />
                    <p>Visualização de calendário em breve.</p>
                </div>
            </div>
        ) : null}

        {tab === 'settings' ? (
            <div className="card">
                 <div className="cardHeader"><h2 className="cardTitle">Configurações</h2></div>
                 <div className="cardBody">
                     <div className="row" style={{marginBottom: 20}}>
                        <div className="input-group" style={{flex: 1}}>
                            <label className="label">Nome do Espaço</label>
                            <input className="input" value={tenant?.name} disabled />
                        </div>
                        <div className="input-group" style={{flex: 1}}>
                            <label className="label">URL (Slug)</label>
                            <input className="input" value={tenant?.slug} disabled />
                        </div>
                     </div>
                     
                     <div className="sectionTitle" style={{fontSize: '1rem', marginTop: 20}}>Aparência</div>
                     <div className="row">
                        <div className="card" style={{padding: 20, flex: 1, textAlign: 'center', cursor: 'pointer', border: '2px solid var(--primary-500)'}}>
                             <div style={{width: 40, height: 40, borderRadius: '50%', background: '#ec4899', margin: '0 auto 10px'}}/>
                             <div style={{fontWeight: 600}}>Rosa (Padrão)</div>
                        </div>
                        <div className="card" style={{padding: 20, flex: 1, textAlign: 'center', cursor: 'pointer', opacity: 0.6}}>
                             <div style={{width: 40, height: 40, borderRadius: '50%', background: '#8b5cf6', margin: '0 auto 10px'}}/>
                             <div style={{fontWeight: 600}}>Roxo</div>
                        </div>
                        <div className="card" style={{padding: 20, flex: 1, textAlign: 'center', cursor: 'pointer', opacity: 0.6}}>
                             <div style={{width: 40, height: 40, borderRadius: '50%', background: '#0ea5e9', margin: '0 auto 10px'}}/>
                             <div style={{fontWeight: 600}}>Azul</div>
                        </div>
                     </div>
                 </div>
            </div>
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
    const [data, setData] = useState({
        name: '',
        slug: '',
        adminEmail: '',
        adminPassword: '',
        primaryColor: '#ec4899', // Pink default
        logoUrl: ''
    })

    if (!isOpen) return null

    async function handleSubmit() {
        setLoading(true)
        try {
            await api('/api/dev/tenants', {
                method: 'POST',
                body: JSON.stringify({
                    name: data.name,
                    slug: data.slug,
                    adminEmail: data.adminEmail,
                    adminPassword: data.adminPassword,
                    theme: {
                        primaryColor: data.primaryColor,
                        logoUrl: data.logoUrl
                    }
                })
            })
            onSuccess()
            onClose()
        } catch {
            alert('Erro ao criar espaço')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="sidebar-overlay" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'}}>
            <div className="card" style={{width: 500, maxWidth: '95%', padding: 0, overflow: 'hidden', boxShadow: '0 20px 50px -12px rgba(0,0,0,0.5)'}}>
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
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="form-stack">
                            <div className="input-group">
                                <label className="label">Cor Principal</label>
                                <div style={{display: 'flex', gap: 12, flexWrap: 'wrap'}}>
                                    {['#ec4899', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#111827'].map(c => (
                                        <div 
                                            key={c}
                                            onClick={() => setData({...data, primaryColor: c})}
                                            style={{
                                                width: 32, 
                                                height: 32, 
                                                borderRadius: '50%', 
                                                background: c, 
                                                cursor: 'pointer',
                                                border: data.primaryColor === c ? '2px solid var(--text-main)' : '2px solid transparent',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'transform 0.2s'
                                            }}
                                        >
                                            {data.primaryColor === c && <Check size={16} color="white" style={{filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))'}}/>}
                                        </div>
                                    ))}
                                    <input 
                                        type="color" 
                                        value={data.primaryColor}
                                        onChange={e => setData({...data, primaryColor: e.target.value})}
                                        style={{width: 32, height: 32, padding: 0, border: 'none', borderRadius: '50%', overflow: 'hidden', cursor: 'pointer'}}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="label">Logo URL (Opcional)</label>
                                <div className="input-wrapper">
                                    <ImageIcon size={16} className="input-icon" />
                                    <input 
                                        className="input has-icon" 
                                        value={data.logoUrl} 
                                        onChange={e => setData({...data, logoUrl: e.target.value})} 
                                        placeholder="https://..." 
                                    />
                                </div>
                            </div>

                            <div className="preview-card" style={{marginTop: 16, padding: 16, borderRadius: 8, background: 'var(--bg-subtle)', border: '1px dashed var(--border)'}}>
                                <div style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, color: 'var(--text-muted)'}}>Preview</div>
                                <button className="btn btnPrimary" style={{background: data.primaryColor, borderColor: data.primaryColor}}>Botão Principal</button>
                            </div>
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
                        <button className="btn btnPrimary" onClick={() => setStep(2)} disabled={!data.name || !data.slug || !data.adminEmail}>
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

function Dev() {
    const nav = useNavigate()
    const [me, setMe] = useState<SessionUser | null>(null)
    const [tenants, setTenants] = useState<TenantDev[]>([])
    const [loading, setLoading] = useState(true)
    const [testMode, setTestMode] = useState(false)
    const [showNew, setShowNew] = useState(false)

    useEffect(() => {
        setAppMode('admin') 
        api<{user: SessionUser}>('/api/auth/me').then(res => {
            if(res.ok) setMe(res.data.user)
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

    if (!me) return <div className="authContainer"><div className="text-center">Carregando Console...</div></div>

    return (
        <Shell
            title="Developer Console"
            subtitle="Gestão da Plataforma"
            user={me}
            actions={
                <div 
                    className="pill" 
                    style={{
                        background: testMode ? '#fef3c7' : 'var(--bg-subtle)', 
                        color: testMode ? '#b45309' : 'var(--text-muted)',
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8,
                        padding: '6px 12px',
                        border: testMode ? '1px solid #fcd34d' : '1px solid var(--border)'
                    }} 
                    onClick={() => setTestMode(!testMode)}
                >
                    <TestTube size={16} />
                    <span style={{fontWeight: 600}}>Test Mode</span>
                    <div style={{
                        width: 32, 
                        height: 18, 
                        background: testMode ? '#f59e0b' : 'var(--gray-300)', 
                        borderRadius: 99, 
                        position: 'relative',
                        transition: 'all 0.2s'
                    }}>
                        <div style={{
                            width: 14, 
                            height: 14, 
                            background: 'white', 
                            borderRadius: '50%', 
                            position: 'absolute', 
                            top: 2, 
                            left: testMode ? 16 : 2,
                            transition: 'all 0.2s'
                        }} />
                    </div>
                </div>
            }
            sidebar={
                <div className="nav-group">
                    <SidebarItem active icon={<LayoutDashboard size={18}/>} label="Tenants" onClick={() => {}} />
                    <SidebarItem icon={<Settings size={18}/>} label="Configurações" onClick={() => {}} />
                    <div className="navDivider" />
                    <SidebarItem icon={<LogOut size={18}/>} label="Sair" onClick={async () => {
                         await api('/api/auth/logout', {method: 'POST'})
                         window.location.href = '/'
                    }} />
                </div>
            }
        >
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
                <div className="cardHeader" style={{display: 'flex', justifyContent: 'space-between'}}>
                    <h2 className="cardTitle">Espaços Cadastrados</h2>
                    <button className="btn btnPrimary" onClick={() => setShowNew(true)}>
                        <Plus size={16} style={{marginRight: 8}}/> Novo Espaço
                    </button>
                </div>
                
                {loading ? <div style={{padding: 20}}>Carregando...</div> : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>URL</th>
                                <th>Status</th>
                                <th>Assinatura</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tenants.map(t => (
                                <tr key={t.id}>
                                    <td>
                                        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                                            <div className="user-avatar-mini" style={{background: 'var(--primary)', color: 'white', fontSize: '0.75rem'}}>
                                                {t.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <span style={{fontWeight: 600}}>{t.name}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <a href={`http://${t.slug}.localhost:5173`} target="_blank" style={{color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4}}>
                                            {t.slug} <ChevronRight size={12}/>
                                        </a>
                                    </td>
                                    <td><span className="status-badge status-success">Ativo</span></td>
                                    <td><span className="pill">Pro</span></td>
                                    <td>
                                        <button className="icon-btn"><Settings size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <NewTenantModal 
                isOpen={showNew} 
                onClose={() => setShowNew(false)} 
                onSuccess={() => {
                    loadTenants()
                }} 
            />
        </Shell>
    )
}

function UnifiedLogin(props: { hostTenant?: TenantPublic | null } = {}) {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isTenant = !!props.hostTenant
  const accent = props.hostTenant?.primaryColor ?? 'var(--primary-600)'
  const brandName = props.hostTenant?.name ?? 'Lash Space'
  const brandHandle = props.hostTenant?.slug ? `@${props.hostTenant.slug}` : 'Agendamentos e gestão'
  const pageStyle: CssVarStyle = { '--auth-accent': accent }

  useEffect(() => {
    setAppMode(isTenant ? 'tenant' : 'public')
    if (props.hostTenant) applyTenantTheme(props.hostTenant)
  }, [props.hostTenant])

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
    const u = res.data.user
    if (u.role === 'DEV') {
        nav('/')
        return
    }
    if (u.role === 'ADMIN') {
        nav('/admin')
        return
    }
    if (u.role === 'CLIENT') {
        nav('/agendar')
        return
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
            <h1 className="authRefTitle">Entrar na sua conta</h1>
            <p className="authRefSubtitle">Acesse o painel e continue de onde parou.</p>

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
                <input
                  className="authRefInput"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
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
                <Chrome size={18} style={{ color: '#4285F4' }} />
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
          </div>
        </div>
      </div>
    </div>
  )
}

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
  const [services, setServices] = useState<Array<{ id: string; name: string; durationMinutes: number; priceCents: number }>>([])
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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPass, setAuthPass] = useState('')
  const [authName, setAuthName] = useState('')
  const [authPhone, setAuthPhone] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

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

  const timesForSelectedDate = useMemo(() => {
    if (!booking || !selectedService || !selectedDate) return []
    const day = new Date(`${selectedDate}T00:00:00`).getDay()
    const ranges = booking.businessHours.filter((h) => h.weekday === day)
    const stepMinutes = Math.max(5, booking.bookingRules.slotStepMinutes)
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
    return times.filter((t) => {
      const dt = new Date(`${selectedDate}T${t}:00`)
      return dt.getTime() >= cutoff.getTime()
    })
  }, [booking, selectedDate, selectedService])

  async function handleAuth() {
    setAuthLoading(true)
    setActionError(null)
    let res
    if (authMode === 'login') {
      res = await api<{ user: SessionUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPass }),
      })
    } else {
      const payload: RegisterClientPayload = { name: authName, phone: authPhone, email: authEmail, password: authPass }
      if (slug) payload.tenantSlug = slug
      res = await api<{ user: SessionUser }>('/api/auth/register-client', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    }
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
    const startsAt = new Date(`${selectedDate}T${selectedTime}:00`)
    const res = await api<{ appointment: { id: string } }>('/api/client/appointments', {
      method: 'POST',
      body: JSON.stringify({ serviceId: selectedService.id, startsAt: startsAt.toISOString() }),
    })
    setSaving(false)
    if (!res.ok) {
      setActionError(res.error.message)
      return
    }
    nav(withBasePath(basePath, '/cliente'))
  }

  const money = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`

  if (loading) {
    return <div className="bookingContainer"><div className="bookingHeader">Carregando...</div></div>
  }

  if (loadError) {
    return <div className="bookingContainer"><div className="bookingHeader">{loadError}</div></div>
  }

  // Steps: 1=Service, 2=Date, 3=Time, 4=Confirm(Auth+Action)
  const totalSteps = 4

  return (
    <div className="bookingContainer">
      <div className="bookingHeader">
        {tenant?.logoUrl ? (
          <img src={tenant.logoUrl} className="bookingLogo" alt="Logo" />
        ) : (
          <div className="bookingLogo">{tenant?.name.substring(0, 2).toUpperCase()}</div>
        )}
        <h1 className="bookingTitle">Agendar</h1>
        <div className="bookingSubtitle">{tenant?.name}</div>
      </div>

      <BookingStepper current={step} total={totalSteps} />

      {step === 1 && (
        <>
          <div className="sectionTitle">Escolha o serviço</div>
          <div className="serviceList">
            {services.map((s) => (
              <div
                key={s.id}
                className={`serviceCard ${selectedServiceId === s.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedServiceId(s.id)
                  setStep(2)
                }}
              >
                <div className="serviceInfo">
                  <h3>{s.name}</h3>
                  <div className="servicePrice">{money(s.priceCents)} • {s.durationMinutes} min</div>
                </div>
              </div>
            ))}
            {services.length === 0 && <div className="pill">Nenhum serviço disponível.</div>}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="sectionTitle">Escolha a data</div>
          <div className="calendarSection">
            <input
              type="date"
              className="dateInput"
              value={selectedDate}
              min={dateLimits.min}
              max={dateLimits.max}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                if (e.target.value) setStep(3)
              }}
            />
            <div className="text-center" style={{ marginTop: 10, color: 'var(--muted)', fontSize: '0.9rem' }}>
              Selecione um dia para ver horários.
            </div>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="sectionTitle">Escolha o horário</div>
          <div className="pill" style={{ margin: '0 1.5rem 1rem' }}>
            {new Date(selectedDate).toLocaleDateString('pt-BR')}
          </div>
          {timesForSelectedDate.length === 0 ? (
            <div className="pill" style={{ margin: '0 1.5rem' }}>Sem horários disponíveis.</div>
          ) : (
            <div className="timeGrid">
              {timesForSelectedDate.map((t) => (
                <button
                  key={t}
                  className={`timeBtn ${selectedTime === t ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedTime(t)
                    setStep(4)
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === 4 && (
        <div style={{ padding: '0 1.5rem 2rem' }}>
          <div className="sectionTitle" style={{ paddingLeft: 0 }}>Confirmação</div>
          
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="cardBody">
              <div className="row">
                <div>
                  <div className="label">Serviço</div>
                  <div style={{ fontWeight: 600 }}>{selectedService?.name}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{money(selectedService?.priceCents ?? 0)}</div>
                </div>
                <div>
                  <div className="label">Data e Hora</div>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(selectedDate).toLocaleDateString('pt-BR')} às {selectedTime}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!me ? (
            <div className="card">
              <div className="cardHeader">
                <div className="cardTitle" style={{ fontSize: '1.1rem' }}>
                  {authMode === 'login' ? 'Identifique-se' : 'Criar conta'}
                </div>
              </div>
              <div className="cardBody">
                <div className="row">
                  {authMode === 'register' && (
                    <>
                      <input className="input" placeholder="Nome" value={authName} onChange={e => setAuthName(e.target.value)} />
                      <input className="input" placeholder="Telefone" value={authPhone} onChange={e => setAuthPhone(e.target.value)} />
                    </>
                  )}
                  <input className="input" placeholder="E-mail" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
                  <input className="input" type="password" placeholder="Senha" value={authPass} onChange={e => setAuthPass(e.target.value)} />
                  
                  {actionError && <div className="pill" style={{ color: 'var(--danger)' }}>{actionError}</div>}
                  
                  <button className="btn btnPrimary" onClick={handleAuth} disabled={authLoading}>
                    {authLoading ? 'Carregando...' : (authMode === 'login' ? 'Entrar' : 'Cadastrar')}
                  </button>
                  
                  <div className="text-center" style={{ fontSize: '0.9rem' }}>
                    {authMode === 'login' ? (
                      <span onClick={() => setAuthMode('register')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                        Não tem conta? Cadastre-se
                      </span>
                    ) : (
                      <span onClick={() => setAuthMode('login')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                        Já tem conta? Entre
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="pill" style={{ marginBottom: 20 }}>
                Logado como {me.email}
              </div>
              {actionError && <div className="pill" style={{ marginBottom: 20, color: 'var(--danger)' }}>{actionError}</div>}
              <button className="btn btnPrimary w-full" style={{ padding: '1rem', fontSize: '1.1rem' }} onClick={confirmBooking} disabled={saving}>
                {saving ? 'Confirmando...' : 'Confirmar Agendamento'}
              </button>
            </>
          )}
        </div>
      )}

      <div className="bottomBar">
        {step > 1 && (
          <button className="btn" style={{ flex: 1 }} onClick={() => setStep(step - 1)}>
            Voltar
          </button>
        )}
        {step === 1 && (
          <button className="btn" style={{ flex: 1 }} onClick={() => nav(withBasePath(basePath, '/'))}>
            Cancelar
          </button>
        )}
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
        api<{ user: SessionUser | null }>('/api/auth/me').then(res => {
            if(res.ok) setMe(res.data.user)
            setAuthLoading(false)
        })
    }, [])

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
                <div className="cardBody">
                    <div className="list">
                        {appointments.length === 0 ? <div className="text-center text-muted">Nenhum agendamento.</div> : null}
                        {appointments.map(a => (
                            <div className="listItem" key={a.id}>
                                <div className="listItemTitle">{a.serviceName}</div>
                                <div className="listItemMeta">{new Date(a.startsAt).toLocaleString()} · {a.status}</div>
                            </div>
                        ))}
                    </div>
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

export default function App() {
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : ''
  const isDevHost = host.startsWith('dev.') || host.endsWith('.dev') || host.includes('.dev.')
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
        <Route path="/" element={<Dev />} />
        <Route path="/login" element={<UnifiedLogin />} />
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
      <Route path="/" element={<UnifiedLogin hostTenant={hostTenant} />} />
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
