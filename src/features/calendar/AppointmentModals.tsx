import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { api } from '../../api'
import type { CalendarEvent } from '../../types'
import { formatDateInZone, formatDateTimeInZone, formatTimeInZone, localDateToYmd, zonedDateTimeToUtc } from '../../dateTime'
import { ProductSelect } from '../../components/ProductSelect'
import { confirmAction, notify } from '../../components/FeedbackCenter'
import { ModalRoot } from '../../components/ModalRoot'

import { appointmentPresenceMeta } from './appointmentPresence'
import type { AdminAppointment, AdminService } from './types'

export function ProductSelectField({
    value,
    onChange,
    options,
    placeholder
}: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string; subLabel?: string }[];
    placeholder?: string;
}) {
    return (
        <ProductSelect
            value={value}
            onChange={onChange}
            options={options.map((option) => ({
                value: option.value,
                label: option.label,
                description: option.subLabel,
            }))}
            placeholder={placeholder}
        />
    )
}

export function NewAppointmentModal({
    isOpen,
    onClose,
    onSuccess,
    initialDate,
    timeZone,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (event: CalendarEvent) => void;
    initialDate: Date;
    timeZone: string;
}) {
    const [clientName, setClientName] = useState('')
    const [clientPhone, setClientPhone] = useState('')
    const [serviceId, setServiceId] = useState('')
    const [date, setDate] = useState('')
    const [time, setTime] = useState('09:00')
    const [loading, setLoading] = useState(false)
    const [services, setServices] = useState<AdminService[]>([])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if(isOpen) {
            // Set default date to initialDate (which is currentDate from calendar)
            setDate(localDateToYmd(initialDate))
            loadServices()
        }
    }, [isOpen, initialDate, timeZone])

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

        const startDateTime = zonedDateTimeToUtc(date, time, timeZone)
        if (!startDateTime) {
            setError('Data ou horário inválido para o fuso do espaço')
            setLoading(false)
            return
        }

        const res = await api<{ appointment: AdminAppointment }>('/api/admin/appointments', {
            method: 'POST',
            body: JSON.stringify({
                clientName: clientName.trim(),
                clientPhone: clientPhone.trim() || undefined,
                serviceId,
                startsAt: startDateTime.toISOString(),
                status: 'CONFIRMED',
            }),
        })

        if (!res.ok) {
            setError(res.error.message)
            setLoading(false)
            return
        }

        const a = res.data.appointment
        const status = a.status === 'CONFIRMED' ? 'confirmed' : a.status === 'PENDING' ? 'pending' : 'cancelled'
        const presence = appointmentPresenceMeta(a.status, a.confirmationStatus)

        onSuccess({
            id: a.id,
            clientName: a.clientName ?? clientName,
            title: a.serviceName,
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
        })

        onClose()
        setLoading(false)

        // Reset form
        setClientName('')
        setClientPhone('')
        setTime('09:00')
    }

    if (!isOpen) return null

    return (
        <ModalRoot className="modal-overlay" onClick={onClose}>
            <div className="ld-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-create-title" onClick={e => e.stopPropagation()}>
                <div className="cardHeader">
                    <h3 id="appointment-create-title" className="cardTitle">Novo Agendamento</h3>
                    <button type="button" className="icon-btn" onClick={onClose} style={{width: 32, height: 32, border: 'none'}} aria-label="Fechar janela">
                        <X size={18} />
                    </button>
                </div>
                <div className="cardBody">
                    <div className="form-stack">
                        <div className="input-group">
                            <label className="label">Cliente</label>
                            <div className="input-wrapper">
                                <input
                                    className="input"
                                    value={clientName}
                                    onChange={e => setClientName(e.target.value)}
                                    placeholder="Nome da cliente"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="label">WhatsApp da cliente <span className="text-muted">(opcional)</span></label>
                            <div className="input-wrapper">
                                <input
                                    className="input"
                                    value={clientPhone}
                                    onChange={(e) => setClientPhone(e.target.value)}
                                    placeholder="(11) 99999-9999"
                                    inputMode="tel"
                                    autoComplete="tel"
                                />
                            </div>
                        </div>

                        <div className="input-group">
                            <label className="label">Serviço</label>
                            <ProductSelectField
                                value={serviceId}
                                onChange={setServiceId}
                                options={services.map(s => ({
                                    value: s.id,
                                    label: s.name,
                                    subLabel: `${s.durationMinutes} min - R$ ${(s.priceCents/100).toFixed(2)}`
                                }))}
                                placeholder="Selecione um serviço"
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
                                    <input
                                        type="time"
                                        className="input"
                                        value={time}
                                        onChange={e => setTime(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="pill" style={{color: 'var(--danger)', background: 'var(--status-danger-bg)', justifyContent: 'center'}}>
                                {error}
                            </div>
                        )}

                        <div className="row" style={{marginTop: 10}}>
                            <button type="button" className="btn w-full" data-modal-close onClick={onClose}>Cancelar</button>
                            <button type="button" className="btn btnPrimary w-full" onClick={handleSubmit} disabled={loading}>
                                {loading ? 'Salvando...' : 'Agendar'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ModalRoot>
    )
}

