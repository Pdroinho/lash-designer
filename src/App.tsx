import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api } from './api'
import type { SessionUser, TenantDev, TenantPublic, CalendarEvent } from './types'
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
  EyeOff
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
            
            <div className="search-trigger">
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

      <div className="grid" style={{gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start'}}>
        <div className="column" style={{gap: '2rem'}}>
        <div className="card">
          <div className="cardHeader">
            <h3 className="cardTitle">Próximos Agendamentos</h3>
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
                  <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem'}}>MJ</div>
                    <span style={{fontWeight: 600}}>Maria Julia</span>
                  </div>
                </td>
                <td>Cílios Volume Russo</td>
                <td>14:00</td>
                <td><span className="status-badge status-success">Confirmado</span></td>
                <td><button className="icon-btn" style={{width: 32, height: 32}}><MoreHorizontal size={16}/></button></td>
              </tr>
              <tr>
                <td>
                  <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1'}}>AS</div>
                    <span style={{fontWeight: 600}}>Ana Silva</span>
                  </div>
                </td>
                <td>Design de Sobrancelha</td>
                <td>15:30</td>
                <td><span className="status-badge status-pending">Pendente</span></td>
                <td><button className="icon-btn" style={{width: 32, height: 32}}><MoreHorizontal size={16}/></button></td>
              </tr>
              <tr>
                <td>
                  <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                    <div className="user-avatar-mini" style={{width: 32, height: 32, fontSize: '0.75rem', background: '#fef3c7', color: '#b45309'}}>CP</div>
                    <span style={{fontWeight: 600}}>Carla Perez</span>
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
        
        <div className="card">
            <div className="cardHeader">
                <h3 className="cardTitle" style={{fontSize: '1rem'}}>Link de Agendamento</h3>
            </div>
            <div className="cardBody">
                <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12}}>
                    Envie este link para suas clientes agendarem:
                </p>
                <div style={{background: 'var(--bg-subtle)', padding: 12, borderRadius: 'var(--radius-md)', fontSize: '0.85rem', wordBreak: 'break-all', marginBottom: 16, border: '1px solid var(--gray-200)', color: 'var(--primary-600)', fontWeight: 500}}>
                    {bookingLink}
                </div>
                <button className="btn btnPrimary w-full" onClick={() => window.open(bookingLink, '_blank')}>Abrir Link</button>
            </div>
        </div>
        </div>

        <div className="column" style={{gap: '1.5rem'}}>
            <div className="card">
            <div className="cardHeader">
                <h3 className="cardTitle" style={{fontSize: '1rem'}}>Atividade Recente</h3>
            </div>
            <div className="cardBody">
                <div style={{display: 'flex', gap: 16, marginBottom: 20, position: 'relative'}}>
                    <div style={{position: 'absolute', left: 5, top: 10, bottom: -20, width: 2, background: 'var(--gray-100)'}}></div>
                    <div style={{width: 12, height: 12, borderRadius: '50%', background: 'var(--success)', marginTop: 4, zIndex: 1, border: '2px solid white', boxShadow: '0 0 0 2px var(--success-100, #dcfce7)'}} />
                    <div>
                        <div style={{fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-800)'}}>Pagamento recebido</div>
                        <div style={{fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: 2}}>Maria Julia pagou <span style={{color: 'var(--gray-800)', fontWeight: 600}}>R$ 120,00</span></div>
                        <div style={{fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4}}>Há 10 min</div>
                    </div>
                </div>
                <div style={{display: 'flex', gap: 16, marginBottom: 0}}>
                    <div style={{width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)', marginTop: 4, zIndex: 1, border: '2px solid white', boxShadow: '0 0 0 2px var(--primary-100)'}} />
                    <div>
                        <div style={{fontSize: '0.9rem', fontWeight: 600, color: 'var(--gray-800)'}}>Novo Agendamento</div>
                        <div style={{fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: 2}}>Ana Silva agendou <span style={{color: 'var(--gray-800)', fontWeight: 600}}>Design</span></div>
                        <div style={{fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: 4}}>Há 32 min</div>
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
        <>
            <div className="card">
                <div className="cardHeader">
                    <div>
                        <h2 className="cardTitle">Serviços</h2>
                        <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4}}>Gerencie os serviços oferecidos no seu espaço.</p>
                    </div>
                    <button className="btn btnPrimary" onClick={() => setModalOpen(true)}>
                        <Plus size={16} style={{marginRight: 8}}/> Novo Serviço
                    </button>
                </div>

                {loading ? <div style={{padding: 20}}>Carregando...</div> : (
                    <div style={{overflowX: 'auto'}}>
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
                                            <button className="icon-btn" style={{width: 32, height: 32}}><Edit2 size={16}/></button>
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
        </>
    )
}

