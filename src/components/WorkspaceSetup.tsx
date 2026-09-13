import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { optimizeImageFile } from '../imageProcessing'
import type { TenantPublic } from '../types'
import { ArrowRight, Check, Palette, Sparkles, Upload } from './Icons'
import { ProductSelect } from './ProductSelect'

type SetupMode = 'ASSISTED' | 'MANUAL'
type PaletteOption = { name: string; primary: string; secondary: string; background: string; rationale: string }
type ServiceDraft = { name: string; durationMinutes: number; price: string }

const defaultPalettes: PaletteOption[] = [
  { name: 'Rosé essencial', primary: '#9B4266', secondary: '#33272D', background: '#FCF7F9', rationale: 'Delicada, profissional e fácil de aplicar.' },
  { name: 'Nude sofisticado', primary: '#82605B', secondary: '#312927', background: '#FAF7F3', rationale: 'Minimalista e acolhedora para uma marca premium.' },
  { name: 'Grafite lavanda', primary: '#66566E', secondary: '#29252C', background: '#F8F6FA', rationale: 'Elegante, atual e com personalidade discreta.' },
]

const weekdays = [
  ['D', 'Domingo'], ['S', 'Segunda'], ['T', 'Terça'], ['Q', 'Quarta'], ['Q', 'Quinta'], ['S', 'Sexta'], ['S', 'Sábado'],
] as const

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

// The API validates the base64 string (roughly 4/3 of the encoded blob size),
// so keep the binary comfortably below the 450 kB request-field ceiling.
const optimizeLogo = (file: File) => optimizeImageFile(file, { maxBytes: 300_000, maxDimension: 720, quality: .82 })

