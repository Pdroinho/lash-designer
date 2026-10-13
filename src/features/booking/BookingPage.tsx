import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { TenantPublic } from '../../types'
import { applyTenantTheme, setAppMode } from '../../theme'
import { formatBrazilPhoneInput, normalizeBrazilPhone } from '../../phone'
import { bundledServiceCover, withBasePath } from '../../lib/runtime'
import { addDaysToYmd, formatYmdPtBr, weekdayIndexForYmd, ymdInTimeZone, zonedDateTimeToUtc } from '../../dateTime'
import { EmptyState } from '../../components/SharedUi'
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Search, ShieldCheck } from '../../components/Icons'

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

export function BookingPage(props: { tenant?: TenantPublic; tenantSlug?: string; basePath?: string } = {}) {
  const { tenantSlug } = useParams()
  const nav = useNavigate()
  const slug = (props.tenantSlug ?? tenantSlug ?? '').trim().toLowerCase()
  const basePath = props.basePath ?? (slug ? `/${slug}` : '')

  useEffect(() => { setAppMode('tenant') }, [])

  const [tenant, setTenant] = useState<TenantPublic | null>(props.tenant ?? null)
  const [services, setServices] = useState<Array<{ id: string; name: string; durationMinutes: number; priceCents: number; coverUrl?: string | null }>>([])
  const [serviceQuery, setServiceQuery] = useState('')
  const [booking, setBooking] = useState<{
    timezone: string
    currency: string
    bookingRules: { minNoticeMinutes: number; maxFutureDays: number; slotStepMinutes: number }
    businessHours: Array<{ weekday: number; startMinute: number; endMinute: number }>
  } | null>(null)
  type BookablePerson = { id: string; name: string }
  type AvailablePerson = BookablePerson & { businessHours: Array<{ weekday: number; startMinute: number; endMinute: number }>; blocks: Array<{ startsAt: string; endsAt: string; kind: 'appointment' | 'time_off' }> }
  const [professionals, setProfessionals] = useState<BookablePerson[]>([])
  const [professionalsLoading, setProfessionalsLoading] = useState(false)
  const [staffAvailability, setStaffAvailability] = useState<AvailablePerson[] | null>(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [marketingDetailsOpen, setMarketingDetailsOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmedAppointment, setConfirmedAppointment] = useState<{ id: string; status: string; professionalName?: string } | null>(null)

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
    if (!selectedServiceId) { setProfessionals([]); setProfessionalsLoading(false); return }
    let mounted = true
    setProfessionals([])
    setProfessionalsLoading(true)
    setActionError(null)
    const path = slug ? `/api/public/tenant/${encodeURIComponent(slug)}/professionals` : '/api/public/professionals'
    api<{ professionals: BookablePerson[] }>(`${path}?serviceId=${encodeURIComponent(selectedServiceId)}`).then(res => {
      if (!mounted) return
      if (res.ok) setProfessionals(res.data.professionals)
      else setActionError(res.error.message)
    }).finally(() => { if (mounted) setProfessionalsLoading(false) })
    return () => { mounted = false }
  }, [slug, selectedServiceId])

  useEffect(() => {
    if (!selectedDate || !selectedServiceId) { setStaffAvailability(null); return }
    setStaffAvailability(null)
    setAvailabilityLoading(true)
    setActionError(null)
    let mounted = true
    const path = slug ? `/api/public/tenant/${encodeURIComponent(slug)}/staff-availability` : '/api/public/staff-availability'
    const query = new URLSearchParams({ date: selectedDate, serviceId: selectedServiceId, _: String(Date.now()) })
    if (selectedProfessionalId) query.set('professionalId', selectedProfessionalId)
    api<{ professionals: AvailablePerson[] }>(`${path}?${query}`).then(res => {
      if (!mounted) return
      if (res.ok) setStaffAvailability(res.data.professionals)
      else setActionError(res.error.message)
    }).finally(() => { if (mounted) setAvailabilityLoading(false) })
    return () => { mounted = false }
  }, [slug, selectedDate, selectedServiceId, selectedProfessionalId])

  const selectedService = useMemo(() => services.find((s) => s.id === selectedServiceId) ?? null, [services, selectedServiceId])
  const filteredServices = useMemo(() => {
    const query = serviceQuery.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
    if (!query) return services
    return services.filter(service => service.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(query))
  }, [services, serviceQuery])
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
    if (!booking || !selectedService || !selectedDate || !staffAvailability) return [] as Array<{ time: string; status: 'available' | 'blocked' | 'notice'; reason: string }>
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
    return [...new Set(times)].sort().map((time) => {
      const startUtc = zonedDateTimeToUtc(selectedDate, time, booking.timezone)
      if (!startUtc || startUtc < cutoff) return { time, status: 'notice' as const, reason: 'Antecedência mínima' }
      const endUtc = new Date(startUtc.getTime() + selectedService.durationMinutes * 60_000)
      const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
      const available = staffAvailability.some(person =>
        person.businessHours.some(hours => hours.weekday === day && minute >= hours.startMinute && minute + selectedService.durationMinutes <= hours.endMinute) &&
        !person.blocks.some(block => new Date(block.endsAt) > startUtc && new Date(block.startsAt) < endUtc))
      return available ? { time, status: 'available' as const, reason: '' } : { time, status: 'blocked' as const, reason: 'Reservado' }
    })
  }, [booking, selectedDate, selectedService, staffAvailability])

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
    const res = await api<{ appointment: { id: string; status: string; professionalName?: string } }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ serviceId: selectedService.id, professionalId: selectedProfessionalId ?? undefined, startsAt: startsAt.toISOString(), name, phone, marketingConsent: marketingOptIn }),
    })
    setSaving(false)
    if (!res.ok) { setActionError(res.error.message); return }
    setConfirmedAppointment(res.data.appointment)
  }

  function resetBooking() {
    setConfirmedAppointment(null); setStep(1); setSelectedServiceId(null); setSelectedProfessionalId(null); setSelectedDate(''); setSelectedTime(null); setClientName(''); setClientPhone(''); setMarketingOptIn(false); setMarketingDetailsOpen(false); setActionError(null)
  }

  if (loading) return <div className="booking25 booking25-loading"><div className="booking25-skeleton" /></div>
  if (loadError) return <div className="booking25"><div className="booking25-error"><strong>Não conseguimos abrir esta agenda.</strong><span>{loadError}</span></div></div>

  const summary = [
    selectedService ? { label: 'Serviço', value: selectedService.name } : null,
    professionals.length > 1 ? { label: 'Profissional', value: professionals.find(person => person.id === selectedProfessionalId)?.name ?? 'Qualquer disponível' } : null,
    selectedDate ? { label: 'Data', value: formatYmdPtBr(selectedDate) } : null,
    selectedTime ? { label: 'Horário', value: selectedTime } : null,
  ].filter(Boolean) as Array<{label:string; value:string}>

  const stepLabels = ['Serviço', 'Profissional e data', 'Horário', 'Confirmar']
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
            <h1>{step === 1 ? 'Qual cuidado você quer hoje?' : step === 2 ? 'Com quem e quando você prefere?' : step === 3 ? 'Escolha o seu horário.' : 'Últimos detalhes.'}</h1>
            <p>{step === 1 ? 'Escolha o atendimento e veja os horários disponíveis.' : step === 2 ? 'Escolha uma profissional ou encontre qualquer horário livre.' : step === 3 ? 'Estes horários estão livres agora.' : 'Seu nome e WhatsApp bastam para reservar.'}</p>
          </div>

          {step < 4 && summary.length ? <div className="booking30-mobile-summary">
            {summary.map((item) => <span key={item.label}><small>{item.label}</small><strong>{item.value}</strong></span>)}
          </div> : null}

          <div className="booking30-content">
            {step === 1 ? <div className="booking30-service-catalog">
              {services.length >= 6 ? <label className="booking30-service-search"><Search size={20} aria-hidden="true" /><span className="sr-only">Buscar serviço</span><input type="search" value={serviceQuery} onChange={event => setServiceQuery(event.target.value)} placeholder="Busque um serviço pelo nome" autoComplete="off" /></label> : null}
              <div className="booking30-services">
              {filteredServices.map((service, index) => <button type="button" key={service.id} className="booking30-service" onClick={() => { setSelectedServiceId(service.id); setSelectedProfessionalId(null); setSelectedDate(''); setSelectedTime(null); setStep(2) }}>
                <div className="booking30-service-photo"><img src={service.coverUrl || bundledServiceCover(service.name)} alt="" onError={(e) => { e.currentTarget.src = '/placeholders/service-placeholder.webp' }} /><span className="booking30-service-index">{String(index + 1).padStart(2, '0')}</span></div>
                <div className="booking30-service-copy"><strong>{service.name}</strong><span>{service.durationMinutes} min</span></div>
                <div className="booking30-service-price"><strong>{money(service.priceCents)}</strong><span aria-hidden="true">↗</span></div>
              </button>)}
              {!services.length ? <EmptyState image="/empty-states/empty-calendar.png" title="Nenhum serviço disponível" description="Este espaço ainda não publicou serviços para agendamento." /> : null}
              {services.length > 0 && !filteredServices.length ? <p role="status" className="booking30-no-results">Nenhum serviço corresponde à busca. Tente outro nome.</p> : null}
              </div>
            </div> : null}

            {step === 2 ? <div className="booking30-date">
              {professionals.length > 1 ? <fieldset className="booking30-professionals"><legend>Escolha quem vai atender</legend>
                <label><input type="radio" name="book-professional" checked={!selectedProfessionalId} onChange={() => { setSelectedProfessionalId(null); setSelectedDate('') }} /><span>Qualquer profissional disponível</span></label>
                {professionals.map(person => <label key={person.id}><input type="radio" name="book-professional" checked={selectedProfessionalId === person.id} onChange={() => { setSelectedProfessionalId(person.id); setSelectedDate('') }} /><span>{person.name}</span></label>)}
              </fieldset> : null}
              {professionalsLoading ? <p role="status">Consultando profissionais…</p> : professionals.length ? <DateScroller value={selectedDate} min={dateLimits.min} max={dateLimits.max} onChange={(value) => { setSelectedDate(value); setSelectedTime(null); setStep(3) }} getDateStatus={dateStatusFor} /> : <p role="status">{actionError ?? 'Este serviço ainda não tem uma profissional disponível. Escolha outro serviço.'}</p>}
            </div> : null}

            {step === 3 ? <div className="booking30-times">
              {availabilityLoading ? <p role="status">Consultando horários das profissionais…</p> : null}
              {!availabilityLoading && availableTimeSlots.length ? <>
                <div className="booking30-time-grid booking30-time-grid-desktop">{availableTimeSlots.map((slot) => <button type="button" key={slot.time} onClick={() => { setSelectedTime(slot.time); setStep(4) }}><span>{slot.time}</span><small>disponível</small></button>)}</div>
                <div className="booking30-mobile-time-groups">{mobileTimeGroups.map((group) => <section key={group.label}><header><strong>{group.label}</strong><span>{group.hint}</span></header><div>{group.slots.map((slot) => <button type="button" key={slot.time} onClick={() => { setSelectedTime(slot.time); setStep(4) }}>{slot.time}<ArrowRight size={14} /></button>)}</div></section>)}</div>
              </> : !availabilityLoading ? <div className="booking30-empty-time"><Clock size={22} /><strong>{actionError ? 'Não foi possível consultar os horários.' : 'Nenhum horário livre por aqui.'}</strong><p>{actionError ?? 'Escolha outro dia e continuamos.'}</p><button type="button" onClick={() => setStep(2)}>Trocar a data</button></div> : null}
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
            {professionals.length > 1 ? <div><dt>Profissional</dt><dd>{professionals.find(person => person.id === selectedProfessionalId)?.name ?? 'Qualquer disponível'}</dd></div> : null}
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
          <p>{selectedService?.name} · {selectedDate ? formatYmdPtBr(selectedDate) : ''} · {selectedTime}{confirmedAppointment?.professionalName ? ` · ${confirmedAppointment.professionalName}` : ''}</p>
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
