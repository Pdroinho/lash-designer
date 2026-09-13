import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from './api'
import { ArrowRight, ShieldCheck } from './components/Icons'
import './legal-v56.css'

type LegalSection = { id: string; title: string; paragraphs: string[] }

type LegalConfig = {
  provider: {
    name?: string | null
    taxId?: string | null
    address?: string | null
    contactEmail?: string | null
    privacyEmail?: string | null
  }
  documents: { termsVersion: string; privacyVersion: string; updatedAt: string; bundleHash: string }
  content: { terms: LegalSection[]; privacy: LegalSection[] }
  supportUrl?: string | null
  acceptance?: { acceptedAt: string; source: string; bundleHash: string }
}

const fallbackConfig: LegalConfig = {
  provider: {},
  documents: { termsVersion: 'carregando', privacyVersion: 'carregando', updatedAt: '2026-08-14', bundleHash: '' },
  content: { terms: [], privacy: [] },
  supportUrl: null,
  acceptance: undefined,
}

function providerLabel(config: LegalConfig) {
  return config.provider.name?.trim() || 'Lash Designer'
}

function ProviderBlock({ config }: { config: LegalConfig }) {
  const provider = config.provider
  return <div className="legal56-provider">
    <strong>{providerLabel(config)}</strong>
    {provider.taxId ? <span>{provider.taxId}</span> : null}
    {provider.address ? <span>{provider.address}</span> : null}
    {provider.contactEmail ? <a href={`mailto:${provider.contactEmail}`}>{provider.contactEmail}</a> : null}
  </div>
}

function LegalShell({ config, title, eyebrow, version, children }: { config: LegalConfig; title: string; eyebrow: string; version: string; children: ReactNode }) {
  const updated = useMemo(() => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${config.documents.updatedAt}T12:00:00Z`)), [config.documents.updatedAt])
  return <main className="legal56-page">
    <header className="legal56-topbar">
      <a className="legal56-brand" href="/" aria-label="Voltar para Lash Designer"><img src="/branding/logo-horizontal-light.svg" alt="Lash Designer" /></a>
      <a className="legal56-back" href="/">Voltar ao início <ArrowRight size={15} /></a>
    </header>
    <section className="legal56-hero">
      <div className="legal56-hero-copy"><span>{eyebrow}</span><h1>{title}</h1><p>Versão {version} · atualizada em {updated}</p></div>
      <div className="legal56-trust"><ShieldCheck size={20} /><span>{config.acceptance ? `Versão aceita em ${new Date(config.acceptance.acceptedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Conteúdo preservado como comprovante.` : 'Documento versionado e vinculado ao aceite da conta.'}</span></div>
    </section>
    <div className="legal56-layout">
      <aside className="legal56-aside"><span>Responsável pela plataforma</span><ProviderBlock config={config} /><button type="button" onClick={() => window.print()}>Imprimir ou salvar em PDF</button></aside>
      <article className="legal56-document">{children}</article>
    </div>
    <footer className="legal56-footer"><span>© 2026 Lash Designer</span><div><a href="/termos">Termos de Uso</a><a href="/privacidade">Privacidade</a></div></footer>
  </main>
}

function DocumentSections({ sections }: { sections: LegalSection[] }) {
  if (!sections.length) return <section><h2>Carregando documento…</h2><p>Aguarde enquanto a versão vigente é carregada.</p></section>
  return <>{sections.map((section) => <section id={section.id} key={section.id}>
    <h2>{section.title}</h2>
    {section.paragraphs.map((paragraph, index) => <p key={`${section.id}-${index}`}>{paragraph}</p>)}
  </section>)}</>
}

function Terms({ config }: { config: LegalConfig }) {
  return <LegalShell config={config} title="Termos de Uso" eyebrow="Relação contratual" version={config.documents.termsVersion}>
    <DocumentSections sections={config.content.terms} />
  </LegalShell>
}

function Privacy({ config }: { config: LegalConfig }) {
  return <LegalShell config={config} title="Política de Privacidade" eyebrow="Proteção de dados" version={config.documents.privacyVersion}>
    <DocumentSections sections={config.content.privacy} />
  </LegalShell>
}

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const [config, setConfig] = useState<LegalConfig>(fallbackConfig)
  useEffect(() => {
    let alive = true
    const acceptedHash = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('accepted')?.trim().toLowerCase() ?? '' : ''
    if (/^[a-f0-9]{64}$/.test(acceptedHash)) {
      api<{ legal: Omit<LegalConfig, 'acceptance'>; acceptance: { acceptedAt: string; source: string; bundleHash: string } }>(`/api/auth/legal-acceptance/${acceptedHash}`).then((result) => {
        if (alive && result.ok) setConfig({ ...result.data.legal, acceptance: result.data.acceptance })
      })
    } else {
      api<LegalConfig>('/api/public/legal').then((result) => { if (alive && result.ok) setConfig(result.data) })
    }
    return () => { alive = false }
  }, [])
  return kind === 'terms' ? <Terms config={config} /> : <Privacy config={config} />
}
