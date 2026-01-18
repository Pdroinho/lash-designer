import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { SessionUser, TenantPublic } from './types'
import { applyTenantTheme } from './theme'

function Topbar(props: { title: string; subtitle: string }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brandMark" aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <div className="brandTitle">{props.title}</div>
          <div className="brandSub">{props.subtitle}</div>
        </div>
      </div>
      <div className="pill">
        <span>API</span>
        <span className="mono">/api</span>
      </div>
    </div>
  )
}

function Home() {
  const nav = useNavigate()
  const [slug, setSlug] = useState('')

  return (
    <div className="container">
      <Topbar title="Lash Designer Space" subtitle="Agenda white label para profissionais" />
      <div className="grid">
        <div className="card">
          <div className="cardHeader">
            <h1 className="cardTitle">Entrar no seu espaço</h1>
            <p className="cardDesc">
              Se você já tem uma página (slug), digite abaixo. Exemplo:{' '}
              <span className="mono">/ana-lash</span>
            </p>
          </div>
          <div className="cardBody">
            <div className="row">
              <div>
                <label className="label">Seu slug</label>
                <input
                  className="input"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="ana-lash"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
              <div className="btnRow">
                <button
                  className="btn btnPrimary"
                  onClick={() => {
                    const cleaned = slug.trim().toLowerCase()
                    if (!cleaned) return
                    nav(`/${cleaned}`)
                  }}
                >
                  Acessar
                </button>
                <button className="btn" onClick={() => nav('/login')}>
                  Login (admin/cliente/dev)
                </button>
              </div>
              <div className="hr" />
              <div className="pill">
                <span className="mono">Dica</span>
                <span>Para testar agora: crie um tenant no painel DEV.</span>
              </div>
              <div className="btnRow">
                <button className="btn" onClick={() => nav('/dev')}
                >
                  Painel DEV
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h2 className="cardTitle">O que já existe no esqueleto</h2>
            <p className="cardDesc">Multi-tenant + login + base do painel.</p>
          </div>
          <div className="cardBody">
            <div className="list">
              <div className="listItem">
                <div className="listItemTitle">White label por slug</div>
                <div className="listItemMeta">Branding carregado via API pública do tenant</div>
              </div>
              <div className="listItem">
                <div className="listItemTitle">Papéis</div>
                <div className="listItemMeta">DEV, ADMIN e CLIENT com rotas protegidas</div>
              </div>
              <div className="listItem">
                <div className="listItemTitle">Banco local</div>
                <div className="listItemMeta">SQLite com migração automática na inicialização</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Login() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit() {
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
    if (u.role === 'DEV') nav('/dev')
    else if (u.tenantSlug) nav(`/${u.tenantSlug}/admin`)
    else nav('/')
  }

  return (
    <div className="container">
      <Topbar title="Login" subtitle="Acesso para admin, cliente e dev" />
      <div className="grid">
        <div className="card">
          <div className="cardHeader">
            <h1 className="cardTitle">Entrar</h1>
            <p className="cardDesc">Use seu e-mail e senha.</p>
          </div>
          <div className="cardBody">
            <div className="row">
              <div>
                <label className="label">E-mail</label>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  autoCapitalize="off"
                />
              </div>
              <div>
                <label className="label">Senha</label>
                <input
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                />
              </div>
              {error ? <div className="pill">{error}</div> : null}
              <div className="btnRow">
                <button className="btn btnPrimary" onClick={onSubmit} disabled={loading}>
                  {loading ? 'Entrando…' : 'Entrar'}
                </button>
                <button className="btn" onClick={() => nav('/')}
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="cardHeader">
            <h2 className="cardTitle">Primeiro acesso DEV</h2>
            <p className="cardDesc">
              Se não existir DEV no banco, use o painel DEV para criar o primeiro.
            </p>
          </div>
          <div className="cardBody">
            <div className="btnRow">
              <button className="btn" onClick={() => nav('/dev')}
              >
                Abrir painel DEV
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TenantShell() {
  const { tenantSlug } = useParams()
  const nav = useNavigate()
  const slug = (tenantSlug ?? '').trim().toLowerCase()
  const [tenant, setTenant] = useState<TenantPublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    api<{ tenant: TenantPublic }>(`/api/public/tenant/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!mounted) return
        if (!res.ok) {
          setError(res.error.message)
          setTenant(null)
          return
        }
        setTenant(res.data.tenant)
        applyTenantTheme(res.data.tenant)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [slug])

  const subtitle = useMemo(() => {
    if (loading) return `Carregando ${slug}…`
    if (error) return error
    return `Espaço: /${slug}`
  }, [loading, slug, error])

  return (
    <div className="container">
      <Topbar title={tenant?.name ?? 'Espaço'} subtitle={subtitle} />
      <div className="grid">
        <div className="card">
          <div className="cardHeader">
            <h1 className="cardTitle">Agendamento</h1>
            <p className="cardDesc">Entre como cliente para agendar e ver histórico.</p>
          </div>
          <div className="cardBody">
            <div className="btnRow">
              <button className="btn btnPrimary" onClick={() => nav(`/${slug}/cliente/cadastro`)}>
                Sou cliente (cadastro)
              </button>
              <button className="btn" onClick={() => nav('/login')}>
                Já tenho login
              </button>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="cardHeader">
            <h2 className="cardTitle">Painel admin</h2>
            <p className="cardDesc">Gerencie serviços e visualize agendamentos.</p>
          </div>
          <div className="cardBody">
            <div className="btnRow">
              <button className="btn" onClick={() => nav('/login')}>
                Login admin
              </button>
              <button className="btn" onClick={() => nav(`/${slug}/admin`)}>
                Abrir dashboard
              </button>
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
  const [allowBootstrap, setAllowBootstrap] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [bootstrapDone, setBootstrapDone] = useState(false)

  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#b1ff9a')
  const [tenantError, setTenantError] = useState<string | null>(null)
  const [tenantCreated, setTenantCreated] = useState<string | null>(null)
  const [adminEmail, setAdminEmail] = useState('admin@exemplo.com')
  const [adminPassword, setAdminPassword] = useState('admin123456')

  useEffect(() => {
    api<{ user: SessionUser | null; allowDevBootstrap: boolean }>(
      '/api/auth/me',
    ).then((res) => {
      if (!res.ok) return
      setMe(res.data.user)
      setAllowBootstrap(res.data.allowDevBootstrap)
    })
  }, [])

  async function bootstrapDev() {
    setBootstrapError(null)
    setBootstrapDone(false)
    const res = await api<{ ok: true }>('/api/dev/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      setBootstrapError(res.error.message)
      return
    }
    setBootstrapDone(true)
  }

  async function createTenant() {
    setTenantError(null)
    setTenantCreated(null)
    const res = await api<{ tenant: TenantPublic; adminUser: SessionUser }>(
      '/api/dev/tenants',
      {
        method: 'POST',
        body: JSON.stringify({
          name: tenantName,
          slug: tenantSlug,
          primaryColor,
          adminEmail,
          adminPassword,
        }),
      },
    )
    if (!res.ok) {
      setTenantError(res.error.message)
      return
    }
    setTenantCreated(res.data.tenant.slug)
  }

  return (
    <div className="container">
      <Topbar title="Painel DEV" subtitle="Controle total e provisioning" />
      <div className="grid">
        <div className="card">
          <div className="cardHeader">
            <h1 className="cardTitle">Sessão</h1>
            <p className="cardDesc">Você precisa estar logado como DEV para criar tenants.</p>
          </div>
          <div className="cardBody">
            <div className="row">
              <div className="pill">
                <span>Status</span>
                <span className="mono">{me ? `${me.role}:${me.email}` : 'deslogado'}</span>
              </div>
              <div className="btnRow">
                <button className="btn" onClick={() => nav('/login')}>
                  Abrir login
                </button>
                <button
                  className="btn"
                  onClick={async () => {
                    await api('/api/auth/logout', { method: 'POST' })
                    setMe(null)
                  }}
                >
                  Sair
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h2 className="cardTitle">Bootstrap DEV</h2>
            <p className="cardDesc">
              Só disponível se ainda não existir usuário DEV no banco.
            </p>
          </div>
          <div className="cardBody">
            <div className="row">
              <div className="pill">
                <span>Disponível</span>
                <span className="mono">{allowBootstrap ? 'true' : 'false'}</span>
              </div>
              <div>
                <label className="label">E-mail DEV</label>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Senha DEV</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {bootstrapError ? <div className="pill">{bootstrapError}</div> : null}
              {bootstrapDone ? <div className="pill">DEV criado. Faça login.</div> : null}
              <div className="btnRow">
                <button className="btn btnPrimary" onClick={bootstrapDev} disabled={!allowBootstrap}>
                  Criar DEV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }} className="card">
        <div className="cardHeader">
          <h2 className="cardTitle">Criar tenant + admin</h2>
          <p className="cardDesc">
            Cria um espaço white label e um usuário ADMIN vinculado.
          </p>
        </div>
        <div className="cardBody">
          <div className="row">
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label className="label">Nome</label>
                <input className="input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
              </div>
              <div>
                <label className="label">Slug</label>
                <input className="input" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label className="label">Cor primária</label>
                <input className="input" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
              </div>
              <div>
                <label className="label">Admin e-mail</label>
                <input className="input" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Admin senha</label>
              <input className="input" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
            </div>
            {tenantError ? <div className="pill">{tenantError}</div> : null}
            {tenantCreated ? (
              <div className="pill">
                <span>Criado:</span>
                <span className="mono">/{tenantCreated}</span>
              </div>
            ) : null}
            <div className="btnRow">
              <button className="btn btnPrimary" onClick={createTenant} disabled={!me || me.role !== 'DEV'}>
                Criar tenant
              </button>
              <button className="btn" onClick={() => nav(tenantCreated ? `/${tenantCreated}` : '/')}
              >
                Abrir espaço
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Admin() {
  const [me, setMe] = useState<SessionUser | null>(null)
  const [appointments, setAppointments] = useState<
    Array<{ id: string; startsAt: string; clientEmail: string; serviceName: string; status: string }>
  >([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ user: SessionUser | null }>('/api/auth/me').then((res) => {
      if (!res.ok) return
      setMe(res.data.user)
    })
    api<{ appointments: typeof appointments }>('/api/admin/appointments').then((res) => {
      if (!res.ok) {
        setError(res.error.message)
        return
      }
      setAppointments(res.data.appointments)
    })
  }, [])

  return (
    <div className="container">
      <Topbar title="Dashboard Admin" subtitle={me ? me.email : '—'} />
      <div className="grid">
        <div className="card">
          <div className="cardHeader">
            <h1 className="cardTitle">Agendamentos</h1>
            <p className="cardDesc">Visão inicial (MVP).</p>
          </div>
          <div className="cardBody">
            {error ? <div className="pill">{error}</div> : null}
            <div className="list">
              {appointments.length === 0 ? (
                <div className="listItem">
                  <div className="listItemTitle">Nenhum agendamento ainda</div>
                  <div className="listItemMeta">Crie um serviço e agende como cliente.</div>
                </div>
              ) : (
                appointments.map((a) => (
                  <div className="listItem" key={a.id}>
                    <div className="listItemTitle">{a.serviceName}</div>
                    <div className="listItemMeta">
                      {new Date(a.startsAt).toLocaleString('pt-BR')} · {a.clientEmail} · {a.status}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="cardHeader">
            <h2 className="cardTitle">Serviços</h2>
            <p className="cardDesc">Crie serviços para aparecerem no agendamento.</p>
          </div>
          <div className="cardBody">
            <AdminServices />
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminServices() {
  const [items, setItems] = useState<
    Array<{ id: string; name: string; durationMinutes: number; priceCents: number }>
  >([])
  const [name, setName] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('90')
  const [priceCents, setPriceCents] = useState('20000')
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const res = await api<{ services: typeof items }>('/api/admin/services')
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setError(null)
    setItems(res.data.services)
  }

  useEffect(() => {
    refresh()
  }, [])

  async function create() {
    const res = await api<{ service: (typeof items)[number] }>('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify({
        name,
        durationMinutes: Number(durationMinutes),
        priceCents: Number(priceCents),
      }),
    })
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setName('')
    await refresh()
  }

  return (
    <div className="row">
      <div className="grid" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
        <div>
          <label className="label">Nome do serviço</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Duração (min)</label>
          <input
            className="input"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label">Preço (centavos)</label>
        <input className="input" value={priceCents} onChange={(e) => setPriceCents(e.target.value)} />
      </div>
      {error ? <div className="pill">{error}</div> : null}
      <div className="btnRow">
        <button className="btn btnPrimary" onClick={create}>
          Criar
        </button>
        <button className="btn" onClick={refresh}>
          Recarregar
        </button>
      </div>
      <div className="list">
        {items.map((s) => (
          <div className="listItem" key={s.id}>
            <div className="listItemTitle">{s.name}</div>
            <div className="listItemMeta">
              {s.durationMinutes} min · R$ {(s.priceCents / 100).toFixed(2).replace('.', ',')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ClientSignup() {
  const { tenantSlug } = useParams()
  const nav = useNavigate()
  const slug = (tenantSlug ?? '').trim().toLowerCase()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit() {
    setError(null)
    const res = await api<{ user: SessionUser }>(
      '/api/auth/register-client',
      {
        method: 'POST',
        body: JSON.stringify({ tenantSlug: slug, name, phone, email, password }),
      },
    )
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setDone(true)
    nav(`/login`)
  }

  return (
    <div className="container">
      <Topbar title="Cadastro cliente" subtitle={`/${slug}`} />
      <div className="card">
        <div className="cardHeader">
          <h1 className="cardTitle">Criar conta</h1>
          <p className="cardDesc">Seu login fica salvo para próximos agendamentos.</p>
        </div>
        <div className="cardBody">
          <div className="row">
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label className="label">Nome</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label">Telefone</label>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label className="label">E-mail</label>
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="off" />
              </div>
              <div>
                <label className="label">Senha</label>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            {error ? <div className="pill">{error}</div> : null}
            {done ? <div className="pill">Conta criada.</div> : null}
            <div className="btnRow">
              <button className="btn btnPrimary" onClick={submit}>
                Criar conta
              </button>
              <button className="btn" onClick={() => nav(`/${slug}`)}>
                Voltar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dev" element={<Dev />} />
      <Route path="/:tenantSlug" element={<TenantShell />} />
      <Route path="/:tenantSlug/admin" element={<Admin />} />
      <Route path="/:tenantSlug/cliente/cadastro" element={<ClientSignup />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

