import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatTimeInZone, getZonedDateTimeParts } from '../../dateTime'
import { ProductDate } from '../../components/ProductDate'
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
  const [timeZone,setTimeZone]=useState<string|null>(null)
  const [timeZoneRevision,setTimeZoneRevision]=useState(0)
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

  useEffect(()=>{
    if(user?.role!=='STAFF')return
    const c=new AbortController()
    void api<{timezone:string}>('/api/public/booking',{signal:c.signal}).then(res=>{
      if(c.signal.aborted)return
      if(!res.ok){setError('Não foi possível consultar o fuso do estúdio. Tente novamente.');setLoading(false);return}
      setTimeZone(res.data.timezone);setDay(getZonedDateTimeParts(new Date(),res.data.timezone)?.ymd ?? localDay());setError('')
    })
    return()=>c.abort()
  },[user,timeZoneRevision])

  useEffect(() => {
    if (user?.role !== 'STAFF' || !timeZone) return
    const range = staffDayRange(day,timeZone)
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
  }, [day, user,timeZone])

  return <main className="staff-area">
    <header className="staff-area-header"><div><span>MEU ESPAÇO</span><strong>{user?.tenantSlug ?? 'Lash Designer'}</strong></div><button type="button" onClick={() => navigate('/suporte')}>Suporte{supportUnread ? ` (${supportUnread} nova${supportUnread === 1 ? '' : 's'})` : ''}</button><button type="button" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.assign('/login') }}>Sair</button></header>
    <div className="staff-area-content">
      <span className="staff-area-kicker">Agenda individual</span>
      <h1>Olá, {name || 'profissional'}.</h1>
      <p>Veja seus atendimentos no estúdio. Os horários e dados de outras profissionais ficam fora da sua conta.</p>
      <div className="staff-area-toolbar"><ProductDate label="Escolha o dia" value={day} onChange={setDay} today={timeZone?getZonedDateTimeParts(new Date(),timeZone)?.ymd ?? localDay():localDay()} disabled={!timeZone}/><button type="button" onClick={() => setDay(timeZone?getZonedDateTimeParts(new Date(),timeZone)?.ymd ?? localDay():localDay())}>Hoje</button></div>
      {error ? <div role="alert" className="staff-area-error">{error}{!timeZone?<button type="button" className="btn" onClick={()=>setTimeZoneRevision(v=>v+1)}>Tentar novamente</button>:null}</div> : loading ? <div className="staff-area-empty">Carregando agenda…</div> : appointments.length === 0 ? <div className="staff-area-empty">Nenhum atendimento para este dia.</div> :
        <ol className="staff-area-list">{appointments.map(item => <li key={item.id}>
          <time>{formatTimeInZone(item.startsAt,timeZone ?? 'America/Sao_Paulo')}</time>
          <div><strong>{item.serviceName}</strong><span>{item.clientName ?? 'Cliente'} · até {formatTimeInZone(item.endsAt,timeZone ?? 'America/Sao_Paulo')}</span></div>
          <small>{item.status === 'CANCELLED' ? 'Cancelado' : item.status === 'CONFIRMED' ? 'Confirmado' : 'Pendente'}</small>
        </li>)}</ol>}
      <footer>Para ajustar serviços, folgas ou horários, fale com a administração do estúdio.</footer>
    </div>
  </main>
}
