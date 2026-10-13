import { useEffect, useState } from 'react'
import { api } from '../../api'
import { ProductDate } from '../../components/ProductDate'
import { ProductSelect } from '../../components/ProductSelect'
import { formatDateTimeInZone } from '../../dateTime'
import {
  LumaOperationDialog,
  prepareLumaOperation,
  type ReviewAction,
} from './LumaOperationDialog'
type Reminder = { id: string; body: string; dueAt: string; status: string }
const states: Record<string, string> = {
  SCHEDULED: 'Agendado',
  SENDING: 'Enviando',
  SENT: 'Aceito pelo WhatsApp',
  FAILED: 'Não enviado',
  UNKNOWN: 'Envio não confirmado',
  CANCELLED: 'Cancelado',
}
export function LumaReminders({
  today,
  timezone,
}: {
  today: string
  timezone: string
}) {
  const [date, setDate] = useState(today),
    [time, setTime] = useState('09:00'),
    [message, setMessage] = useState(''),
    [rows, setRows] = useState<Reminder[]>([]),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [review, setReview] = useState<ReviewAction | null>(null)
  useEffect(() => {
    const c = new AbortController()
    setLoading(true)
    void api<{ reminders: Reminder[] }>('/api/admin/assistant/reminders', {
      signal: c.signal,
    }).then((res) => {
      if (c.signal.aborted) return
      setLoading(false)
      if (res.ok) setRows(res.data.reminders)
      else setError(res.error.message)
    })
    return () => c.abort()
  }, [revision])
  async function prepare(name: string, args: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      setReview(await prepareLumaOperation(name, args))
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Não foi possível preparar seu lembrete.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section data-tour="luma-reminders">
      <div className="card luma-work-form">
        <h2>Lembretes no meu WhatsApp</h2>
        <p className="form-help">
          A Luma lembra você no número cadastrado para seu acesso. O WhatsApp do
          estúdio precisa estar conectado. Os lembretes usam o fuso {timezone}.
        </p>
        <ProductDate
          today={today}
          minDate={today}
          label="Quando lembrar"
          value={date}
          disabled={busy}
          onChange={setDate}
        />
        <label className="label">
          Horário
          <ProductSelect
            ariaLabel="Horário do lembrete"
            value={time}
            onChange={setTime}
            options={Array.from({ length: 96 }, (_, i) => {
              const s = `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`
              return { value: s, label: s }
            })}
          />
        </label>
        <label className="label">
          O que você quer lembrar?
          <textarea
            className="input"
            rows={3}
            maxLength={800}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex.: conferir os comparecimentos de hoje e organizar os horários de amanhã."
          />
        </label>
        <button
          type="button"
          className="btn btnPrimary"
          disabled={busy}
          onClick={() =>
            void prepare('prepare_whatsapp_reminder', { date, time, message })
          }
        >
          {busy ? 'Preparando…' : 'Agendar lembrete'}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
          <button
            type="button"
            className="btn"
            onClick={() => setRevision(revision + 1)}
          >
            Atualizar
          </button>
        </p>
      ) : null}
      <h3>Meus lembretes</h3>
      {loading ? (
        <p role="status">Carregando…</p>
      ) : !rows.length ? (
        <p className="form-help">Nenhum lembrete criado ainda.</p>
      ) : (
        <div className="luma-reminder-list">
          {rows.map((r) => (
            <article className="card luma-reminder" key={r.id}>
              <div>
                <strong>{r.body}</strong>
                <p>{formatDateTimeInZone(r.dueAt, timezone)}</p>
                <span className="status-badge">
                  {states[r.status] || r.status}
                </span>
                {r.status === 'UNKNOWN' ? (
                  <p className="form-help">
                    Não podemos confirmar se o WhatsApp recebeu este envio.
                    Confira seu celular antes de criar outro lembrete.
                  </p>
                ) : null}
              </div>
              {r.status === 'SCHEDULED' ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    void prepare('prepare_cancel_reminder', {
                      reminder_id: r.id,
                    })
                  }
                >
                  Cancelar lembrete
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
      {review ? (
        <LumaOperationDialog
          action={review}
          onClose={() => setReview(null)}
          onDone={() => {
            setReview(null)
            setMessage('')
            setRevision(revision + 1)
          }}
        />
      ) : null}
    </section>
  )
}
