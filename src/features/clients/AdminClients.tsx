import { useEffect, useState, type CSSProperties } from 'react'
import { Search, X } from '../../components/Icons'
import { api } from '../../api'

type AdminClientRow = {
  id: string
  name: string
  phone: string | null
  marketingWhatsappOptIn: number | boolean
  email: string
  totalSpentCents: number
  lastVisitAt: string | null
}

function formatBRL(value: number) {
  return 'R$' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

export function AdminClients() {
    const [clients, setClients] = useState<AdminClientRow[]>([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')

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

    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    const filteredClients = normalizedQuery
        ? clients.filter((client) => [client.name, client.phone ?? '', client.email].some((value) => value.toLocaleLowerCase('pt-BR').includes(normalizedQuery)))
        : clients
    const topClient = clients.reduce<AdminClientRow | null>((best, client) => !best || client.totalSpentCents > best.totalSpentCents ? client : best, null)
    const visitedClients = clients.filter((client) => Boolean(client.lastVisitAt)).length

    return (
        <div className="card client-admin-page">
            <section className="client-mobile-overview" aria-label="Resumo da base de clientes">
                <div className="client-mobile-overview-copy"><span>Sua comunidade</span><strong>{clients.length}</strong><p>{visitedClients} {visitedClients === 1 ? 'cliente tem visita registrada' : 'clientes têm visita registrada'}.</p></div>
                {topClient ? (() => { const col = colorFor(topClient.name); return <div className="client-mobile-highlight" style={{ '--client-accent': col.bg || 'var(--brand-soft)' } as CSSProperties}>
                    <div className="user-avatar-mini" style={{ background: col.bg, color: col.fg }}>{initials(topClient.name)}</div>
                    <span><small>Maior valor acumulado</small><strong>{topClient.name}</strong><em>{formatBRL(topClient.totalSpentCents / 100)}</em></span>
                </div> })() : <div className="client-mobile-highlight is-empty"><span><small>Primeiros vínculos</small><strong>Sua base começa aqui.</strong></span></div>}
            </section>
            <div className="cardHeader client-admin-header">
                <div>
                    <h2 className="cardTitle">Clientes</h2>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4}}>Base de clientes do seu espaço.</p>
                </div>
                <span className="client-count-badge">{clients.length}</span>
            </div>
            <label className="client-search" aria-label="Buscar clientes">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail" />
                {query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca"><X size={15} /></button> : null}
            </label>
            {loading ? (
                <div style={{display: 'flex', justifyContent: 'center', padding: 40}}>
                    <div className="spinner" />
                </div>
            ) : (
                <div className="table-scroll client-desktop-table">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Telefone</th>
                                <th>Promoções</th>
                                <th>Última Visita</th>
                                <th>Total Gasto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredClients.map(c => {
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
                                        <td>{c.marketingWhatsappOptIn ? <span className="status-badge status-success">Autorizado</span> : <span style={{color: 'var(--text-muted)'}}>—</span>}</td>
                                        <td>
                                            {c.lastVisitAt ? (
                                                <span className="pill">{new Date(c.lastVisitAt).toLocaleDateString('pt-BR')}</span>
                                            ) : (
                                                <span style={{color: 'var(--text-muted)'}}>—</span>
                                            )}
                                        </td>
                                        <td style={{fontWeight: 600}}>{formatBRL(c.totalSpentCents / 100)}</td>
                                    </tr>
                                )
                            })}
                            {filteredClients.length === 0 ? (
                                <tr>
                                    <td colSpan={5}>
                                        <EmptyState compact image="/empty-states/empty-clients.png" title="Nenhuma cliente ainda" description="Os novos contatos aparecerão aqui após o primeiro agendamento." />
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            )}
            {!loading ? <div className="client-mobile-list" aria-label="Clientes cadastradas">
                {filteredClients.map((client) => {
                    const col = colorFor(client.name)
                    return <article className="client-mobile-card" key={`mobile-${client.id}`} style={{ '--client-accent': col.bg || 'var(--brand-soft)' } as CSSProperties}>
                        <div className="user-avatar-mini client-mobile-avatar" style={{ background: col.bg, color: col.fg }}>{initials(client.name)}</div>
                        <div className="client-mobile-main">
                            <strong>{client.name}</strong>
                            <span>{client.phone || client.email || 'Sem contato informado'}</span>
                            <div className="client-mobile-tags">
                                {client.marketingWhatsappOptIn ? <em className="is-ok">Promoções autorizadas</em> : <em>Sem promoções</em>}
                                {client.lastVisitAt ? <em>Última visita {new Date(client.lastVisitAt).toLocaleDateString('pt-BR')}</em> : <em>Primeira visita pendente</em>}
                            </div>
                        </div>
                        <div className="client-mobile-value"><small>Total</small><strong>{formatBRL(client.totalSpentCents / 100)}</strong></div>
                    </article>
                })}
                {filteredClients.length === 0 ? <EmptyState compact image="/empty-states/empty-clients.png" title={query ? 'Nenhuma cliente encontrada' : 'Nenhuma cliente ainda'} description={query ? 'Tente outro nome, telefone ou e-mail.' : 'Os novos contatos aparecerão aqui após o primeiro agendamento.'} /> : null}
            </div> : null}
        </div>
    )
}

