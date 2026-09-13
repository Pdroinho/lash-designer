import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { formatBrazilPhoneInput, normalizeBrazilPhone } from '../phone'
import { ArrowRight, Check, ShieldCheck, X } from './Icons'
import { PasswordChecklist } from './PasswordChecklist'

type BillingPlan = { cycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'; months: number; label: string; amountCents: number; monthlyEquivalentCents: number; savingsPercent: number; featured: boolean }
type ReferralPreview = { label: string; inviteeDiscountPercent: number; expiresAt: string | null }
type CheckoutLegalConfig = { documents: { termsVersion: string; privacyVersion: string; updatedAt: string; bundleHash: string } }

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const slugify = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)

export function LandingCheckout({ open, onClose, referralToken, initialCycle = 'ANNUAL' }: { open: boolean; onClose: () => void; referralToken?: string; initialCycle?: BillingPlan['cycle'] }) {
  const [plans, setPlans] = useState<BillingPlan[]>([])
  const [cycle, setCycle] = useState<BillingPlan['cycle']>(initialCycle)
  const [step, setStep] = useState<1 | 2>(1)
  const [referral, setReferral] = useState<ReferralPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [legalConfig, setLegalConfig] = useState<CheckoutLegalConfig | null>(null)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [platformMarketingWhatsapp, setPlatformMarketingWhatsapp] = useState(false)
  const [form, setForm] = useState({ ownerName: '', studioName: '', slug: '', email: '', phone: '', password: '' })

  useEffect(() => {
    if (!open) return
    setStep(1)
    setCycle(initialCycle)
    setError('')
    setLegalAccepted(false)
    setPlatformMarketingWhatsapp(false)
    setLegalConfig(null)
    api<CheckoutLegalConfig>('/api/public/legal').then((result) => {
      if (!result.ok) return setError('Não foi possível carregar os documentos legais agora.')
      setLegalConfig(result.data)
    })
    api<{ plans: BillingPlan[] }>('/api/public/billing/plans').then((result) => {
      if (!result.ok) return setError('Não foi possível carregar os ciclos agora.')
      setPlans(result.data.plans)
      setCycle(result.data.plans.some((plan) => plan.cycle === initialCycle) ? initialCycle : (result.data.plans.find((plan) => plan.featured)?.cycle ?? 'ANNUAL'))
    })
    if (referralToken) api<{ referral: ReferralPreview }>(`/api/public/referrals/${encodeURIComponent(referralToken)}`).then((result) => {
      if (result.ok) setReferral(result.data.referral)
      else setError('Esse link de desconto expirou. Você ainda pode continuar pelo valor normal.')
    })
  }, [open, referralToken, initialCycle])

  const selected = useMemo(() => plans.find((plan) => plan.cycle === cycle) ?? plans[0], [plans, cycle])
  const finalAmount = selected ? Math.max(0, selected.amountCents - Math.round(selected.amountCents * (referral?.inviteeDiscountPercent ?? 0) / 100)) : 0

  function updateStudioName(value: string) {
    setForm((current) => ({ ...current, studioName: value, slug: !current.slug || current.slug === slugify(current.studioName) ? slugify(value) : current.slug }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step === 1) { setStep(2); setError(''); return }
    if (!normalizeBrazilPhone(form.phone)) { setError('Informe um WhatsApp brasileiro válido, com DDD.'); return }
    if (!legalConfig) { setError('Os documentos legais ainda estão carregando. Tente novamente em instantes.'); return }
    if (!legalAccepted) { setError('Para contratar o Lash Designer, confirme a leitura e o aceite dos Termos de Uso.'); return }
    setBusy(true)
    setError('')
    try {
      const result = await api<{ activated: boolean; url?: string; workspaceSlug: string }>('/api/public/onboarding/checkout', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          cycle,
          referralToken: referral ? referralToken : undefined,
          legal: {
            accepted: true,
            termsVersion: legalConfig.documents.termsVersion,
            privacyVersion: legalConfig.documents.privacyVersion,
            bundleHash: legalConfig.documents.bundleHash,
          },
          platformMarketingWhatsapp,
        }),
      })
      if (!result.ok) throw new Error(result.error.message)
      if (result.data.url) return window.location.assign(result.data.url)
      const configured = String(import.meta.env.VITE_APP_BASE_URL ?? '').trim()
      if (configured) {
        const base = new URL(configured)
        const rootHost = base.hostname.replace(/^www\./, '')
        const port = base.port ? `:${base.port}` : ''
        return window.location.assign(`${base.protocol}//${result.data.workspaceSlug}.${rootHost}${port}/login?welcome=1`)
      }
      window.location.assign(`/acessar?workspace=${encodeURIComponent(result.data.workspaceSlug)}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a compra.') }
    finally { setBusy(false) }
  }

  if (!open || typeof document === 'undefined') return null
  return createPortal(<div className="landing-checkout-layer" data-blocking-overlay="true" onClick={busy ? undefined : onClose}>
    <section className="landing-checkout-panel" role="dialog" aria-modal="true" aria-labelledby="landing-checkout-title" onClick={(event) => event.stopPropagation()}>
      <div className="checkout-progress" aria-label={`Etapa ${step} de 2`}><i className="is-active" /><i className={step === 2 ? 'is-active' : ''} /></div>
      <header className="landing-checkout-header">
        <div><span>{step === 1 ? '1 de 2 · escolha o ciclo' : '2 de 2 · crie seu acesso'}</span><h2 id="landing-checkout-title">{step === 1 ? 'Quanto mais tempo, menor o valor por mês.' : 'Só o essencial. Sua marca vem depois do pagamento.'}</h2><p>{step === 1 ? 'Todos os ciclos liberam o produto completo.' : 'No setup inicial você envia logo, escolhe cores, horários e serviços.'}</p></div>
        <button type="button" className="landing-checkout-close" data-modal-close onClick={onClose} aria-label="Fechar compra" disabled={busy}><X size={19} /></button>
      </header>

      <form className="landing-checkout-body" onSubmit={submit}>
        {step === 1 ? <>
          <div className="checkout-plan-grid" role="radiogroup" aria-label="Ciclo de pagamento">{plans.map((plan) => {
            const discounted = Math.max(0, plan.amountCents - Math.round(plan.amountCents * (referral?.inviteeDiscountPercent ?? 0) / 100))
            return <button type="button" role="radio" aria-checked={cycle === plan.cycle} className={cycle === plan.cycle ? 'is-selected' : ''} key={plan.cycle} onClick={() => setCycle(plan.cycle)}>
              <span>{plan.label}{plan.featured ? <i>Melhor valor</i> : null}</span>
              <strong>{money(Math.round(discounted / plan.months))}<small>/mês</small></strong>
              <p>{money(discounted)} por {plan.months === 1 ? '1 mês' : `${plan.months} meses`}</p>
              <b>{cycle === plan.cycle ? <Check size={14} /> : null}</b>
            </button>
          })}</div>
          {referral ? <div className="landing-referral-applied"><Check size={16} /><span><strong>{referral.inviteeDiscountPercent}% de desconto aplicado</strong><small>{referral.label}</small></span></div> : null}
          <div className="checkout-cycle-note"><span>Incluído em qualquer ciclo</span><div><i><Check size={13} />Agenda e clientes</i><i><Check size={13} />Financeiro</i><i><Check size={13} />Luma</i><i><Check size={13} />Setup guiado</i></div></div>
        </> : <div className="checkout-account-layout">
          <div className="landing-checkout-fields">
            <label>Seu nome<input value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} autoComplete="name" required minLength={2} placeholder="Como podemos chamar você?" /></label>
            <label>Nome do estúdio<input value={form.studioName} onChange={(event) => updateStudioName(event.target.value)} autoComplete="organization" required minLength={2} placeholder="Ex.: Studio Mariana" /></label>
            <label>E-mail<input type="email" inputMode="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required placeholder="voce@email.com" /></label>
            <label>WhatsApp<input inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: formatBrazilPhoneInput(event.target.value) })} autoComplete="tel" required placeholder="(11) 99999-9999" aria-invalid={Boolean(form.phone && !normalizeBrazilPhone(form.phone))} /></label>
            <label>Crie uma senha<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" minLength={8} required placeholder="Crie uma senha" aria-describedby="checkout-password-requirements" /><PasswordChecklist id="checkout-password-requirements" password={form.password} /></label>
            <details className="checkout-address-details"><summary>Personalizar endereço do espaço</summary><label>Seu endereço<div className="landing-slug-field"><input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required minLength={2} /><span>.lashdesigner</span></div></label></details>
          </div>
          <aside className="checkout-order-card"><span>Seu pedido</span><div><strong>{selected?.label ?? 'Plano'}</strong><small>{selected ? `${selected.months} ${selected.months === 1 ? 'mês' : 'meses'} de acesso completo` : 'Carregando ciclo…'}</small></div><hr /><div className="checkout-order-total"><span>Total agora</span><strong>{selected ? money(finalAmount) : '—'}</strong>{referral && selected ? <small>de {money(selected.amountCents)}</small> : null}</div><ul><li><ShieldCheck size={15} />Pagamento processado pela InfinitePay</li><li><Check size={15} />Sem cobrança automática silenciosa</li></ul></aside>
          <div className="checkout-legal-stack">
            <label className={`checkout-legal-choice is-required ${legalAccepted ? 'is-checked' : ''}`}>
              <input type="checkbox" checked={legalAccepted} onChange={(event) => { setLegalAccepted(event.target.checked); setError('') }} required />
              <span><strong>Li e aceito os <a href="/termos" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Termos de Uso</a></strong><small>Também declaro ciência da <a href="/privacidade" target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>Política de Privacidade</a>. Este aceite é necessário para contratar o serviço.</small></span>
            </label>
            <label className={`checkout-legal-choice ${platformMarketingWhatsapp ? 'is-checked' : ''}`}>
              <input type="checkbox" checked={platformMarketingWhatsapp} onChange={(event) => setPlatformMarketingWhatsapp(event.target.checked)} />
              <span><strong>Quero receber novidades, recursos e ofertas do Lash Designer pelo WhatsApp</strong><small>Opcional. Não interfere na compra e pode ser desativado depois nas configurações da conta.</small></span>
            </label>
          </div>
        </div>}

        {error ? <div className="landing-checkout-error" role="alert">{error}</div> : null}
        <footer className="checkout-actions">
          {step === 2 ? <button type="button" className="checkout-back" onClick={() => setStep(1)} disabled={busy}>Voltar</button> : <span />}
          <button type="submit" className="checkout-next" disabled={busy || !selected || (step === 2 && (!legalConfig || !legalAccepted))}>{busy ? 'Preparando pagamento…' : step === 1 ? <>Continuar com {selected?.label?.toLowerCase() ?? 'este ciclo'} <ArrowRight size={17} /></> : finalAmount === 0 ? <>Ativar meu espaço <ArrowRight size={17} /></> : <>Ir para o pagamento seguro <ArrowRight size={17} /></>}</button>
        </footer>
      </form>
    </section>
  </div>, document.body)
}