const MOCK_EVENTS_STORE: CalendarEvent[] = []

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

        // Calculate start and end times
        const startDateTime = new Date(`${date}T${time}`)
        const endDateTime = new Date(startDateTime.getTime() + service.durationMinutes * 60000)

        // Create new event object
        const newEvent: CalendarEvent = {
            id: Math.random().toString(36).substr(2, 9),
            clientName: clientName,
            title: service.name,
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString(),
            color: '#e0f2fe', // Default blue-ish
            textColor: '#0369a1',
            status: 'confirmed'
        }

        // Simulate API call
        await new Promise(r => setTimeout(r, 500))

        onSuccess(newEvent)
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

function AdminCalendar() {
    const [view, setView] = useState<'week' | 'month'>('week')
    const [currentDate, setCurrentDate] = useState(new Date())
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false)
    
    // Helpers for Date Manipulation
    const getWeekDays = (date: Date) => {
        const start = new Date(date)
        const day = start.getDay()
        const diff = start.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
        start.setDate(diff)
        start.setHours(0,0,0,0)
        
        return Array.from({ length: 7 }, (_, i) => {
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

    const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate])
    const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate])
    
    const nextPeriod = () => {
        const d = new Date(currentDate)
        if (view === 'week') d.setDate(d.getDate() + 7)
        else d.setMonth(d.getMonth() + 1)
        setCurrentDate(d)
    }

    const prevPeriod = () => {
        const d = new Date(currentDate)
        if (view === 'week') d.setDate(d.getDate() - 7)
        else d.setMonth(d.getMonth() - 1)
        setCurrentDate(d)
    }

    const handleNewEvent = (newEvent: CalendarEvent) => {
        MOCK_EVENTS_STORE.push(newEvent)
        setEvents([...MOCK_EVENTS_STORE])
    }

    // Backend Integration Simulation
    useEffect(() => {
        // Initialize store if empty
        if (MOCK_EVENTS_STORE.length === 0) {
            const baseEvents = [
                { 
                    id: '1', 
                    clientName: 'Maria Julia', 
                    title: 'Cílios Volume Russo', 
                    start: setTime(weekDays[1], 10, 0).toISOString(), 
                    end: setTime(weekDays[1], 12, 0).toISOString(), 
                    color: '#dcfce7', 
                    textColor: '#166534',
                    status: 'confirmed'
                },
                { 
                    id: '2', 
                    clientName: 'Ana Silva', 
                    title: 'Design Sobrancelha', 
                    start: setTime(weekDays[1], 14, 0).toISOString(), 
                    end: setTime(weekDays[1], 15, 0).toISOString(), 
                    color: '#fef9c3', 
                    textColor: '#854d0e',
                    status: 'pending'
                },
                { 
                    id: '3', 
                    clientName: 'Carla Perez', 
                    title: 'Manutenção', 
                    start: setTime(weekDays[2], 11, 0).toISOString(), 
                    end: setTime(weekDays[2], 12, 30).toISOString(), 
                    color: '#e0f2fe', 
                    textColor: '#0369a1',
                    status: 'confirmed'
                },
                { 
                    id: '4', 
                    clientName: 'Beatriz Lima', 
                    title: 'Lifting', 
                    start: setTime(weekDays[3], 16, 0).toISOString(), 
                    end: setTime(weekDays[3], 17, 30).toISOString(), 
                    color: '#f3e8ff', 
                    textColor: '#6b21a8',
                    status: 'confirmed'
                },
                { 
                    id: '5', 
                    clientName: 'Fernanda Costa', 
                    title: 'Cílios Clássico', 
                    start: setTime(weekDays[4], 9, 0).toISOString(), 
                    end: setTime(weekDays[4], 11, 0).toISOString(), 
                    color: '#ffe4e6', 
                    textColor: '#9d174d',
                    status: 'confirmed'
                },
                // Extra events for Month View demo
                { 
                    id: '6', 
                    clientName: 'Patricia Santos', 
                    title: 'Microblading', 
                    start: setTime(weekDays[0], 13, 0).toISOString(), 
                    end: setTime(weekDays[0], 15, 0).toISOString(), 
                    color: '#ffedd5', 
                    textColor: '#c2410c',
                    status: 'confirmed'
                },
                { 
                    id: '7', 
                    clientName: 'Juliana Costa', 
                    title: 'Brow Lamination', 
                    start: setTime(weekDays[5], 10, 0).toISOString(), 
                    end: setTime(weekDays[5], 11, 0).toISOString(), 
                    color: '#d1fae5', 
                    textColor: '#047857',
                    status: 'confirmed'
                },
            ] as CalendarEvent[]
            MOCK_EVENTS_STORE.push(...baseEvents)
        }
        
        fetchEvents()
    }, [currentDate, view])

    async function fetchEvents() {
        setLoading(true)
        // In a real app, you would fetch based on the start/end of the view
        // const start = weekDays[0].toISOString()
        // const end = weekDays[6].toISOString()
        // const { data } = await api.get('/appointments', { params: { start, end } })

        // Mock Data Generation that aligns with the current view
        await new Promise(r => setTimeout(r, 300)) // Network simulation

        setEvents([...MOCK_EVENTS_STORE])
        setLoading(false)
    }

    const setTime = (d: Date, h: number, m: number) => {
        const date = new Date(d)
        date.setHours(h, m, 0, 0)
        return date
    }

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
    const weekDayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const hours = Array.from({ length: 11 }, (_, i) => i + 8) // 8:00 to 18:00

    return (
        <>
            <div className="card" style={{height: '100%', display: 'flex', flexDirection: 'column'}}>
                <div className="cardHeader">
                    <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
                        <button className="icon-btn" onClick={prevPeriod}><ChevronLeft size={20}/></button>
                        <h2 className="cardTitle" style={{fontSize: '1.25rem', minWidth: 180, textAlign: 'center'}}>
                            {monthNames[currentDate.getMonth()]}, {currentDate.getFullYear()}
                        </h2>
                        <button className="icon-btn" onClick={nextPeriod}><ChevronRight size={20}/></button>
                    </div>
                    <div style={{display: 'flex', gap: 12}}>
                        <div style={{display: 'flex', background: 'var(--gray-50)', padding: 4, borderRadius: 8}}>
                            <button 
                                className={`btn btn-ghost ${view === 'week' ? 'bg-white shadow-sm' : ''}`} 
                                style={{padding: '6px 16px', height: 32, borderRadius: 6, color: view === 'week' ? 'var(--gray-900)' : 'var(--gray-500)'}}
                                onClick={() => setView('week')}
                            >
                                Semana
                            </button>
                            <button 
                                className={`btn btn-ghost ${view === 'month' ? 'bg-white shadow-sm' : ''}`} 
                                style={{padding: '6px 16px', height: 32, borderRadius: 6, color: view === 'month' ? 'var(--gray-900)' : 'var(--gray-500)'}}
                                onClick={() => setView('month')}
                            >
                                Mês
                            </button>
                        </div>
                        <button className="btn btnPrimary" onClick={() => setIsNewAppointmentOpen(true)}>
                            <Plus size={16} style={{marginRight: 8}}/> Novo Agendamento
                        </button>
                    </div>
                </div>
                
                <div className="calendar-grid-wrapper" style={{opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', flexDirection: view === 'month' ? 'column' : 'row'}}>
                    {view === 'week' ? (
                        <>
                            <div className="calendar-time-column">
                                <div className="calendar-header-cell empty"></div>
                                {hours.map(h => (
                                    <div key={h} className="calendar-time-slot">
                                        {h}:00
                                    </div>
                                ))}
                            </div>
                            
                            <div className="calendar-days-container">
                                <div className="calendar-days-header">
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
                                
                                <div className="calendar-body">
                                    {weekDays.map((date, i) => (
                                        <div key={date.toISOString()} className="calendar-day-column">
                                            {hours.map(h => (
                                                <div key={h} className="calendar-grid-cell"></div>
                                            ))}
                                            
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
                                                const height = durationHours * 60
                                                
                                                return (
                                                    <div 
                                                        key={ev.id}
                                                        className="calendar-event"
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
                                    ))}
                                </div>
                            </div>
                        </>
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
                                            <div className={`calendar-month-day-number ${isToday ? 'today' : ''}`}>
                                                {date.getDate()}
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

            <NewAppointmentModal 
                isOpen={isNewAppointmentOpen} 
                onClose={() => setIsNewAppointmentOpen(false)} 
                onSuccess={handleNewEvent}
                initialDate={currentDate}
            />
        </>
    )
}

function AdminClients() {
    return (
        <div className="card">
            <div className="cardHeader">
                <div>
                    <h2 className="cardTitle">Clientes</h2>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4}}>Base de clientes do seu espaço.</p>
                </div>
            </div>
            <div style={{overflowX: 'auto'}}>
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
                        <tr>
                            <td>
                                 <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                                    <div className="user-avatar-mini" style={{width: 36, height: 36, fontSize: '0.8rem'}}>MJ</div>
                                    <span style={{fontWeight: 600, color: 'var(--gray-800)'}}>Maria Julia</span>
                                </div>
                            </td>
                            <td style={{color: 'var(--gray-600)'}}>(11) 99999-9999</td>
                            <td><span className="pill">10/01/2026</span></td>
                            <td style={{fontWeight: 600}}>R$ 450,00</td>
                            <td><button className="icon-btn" style={{width: 32, height: 32}}><MoreHorizontal size={16}/></button></td>
                        </tr>
                        <tr>
                            <td>
                                 <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                                    <div className="user-avatar-mini" style={{width: 36, height: 36, fontSize: '0.8rem', background: '#e0f2fe', color: '#0369a1'}}>AS</div>
                                    <span style={{fontWeight: 600, color: 'var(--gray-800)'}}>Ana Silva</span>
                                </div>
                            </td>
                            <td style={{color: 'var(--gray-600)'}}>(11) 98888-8888</td>
                            <td><span className="pill">15/01/2026</span></td>
                            <td style={{fontWeight: 600}}>R$ 120,00</td>
                            <td><button className="icon-btn" style={{width: 32, height: 32}}><MoreHorizontal size={16}/></button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
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

        {tab === 'calendar' ? <AdminCalendar /> : null}

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
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [logoError, setLogoError] = useState<string | null>(null)
    const [logoBusy, setLogoBusy] = useState(false)
    const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload')
    const [logoFileName, setLogoFileName] = useState<string | null>(null)
    const logoFileInputRef = useRef<HTMLInputElement | null>(null)
    const [colorText, setColorText] = useState('#ec4899')
    const [colorError, setColorError] = useState<string | null>(null)
    const [data, setData] = useState({
        name: '',
        slug: '',
        adminEmail: '',
        adminPassword: '',
        primaryColor: '#ec4899', // Pink default
        logoUrl: ''
    })

    useEffect(() => {
        setColorText(data.primaryColor)
    }, [data.primaryColor])

    if (!isOpen) return null

    function isValidHexColor(s: string) {
        const v = s.trim().toLowerCase()
        if (/^#[0-9a-f]{6}$/.test(v)) return true
        if (/^#[0-9a-f]{3}$/.test(v)) return true
        return false
    }

    function normalizeHexColor(s: string) {
        const raw = s.trim().toLowerCase()
        const v = raw.startsWith('#') ? raw : `#${raw}`
        return v
    }

    function applyHexColor(next: string) {
        const normalized = normalizeHexColor(next)
        if (!isValidHexColor(normalized)) {
            setColorError('Cor inválida (use #RGB ou #RRGGBB)')
            return
        }
        setColorError(null)
        setData((d) => ({ ...d, primaryColor: normalized }))
    }

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
                                <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center'}}>
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
                                    <div style={{display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 220px', minWidth: 220}}>
                                        <div
                                            style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 12,
                                                border: '1px solid var(--border)',
                                                background: data.primaryColor,
                                                position: 'relative',
                                                overflow: 'hidden',
                                                boxShadow: '0 10px 20px -12px rgba(0,0,0,0.5)'
                                            }}
                                        >
                                            <input
                                                aria-label="Escolher cor"
                                                type="color"
                                                value={data.primaryColor}
                                                onChange={(e) => {
                                                    setColorError(null)
                                                    setData({ ...data, primaryColor: e.target.value })
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    width: '100%',
                                                    height: '100%',
                                                    opacity: 0,
                                                    cursor: 'pointer'
                                                }}
                                            />
                                        </div>
                                        <div style={{flex: 1, minWidth: 0}}>
                                            <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                                                <input
                                                    className="input"
                                                    value={colorText}
                                                    onChange={(e) => {
                                                        setColorText(e.target.value)
                                                        setColorError(null)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') applyHexColor(colorText)
                                                    }}
                                                    onBlur={() => applyHexColor(colorText)}
                                                    inputMode="text"
                                                    placeholder="#ec4899"
                                                />
                                                <button
                                                    type="button"
                                                    className="btn"
                                                    onClick={() => applyHexColor(colorText)}
                                                    style={{whiteSpace: 'nowrap'}}
                                                >
                                                    Aplicar
                                                </button>
                                            </div>
                                            {colorError && (
                                                <div style={{marginTop: 8, color: 'var(--danger)', fontSize: '0.85rem'}}>{colorError}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
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
                                            style={{color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4}}
                                        >
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keepSigned, setKeepSigned] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)

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
  max 
}: { 
  value: string; 
  onChange: (val: string) => void;
  min: string;
  max: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const dates = useMemo(() => {
    const arr = []
    const start = new Date(min)
    const end = new Date(max)
    const curr = new Date(start)
    
    // Add extra buffer days at start for alignment if needed, but for now just list range
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
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  
  return (
    <div className="dateScrollerWrapper">
      <button className="dateScrollBtn left" onClick={() => scroll('left')}>
        <ChevronLeft size={20} />
      </button>
      
      <div className="dateScrollerContainer" ref={scrollRef}>
        {dates.map(d => {
          const dStr = d.toISOString().split('T')[0] // YYYY-MM-DD
          const isSelected = value === dStr
          const isToday = new Date().toDateString() === d.toDateString()
          
          return (
            <div 
              key={dStr} 
              className={`dateCard ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => onChange(dStr)}
            >
              <span className="dateCardWeek">{weekDays[d.getDay()]}</span>
              <span className="dateCardDay">{d.getDate()}</span>
              <span className="dateCardMonth">{months[d.getMonth()]}</span>
            </div>
          )
        })}
      </div>

      <button className="dateScrollBtn right" onClick={() => scroll('right')}>
        <ChevronRight size={20} />
      </button>
      
      <div className="dateScrollerBlur left" />
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
                      <Sparkles size={32} strokeWidth={1.5} />
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
                    setStep(3)
                  }}
                />
                <div className="dateScrollerHint">
                  Selecione uma data para visualizar a disponibilidade
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="bookingCalendarWrapper">
                 {timesForSelectedDate.length === 0 ? (
                  <div className="text-center text-muted">Sem horários disponíveis para este dia.</div>
                ) : (
                  <div className="bookingTimeGrid">
                    {timesForSelectedDate.map((t) => (
                      <button
                        key={t}
                        className={`bookingTimeBtn ${selectedTime === t ? 'selected' : ''}`}
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
                      <p style={{color: 'var(--text-muted)'}}>Logado como <strong>{me.email}</strong></p>
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
        <Route path="/" element={<RootEntry loginElement={<UnifiedLogin />} renderWhenAuthenticated={() => <Dev />} />} />
        <Route path="/dev" element={<Dev />} />
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
