import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { AdminService } from '../shared/types'
import { formatBrazilPhoneInput } from '../../phone'

type Hours = { weekday: number; startMinute: number; endMinute: number }
type Professional = { id: string; name: string; active: boolean; bookable: boolean; userId: string | null; accessDisabledAt: string | null; serviceIds: string[]; hours: Hours[] }
type TimeOff = { id: string; startsAt: string; endsAt: string; reason: string | null }
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))

export function ProfessionalManager({ services }: { services: AdminService[] }) {
  const [team, setTeam] = useState<Professional[]>([])
  const [limit, setLimit] = useState(3)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [hours, setHours] = useState<Hours[]>([])
  const [customHours, setCustomHours] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [timeOffPerson, setTimeOffPerson] = useState<Professional | null>(null)
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [offStart, setOffStart] = useState('')
  const [offEnd, setOffEnd] = useState('')
  const [offReason, setOffReason] = useState('')
  const [invitePerson, setInvitePerson] = useState<Professional | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePhone, setInvitePhone] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')

  async function invite() {
    if (!invitePerson) return
    setBusy(true); setError('')
    const result = await api<{ path: string }>(`/api/admin/professionals/${invitePerson.id}/invitation`, {
      method: 'POST', body: JSON.stringify({ email: inviteEmail.trim(), phone: invitePhone }),
    })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setInviteUrl(`${window.location.origin}${result.data.path}`)
  }
  async function toggleAccess(person: Professional) {
    setBusy(true); setError('')
    const result = await api(`/api/admin/professionals/${person.id}/access`, { method: 'PATCH', body: JSON.stringify({ enabled: Boolean(person.accessDisabledAt) }) })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    await refresh()
  }

  async function refresh() {
    const result = await api<{ professionals: Professional[]; seatLimit: number }>('/api/admin/professionals')
    if (result.ok) { setTeam(result.data.professionals); setLimit(result.data.seatLimit) }
    else setError(result.error.message)
  }
  useEffect(() => { void refresh() }, [])

  function begin(person?: Professional) {
    setEditing(person?.id ?? 'new')
    setName(person?.name ?? '')
    setSelectedServices(person?.serviceIds ?? services.map(service => service.id))
    setHours(person?.hours ?? [])
    setCustomHours(Boolean(person?.hours.length))
    setError('')
  }

  function toggleDay(weekday: number) {
    setHours(current => current.some(row => row.weekday === weekday)
      ? current.filter(row => row.weekday !== weekday)
      : [...current, { weekday, startMinute: 540, endMinute: 1080 }])
  }

  async function save() {
    if (name.trim().length < 2) { setError('Informe o nome da profissional.'); return }
    if (!selectedServices.length) { setError('Escolha ao menos um serviço.'); return }
    if (customHours && !hours.length) { setError('Escolha pelo menos um dia de atendimento.'); return }
    if (hours.some(row => row.startMinute >= row.endMinute)) { setError('O horário final deve ser posterior ao inicial.'); return }
    setBusy(true); setError('')
    const isNew = editing === 'new'
    const result = await api(isNew ? '/api/admin/professionals' : `/api/admin/professionals/${editing}`, {
      method: isNew ? 'POST' : 'PATCH',
      body: JSON.stringify({ name: name.trim(), serviceIds: selectedServices, hours: customHours ? hours : [] }),
    })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setEditing(null)
    await refresh()
  }

  async function toggleActive(person: Professional) {
    setBusy(true); setError('')
    const result = await api(`/api/admin/professionals/${person.id}`, { method: 'PATCH', body: JSON.stringify({ active: !person.active }) })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    await refresh()
  }

  async function loadTimeOff(person: Professional) {
    setTimeOffPerson(person); setError('')
    const result = await api<{ timeOff: TimeOff[] }>(`/api/admin/professionals/${person.id}/time-off`)
    if (result.ok) setTimeOff(result.data.timeOff)
    else setError(result.error.message)
  }

  async function addTimeOff() {
    if (!timeOffPerson || !offStart || !offEnd) { setError('Informe o início e o fim da folga.'); return }
    const start = new Date(offStart)
    const end = new Date(offEnd)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) { setError('Confira o período informado.'); return }
    setBusy(true); setError('')
    const result = await api(`/api/admin/professionals/${timeOffPerson.id}/time-off`, {
      method: 'POST', body: JSON.stringify({ startsAt: start.toISOString(), endsAt: end.toISOString(), reason: offReason.trim() }),
    })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setOffStart(''); setOffEnd(''); setOffReason('')
    await loadTimeOff(timeOffPerson)
  }

  async function removeTimeOff(blockId: string) {
    if (!timeOffPerson) return
    setBusy(true); setError('')
    const result = await api(`/api/admin/professionals/${timeOffPerson.id}/time-off/${blockId}`, { method: 'DELETE' })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    await loadTimeOff(timeOffPerson)
  }

  const active = team.filter(person => person.active && person.bookable).length
  return <section className="staff52" aria-labelledby="staff52-title">
    <header className="staff52-heading">
      <div><span>Equipe do estúdio</span><h2 id="staff52-title">Quem atende por aqui</h2><p>Associe serviços e horários a cada profissional. O WhatsApp continua sob a gestão da administradora do estúdio.</p></div>
      <button type="button" className="btn btnPrimary" onClick={() => begin()} disabled={busy || active >= limit || !services.length}>+ Adicionar profissional</button>
    </header>
    <p className="staff52-counter" role="status">{active} de {limit} vagas ativas no plano atual</p>
    {error ? <p className="staff52-error" role="alert">{error}</p> : null}
    {editing ? <div className="staff52-form">
      <label>Nome da profissional<input value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="Nome exibido no agendamento" /></label>
      <fieldset><legend>Serviços que ela realiza</legend><div className="staff52-options">{services.map(service => <label key={service.id}><input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => setSelectedServices(current => current.includes(service.id) ? current.filter(id => id !== service.id) : [...current, service.id])} />{service.name}</label>)}</div></fieldset>
      <label className="staff52-check"><input type="checkbox" checked={customHours} onChange={event => setCustomHours(event.target.checked)} />Personalizar os dias e horários desta profissional</label>
      {customHours ? <div className="staff52-hours">{weekdays.map((label, weekday) => {
        const row = hours.find(item => item.weekday === weekday)
        return <div key={label}><label className="staff52-check"><input type="checkbox" checked={Boolean(row)} onChange={() => toggleDay(weekday)} />{label}</label>
          {row ? <><input type="time" aria-label={`Início ${label}`} value={toTime(row.startMinute)} onChange={event => setHours(current => current.map(item => item.weekday === weekday ? { ...item, startMinute: toMinutes(event.target.value) } : item))} /><span>até</span><input type="time" aria-label={`Fim ${label}`} value={toTime(row.endMinute)} onChange={event => setHours(current => current.map(item => item.weekday === weekday ? { ...item, endMinute: toMinutes(event.target.value) } : item))} /></> : <span>Sem atendimento</span>}</div>
      })}</div> : <small>Usa os horários gerais do estúdio.</small>}
      <div className="staff52-actions"><button type="button" className="btn" onClick={() => { setEditing(null); setError('') }} disabled={busy}>Cancelar</button><button type="button" className="btn btnPrimary" onClick={() => void save()} disabled={busy}>{busy ? 'Salvando…' : 'Salvar profissional'}</button></div>
    </div> : null}
    {timeOffPerson ? <div className="staff52-form staff52-time-off" aria-label={`Folgas de ${timeOffPerson.name}`}>
      <div className="staff52-off-title"><strong>Folgas de {timeOffPerson.name}</strong><button type="button" className="btn" onClick={() => setTimeOffPerson(null)}>Fechar</button></div>
      <div className="staff52-off-inputs"><label>Início<input type="datetime-local" value={offStart} onChange={event => setOffStart(event.target.value)} /></label><label>Fim<input type="datetime-local" value={offEnd} onChange={event => setOffEnd(event.target.value)} /></label><label>Motivo (opcional)<input value={offReason} maxLength={200} onChange={event => setOffReason(event.target.value)} /></label></div>
      <button type="button" className="btn btnPrimary" onClick={() => void addTimeOff()} disabled={busy}>Bloquear período</button>
      {timeOff.length ? <ul className="staff52-off-list">{timeOff.map(block => <li key={block.id}><span>{new Date(block.startsAt).toLocaleString('pt-BR')} até {new Date(block.endsAt).toLocaleString('pt-BR')}{block.reason ? ` · ${block.reason}` : ''}</span><button type="button" className="btn" onClick={() => void removeTimeOff(block.id)} disabled={busy}>Remover</button></li>)}</ul> : <small>Nenhuma folga futura cadastrada.</small>}
    </div> : null}
    {invitePerson ? <div className="staff52-form" aria-label={`Acesso de ${invitePerson.name}`}>
      <div className="staff52-off-title"><strong>Convidar {invitePerson.name}</strong><button type="button" className="btn" onClick={() => { setInvitePerson(null); setInviteUrl('') }}>Fechar</button></div>
      <p>Ela verá somente a própria agenda. Informe o WhatsApp dela para o código de segurança no login.</p>
      <div className="staff52-off-inputs"><label>E-mail de acesso<input type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="profissional@email.com" /></label><label>WhatsApp com DDD<input type="tel" value={invitePhone} onChange={event => setInvitePhone(formatBrazilPhoneInput(event.target.value))} placeholder="(11) 99999-9999" /></label></div>
      <button type="button" className="btn btnPrimary" disabled={busy || !inviteEmail || !invitePhone} onClick={() => void invite()}>Gerar link de acesso</button>
      {inviteUrl ? <div className="staff52-invite-link"><label>Convite válido por 72 horas<input readOnly value={inviteUrl} onFocus={event => event.target.select()} /></label><button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copiar link</button><small>Compartilhe o link diretamente com {invitePerson.name}. Gerar outro invalida o anterior.</small></div> : null}
    </div> : null}
    <div className="staff52-list">{team.map(person => <article key={person.id}>
      <span className="staff52-avatar" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span>
      <div><strong>{person.name}</strong><small>{person.active ? `${person.serviceIds.length} serviços · ${person.hours.length ? 'Horários próprios' : 'Horários do estúdio'}` : 'Inativa'}</small></div>
      <button type="button" className="btn" onClick={() => begin(person)} disabled={busy}>Editar</button>
      <button type="button" className="btn" onClick={() => void loadTimeOff(person)} disabled={busy}>Folgas</button>
      {person.userId ? <button type="button" className="btn" onClick={() => void toggleAccess(person)} disabled={busy}>{person.accessDisabledAt ? 'Restaurar acesso' : 'Suspender acesso'}</button> : person.active ? <button type="button" className="btn" onClick={() => { setInvitePerson(person); setInviteUrl(''); setInviteEmail(''); setInvitePhone(''); setError('') }} disabled={busy}>Convidar</button> : null}
      <button type="button" className="btn" onClick={() => void toggleActive(person)} disabled={busy}>{person.active ? 'Desativar' : 'Ativar'}</button>
    </article>)}</div>
  </section>
}
