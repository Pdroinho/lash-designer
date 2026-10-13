import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import type { SessionUser } from '../../types'
import './staff-area.css'
import { useSupportNotifications } from '../support/useSupportNotifications'
import { staffDayRange } from './staffDayRange'

type Appointment = { id: string; startsAt: string; endsAt: string; status: string; serviceName: string; clientName: string | null }
const localDay = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export function StaffArea() {
  const navigate = useNavigate()
  const [user, setUser] = useState<SessionUser | null>(null)
  const supportUnread = useSupportNotifications(user)
  const [day, setDay] = useState(localDay)
  const [name, setName] = useState('')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ user: SessionUser | null }>('/api/auth/me').then(result => {
      if (!result.ok || !result.data.user) { navigate('/login', { replace: true }); return }
      setUser(result.data.user)
      if (result.data.user.role !== 'STAFF') navigate('/', { replace: true })
    })
  }, [navigate])

  useEffect(() => {
    if (user?.role !== 'STAFF') return
    const range = staffDayRange(day)
    if (!range) {
      setAppointments([])
      setError('Escolha uma data válida para consultar sua agenda.')
      setLoading(false)
      return
    }
    const controller = new AbortController()
    let current = true
    setLoading(true)
    setError('')
    setAppointments([])
    api<{ professional: { name: string }; appointments: Appointment[] }>(`/api/staff/appointments?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`, { signal: controller.signal })
      .then(result => {
        if (!current) return
        if (result.ok) { setName(result.data.professional.name); setAppointments(result.data.appointments); setError('') }
        else setError(result.error.message)
        setLoading(false)
      })
    return () => { current = false; controller.abort() }
  }, [day, user])

  return <main className="staff-area">
    <header className="staff-area-header"><div><span>MEU ESPAÇO</span><strong>{user?.tenantSlug ?? 'Lash Designer'}</strong></div><button type="button" onClick={() => navigate('/suporte')}>Suporte{supportUnread ? ` (${supportUnread} nova${supportUnread === 1 ? '' : 's'})` : ''}</button><button type="button" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.assign('/login') }}>Sair</button></header>
    <div className="staff-area-content">
      <span className="staff-area-kicker">Agenda individual</span>
      <h1>Olá, {name || 'profissional'}.</h1>
      <p>Veja seus atendimentos no estúdio. Os horários e dados de outras profissionais ficam fora da sua conta.</p>
      <div className="staff-area-toolbar"><label>Escolha o dia<input type="date" value={day} onChange={event => setDay(event.target.value)} /></label><button type="button" onClick={() => setDay(localDay())}>Hoje</button></div>
      {error ? <div role="alert" className="staff-area-error">{error}</div> : loading ? <div className="staff-area-empty">Carregando agenda…</div> : appointments.length === 0 ? <div className="staff-area-empty">Nenhum atendimento para este dia.</div> :
        <ol className="staff-area-list">{appointments.map(item => <li key={item.id}>
          <time>{new Date(item.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
          <div><strong>{item.serviceName}</strong><span>{item.clientName ?? 'Cliente'} · até {new Date(item.endsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
          <small>{item.status === 'CANCELLED' ? 'Cancelado' : item.status === 'CONFIRMED' ? 'Confirmado' : 'Pendente'}</small>
        </li>)}</ol>}
      <footer>Para ajustar serviços, folgas ou horários, fale com a administração do estúdio.</footer>
    </div>
  </main>
}
