import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { Copy } from './Icons'
import { notify } from './FeedbackCenter'

type DevReferralData = {
  metrics: { activeLinks: number; totalRedemptions: number; paidRedemptions: number; grantedDiscountCents: number; availableCredits: number }
  links: Array<{ id: string; label: string; url: string; ownerName: string | null; inviteeDiscountPercent: number; referrerRewardPercent: number; maxRedemptions: number; redemptionsCount: number; expiresAt: string | null; active: boolean }>
  recent: Array<{ id: string; status: string; invitedName: string; ownerName: string | null; grossAmountCents: number; discountAmountCents: number; createdAt: string }>
}

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function DevReferrals() {
  const [data, setData] = useState<DevReferralData | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ label: '', inviteeDiscountPercent: 15, referrerRewardPercent: 0, maxRedemptions: 1, expiresAt: '', confirmation: '' })
  const load = () => api<DevReferralData>('/api/dev/referrals').then((result) => result.ok ? setData(result.data) : notify(result.error.message, 'error'))
  useEffect(() => { void load() }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api('/api/dev/referrals/links', { method: 'POST', body: JSON.stringify({ ...form, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null }) })
      if (!result.ok) throw new Error(result.error.message)
      notify('Link de desconto criado com segurança.', 'success')
      setForm({ label: '', inviteeDiscountPercent: 15, referrerRewardPercent: 0, maxRedemptions: 1, expiresAt: '', confirmation: '' })
      await load()
    } catch (error) { notify(error instanceof Error ? error.message : 'Não foi possível gerar o link.', 'error') }
    finally { setBusy(false) }
  }

  async function toggle(id: string, active: boolean) {
    const result = await api(`/api/dev/referrals/links/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) })
    if (!result.ok) return notify(result.error.message, 'error')
    await load()
  }

  if (!data) return <div className="skeleton skeleton-card" style={{ height: 440 }} />
  return (
    <section className="dev-referrals" aria-labelledby="dev-referrals-title">
      <header className="dev-section-heading"><span className="eyebrow">Governança comercial</span><h1 id="dev-referrals-title">Indicações e links de desconto</h1><p>Acompanhe conversões, limite exposição e revogue campanhas sem alterar preços do plano.</p></header>
      <div className="platform-metrics">
        <article><span>Links ativos</span><strong>{data.metrics.activeLinks}</strong><small>inclui links de clientes</small></article>
        <article><span>Pagamentos indicados</span><strong>{data.metrics.paidRedemptions}</strong><small>de {data.metrics.totalRedemptions} tentativas</small></article>
        <article><span>Desconto concedido</span><strong>{money(data.metrics.grantedDiscountCents)}</strong><small>em pagamentos confirmados</small></article>
        <article><span>Créditos disponíveis</span><strong>{data.metrics.availableCredits}</strong><small>para próximas renovações</small></article>
      </div>

      <div className="dev-referral-grid">
        <form className="card dev-referral-form" onSubmit={submit}>
          <div className="cardHeader"><div><h2 className="cardTitle">Gerar link administrativo</h2><p className="cardDesc">Até 100%, sempre com validade e uso controlados.</p></div></div>
          <div className="cardBody form-stack">
            <div className="input-group"><label className="label" htmlFor="discount-label">Identificação</label><input id="discount-label" className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex.: Parceria agosto" required /></div>
            <div className="row"><div className="input-group"><label className="label" htmlFor="discount-percent">Desconto da indicada (%)</label><input id="discount-percent" className="input" type="number" min="0" max="100" value={form.inviteeDiscountPercent} onChange={(e) => setForm({ ...form, inviteeDiscountPercent: Number(e.target.value) })} /></div><div className="input-group"><label className="label" htmlFor="reward-percent">Crédito de quem indicou (%)</label><input id="reward-percent" className="input" type="number" min="0" max="30" value={form.referrerRewardPercent} onChange={(e) => setForm({ ...form, referrerRewardPercent: Number(e.target.value) })} /></div></div>
            <div className="row"><div className="input-group"><label className="label" htmlFor="discount-uses">Máximo de usos</label><input id="discount-uses" className="input" type="number" min="1" max="100000" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: Number(e.target.value) })} /></div><div className="input-group"><label className="label" htmlFor="discount-expiry">Validade</label><input id="discount-expiry" className="input" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div></div>
            {form.inviteeDiscountPercent === 100 ? <div className="input-group high-discount-confirm"><label className="label" htmlFor="discount-confirm">Confirmação obrigatória</label><input id="discount-confirm" className="input" value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} placeholder="GERAR 100%" /><small>Links de 100% são automaticamente limitados a um uso e sete dias.</small></div> : null}
            <button type="submit" className="btn btnPrimary" disabled={busy}>{busy ? 'Gerando…' : 'Gerar link controlado'}</button>
          </div>
        </form>

        <div className="card dev-referral-list"><div className="cardHeader"><div><h2 className="cardTitle">Links recentes</h2><p className="cardDesc">A URL é um cupom portador: compartilhe apenas com quem deve usar.</p></div></div><div className="cardBody">{data.links.length === 0 ? <p className="cardDesc">Nenhum link criado.</p> : data.links.map((link) => <article className="dev-referral-row" key={link.id}><div><strong>{link.label}</strong><span>{link.ownerName || 'Campanha administrativa'} · {link.inviteeDiscountPercent}% · {link.redemptionsCount}/{link.maxRedemptions} usos</span></div><div><button type="button" className="icon-btn" aria-label="Copiar link" onClick={() => { void navigator.clipboard.writeText(link.url); notify('Link copiado.', 'success') }}><Copy size={17} /></button><button type="button" className="btn" onClick={() => void toggle(link.id, !link.active)}>{link.active ? 'Revogar' : 'Reativar'}</button></div></article>)}</div></div>
      </div>
    </section>
  )
}
