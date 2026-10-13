import './billing-center.css'
import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  PUBLIC_TEAM_PLANS,
  validTeamPlans,
  orderedTeamPlans,
  type TeamPlan,
} from '../teamPlans'
import { notify } from './FeedbackCenter'
type Order = {
  orderNsu: string
  amountCents: number
  status: string
  createdAt: string
  paidAt: string | null
}
type TeamCatalog = {
  plans: TeamPlan[]
  checkoutAvailable: boolean
  activeProfessionals: number
  currentSubscription: null | {
    planCode: string | null
    currentPeriodEnd: string | null
  }
  quotes?: Record<string,{amountCents:number;discountPercent:number;source:string;debtRecoveryPercent?:number}>
  orders?: Order[]
}
const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export function BillingCenter({ locked = false }: { locked?: boolean }) {
  const [catalog, setCatalog] = useState<TeamCatalog | null>(null),
    [orders, setOrders] = useState<Order[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [code, setCode] = useState<TeamPlan['code']>('TEAM_3'),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoading(true)
    setError('')
    setCatalog(null)
    void api<TeamCatalog>('/api/admin/subscription/team-plans', {
      signal: controller.signal,
    }).then((res) => {
      if (!current) return
      if (res.ok && validTeamPlans(res.data?.plans)) {
        const plans = orderedTeamPlans(res.data.plans)
        setCatalog({ ...res.data, checkoutAvailable: res.data.checkoutAvailable === true, plans })
        setCode(
          plans.find((plan) => plan.seats >= res.data.activeProfessionals)
            ?.code ?? 'TEAM_15',
        )
        setOrders((previous) => [
          ...(res.data.orders ?? []),
          ...previous.filter(
            (old) =>
              !(res.data.orders ?? []).some(
                (next) => next.orderNsu === old.orderNsu,
              ),
          ),
        ])
      } else
        setError(
          res.ok
            ? 'O catálogo recebido é inválido. Atualize antes de contratar.'
            : res.error.message,
        )
      setLoading(false)
    })
    // Existing financial records remain visible; they never replace the current offer.
    if (!locked)
      void api<{ orders: Order[] }>('/api/admin/billing/overview', {
        signal: controller.signal,
      }).then((res) => {
        if (current && res.ok && Array.isArray(res.data?.orders))
          setOrders((previous) => [
            ...previous,
            ...res.data.orders.filter(
              (order) =>
                !previous.some((item) => item.orderNsu === order.orderNsu),
            ),
          ])
      })
    return () => {
      current = false
      controller.abort()
    }
  }, [locked, retry])
  useEffect(() => {
    if (!locked || !catalog?.checkoutAvailable) return
    const controller = new AbortController()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible')
        void api<{
          user: {
            billingRecovery?: boolean
            subscriptionStatus?: string
          } | null
        }>('/api/auth/me', { signal: controller.signal }).then((res) => {
          if (
            !controller.signal.aborted &&
            res.ok &&
            res.data.user?.subscriptionStatus === 'ACTIVE' &&
            !res.data.user.billingRecovery
          )
            window.location.reload()
        })
    }, 5000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [locked, catalog?.checkoutAvailable])
  const plans = catalog?.plans ?? PUBLIC_TEAM_PLANS,
    selected = plans.find((plan) => plan.code === code) ?? plans[0]
  const tooSmall = Boolean(
      catalog && selected.seats < catalog.activeProfessionals,
    ),
    active = Boolean(catalog?.currentSubscription)
  const quote=catalog?.quotes?.[code]
  const finalAmount=quote?.amountCents ?? selected.amountCents
  async function startTeamCheckout() {
    if (busy || loading || !catalog?.checkoutAvailable || tooSmall || active)
      return
    setBusy(true)
    setError('')
    const res = await api<{ checkoutUrl: string; intentId: string }>(
      '/api/admin/subscription/team-checkout',
      { method: 'POST', body: JSON.stringify({ planCode: code }) },
    )
    if (!res.ok) {
      setError(res.error.message)
      notify(res.error.message, 'error')
      setBusy(false)
      return
    }
    localStorage.setItem(
      'lashdesigner_appmax_pending_intent',
      res.data.intentId,
    )
    window.location.assign(res.data.checkoutUrl)
  }
  return (
    <section
      className={`billing-shell staff52-billing ${locked ? 'billing-shell--locked' : ''}`}
      aria-labelledby="billing-title"
    >
      <div className="billing-intro">
        <div>
          <span className="eyebrow">Assinatura Lash Designer</span>
          <h1 id="billing-title">O tamanho certo para o seu estúdio</h1>
          <p>
            Uma assinatura para a equipe, agenda por profissional e um WhatsApp
            do estúdio. O valor é mensal por faixa de profissionais.
          </p>
        </div>
      </div>
      <div className="billing-layout">
        <div
          className="billing-plan-grid"
          role="radiogroup"
          aria-label="Faixa de profissionais"
        >
          {plans.map((plan) => (
            <button
              type="button"
              role="radio"
              aria-checked={plan.code === code}
              className={`billing-plan ${plan.code === code ? 'is-selected' : ''}`}
              key={plan.code}
              onClick={() => setCode(plan.code)}
              disabled={busy}
            >
              <span className="billing-plan__top">
                <strong>{plan.label}</strong>
              </span>
              <span className="billing-plan__monthly">
                <b>{money(plan.amountCents)}</b>
                <small>/mês</small>
              </span>
              <span className="billing-plan__total">
                Até {plan.seats} profissionais agendáveis
              </span>
            </button>
          ))}
        </div>
        <aside className="billing-summary">
          <span className="eyebrow">Resumo</span>
          <h2>{selected.label}</h2>
          <div className="billing-summary__price">
            <strong>{money(finalAmount)}</strong>
            <span>por um mês</span>
          </div>
          {quote?.debtRecoveryPercent ? <p role="status">{quote.debtRecoveryPercent}% dos créditos compensam benefícios de indicações estornadas. O restante entra no desconto mostrado; não há cobrança automática.</p> : null}
          {quote && quote.discountPercent > 0 ? <p role="status">{quote.discountPercent}% de desconto {quote.source === 'REFERRAL' ? 'pela indicação, na primeira assinatura' : 'com seus créditos de indicação'}. Valor normal da faixa: {money(selected.amountCents)}/mês. Créditos excedentes ficam para renovações futuras.</p> : null}
          <p>
            Pagamento avulso. A renovação não é automática. Acesso liberado após
            confirmação do pagamento.
          </p>
          {active ? (
            <p role="status">
              {catalog?.currentSubscription?.currentPeriodEnd
                ? `Seu período atual vai até ${new Date(catalog.currentSubscription.currentPeriodEnd).toLocaleDateString('pt-BR')}. `
                : ''}
              A transição de contratos ativos ainda não está disponível neste
              checkout.
            </p>
          ) : tooSmall ? (
            <p role="status">
              Esta faixa comporta menos profissionais do que os{' '}
              {catalog?.activeProfessionals} ativos no estúdio.
            </p>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          {!loading && !catalog?.checkoutAvailable ? (
            <p role="status">
              Contratação temporariamente indisponível. Os planos e valores
              continuam atualizados.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btnPrimary billing-checkout"
            disabled={
              loading ||
              busy ||
              !catalog?.checkoutAvailable ||
              tooSmall ||
              active
            }
            onClick={() => void startTeamCheckout()}
          >
            {loading
              ? 'Verificando disponibilidade…'
              : busy
                ? 'Preparando checkout…'
                : !catalog?.checkoutAvailable
                  ? 'Contratação indisponível'
                  : 'Ir para o checkout Appmax'}
          </button>
          {!loading && !catalog?.checkoutAvailable ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRetry((value) => value + 1)}
            >
              Tentar novamente
            </button>
          ) : null}
        </aside>
      </div>
      <div
        className="billing-mobile-cta"
        aria-label={`Plano selecionado: ${selected.label}`}
      >
        <div>
          <small>{selected.label}</small>
          <strong>{money(finalAmount)} agora</strong>
        </div>
        <button
          type="button"
          disabled={
            loading || busy || !catalog?.checkoutAvailable || tooSmall || active
          }
          onClick={() => void startTeamCheckout()}
        >
          {loading
            ? 'Verificando…'
            : busy
              ? 'Preparando…'
              : !catalog?.checkoutAvailable
                ? 'Indisponível'
                : active
                  ? 'Plano ativo'
                  : 'Continuar'}
        </button>
      </div>
      {!locked && orders.length ? (
        <div className="billing-history">
          <div>
            <span className="eyebrow">Histórico</span>
            <h2>Pagamentos recentes</h2>
          </div>
          <div className="billing-history__list">
            {orders.slice(0, 10).map((order) => (
              <div key={order.orderNsu}>
                <span>
                  {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                </span>
                <strong>{money(order.amountCents)}</strong>
                <em data-status={order.status}>
                  {order.status === 'PAID'
                    ? 'Pago'
                    : order.status === 'PENDING'
                      ? 'Pendente'
                      : order.status}
                </em>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
