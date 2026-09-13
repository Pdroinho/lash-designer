import { useEffect, useState } from 'react'
import { api } from '../api'
import { Copy, Link2 } from './Icons'
import { notify } from './FeedbackCenter'

type ReferralOverview = {
  link: null | { id: string; url: string; inviteeDiscountPercent: number; referrerRewardPercent: number; redemptionsCount: number; active: boolean }
  metrics: { total: number; paid: number; customerSavingsCents: number }
  credits: Array<{ discountPercent: number; status: string; createdAt: string }>
  rules: { inviteeDiscountPercent: number; referrerRewardPercent: number; renewalCapPercent: number }
}

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ReferralCenter() {
  const [data, setData] = useState<ReferralOverview | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api<ReferralOverview>('/api/admin/referrals/overview').then((result) => {
    if (result.ok) setData(result.data)
    else notify(result.error.message, 'error')
  })

  useEffect(() => { void load() }, [])

  async function createLink() {
    setBusy(true)
    try {
      const result = await api<{ url: string }>('/api/admin/referrals/link', { method: 'POST', body: '{}' })
      if (!result.ok) throw new Error(result.error.message)
      await navigator.clipboard.writeText(result.data.url)
      notify('Link criado e copiado.', 'success')
      await load()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível criar o link.', 'error')
    } finally { setBusy(false) }
  }

  async function copyLink() {
    if (!data?.link?.url) return
    await navigator.clipboard.writeText(data.link.url)
    notify('Link de indicação copiado.', 'success')
  }

  if (!data) return <div className="referral-page"><div className="skeleton skeleton-card" style={{ height: 360 }} /></div>
  const availablePercent = data.credits.filter((credit) => credit.status === 'AVAILABLE').reduce((sum, credit) => sum + credit.discountPercent, 0)
  const nextDiscount = Math.min(data.rules.renewalCapPercent, availablePercent)

  return (
    <section className="referral-page" aria-labelledby="referral-title">
      <header className="referral-hero">
        <div><span className="eyebrow">Indique e economize</span><h1 id="referral-title">Seu trabalho abre portas. Sua indicação também.</h1><p>Quem chega pelo seu link recebe {data.rules.inviteeDiscountPercent}% na primeira compra. Depois do pagamento confirmado, você recebe {data.rules.referrerRewardPercent}% para a próxima renovação.</p></div>
        <div className="referral-reward"><strong>{nextDiscount}%</strong><span>disponível na próxima renovação</span></div>
      </header>

      <div className="referral-metrics">
        <article><span>Cliques convertidos</span><strong>{data.metrics.paid}</strong><small>{data.metrics.total} cadastros iniciados</small></article>
        <article><span>Economia das indicadas</span><strong>{money(data.metrics.customerSavingsCents)}</strong><small>somente pagamentos confirmados</small></article>
        <article><span>Limite por renovação</span><strong>{data.rules.renewalCapPercent}%</strong><small>créditos excedentes ficam para depois</small></article>
      </div>

      <div className="referral-link-card">
        <div className="referral-link-copy"><Link2 size={22} /><div><h2>Seu link pessoal</h2><p>Compartilhe com profissionais que realmente podem aproveitar a plataforma.</p></div></div>
        {data.link ? <div className="referral-link-field"><input value={data.link.url} readOnly aria-label="Link de indicação" /><button type="button" className="btn btnPrimary" onClick={copyLink}><Copy size={17} />Copiar link</button></div> : <button type="button" className="btn btnPrimary" onClick={createLink} disabled={busy}>{busy ? 'Criando…' : 'Criar meu link'}</button>}
        <p className="referral-rules">O benefício não vira saldo em dinheiro, não vale para autoindicação e só nasce depois da confirmação do primeiro pagamento. O desconto de renovação é limitado a {data.rules.renewalCapPercent}% para manter o programa sustentável.</p>
      </div>
    </section>
  )
}