export function WorkspaceSetup({ tenant, onComplete }: { tenant: TenantPublic | null; onComplete: (tenant?: TenantPublic) => void }) {
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<SetupMode>('ASSISTED')
  const [step, setStep] = useState(0)
  const [businessName, setBusinessName] = useState(tenant?.name ?? '')
  const [logoUrl, setLogoUrl] = useState(tenant?.logoUrl ?? '')
  const [preferences, setPreferences] = useState('elegante, acolhedora e moderna')
  const [palettes, setPalettes] = useState(defaultPalettes)
  const [selectedPalette, setSelectedPalette] = useState(0)
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5, 6])
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [services, setServices] = useState<ServiceDraft[]>([
    { name: 'Extensão clássica', durationMinutes: 120, price: '150,00' },
    { name: 'Volume brasileiro', durationMinutes: 150, price: '190,00' },
    { name: 'Manutenção', durationMinutes: 90, price: '100,00' },
  ])
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisSource, setAnalysisSource] = useState<'VISION' | 'CURATED' | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (tenant) {
      setBusinessName(tenant.name)
      setLogoUrl(tenant.logoUrl ?? '')
    }
  }, [tenant])

  useEffect(() => {
    api<{ onboarding: { status: string } }>('/api/admin/onboarding').then((result) => {
      if (result.ok && result.data.onboarding.status === 'PENDING') setVisible(true)
    })
  }, [])

  async function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    try { setLogoUrl(await optimizeLogo(file)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível processar a logo.') }
    finally { event.target.value = '' }
  }

  async function analyzeBrand() {
    setAnalyzing(true)
    setError('')
    try {
      const result = await api<{ palettes: PaletteOption[]; source: 'VISION' | 'CURATED' }>('/api/admin/onboarding/brand-suggestions', {
        method: 'POST',
        body: JSON.stringify({ businessName, preferences, logoDataUrl: logoUrl.startsWith('data:image/') ? logoUrl : null }),
      })
      if (!result.ok) throw new Error(result.error.message)
      setPalettes(result.data.palettes)
      setSelectedPalette(0)
      setAnalysisSource(result.data.source)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar as sugestões.') }
    finally { setAnalyzing(false) }
  }

  function updateService(index: number, patch: Partial<ServiceDraft>) {
    setServices((current) => current.map((service, itemIndex) => itemIndex === index ? { ...service, ...patch } : service))
  }

  async function finish() {
    const palette = palettes[selectedPalette]
    if (!palette) return
    const normalizedServices = services.filter((service) => service.name.trim()).map((service) => ({
      name: service.name.trim(),
      durationMinutes: Number(service.durationMinutes),
      priceCents: Math.max(0, Math.round(Number(service.price.replace(/\./g, '').replace(',', '.')) * 100)),
    }))
    if (!businessName.trim() || normalizedServices.length === 0 || workingDays.length === 0) {
      setError('Revise o nome, os dias de atendimento e pelo menos um serviço.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api<{ tenant: TenantPublic }>('/api/admin/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({
          mode, businessName, primaryColor: palette.primary, secondaryColor: palette.secondary,
          logoUrl: logoUrl || null, workingDays, startMinute: timeToMinutes(startTime), endMinute: timeToMinutes(endTime),
          services: normalizedServices, answers: { preferences, palette: palette.name },
        }),
      })
      if (!result.ok) throw new Error(result.error.message)
      setVisible(false)
      onComplete(result.data.tenant)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a configuração.') }
    finally { setBusy(false) }
  }

  async function skip() {
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/admin/onboarding/skip', { method: 'POST' })
      if (!result.ok) throw new Error(result.error.message)
      setVisible(false)
      onComplete()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar essa escolha.')
    } finally { setBusy(false) }
  }

  function advance() {
    setError('')
    if (step === 1 && businessName.trim().length < 2) {
      setError('Informe o nome que suas clientes verão para continuar.')
      return
    }
    if (step === 2 && (workingDays.length === 0 || timeToMinutes(endTime) <= timeToMinutes(startTime))) {
      setError('Escolha pelo menos um dia e um horário final posterior ao inicial.')
      return
    }
    setStep((current) => Math.min(3, current + 1))
  }

  if (!visible || typeof document === 'undefined') return null
  const palette = palettes[selectedPalette] ?? defaultPalettes[0]

  return createPortal(
    <div className="workspace-setup-layer" data-blocking-overlay="true">
      <section
        className="workspace-setup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-setup-title"
        style={{
          '--setup-primary': palette.primary,
          '--setup-secondary': palette.secondary,
          '--setup-background': palette.background,
        } as CSSProperties}
      >
        <aside className="workspace-setup-aside">
          <div className="workspace-setup-mark"><Sparkles size={20} weight="duotone" /></div>
          <div>
            <span className="workspace-setup-eyebrow">Seu espaço começa aqui</span>
            <h2 id="workspace-setup-title">Seu espaço, do seu jeito.</h2>
            <p>Quatro escolhas rápidas deixam sua agenda pronta para começar.</p>
          </div>
          <ol className="workspace-setup-progress" aria-label="Progresso da configuração">
            {['Caminho', 'Sua marca', 'Sua agenda', 'Seus serviços'].map((label, index) => (
              <li key={label} className={index === step ? 'is-current' : index < step ? 'is-done' : ''}>
                <span>{index < step ? <Check size={13} /> : index + 1}</span><b>{label}</b>
              </li>
            ))}
          </ol>
          <button type="button" className="workspace-setup-later" onClick={skip} disabled={busy}>Prefiro configurar depois</button>
        </aside>

        <div className="workspace-setup-main">
          {step === 0 ? <div className="workspace-setup-step">
            <span className="workspace-setup-kicker">1 de 4 · escolha o caminho</span>
            <h3>Como quer começar?</h3>
            <p>Receba sugestões da Luma ou escolha cada detalhe manualmente.</p>
            <div className="workspace-mode-grid">
              <button type="button" autoFocus className={mode === 'ASSISTED' ? 'is-selected' : ''} onClick={() => setMode('ASSISTED')}>
                <Sparkles size={24} weight="duotone" /><span><strong>Com ajuda da Luma</strong><small>Envie sua logo ou descreva seu estilo. Você escolhe entre sugestões prontas.</small></span><i>Recomendado</i>
              </button>
              <button type="button" className={mode === 'MANUAL' ? 'is-selected' : ''} onClick={() => setMode('MANUAL')}>
                <Palette size={24} /><span><strong>Quero escolher sozinha</strong><small>Use paletas prontas e ajuste tudo manualmente, sem análise visual.</small></span>
              </button>
            </div>
          </div> : null}

          {step === 1 ? <div className="workspace-setup-step">
            <span className="workspace-setup-kicker">2 de 4 · identidade</span>
            <h3>{mode === 'ASSISTED' ? 'Vamos partir da sua marca.' : 'Escolha a direção da sua marca.'}</h3>
            <div className="workspace-brand-grid">
              <div className="workspace-logo-upload">
                <button type="button" onClick={() => fileRef.current?.click()}>
                  {logoUrl ? <img src={logoUrl} alt="Prévia da logo enviada" /> : <><Upload size={23} /><strong>Enviar minha logo</strong><small>PNG, JPG ou WebP</small></>}
                </button>
                {logoUrl ? <button type="button" className="workspace-remove-logo" onClick={() => setLogoUrl('')}>Remover imagem</button> : null}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogo} hidden />
              </div>
              <div className="workspace-brand-fields">
                <label>Nome que suas clientes veem<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={120} /></label>
                <label>Como sua marca deve parecer?<textarea value={preferences} onChange={(event) => setPreferences(event.target.value)} rows={3} maxLength={280} /></label>
                {mode === 'ASSISTED' ? <button type="button" className="workspace-analyze" onClick={analyzeBrand} disabled={analyzing || businessName.trim().length < 2}>
                  <Sparkles size={17} />{analyzing ? 'Lendo sua identidade…' : logoUrl ? 'Analisar logo e sugerir paletas' : 'Sugerir paletas pelo meu estilo'}
                </button> : null}
              </div>
            </div>
            <div className="workspace-palette-grid">
              {palettes.map((option, index) => <button type="button" key={`${option.name}-${index}`} className={selectedPalette === index ? 'is-selected' : ''} onClick={() => setSelectedPalette(index)}>
                <span className="workspace-palette-swatches"><i style={{ background: option.primary }} /><i style={{ background: option.secondary }} /><i style={{ background: option.background }} /></span>
                <strong>{option.name}</strong><small>{option.rationale}</small>{selectedPalette === index ? <Check size={16} /> : null}
              </button>)}
            </div>
            {analysisSource ? <p className="workspace-analysis-note">{analysisSource === 'VISION' ? 'Sugestões criadas a partir da sua identidade visual. Você continua no controle da escolha.' : 'Sugestões seguras da curadoria Lash Designer.'}</p> : null}
          </div> : null}

          {step === 2 ? <div className="workspace-setup-step">
            <span className="workspace-setup-kicker">3 de 4 · disponibilidade</span>
            <h3>Quando você costuma atender?</h3>
            <p>Essa é só a base inicial. Depois você pode criar intervalos, folgas e horários diferentes por dia.</p>
            <div className="workspace-days">
              {weekdays.map(([letter, label], index) => <button type="button" key={label} className={workingDays.includes(index) ? 'is-selected' : ''} onClick={() => setWorkingDays((days) => days.includes(index) ? days.filter((day) => day !== index) : [...days, index])} aria-label={label} title={label}>{letter}<small>{label.slice(0, 3)}</small></button>)}
            </div>
            <div className="workspace-time-grid"><label>Começo<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><span>até</span><label>Fim<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>
            <div className="workspace-schedule-preview"><span>Resumo</span><strong>{workingDays.length} {workingDays.length === 1 ? 'dia' : 'dias'} por semana · {startTime} às {endTime}</strong><small>Você poderá personalizar cada dia na Agenda.</small></div>
          </div> : null}

          {step === 3 ? <div className="workspace-setup-step">
            <span className="workspace-setup-kicker">4 de 4 · catálogo inicial</span>
            <h3>Quais serviços já podem entrar na agenda?</h3>
            <p>Comece com os principais. Fotos e descrições podem ser adicionadas depois.</p>
            <div className="workspace-services-list">
              {services.map((service, index) => <div key={index}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <label>Serviço<input value={service.name} onChange={(event) => updateService(index, { name: event.target.value })} /></label>
                <label>Duração<ProductSelect value={String(service.durationMinutes)} onChange={(value) => updateService(index, { durationMinutes: Number(value) })} ariaLabel={`Duração de ${service.name || 'serviço'}`} size="compact" options={[30, 45, 60, 75, 90, 120, 150, 180].map((minutes) => ({ value: String(minutes), label: `${minutes} min` }))} /></label>
                <label>Valor<input inputMode="decimal" value={service.price} onChange={(event) => updateService(index, { price: event.target.value.replace(/[^0-9,.]/g, '') })} /></label>
                {services.length > 1 ? <button type="button" onClick={() => setServices((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover ${service.name || 'serviço'}`}>×</button> : null}
              </div>)}
            </div>
            {services.length < 8 ? <button type="button" className="workspace-add-service" onClick={() => setServices((current) => [...current, { name: '', durationMinutes: 90, price: '' }])}>+ Adicionar outro serviço</button> : null}
            <div className="workspace-finish-preview" style={{ '--setup-primary': palette.primary, '--setup-background': palette.background } as CSSProperties}>
              <div>{logoUrl ? <img src={logoUrl} alt="" /> : <span>{businessName.slice(0, 1).toUpperCase()}</span>}<strong>{businessName}</strong></div><small>Seu espaço ficará pronto com marca, agenda e {services.filter((service) => service.name.trim()).length} serviços.</small>
            </div>
          </div> : null}

          {error ? <div className="workspace-setup-error" role="alert">{error}</div> : null}
          <footer className="workspace-setup-actions">
            {step > 0 ? <button type="button" className="workspace-back" onClick={() => { setStep((current) => current - 1); setError('') }} disabled={busy}>Voltar</button> : <span />}
            {step < 3 ? <button type="button" className="workspace-next" data-setup-next onClick={advance}>Continuar <ArrowRight size={17} /></button> : <button type="button" className="workspace-next" onClick={finish} disabled={busy}>{busy ? 'Preparando seu espaço…' : 'Entrar no meu espaço'} <ArrowRight size={17} /></button>}
          </footer>
        </div>
      </section>
    </div>, document.body,
  )
}
