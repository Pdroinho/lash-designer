import { useEffect, useState } from 'react'
import { api } from '../../api'
import {
  getZonedDateTimeParts,
  zonedDateTimeToUtc,
  formatDateTimeInZone,
} from '../../dateTime'
import { confirmAction, notify } from '../../components/FeedbackCenter'
import { TeamDate } from './TeamDate'
import { TeamTime } from './TeamHours'
import { clock, type Professional } from './teamTypes'
type TimeOff = {
  id: string
  startsAt: string
  endsAt: string
  reason: string | null
}
export function ProfessionalTimeOff({
  person,
  timezone,
  onBusyChange,
}: {
  person: Professional
  timezone: string
  onBusyChange: (busy: boolean) => void
}) {
  const today = getZonedDateTimeParts(new Date(), timezone)!.ymd
  const [startDate, setStartDate] = useState(''),
    [endDate, setEndDate] = useState(''),
    [startMinute, setStartMinute] = useState(540),
    [endMinute, setEndMinute] = useState(1080),
    [reason, setReason] = useState(''),
    [blocks, setBlocks] = useState<TimeOff[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    onBusyChange(busy)
    return () => onBusyChange(false)
  }, [busy, onBusyChange])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void api<{ timeOff: TimeOff[] }>(
      `/api/admin/professionals/${person.id}/time-off`,
      { signal: controller.signal },
    ).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (result.ok) setBlocks(result.data.timeOff)
      else setError(result.error.message)
    })
    return () => controller.abort()
  }, [person.id, revision])
  async function add() {
    const start = zonedDateTimeToUtc(startDate, clock(startMinute), timezone),
      end = zonedDateTimeToUtc(endDate, clock(endMinute), timezone)
    if (!start || !end || start >= end || start < new Date()) {
      setError('Escolha um período futuro. O fim precisa ser depois do início.')
      return
    }
    setBusy(true)
    setError('')
    const result = await api(`/api/admin/professionals/${person.id}/time-off`, {
      method: 'POST',
      body: JSON.stringify({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        reason: reason.trim(),
      }),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setStartDate('')
    setEndDate('')
    setReason('')
    setRevision(revision + 1)
    notify('Período bloqueado na agenda.', 'success')
  }
  async function remove(block: TimeOff) {
    if (
      !(await confirmAction({
        title: 'Liberar este período?',
        message:
          'As clientes poderão voltar a agendar nos horários disponíveis desse período.',
        confirmLabel: 'Liberar período',
      }))
    )
      return
    setBusy(true)
    setError('')
    const result = await api(
      `/api/admin/professionals/${person.id}/time-off/${block.id}`,
      { method: 'DELETE' },
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setRevision(revision + 1)
    notify('Período liberado.', 'success')
  }
  return (
    <div>
      <h3>Folgas e ausências</h3>
      <p className="team-help">
        Bloqueie férias, folgas ou outro compromisso. Se já houver atendimento,
        será preciso reagendá-lo antes. Os horários abaixo seguem o fuso do
        estúdio ({timezone}).
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
        className="team-off-form"
      >
        <div className="team-off-dates">
          <div>
            <TeamDate
              label="Data de início"
              today={today}
              value={startDate}
              disabled={busy}
              onChange={(value) => {
                setStartDate(value)
                if (!endDate || endDate < value) setEndDate(value)
              }}
            />
            <label className="team-field">
              Horário de início
              <TeamTime
                label="Horário de início"
                value={startMinute}
                onChange={setStartMinute}
                disabled={busy}
              />
            </label>
          </div>
          <div>
            <TeamDate
              label="Data de fim"
              today={today}
              value={endDate}
              disabled={busy}
              onChange={setEndDate}
            />
            <label className="team-field">
              Horário de fim
              <TeamTime
                label="Horário de fim"
                value={endMinute}
                onChange={setEndMinute}
                disabled={busy}
              />
            </label>
          </div>
        </div>
        <label className="team-field">
          Motivo (opcional)
          <input
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: férias"
            maxLength={200}
            disabled={busy}
          />
        </label>
        <button
          type="submit"
          className="btn btnPrimary"
          disabled={busy || loading}
        >
          {busy ? 'Salvando…' : 'Bloquear período'}
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setError('')
              setRevision(revision + 1)
            }}
          >
            Tentar novamente
          </button>
        </p>
      ) : null}
      <h4>Próximos períodos bloqueados</h4>
      {loading ? (
        <p role="status">Carregando folgas…</p>
      ) : !blocks.length ? (
        <p className="team-help">Nenhum período bloqueado por enquanto.</p>
      ) : (
        <ul className="team-off-list">
          {blocks.map((block) => (
            <li key={block.id}>
              <div>
                <strong>{block.reason || 'Ausência'}</strong>
                <span>
                  {formatDateTimeInZone(block.startsAt, timezone)} até{' '}
                  {formatDateTimeInZone(block.endsAt, timezone)}
                </span>
              </div>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void remove(block)}
              >
                Liberar período
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
