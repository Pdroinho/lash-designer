import { useEffect, useState } from 'react'
import { api } from '../api'
import { Copy, Link2 } from './Icons'
import { notify } from './FeedbackCenter'

type ReferralOverview = {
  link: null | { id: string; url: string; inviteeDiscountPercent: number; referrerRewardPercent: number; redemptionsCount: number; active: boolean }
  metrics: { total: number; paid: number; customerSavingsCents: number }
  credits: Array<{ discountPercent: number; status: string; createdAt: string }>
  availableRenewalDiscountPercent?: number
  debtRecoveryPercent?: number
  teamDiscountsAvailable?: boolean
  rules: { inviteeDiscountPercent: number; referrerRewardPercent: number; renewalCapPercent: number }
}

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ReferralCenter() {
  const [data, setData] = useState<ReferralOverview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => api<ReferralOverview>('/api/admin/referrals/overview').then((result) => {
    if (result.ok) { setData(result.data); setLoadError(null) }
    else setLoadError(result.error.message)
  })

  useEffect(() => { void load() }, [])

  async function createLink() {
    if (!data?.teamDiscountsAvailable) return
    setBusy(true)
    try {
      const result = await api<{ url: string }>('/api/admin/referrals/link', { method: 'POST', body: '{}' })
      if (!result.ok) throw new Error(result.error.message)
      await load()
      try {
        await navigator.clipboard.writeText(result.data.url)
        notify('Link criado e copiado.', 'success')
      } catch { notify('Link criado. Selecione e copie o endereço abaixo.', 'warning') }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível criar o link.', 'error')
    } finally { setBusy(false) }
  }

  async function copyLink() {
    if (!data?.link?.url) return
    try {
      await navigator.clipboard.writeText(data.link.url)
      notify('Link de indicação copiado.', 'success')
    } catch { notify('Não foi possível copiar automaticamente. Selecione e copie o endereço do link.', 'warning') }
  }

  if (!data && loadError) return <section className="referral-page"><p role="alert">{loadError}</p><button type="button" className="btn btnPrimary" onClick={() => void load()}>Tentar novamente</button></section>
  if (!data) return <div className="referral-page"><div className="skeleton skeleton-card" style={{ height: 360 }} /></div>
  const availablePercent = data.credits.filter((credit) => credit.status === 'AVAILABLE').reduce((sum, credit) => sum + credit.discountPercent, 0)
  const nextDiscount = data.availableRenewalDiscountPercent ?? Math.min(data.rules.renewalCapPercent, availablePercent)

  return (
    <section className="referral-page" aria-labelledby="referral-title">
      {loadError ? <p role="alert">{loadError}</p> : null}
      <header className="referral-hero">
        <div><span className="eyebrow">Indicações da plataforma</span><h1 id="referral-title">Indique o Lash Designer a outro estúdio.</h1><p>{data.teamDiscountsAvailable ? `Ele recebe ${data.rules.inviteeDiscountPercent}% na primeira assinatura paga. Após a confirmação, você ganha ${data.rules.referrerRewardPercent}% para renovar sua assinatura.` : 'Benefícios em atualização. Descontos e créditos de indicação ainda não são aplicados aos planos por equipe.'}</p></div>
        <div className="referral-reward"><strong>{nextDiscount}%</strong><span>{data.teamDiscountsAvailable ? 'de desconto na próxima renovação da assinatura' : 'em créditos anteriores · uso indisponível'}</span></div>
      </header>

      <div className="referral-metrics">
        <article><span>Estúdios com pagamento confirmado</span><strong>{data.metrics.paid}</strong><small>{data.metrics.total} assinaturas iniciadas pelo seu link</small></article>
        <article><span>Economia dos estúdios indicados</span><strong>{money(data.metrics.customerSavingsCents)}</strong><small>somente pagamentos confirmados</small></article>
        <article><span>{data.teamDiscountsAvailable ? 'Limite por renovação' : 'Teto do programa anterior'}</span><strong>{data.rules.renewalCapPercent}%</strong><small>{data.teamDiscountsAvailable ? 'Créditos excedentes ficam para as próximas renovações' : 'não representa desconto disponível no checkout atual'}</small></article>
      </div>

      {data.debtRecoveryPercent ? <p role="status">{data.debtRecoveryPercent}% dos créditos serão usados para compensar benefícios de indicações estornadas antes de liberar novo desconto. Não há cobrança automática.</p> : null}
      <div className="referral-link-card">
        <div className="referral-link-copy"><Link2 size={22} /><div><h2>Seu link de indicação da plataforma</h2><p>Para convidar estúdios. O link de agendamento das suas clientes fica no Início.</p></div></div>
        {data.link?.active ? <div className="referral-link-field"><input value={data.link.url} readOnly onFocus={(event) => event.currentTarget.select()} aria-label="Link de indicação" /><button type="button" className="btn btnPrimary" onClick={copyLink}><Copy size={17} />Copiar link</button></div> : <button type="button" className="btn btnPrimary" onClick={createLink} disabled={busy || !data.teamDiscountsAvailable}>{busy ? 'Criando…' : data.teamDiscountsAvailable ? 'Criar meu link' : 'Programa em atualização'}</button>}
        <p className="referral-rules">{!data.teamDiscountsAvailable ? 'Links antigos não dão desconto no checkout atual. O histórico foi preservado.' : `O benefício é desconto na assinatura, não saldo em dinheiro. Não vale para autoindicação e só é liberado após o primeiro pagamento confirmado. Limite de ${data.rules.renewalCapPercent}% por renovação.`}</p>
      </div>
    </section>
  )
}
