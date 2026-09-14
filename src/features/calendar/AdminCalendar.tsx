import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Calendar, Check, ChevronLeft, ChevronRight, Clock, Plus, Trash2 } from '../../components/Icons'
import { api } from '../../api'
import type { CalendarEvent } from '../../types'
import { addDaysToYmd, formatDateInZone, formatTimeInZone, localDateToYmd, minutesInTimeZone, ymdInTimeZone, zonedDateTimeToUtc } from '../../dateTime'
import { ProductSelect } from '../../components/ProductSelect'
import { confirmAction, notify } from '../../components/FeedbackCenter'
import { AppointmentDetailsModal, NewAppointmentModal } from './AppointmentModals'
import { appointmentPresenceMeta } from './appointmentPresence'
import type { AdminAppointment, AdminBusinessHour, AdminTimeOff } from './types'

export function AdminCalendar() {
    const [view, setView] = useState<'week' | 'month'>('week')
    const [currentDate, setCurrentDate] = useState(new Date())
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [isNewAppointmentOpen, setIsNewAppointmentOpen] = useState(false)
    const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

    const [agendaTab, setAgendaTab] = useState<'appointments' | 'hours' | 'blocks'>('appointments')

    const [tenantTimeZone, setTenantTimeZone] = useState('America/Sao_Paulo')
    const [businessHours, setBusinessHours] = useState<AdminBusinessHour[]>([])
    const [businessHoursLoading, setBusinessHoursLoading] = useState(false)
    const [businessHoursError, setBusinessHoursError] = useState<string | null>(null)
    const [businessHoursEdits, setBusinessHoursEdits] = useState<Record<number, { startTime: string; endTime: string; lunchEnabled: boolean; lunchStart: string; lunchEnd: string }>>({})

    const [timeOff, setTimeOff] = useState<AdminTimeOff[]>([])
    const [timeOffLoading, setTimeOffLoading] = useState(false)
    const [timeOffError, setTimeOffError] = useState<string | null>(null)
    const [timeOffAdd, setTimeOffAdd] = useState<{ startsLocal: string; endsLocal: string; reason: string }>(() => {
        const now = new Date()
        const pad = (v: number) => String(v).padStart(2, '0')
        const y = String(now.getFullYear())
        const m = pad(now.getMonth() + 1)
        const d = pad(now.getDate())
        return { startsLocal: `${y}-${m}-${d}T09:00`, endsLocal: `${y}-${m}-${d}T18:00`, reason: '' }
    })

    // Responsive Days Logic
    const [daysToShow, setDaysToShow] = useState(7)
    const agendaRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const host = agendaRef.current
        if (!host) return
        const update = () => {
            const width = host.getBoundingClientRect().width
            if (width < 520) setDaysToShow(1)
            else if (width < 920) setDaysToShow(3)
            else setDaysToShow(7)
        }
        const observer = new ResizeObserver(update)
        observer.observe(host)
        update()
        return () => observer.disconnect()
    }, [])

    // Helpers for Date Manipulation
    const getWeekDays = (date: Date) => {
        const start = new Date(date)

        if (daysToShow === 7) {
            // Standard week view (Sunday to Saturday)
            const day = start.getDay()
            const diff = start.getDate() - day
            start.setDate(diff)
        } else {
            // Rolling view (starts from current date)
            // No adjustment needed, start from 'date'
        }
        start.setHours(0,0,0,0)

        return Array.from({ length: daysToShow }, (_, i) => {
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

    const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate, daysToShow])
    const monthDays = useMemo(() => getMonthDays(currentDate), [currentDate])

    useEffect(() => {
        let mounted = true
        api<{ timezone: string }>('/api/public/booking').then((res) => {
            if (!mounted) return
            if (res.ok && res.data?.timezone) setTenantTimeZone(res.data.timezone)
        })
        return () => {
            mounted = false
        }
    }, [])

    const weekdayNamesFull = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    const weekdayNamesShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

    const minuteToTime = (minute: number) => {
        const m = Math.max(0, Math.min(1440, Math.floor(minute)))
        const hh = String(Math.floor(m / 60)).padStart(2, '0')
        const mm = String(m % 60).padStart(2, '0')
        return `${hh}:${mm}`
    }

    const timeToMinute = (t: string) => {
        const m = /^([0-9]{2}):([0-9]{2})$/.exec(t)
        if (!m) return null
        const hh = Number(m[1])
        const mm = Number(m[2])
        if (![hh, mm].every(Number.isFinite)) return null
        if (hh < 0 || hh > 23) return null
        if (mm < 0 || mm > 59) return null
        return hh * 60 + mm
    }

    const timeOptions = useMemo(() => {
        const opts: string[] = []
        for (let i = 0; i < 24 * 60; i += 15) {
            const h = Math.floor(i / 60).toString().padStart(2, '0')
            const m = (i % 60).toString().padStart(2, '0')
            opts.push(`${h}:${m}`)
        }
        // Add end of day if needed, usually business hours go up to a certain point.
        // But 23:45 is the last 15m slot start.
        return opts
    }, [])

    const TimeSelect = ({ value, onChange, disabled }: { value: string, onChange: (val: string) => void, disabled?: boolean }) => (
        <ProductSelect
            value={value}
            onChange={onChange}
            disabled={disabled}
            ariaLabel="Selecionar horário"
            size="compact"
            options={timeOptions.map((time) => ({ value: time, label: time }))}
        />
    )

    const sortBusinessHours = (list: AdminBusinessHour[]) => {
        return [...list].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
    }

    const suggestLunch = (startMinute: number, endMinute: number) => {
        const span = endMinute - startMinute
        const base = Math.max(startMinute + 60, startMinute + Math.floor(span / 2) - 30)
        const lunchStart = Math.min(endMinute - 90, base)
        const lunchEnd = Math.min(endMinute - 30, lunchStart + 60)
        return { lunchStart, lunchEnd }
    }

    const buildDayEditState = (ranges: AdminBusinessHour[]) => {
        if (ranges.length === 0) {
            return { startTime: '09:00', endTime: '18:00', lunchEnabled: false, lunchStart: '12:00', lunchEnd: '13:00' }
        }
        if (ranges.length === 1) {
            const r = ranges[0]
            const lunch = suggestLunch(r.startMinute, r.endMinute)
            return {
                startTime: minuteToTime(r.startMinute),
                endTime: minuteToTime(r.endMinute),
                lunchEnabled: false,
                lunchStart: minuteToTime(lunch.lunchStart),
                lunchEnd: minuteToTime(lunch.lunchEnd),
            }
        }
        const r1 = ranges[0]
        const r2 = ranges[1]
        return {
            startTime: minuteToTime(r1.startMinute),
            endTime: minuteToTime(r2.endMinute),
            lunchEnabled: true,
            lunchStart: minuteToTime(r1.endMinute),
            lunchEnd: minuteToTime(r2.startMinute),
        }
    }

    const syncDayRanges = async (weekday: number, nextState: { startTime: string; endTime: string; lunchEnabled: boolean; lunchStart: string; lunchEnd: string }) => {
        const dayRanges = sortBusinessHours(businessHours.filter((b) => b.weekday === weekday))
        const startMinute = timeToMinute(nextState.startTime)
        const endMinute = timeToMinute(nextState.endTime)
        if (startMinute === null || endMinute === null) return
        if (endMinute <= startMinute) {
            setBusinessHoursError('Intervalo inválido')
            return
        }

        const upsert = (bh: AdminBusinessHour) => {
            setBusinessHours((prev) => {
                const exists = prev.some((p) => p.id === bh.id)
                const next = exists ? prev.map((p) => (p.id === bh.id ? bh : p)) : [...prev, bh]
                return sortBusinessHours(next)
            })
        }

        const createRange = async (start: number, end: number) => {
            const res = await api<{ businessHour: AdminBusinessHour }>('/api/admin/business-hours', {
                method: 'POST',
                body: JSON.stringify({ weekday, startMinute: start, endMinute: end }),
            })
            if (res.ok) upsert(res.data.businessHour)
        }

        const patchRange = async (id: string, start: number, end: number) => {
            const res = await api<{ businessHour: AdminBusinessHour }>(`/api/admin/business-hours/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ weekday, startMinute: start, endMinute: end }),
            })
            if (res.ok) upsert(res.data.businessHour)
        }

        const deleteRange = async (id: string) => {
            const res = await api<{ ok: true }>(`/api/admin/business-hours/${id}`, { method: 'DELETE' })
            if (res.ok) setBusinessHours((prev) => prev.filter((p) => p.id !== id))
        }

        if (!nextState.lunchEnabled) {
            if (dayRanges.length === 0) {
                await createRange(startMinute, endMinute)
            } else {
                await patchRange(dayRanges[0].id, startMinute, endMinute)
                for (const r of dayRanges.slice(1)) await deleteRange(r.id)
            }
            return
        }

        const lunchStart = timeToMinute(nextState.lunchStart)
        const lunchEnd = timeToMinute(nextState.lunchEnd)
        if (lunchStart === null || lunchEnd === null) return
        if (!(startMinute < lunchStart && lunchStart < lunchEnd && lunchEnd < endMinute)) {
            setBusinessHoursError('Intervalo de almoço inválido')
            return
        }

        const morningStart = startMinute
        const morningEnd = lunchStart
        const afternoonStart = lunchEnd
        const afternoonEnd = endMinute

        if (morningEnd <= morningStart || afternoonEnd <= afternoonStart) {
            setBusinessHoursError('Intervalo inválido')
            return
        }

        if (dayRanges.length === 0) {
            await createRange(morningStart, morningEnd)
            await createRange(afternoonStart, afternoonEnd)
            return
        }

        if (dayRanges.length === 1) {
            await patchRange(dayRanges[0].id, morningStart, morningEnd)
            await createRange(afternoonStart, afternoonEnd)
            return
        }

        await patchRange(dayRanges[0].id, morningStart, morningEnd)
        await patchRange(dayRanges[1].id, afternoonStart, afternoonEnd)
        for (const r of dayRanges.slice(2)) await deleteRange(r.id)
    }

    const parseLocalDateTimeInputToUtc = (value: string, timeZone: string) => {
        const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value)
        if (!match) return null
        return zonedDateTimeToUtc(match[1], match[2], timeZone)
    }

    const nextPeriod = () => {
        const d = new Date(currentDate)
        if (view === 'week') d.setDate(d.getDate() + daysToShow)
        else d.setMonth(d.getMonth() + 1)
        setCurrentDate(d)
    }

    const prevPeriod = () => {
        const d = new Date(currentDate)
        if (view === 'week') d.setDate(d.getDate() - daysToShow)
        else d.setMonth(d.getMonth() - 1)
        setCurrentDate(d)
    }

    const handleNewEvent = (newEvent: CalendarEvent) => {
        setEvents(prev => [...prev, newEvent].sort((a, b) => a.start.localeCompare(b.start)))
    }

    useEffect(() => {
        if (agendaTab !== 'appointments') return
        fetchEvents()
    }, [currentDate, view, agendaTab])

    useEffect(() => {
        if (agendaTab !== 'hours') return
        fetchBusinessHours()
    }, [agendaTab])

    useEffect(() => {
        if (agendaTab !== 'blocks') return
        fetchTimeOff()
    }, [agendaTab, tenantTimeZone])

    async function fetchBusinessHours() {
        setBusinessHoursLoading(true)
        setBusinessHoursError(null)
        const res = await api<{ businessHours: AdminBusinessHour[] }>('/api/admin/business-hours')
        if (!res.ok) {
            setBusinessHoursError(res.error.message)
            setBusinessHoursLoading(false)
            return
        }
        const list = res.data.businessHours ?? []
        setBusinessHours(list)
        setBusinessHoursEdits(() => {
            const next: Record<number, { startTime: string; endTime: string; lunchEnabled: boolean; lunchStart: string; lunchEnd: string }> = {}
            for (let weekday = 0; weekday <= 6; weekday += 1) {
                const ranges = sortBusinessHours(list.filter((h) => h.weekday === weekday))
                next[weekday] = buildDayEditState(ranges)
            }
            return next
        })
        setBusinessHoursLoading(false)
    }

    async function fetchTimeOff() {
        setTimeOffLoading(true)
        setTimeOffError(null)

        const todayYmd = ymdInTimeZone(new Date(), tenantTimeZone)
        const startYmd = addDaysToYmd(todayYmd, -7)
        const endYmd = addDaysToYmd(todayYmd, 121)
        const start = startYmd ? zonedDateTimeToUtc(startYmd, '00:00', tenantTimeZone) : null
        const end = endYmd ? zonedDateTimeToUtc(endYmd, '00:00', tenantTimeZone) : null
        if (!start || !end) {
            setTimeOffError('Não foi possível calcular o período no fuso do espaço.')
            setTimeOffLoading(false)
            return
        }

        const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), limit: '800' })
        const res = await api<{ timeOff: AdminTimeOff[] }>(`/api/admin/time-off?${qs.toString()}`)
        if (!res.ok) {
            setTimeOffError(res.error.message)
            setTimeOffLoading(false)
            return
        }
        const list = res.data.timeOff ?? []
        setTimeOff(list)
        setTimeOffLoading(false)
    }

    async function fetchEvents() {
        setLoading(true)
        const rangeStart = view === 'week' ? weekDays[0] : monthDays[0]
        const rangeEnd = view === 'week' ? weekDays[weekDays.length - 1] : monthDays[monthDays.length - 1]

        const startYmd = localDateToYmd(rangeStart)
        const endYmd = addDaysToYmd(localDateToYmd(rangeEnd), 1)
        const start = zonedDateTimeToUtc(startYmd, '00:00', tenantTimeZone)
        const end = endYmd ? zonedDateTimeToUtc(endYmd, '00:00', tenantTimeZone) : null
        if (!start || !end) {
            setLoading(false)
            return
        }

        const qs = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), limit: '800' })
        const res = await api<{ appointments: AdminAppointment[] }>(`/api/admin/appointments?${qs.toString()}`)

        if (res.ok) {
            const mapped: CalendarEvent[] = res.data.appointments.map(a => {
                const status = a.status === 'CONFIRMED' ? 'confirmed' : a.status === 'PENDING' ? 'pending' : 'cancelled'
                const presence = appointmentPresenceMeta(a.status, a.confirmationStatus)
                return {
                    id: a.id,
                    title: a.serviceName,
                    clientName: a.clientName ?? a.clientEmail,
                    start: a.startsAt,
                    end: a.endsAt,
                    status,
                    confirmationStatus: a.confirmationStatus,
                    confirmationSentAt: a.confirmationSentAt,
                    confirmationRespondedAt: a.confirmationRespondedAt,
                    appointmentReminderSentAt: a.appointmentReminderSentAt,
                    clientPhone: a.clientPhone,
                    color: presence.color,
                    textColor: presence.textColor,
                }
            })
            setEvents(mapped)
        }
        setLoading(false)
    }

    async function handleDeleteEvent(id: string) {
        const res = await api<{ ok: true }>(`/api/admin/appointments/${id}`, { method: 'DELETE' })
        if (res.ok) {
            setEvents(prev => prev.filter(e => e.id !== id))
        } else {
            notify('Erro ao excluir agendamento: ' + res.error.message, 'error')
        }
    }

    const [currentTimeMinutes, setCurrentTimeMinutes] = useState(() =>
        minutesInTimeZone(new Date(), tenantTimeZone) ?? 0,
    )

    useEffect(() => {
        const update = () => setCurrentTimeMinutes(minutesInTimeZone(new Date(), tenantTimeZone) ?? 0)
        update()
        const interval = setInterval(update, 60000)
        return () => clearInterval(interval)
    }, [tenantTimeZone])

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
    const weekDayNames = weekdayNamesShort
    // Hours from 08:00 to 23:00 (16 hours total) to fill the screen better
    const hours = Array.from({ length: 16 }, (_, i) => i + 8)
    const mobileAgendaDays = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(currentDate)
        day.setDate(currentDate.getDate() + index - 2)
        day.setHours(0, 0, 0, 0)
        return day
    })
    const selectedAgendaYmd = localDateToYmd(currentDate)
    const mobileDayEvents = events
        .filter((event) => ymdInTimeZone(event.start, tenantTimeZone) === selectedAgendaYmd)
        .sort((a, b) => a.start.localeCompare(b.start))
    const selectedAgendaLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(currentDate)

    return (
        <div ref={agendaRef} className="ld-agenda">
            <div className="ld-agenda-tabs" role="tablist" aria-label="Seções da agenda">
                <button type="button"
                    className={`ld-agenda-tab ${agendaTab === 'appointments' ? 'is-active' : ''}`} role="tab" aria-selected={agendaTab === 'appointments'}
                    onClick={() => setAgendaTab('appointments')}
                >
                    Calendário
                </button>
                <button type="button"
                    className={`ld-agenda-tab ${agendaTab === 'hours' ? 'is-active' : ''}`} role="tab" aria-selected={agendaTab === 'hours'}
                    onClick={() => setAgendaTab('hours')}
                >
                    Horários
                </button>
                <button type="button"
                    className={`ld-agenda-tab ${agendaTab === 'blocks' ? 'is-active' : ''}`} role="tab" aria-selected={agendaTab === 'blocks'}
                    onClick={() => setAgendaTab('blocks')}
                >
                    Bloqueios
                </button>
            </div>

            {agendaTab === 'appointments' && (
                <>
                <section className="ld-mobile-agenda-view" aria-label="Agenda do dia">
                    <header className="ld-mobile-agenda-head">
                        <div>
                            <span>Agenda</span>
                            <h2>{monthNames[currentDate.getMonth()]} <em>{currentDate.getFullYear()}</em></h2>
                        </div>
                        <div className="ld-mobile-agenda-head-actions">
                            <button type="button" onClick={() => setCurrentDate(new Date())}>Hoje</button>
                            <button type="button" className="ld-mobile-agenda-add" onClick={() => setIsNewAppointmentOpen(true)} aria-label="Novo agendamento"><Plus size={19} /></button>
                        </div>
                    </header>

                    <div className="ld-mobile-day-rail" aria-label="Escolher dia">
                        {mobileAgendaDays.map((date) => {
                            const dateYmd = localDateToYmd(date)
                            const selected = dateYmd === selectedAgendaYmd
                            const today = dateYmd === ymdInTimeZone(new Date(), tenantTimeZone)
                            return <button type="button" key={dateYmd} className={`${selected ? 'is-selected' : ''} ${today ? 'is-today' : ''}`} aria-pressed={selected} onClick={() => setCurrentDate(date)}>
                                <span>{weekdayNamesShort[date.getDay()]}</span>
                                <strong>{date.getDate()}</strong>
                                <i aria-hidden="true" />
                            </button>
                        })}
                    </div>

                    <div className="ld-mobile-agenda-summary">
                        <div><span>{selectedAgendaLabel}</span><strong>{mobileDayEvents.length} {mobileDayEvents.length === 1 ? 'atendimento' : 'atendimentos'}</strong></div>
                        <div className="ld-mobile-agenda-nav"><button type="button" onClick={prevPeriod} aria-label="Dia anterior"><ChevronLeft size={17} /></button><button type="button" onClick={nextPeriod} aria-label="Próximo dia"><ChevronRight size={17} /></button></div>
                    </div>

                    <div className="ld-mobile-agenda-timeline">
                        {loading ? <div className="ld-mobile-agenda-loading"><span className="spinner" /><small>Atualizando agenda…</small></div> : null}
                        {!loading && mobileDayEvents.map((event, index) => {
                            const presence = appointmentPresenceMeta(event.status, event.confirmationStatus)
                            return <button type="button" className="ld-mobile-agenda-event" key={event.id} onClick={() => setSelectedEvent(event)}>
                                <span className="ld-mobile-agenda-time"><strong>{formatTimeInZone(event.start, tenantTimeZone)}</strong><small>{index === 0 ? 'próximo' : ''}</small></span>
                                <span className="ld-mobile-agenda-line"><i style={{ background: event.textColor }} /></span>
                                <span className="ld-mobile-agenda-event-body">
                                    <span className="ld-mobile-agenda-event-top"><strong>{event.clientName}</strong><em className={`status-badge ${presence.className}`}>{presence.label}</em></span>
                                    <span>{event.title}</span>
                                    <small>{formatTimeInZone(event.start, tenantTimeZone)} — {formatTimeInZone(event.end, tenantTimeZone)}</small>
                                </span>
                            </button>
                        })}
                        {!loading && mobileDayEvents.length === 0 ? <div className="ld-mobile-agenda-empty"><span><Calendar size={22} /></span><strong>Um dia com espaço para respirar.</strong><p>Nenhum atendimento marcado para esta data.</p><button type="button" onClick={() => setIsNewAppointmentOpen(true)}>Criar agendamento <ArrowRight size={15} /></button></div> : null}
                    </div>
                </section>
                <div className="ld-calendar">
                    <div className="ld-calendar-toolbar">
                        <div className="ld-calendar-period">
                            <div className="ld-calendar-arrows">
                                <button type="button" className="calendar-nav-btn" onClick={prevPeriod} aria-label="Período anterior"><ChevronLeft size={20}/></button>
                                <button type="button" className="calendar-nav-btn" onClick={nextPeriod} aria-label="Próximo período"><ChevronRight size={20}/></button>
                            </div>
                            <h2 className="ld-calendar-title">
                                {monthNames[currentDate.getMonth()]}, {currentDate.getFullYear()}
                            </h2>
                        </div>

                        <div className="ld-calendar-actions">
                            <div className="calendar-view-toggle">
                                <button type="button"
                                    className={`view-btn ${view === 'week' ? 'active' : ''}`}
                                    onClick={() => setView('week')}
                                >
                                    Semana
                                </button>
                                <button type="button"
                                    className={`view-btn ${view === 'month' ? 'active' : ''}`}
                                    onClick={() => setView('month')}
                                >
                                    Mês
                                </button>
                            </div>
                            <button type="button" className="btn btnPrimary" onClick={() => setIsNewAppointmentOpen(true)}>
                                <Plus size={16} /> <span style={{marginLeft: 8}} className="desktop-only">Novo Agendamento</span>
                            </button>
                        </div>
                    </div>

                    <div className="appointment-presence-legend" aria-label="Legenda de confirmação de presença">
                        <span><i className="is-scheduled" />Agendado</span><span><i className="is-awaiting" />Aguardando resposta</span><span><i className="is-confirmed" />Confirmado</span><span><i className="is-attention" />Atenção</span>
                    </div>

                    <div className="ld-calendar-scroll" data-view={view} data-loading={loading ? "true" : "false"}>
                        {view === 'week' ? (
                            <div className="ld-calendar-week" style={{ '--visible-days': daysToShow } as CSSProperties}>
                                {/* Sticky Header Row */}
                                <div className="calendar-days-header ld-calendar-week-header">
                                    <div className="calendar-header-cell empty" style={{ position: 'sticky', left: 0, zIndex: 40, background: 'var(--surface-raised)', borderRight: '1px solid var(--line-soft)' }}></div>
                                    {weekDays.map((date) => {
                                        const isToday = ymdInTimeZone(new Date(), tenantTimeZone) === localDateToYmd(date)
                                        return (
                                            <div key={date.toISOString()} className="calendar-header-cell">
                                                <div className="calendar-day-name">{weekDayNames[date.getDay()]}</div>
                                                <div className={`calendar-day-number ${isToday ? 'today' : ''}`}>{date.getDate()}</div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Body Row */}
                                <div className="ld-calendar-week-body">
                                    {/* Sticky Time Column */}
                                    <div className="calendar-time-column" style={{ position: 'sticky', left: 0, zIndex: 20, background: 'var(--surface-raised)', borderRight: '1px solid var(--line-soft)' }}>
                                        {hours.map(h => (
                                            <div key={h} className="calendar-time-slot">
                                                {h}:00
                                            </div>
                                        ))}
                                    </div>

                                    {/* Days Columns */}
                                    {weekDays.map((date) => {
                                        const isToday = ymdInTimeZone(new Date(), tenantTimeZone) === localDateToYmd(date)

                                        return (
                                            <div key={date.toISOString()} className="calendar-day-column">
                                                {hours.map(h => (
                                                    <div key={h} className="calendar-grid-cell"></div>
                                                ))}

                                                {/* Current Time Indicator */}
                                                {isToday && (
                                                    <div
                                                        className="current-time-line"
                                                        style={{
                                                            top: `${(currentTimeMinutes / 60 - 8) * 60 + 10}px`
                                                        }}
                                                    >
                                                        <div className="current-time-dot" />
                                                    </div>
                                                )}

                                                {events.filter(ev => {
                                                    return ymdInTimeZone(ev.start, tenantTimeZone) === localDateToYmd(date)
                                                }).map(ev => {
                                                    const startMinutes = minutesInTimeZone(ev.start, tenantTimeZone) ?? 0
                                                        const endMinutes = minutesInTimeZone(ev.end, tenantTimeZone) ?? startMinutes
                                                        const durationMinutes = Math.max(0, endMinutes - startMinutes)
                                                        const top = (startMinutes / 60 - 8) * 60 + 10
                                                        const height = Math.max(durationMinutes, 24)

                                                        return (
                                                            <div
                                                                key={ev.id}
                                                                className="calendar-event"
                                                                role="button"
                                                                tabIndex={0}
                                                                aria-label={`${ev.title}, ${formatTimeInZone(ev.start, tenantTimeZone)}, ${ev.clientName}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setSelectedEvent(ev)
                                                                }}
                                                                onKeyDown={(event) => {
                                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                                        event.preventDefault()
                                                                        event.stopPropagation()
                                                                        setSelectedEvent(ev)
                                                                    }
                                                                }}
                                                                style={{
                                                                    top: `${top}px`,
                                                                    height: `${height}px`,
                                                                    backgroundColor: ev.color,
                                                                    borderLeft: `3px solid ${ev.textColor}`
                                                                }}
                                                            >
                                                                <div className="event-title" style={{color: ev.textColor}}>{ev.title}</div>
                                                                <div className="event-time" style={{color: ev.textColor, opacity: 0.8}}>
                                                                    {formatTimeInZone(ev.start, tenantTimeZone)} - {ev.clientName}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
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
                                        const isToday = ymdInTimeZone(new Date(), tenantTimeZone) === localDateToYmd(date)
                                        const isCurrentMonth = date.getMonth() === currentDate.getMonth()

                                        return (
                                            <div key={date.toISOString()} className={`calendar-month-cell ${!isCurrentMonth ? 'different-month' : ''}`}>
                                                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                                                    <div className={`calendar-month-day-number ${isToday ? 'today' : ''}`}>
                                                        {date.getDate()}
                                                    </div>
                                                </div>
                                                {events.filter(ev => {
                                                    return ymdInTimeZone(ev.start, tenantTimeZone) === localDateToYmd(date)
                                                }).map(ev => (
                                                    <div
                                                        key={ev.id}
                                                        className="calendar-month-event"
                                                        role="button"
                                                        tabIndex={0}
                                                        aria-label={`${ev.title}, ${formatTimeInZone(ev.start, tenantTimeZone)}, ${ev.clientName}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedEvent(ev)
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter' || event.key === ' ') {
                                                                event.preventDefault()
                                                                event.stopPropagation()
                                                                setSelectedEvent(ev)
                                                            }
                                                        }}
                                                        style={{backgroundColor: ev.color, color: ev.textColor}}
                                                    >
                                                        {formatTimeInZone(ev.start, tenantTimeZone)} {ev.clientName}
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
                </>
            )}

            {agendaTab === 'hours' && (
                <div className="animate-entry">
                    {businessHoursLoading && (
                        <div
                            className="pill skeleton skeleton-pill"
                            style={{justifyContent: 'center', margin: '0 24px 16px', height: 28}}
                        />
                    )}
                    {businessHoursError && (
                        <div className="pill" style={{color: 'var(--danger)', background: 'var(--status-danger-bg)', justifyContent: 'center', margin: '0 24px 16px'}}>
                            {businessHoursError}
                        </div>
                    )}
                    <div className="schedule-grid">
                        {weekdayNamesFull.map((dayName, idx) => {
                        const dayRanges = sortBusinessHours(businessHours.filter(b => b.weekday === idx))
                        const isOpen = dayRanges.length > 0
                        const editState = businessHoursEdits[idx] ?? buildDayEditState(dayRanges)
                        const startTime = editState.startTime
                        const endTime = editState.endTime
                        const lunchEnabled = editState.lunchEnabled
                        const lunchStart = editState.lunchStart
                        const lunchEnd = editState.lunchEnd

                        return (
                            <div key={dayName} className={`schedule-day-card ${!isOpen ? 'closed' : ''}`}>
                                <div className="schedule-day-header">
                                    <div className="schedule-day-title">
                                        {dayName}
                                    </div>
                                    <button
                                        type="button"
                                        className={`toggle-switch ${isOpen ? 'checked' : ''}`}
                                        role="switch"
                                        aria-checked={isOpen}
                                        aria-label={`${isOpen ? 'Fechar' : 'Abrir'} ${dayName}`}
                                        onClick={async () => {
                                            setBusinessHoursError(null)
                                            if (isOpen) {
                                                if (!(await confirmAction({ title: `Fechar ${dayName}`, message: `Todos os horários configurados para ${dayName} serão removidos.`, confirmLabel: 'Fechar o dia', danger: true }))) return
                                                for (const r of dayRanges) {
                                                    const res = await api<{ ok: true }>(`/api/admin/business-hours/${r.id}`, { method: 'DELETE' })
                                                    if (res.ok) setBusinessHours(prev => prev.filter(x => x.id !== r.id))
                                                }
                                                return
                                            }
                                            await syncDayRanges(idx, editState)
                                        }}
                                    >
                                        <span className="toggle-thumb" />
                                    </button>
                                </div>

                                <div style={{display: 'flex', alignItems: 'center', gap: 12, opacity: isOpen ? 1 : 0.4, pointerEvents: isOpen ? 'auto' : 'none', transition: 'opacity 0.2s'}}>
                                    <div className="schedule-time-select-field" style={{flex: 1}}>
                                        <TimeSelect
                                            value={startTime}
                                            onChange={async (newTime) => {
                                                setBusinessHoursEdits(prev => ({
                                                    ...prev,
                                                    [idx]: { ...editState, startTime: newTime }
                                                }))
                                                if (!isOpen) return
                                                await syncDayRanges(idx, { ...editState, startTime: newTime })
                                            }}
                                        />
                                    </div>
                                    <span style={{color: 'var(--gray-400)', fontWeight: 600}}>-</span>
                                    <div className="schedule-time-select-field" style={{flex: 1}}>
                                        <TimeSelect
                                            value={endTime}
                                            onChange={async (newTime) => {
                                                setBusinessHoursEdits(prev => ({
                                                    ...prev,
                                                    [idx]: { ...editState, endTime: newTime }
                                                }))
                                                if (!isOpen) return
                                                await syncDayRanges(idx, { ...editState, endTime: newTime })
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="schedule-lunch-row" style={{opacity: isOpen ? 1 : 0.4, pointerEvents: isOpen ? 'auto' : 'none', display: 'block'}}>
                                    <div style={{display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8}}>
                                        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                            <button
                                                type="button"
                                                className={`checkbox-circle ${lunchEnabled ? 'checked' : ''}`}
                                                role="checkbox"
                                                aria-checked={lunchEnabled}
                                                aria-label={`Ativar intervalo de almoço em ${dayName}`}
                                                onClick={async () => {
                                                    const next = { ...editState, lunchEnabled: !lunchEnabled }
                                                    setBusinessHoursEdits(prev => ({ ...prev, [idx]: next }))
                                                    if (!isOpen) return
                                                    await syncDayRanges(idx, next)
                                                }}
                                            >
                                                {lunchEnabled && <Check size={12} strokeWidth={4} />}
                                            </button>
                                            <div className="schedule-lunch-label" style={{margin: 0}}>Almoço</div>
                                        </div>
                                    </div>

                                    {lunchEnabled && (
                                        <div className="schedule-lunch-times" style={{display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 0, width: '100%', animation: 'fadeIn 0.2s'}}>
                                            <div className="schedule-time-select-field is-compact" style={{flex: 1}}>
                                                <TimeSelect
                                                    value={lunchStart}
                                                    onChange={async (newTime) => {
                                                        const next = { ...editState, lunchStart: newTime }
                                                        setBusinessHoursEdits(prev => ({ ...prev, [idx]: next }))
                                                        if (!isOpen || !next.lunchEnabled) return
                                                        await syncDayRanges(idx, next)
                                                    }}
                                                />
                                            </div>
                                            <span style={{color: 'var(--gray-400)', fontWeight: 600}}>-</span>
                                            <div className="schedule-time-select-field is-compact" style={{flex: 1}}>
                                                <TimeSelect
                                                    value={lunchEnd}
                                                    onChange={async (newTime) => {
                                                        const next = { ...editState, lunchEnd: newTime }
                                                        setBusinessHoursEdits(prev => ({ ...prev, [idx]: next }))
                                                        if (!isOpen || !next.lunchEnabled) return
                                                        await syncDayRanges(idx, next)
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className={`schedule-day-status ${isOpen ? 'status-open' : 'status-closed'}`} style={{alignSelf: 'flex-start'}}>
                                    {isOpen ? 'Aberto' : 'Fechado'}
                                </div>
                            </div>
                        )
                    })}
                    </div>
                </div>
            )}

            {agendaTab === 'blocks' && (
                <div className="animate-entry">
                     <div className="blocks-list">
                        <div className="card" style={{padding: 20, marginBottom: 12, border: '1px dashed var(--gray-300)', boxShadow: 'none'}}>
                            <h4 style={{margin: '0 0 16px', fontSize: '1rem'}}>Novo Bloqueio</h4>
                            <div className="grid grid-3" style={{gap: 12}}>
                                <div className="agenda-input-group">
                                    <label className="agenda-label">Início</label>
                                    <div className="time-input-wrapper">
                                        <input
                                            type="datetime-local"
                                            className="time-input"
                                            value={timeOffAdd.startsLocal}
                                            onChange={(e) => setTimeOffAdd(prev => ({ ...prev, startsLocal: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="agenda-input-group">
                                    <label className="agenda-label">Fim</label>
                                    <div className="time-input-wrapper">
                                        <input
                                            type="datetime-local"
                                            className="time-input"
                                            value={timeOffAdd.endsLocal}
                                            onChange={(e) => setTimeOffAdd(prev => ({ ...prev, endsLocal: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="agenda-input-group">
                                    <label className="agenda-label">Motivo</label>
                                    <div className="time-input-wrapper">
                                        <input
                                            className="time-input"
                                            value={timeOffAdd.reason}
                                            onChange={(e) => setTimeOffAdd(prev => ({ ...prev, reason: e.target.value }))}
                                            placeholder="Ex: Feriado"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div style={{marginTop: 16, display: 'flex', justifyContent: 'flex-end'}}>
                                <button type="button"
                                    className="btn btnPrimary"
                                    onClick={async () => {
                                        setTimeOffError(null)
                                        const s = parseLocalDateTimeInputToUtc(timeOffAdd.startsLocal, tenantTimeZone)
                                        const e = parseLocalDateTimeInputToUtc(timeOffAdd.endsLocal, tenantTimeZone)
                                        if (!s || !e) {
                                            setTimeOffError('Data inválida')
                                            return
                                        }
                                        const res = await api<{ timeOff: AdminTimeOff }>('/api/admin/time-off', {
                                            method: 'POST',
                                            body: JSON.stringify({ startsAt: s.toISOString(), endsAt: e.toISOString(), reason: timeOffAdd.reason.trim() || null }),
                                        })
                                        if (!res.ok) {
                                            setTimeOffError(res.error.message)
                                            return
                                        }
                                        const created = res.data.timeOff
                                        setTimeOff(prev => [...prev, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)))
                                    }}
                                    disabled={timeOffLoading}
                                >
                                    Adicionar bloqueio
                                </button>
                            </div>
                            {timeOffError && <div style={{color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8}}>{timeOffError}</div>}
                        </div>

                        {timeOff.map((b) => {
                             const dateObj = new Date(b.startsAt)
                             const monthShort = dateObj.toLocaleDateString('pt-BR', { month: 'short' }).toUpperCase().replace('.', '')
                             const dayNum = dateObj.getDate()

                             return (
                                <div key={b.id} className="block-card">
                                    <div className="block-date-badge">
                                        <span style={{fontSize: '0.75rem', opacity: 0.7}}>{monthShort}</span>
                                        <span style={{fontSize: '1.5rem', lineHeight: 1}}>{dayNum}</span>
                                    </div>
                                    <div className="block-info">
                                        <div className="block-title">{b.reason || 'Bloqueio de Agenda'}</div>
                                        <div className="block-meta">
                                            <Clock size={14} />
                                            {formatTimeInZone(b.startsAt, tenantTimeZone)} - {formatTimeInZone(b.endsAt, tenantTimeZone)}
                                            <span style={{margin: '0 6px'}}>•</span>
                                            {formatDateInZone(b.endsAt, tenantTimeZone) !== formatDateInZone(b.startsAt, tenantTimeZone) ? `Até ${formatDateInZone(b.endsAt, tenantTimeZone)}` : 'Mesmo dia'}
                                        </div>
                                    </div>
                                    <button type="button"
                                        className="icon-btn"
                                        style={{color: 'var(--danger)', borderColor: 'transparent'}}
                                        aria-label={`Remover bloqueio de ${formatDateInZone(b.startsAt, tenantTimeZone)}`}
                                        onClick={async () => {
                                            if (!(await confirmAction({ title: 'Remover bloqueio', message: 'O período voltará a ficar disponível para agendamentos, conforme os horários de atendimento.', confirmLabel: 'Remover bloqueio', danger: true }))) return
                                            const res = await api<{ ok: true }>(`/api/admin/time-off/${b.id}`, { method: 'DELETE' })
                                            if(res.ok) {
                                                setTimeOff(prev => prev.filter(x => x.id !== b.id))
                                            }
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                             )
                        })}
                     </div>
                </div>
            )}

            <NewAppointmentModal
                isOpen={isNewAppointmentOpen}
                onClose={() => setIsNewAppointmentOpen(false)}
                onSuccess={handleNewEvent}
                initialDate={currentDate}
                timeZone={tenantTimeZone}
            />

            <AppointmentDetailsModal
                isOpen={!!selectedEvent}
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
                onDelete={handleDeleteEvent}
                onChanged={fetchEvents}
                timeZone={tenantTimeZone}
            />
        </div>
    )
}


