import { useEffect, useState } from 'react'
import { api } from '../../api'
import { ProductDate } from '../../components/ProductDate'
import { formatDateTimeInZone } from '../../dateTime'
import {
  LumaOperationDialog,
  prepareLumaOperation,
  type ReviewAction,
} from './LumaOperationDialog'
type Appointment = {
  id: string
  startsAt: string
  clientName: string
  serviceName: string
  professionalName: string
  status: string
  confirmationStatus: string
  attendanceStatus: string
}
type Report = {
  timezone: string
  totals: {
    total: number
    attended: number
    absent: number
    needsAttendance: number
    cancelled: number
  }
  appointments: Appointment[]
  page: number
  pages: number
}
export function LumaRoutine({ today }: { today: string }) {
  const [start, setStart] = useState(today),
    [end, setEnd] = useState(today),
    [page, setPage] = useState(1),
    [data, setData] = useState<Report | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [review, setReview] = useState<ReviewAction | null>(null),
    [preparing, setPreparing] = useState(false)
  useEffect(() => {
    const c = new AbortController()
    setLoading(true)
    setError('')
    void api<Report>(
      `/api/admin/assistant/calendar?start=${start}&end=${end}&page=${page}`,
      { signal: c.signal },
    ).then((res) => {
      if (c.signal.aborted) return
      setLoading(false)
      if (res.ok) setData(res.data)
      else {
        setData(null)
        setError(res.error.message)
      }
    })
    return () => c.abort()
  }, [start, end, page, revision])
  async function attendance(a: Appointment, status: string) {
    setPreparing(true)
    setError('')
    try {
      setReview(
        await prepareLumaOperation('prepare_attendance', {
          appointment_id: a.id,
          attendance: status,
        }),
      )
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Não foi possível preparar a marcação.',
      )
    } finally {
      setPreparing(false)
    }
  }
  function preset(days: number) {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days - 1)
    setStart(today)
    setEnd(d.toISOString().slice(0, 10))
    setPage(1)
  }
  return (
    <section className="luma-routine" data-tour="luma-routine">
      <header className="luma-work-heading">
        <div>
          <h2>Minha rotina</h2>
          <p className="form-help">
            Escolha um período para acompanhar os atendimentos de toda a equipe.
          </p>
        </div>
        <div className="luma-quick-periods">
          <button type="button" className="btn" onClick={() => preset(1)}>
            Hoje
          </button>
          <button type="button" className="btn" onClick={() => preset(7)}>
            7 dias
          </button>
          <button type="button" className="btn" onClick={() => preset(30)}>
            30 dias
          </button>
        </div>
      </header>
      <div className="card luma-report-filter">
        <ProductDate
          label="De"
          today={today}
          value={start}
          disabled={loading || preparing}
          onChange={(value) => {
            setStart(value)
            if (value > end) setEnd(value)
            setPage(1)
          }}
        />
        <ProductDate
          label="Até"
          today={today}
          value={end}
          disabled={loading || preparing}
          onChange={(value) => {
            setEnd(value)
            setPage(1)
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={loading}
          onClick={() => setRevision(revision + 1)}
        >
          Atualizar
        </button>
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error}
          <button
            type="button"
            className="btn"
            onClick={() => setRevision(revision + 1)}
          >
            Tentar novamente
          </button>
        </p>
      ) : null}
      {loading ? (
        <p role="status">Carregando os atendimentos…</p>
      ) : data ? (
        <>
          <div className="luma-report-metrics">
            {[
              [data.totals.total, 'Atendimentos no período'],
              [data.totals.attended || 0, 'Clientes que vieram'],
              [data.totals.absent || 0, 'Faltas registradas'],
              [data.totals.needsAttendance || 0, 'Comparecimentos a registrar'],
            ].map(([n, label]) => (
              <article key={label} className="card">
                <strong>{n}</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
          <p className="form-help">
            Horários do estúdio: {data.timezone}. Confirmar que vai comparecer
            não significa que a cliente já veio. A marcação abaixo registra o
            que aconteceu.
          </p>
          <div className="luma-appointments">
            {!data.appointments.length ? (
              <div className="card luma-work-empty">
                <h3>Nenhum atendimento neste período</h3>
                <p className="form-help">
                  Escolha outras datas para consultar sua agenda.
                </p>
              </div>
            ) : (
              data.appointments.map((a) => (
                <article className="card luma-appointment" key={a.id}>
                  <div>
                    <time>
                      {formatDateTimeInZone(a.startsAt, data.timezone)}
                    </time>
                    <h3>{a.clientName}</h3>
                    <p>
                      {a.serviceName} ·{' '}
                      {a.professionalName || 'Profissional do estúdio'}
                    </p>
                    <span
                      className={`status-badge ${a.attendanceStatus === 'ATTENDED' ? 'status-success' : a.attendanceStatus === 'NO_SHOW' ? 'status-warning' : 'status-neutral'}`}
                    >
                      {a.status === 'CANCELLED'
                        ? 'Cancelado'
                        : a.attendanceStatus === 'ATTENDED'
                          ? 'Compareceu'
                          : a.attendanceStatus === 'NO_SHOW'
                            ? 'Faltou'
                            : 'Comparecimento não registrado'}
                    </span>
                    {a.attendanceStatus === 'NOT_RECORDED' &&
                    a.status !== 'CANCELLED' ? (
                      <small className="form-help">
                        {['CONFIRMED', 'MANUALLY_CONFIRMED'].includes(
                          a.confirmationStatus,
                        )
                          ? 'A cliente confirmou que vai comparecer.'
                          : 'Confirmação antecipada ainda não registrada.'}
                      </small>
                    ) : null}
                  </div>
                  {a.status !== 'CANCELLED' &&
                  new Date(a.startsAt) <= new Date() ? (
                    <div className="luma-attendance-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={
                          preparing || a.attendanceStatus === 'ATTENDED'
                        }
                        onClick={() => void attendance(a, 'ATTENDED')}
                      >
                        Veio
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={preparing || a.attendanceStatus === 'NO_SHOW'}
                        onClick={() => void attendance(a, 'NO_SHOW')}
                      >
                        Faltou
                      </button>
                      {a.attendanceStatus !== 'NOT_RECORDED' ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={preparing}
                          onClick={() => void attendance(a, 'NOT_RECORDED')}
                        >
                          Retirar marcação
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
          <div className="luma-work-pagination">
            <button
              type="button"
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {data.pages}
            </span>
            <button
              type="button"
              className="btn"
              disabled={page >= data.pages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      ) : null}
      {review ? (
        <LumaOperationDialog
          action={review}
          onClose={() => setReview(null)}
          onDone={() => {
            setReview(null)
            setRevision(revision + 1)
          }}
        />
      ) : null}
    </section>
  )
}