export function AppointmentDetailsModal({
    isOpen,
    onClose,
    event,
    onDelete,
    onChanged,
    timeZone,
}: {
    isOpen: boolean;
    onClose: () => void;
    event: CalendarEvent | null;
    onDelete: (id: string) => Promise<void>;
    onChanged: () => Promise<void>;
    timeZone: string;
}) {
    const [actionBusy, setActionBusy] = useState(false)
    if (!isOpen || !event) return null

    const presence = appointmentPresenceMeta(event.status.toUpperCase(), event.confirmationStatus)
    const presenceResolved = event.confirmationStatus === 'CONFIRMED' || event.confirmationStatus === 'MANUALLY_CONFIRMED'
    const rawCancelled = event.status === 'cancelled'

    async function runPresenceAction(action: 'manual' | 'resend') {
        if (!event || actionBusy) return
        setActionBusy(true)
        const res = await api(`/api/admin/appointments/${event.id}/confirmation/${action}`, { method: 'POST' })
        setActionBusy(false)
        if (!res.ok) {
            notify(res.error.message, 'error')
            return
        }
        notify(action === 'manual' ? 'Presença confirmada manualmente.' : 'Confirmação enviada pelo WhatsApp.', 'success')
        await onChanged()
        onClose()
    }

    async function cancelAppointment() {
        if (!event || actionBusy) return
        if (!(await confirmAction({ title: 'Cancelar agendamento', message: 'O horário será marcado como cancelado e as automações de confirmação serão interrompidas.', confirmLabel: 'Cancelar agendamento', danger: true }))) return
        setActionBusy(true)
        const res = await api(`/api/admin/appointments/${event.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'CANCELLED' }) })
        setActionBusy(false)
        if (!res.ok) return notify(res.error.message, 'error')
        notify('Agendamento cancelado.', 'success')
        await onChanged()
        onClose()
    }

    return (
        <ModalRoot className="modal-overlay" onClick={onClose} style={{zIndex: 100}}>
            <div className="ld-dialog appointment-details-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-details-title" onClick={e => e.stopPropagation()}>
                <div className="cardHeader appointment-details-head">
                    <div><span className="eyebrow">Agenda</span><h3 id="appointment-details-title" className="cardTitle">{event.clientName}</h3></div>
                    <button type="button" className="icon-btn" onClick={onClose} style={{width: 32, height: 32, border: 'none'}} aria-label="Fechar janela"><X size={18} /></button>
                </div>
                <div className="cardBody appointment-details-body">
                    <section className="appointment-details-summary">
                        <div><span>Serviço</span><strong>{event.title}</strong></div>
                        <div><span>Quando</span><strong>{formatDateInZone(event.start, timeZone)} · {formatTimeInZone(event.start, timeZone)}</strong></div>
                        <div><span>Horário</span><strong>{rawCancelled ? 'Cancelado' : 'Reservado'}</strong></div>
                    </section>

                    <section className="appointment-presence-card">
                        <div className="appointment-presence-card__top">
                            <div><span className="eyebrow">Confirmação de presença</span><strong>{presence.label}</strong></div>
                            <span className={`status-badge ${presence.className}`}>{presence.label}</span>
                        </div>
                        <div className="appointment-presence-card__meta">
                            {event.confirmationSentAt ? <span>Solicitada em {formatDateTimeInZone(event.confirmationSentAt, timeZone)}</span> : <span>A confirmação automática ainda não foi enviada.</span>}
                            {event.confirmationRespondedAt ? <span>Resposta em {formatDateTimeInZone(event.confirmationRespondedAt, timeZone)}</span> : null}
                            {!event.clientPhone ? <span>Sem WhatsApp cadastrado para envio automático.</span> : null}
                        </div>
                        {!rawCancelled ? <div className="appointment-presence-card__actions">
                            {!presenceResolved ? <button type="button" className="btn btnPrimary" onClick={() => void runPresenceAction('manual')} disabled={actionBusy}>Confirmar manualmente</button> : null}
                            {event.clientPhone ? <button type="button" className="btn btn-ghost" onClick={() => void runPresenceAction('resend')} disabled={actionBusy}>{event.confirmationStatus === 'NOT_REQUESTED' ? 'Enviar confirmação' : 'Reenviar WhatsApp'}</button> : null}
                        </div> : null}
                    </section>

                    <div className="appointment-details-actions">
                        {!rawCancelled ? <button type="button" className="btn appointment-cancel-btn" onClick={() => void cancelAppointment()} disabled={actionBusy}>Cancelar agendamento</button> : null}
                        <button type="button" className="btn btn-ghost appointment-delete-btn" onClick={async () => {
                            if (await confirmAction({ title: 'Excluir registro', message: 'Use esta ação apenas para corrigir um registro criado por engano. Para um cancelamento normal, prefira Cancelar agendamento.', confirmLabel: 'Excluir registro', danger: true })) {
                                await onDelete(event.id)
                                onClose()
                            }
                        }}>Excluir registro</button>
                    </div>
                </div>
            </div>
        </ModalRoot>
    )
}

