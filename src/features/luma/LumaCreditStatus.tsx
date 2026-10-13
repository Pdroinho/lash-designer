import { useEffect, useState } from 'react'
import { formatDateTimeInZone } from '../../dateTime'
import { api } from '../../api'
export function LumaCreditStatus({
  timezone = 'America/Sao_Paulo',
}: {
  timezone?: string
}) {
  const [historyOpen, setHistoryOpen] = useState(false),
    [orders, setOrders] = useState<
      Array<{
        orderNsu: string
        credits: number
        amountCents: number
        status: string
        createdAt: string
      }>
    >([]),
    [historyBusy, setHistoryBusy] = useState(false)
  const [scope, setScope] = useState(''),
    [revision, setRevision] = useState(0),
    [state, setState] = useState<{
      status: string
      credits: number
      balance: number
    } | null>(null),
    [error, setError] = useState(''),
    [checking, setChecking] = useState(false)
  useEffect(() => {
    void api<{ storageScope?: string }>('/api/admin/assistant/usage').then(
      (res) => {
        if (res.ok) setScope(res.data.storageScope ?? '')
      },
    )
  }, [])
  useEffect(() => {
    if (!scope) return
    const key = `lashdesigner_pending_luma_credit_order:${scope}`,
      order = localStorage.getItem(key)
    if (!order) return
    let cancelled = false,
      round = 0,
      inFlight = false,
      terminal = false
    const c = new AbortController()
    async function check() {
      if (cancelled || round >= 12 || inFlight || terminal) return
      inFlight = true
      round++
      setChecking(true)
      const res = await api<{
        order: { status: string; credits: number }
        balance: number
      }>(
        `/api/admin/assistant/credits/order-status?orderNsu=${encodeURIComponent(order!)}`,
        { signal: c.signal },
      )
      if (cancelled) return
      inFlight = false
      setChecking(false)
      if (!res.ok) {
        setError(res.error.message)
        return
      }
      setError('')
      setState({ ...res.data.order, balance: res.data.balance })
      if (['PAID', 'REVERSED', 'FAILED'].includes(res.data.order.status)) {
        terminal = true
        localStorage.removeItem(key)
        window.dispatchEvent(new Event('lashdesigner:luma-credits-updated'))
      }
    }
    void check()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check()
    }, 5000)
    return () => {
      cancelled = true
      c.abort()
      clearInterval(timer)
    }
  }, [scope, revision])
  async function openHistory() {
    if (historyOpen) {
      setHistoryOpen(false)
      return
    }
    setHistoryBusy(true)
    const res = await api<{ orders: typeof orders }>(
      '/api/admin/assistant/credits/history',
    )
    setHistoryBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setOrders(res.data.orders)
    setHistoryOpen(true)
  }
  return (
    <div className="luma-credit-area">
      <button
        type="button"
        className="btn btn-ghost"
        aria-expanded={historyOpen}
        disabled={historyBusy}
        onClick={() => void openHistory()}
      >
        {historyBusy ? 'Carregando…' : 'Minhas compras de créditos'}
      </button>
      {historyOpen ? (
        <section className="card luma-credit-history">
          <h3>Últimas compras</h3>
          {!orders.length ? (
            <p className="form-help">Você ainda não comprou créditos extras.</p>
          ) : (
            orders.map((o) => (
              <article key={o.orderNsu}>
                <div>
                  <strong>
                    {o.credits} créditos ·{' '}
                    {(o.amountCents / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                  <small>{formatDateTimeInZone(o.createdAt, timezone)}</small>
                </div>
                <span className="status-badge">
                  {{
                    PAID: 'Pago',
                    PENDING: 'Aguardando pagamento',
                    FAILED: 'Não concluído',
                    REVERSED: 'Estornado',
                  }[o.status] || o.status}
                </span>
              </article>
            ))
          )}
        </section>
      ) : null}
      {state || error ? (
        <div className="card luma-credit-status" role="status">
          <div>
            <strong>
              {state?.status === 'PAID'
                ? 'Pagamento confirmado'
                : state?.status === 'REVERSED'
                  ? 'Pagamento estornado'
                  : state?.status === 'FAILED'
                    ? 'Pagamento não concluído'
                    : 'Aguardando confirmação do pagamento'}
            </strong>
            <p className="form-help">
              {error ||
                (state?.status === 'PAID'
                  ? `${state.credits} créditos recebidos. Saldo disponível: ${state.balance}.`
                  : state?.status === 'REVERSED'
                    ? 'O saldo foi ajustado ao estorno. Créditos já utilizados podem compensar compras futuras.'
                    : state?.status === 'FAILED'
                      ? 'Você pode tentar uma nova compra.'
                      : 'Já pagou? A confirmação chega pelo provedor. Você pode continuar usando a plataforma e conferir novamente.')}
            </p>
          </div>
          {!['PAID', 'REVERSED', 'FAILED'].includes(state?.status ?? '') ? (
            <button
              type="button"
              className="btn"
              disabled={checking}
              onClick={() => setRevision(revision + 1)}
            >
              {checking ? 'Verificando…' : 'Verificar pagamento'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
