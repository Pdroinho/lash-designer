import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Calendar, Check, Clock, Copy, Globe, MoreHorizontal, Users, Wallet } from '../../components/Icons'
import { api } from '../../api'
import type { SessionUser } from '../../types'
import { formatDateInZone, formatTimeInZone, minutesInTimeZone } from '../../dateTime'
import { notify } from '../../components/FeedbackCenter'
import { appointmentPresenceMeta } from '../calendar/appointmentPresence'
import type { AdminStats } from './types'

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

function formatBRL(value: number) {
  return 'R$' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function AdminDashboard({ me, stats, onRefresh, onOpenAgenda }: { me: SessionUser | null; stats: AdminStats | null; onRefresh?: () => void; onOpenAgenda: () => void }) {
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

