import { useEffect, useState } from 'react'
import { api } from '../../api'
import { statusLabels } from '../support/types'
type Ticket = {
  id: number
  protocol: string
  subject: string
  status: string
  unread?: number
}
export function LumaSupportSummary({
  onAsk,
}: {
  onAsk: (prompt: string) => void
}) {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true)
  useEffect(() => {
    const c = new AbortController()
    async function load() {
      const res = await api<{ tickets: Ticket[] }>(
        '/api/admin/assistant/support',
        { signal: c.signal },
      )
      if (c.signal.aborted) return
      setLoading(false)
      if (res.ok) {
        setTickets(res.data.tickets)
        setError('')
      } else setError(res.error.message)
    }
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 20000)
    return () => {
      c.abort()
      clearInterval(timer)
    }
  }, [])
  return (
    <section>
      <header className="luma-work-heading">
        <div>
          <h2>Ajuda e acompanhamento</h2>
          <p className="form-help">
            A Luma ajuda a explicar o problema, preparar seu pedido e entender
            as respostas da equipe.
          </p>
        </div>
        <button
          type="button"
          className="btn btnPrimary"
          onClick={() =>
            onAsk(
              'Preciso de ajuda. Quero que você me ajude a descrever o que aconteceu e preparar um pedido para o suporte humano.',
            )
          }
        >
          Pedir ajuda com a Luma
        </button>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p role="status">Carregando meus pedidos…</p>
      ) : !tickets.length ? (
        <div className="card luma-work-empty">
          <p>
            Se precisar de ajuda, comece pela Luma. Os pedidos enviados à equipe
            vão aparecer aqui.
          </p>
        </div>
      ) : (
        <div className="luma-reminder-list">
          {tickets.map((t) => (
            <article className="card luma-reminder" key={t.id}>
              <div>
                <small>{t.protocol}</small>
                <h3>{t.subject}</h3>
                <span className="status-badge">{statusLabels[t.status]}</span>
                {t.unread ? (
                  <strong>{t.unread} mensagem(ns) nova(s)</strong>
                ) : null}
              </div>
              <div className="luma-support-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    onAsk(
                      `Consulte meu pedido ${t.protocol} e explique o estado atual, a última resposta pública da equipe e o que preciso fazer agora.`,
                    )
                  }
                >
                  Luma, me atualize
                </button>
                <a
                  className="btn btn-ghost"
                  href={`/admin?view=support&ticket=${t.id}`}
                >
                  Ver conversa
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
