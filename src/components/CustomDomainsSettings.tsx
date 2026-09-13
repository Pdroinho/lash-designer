import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Copy, ExternalLink, RefreshCw, ShieldCheck, Star, Trash2 } from './Icons'
import { api } from '../api'
import { confirmAction } from './FeedbackCenter'

type DomainItem = {
  id: string
  domain: string
  status: 'PENDING' | 'ACTIVE' | 'ERROR'
  createdAt: string
  lastCheckedAt: string | null
  verifiedAt: string | null
  verificationError: string | null
  isPrimary: boolean
  dns: {
    verification: { type: 'TXT'; name: string; value: string | null }
    routing:
      | { type: 'CNAME'; name: string; value: string }
      | { type: 'A/AAAA'; name: string; ipv4: string[]; ipv6: string[] }
  }
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="domain-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
        } catch {
          const area = document.createElement('textarea')
          area.value = value
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          document.execCommand('copy')
          area.remove()
        }
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      }}
      title="Copiar valor"
    >
      <code>{value}</code>
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  )
}

export function CustomDomainsSettings() {
  const [domains, setDomains] = useState<DomainItem[]>([])
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await api<{ domains: DomainItem[] }>('/api/admin/domains')
    if (result.ok) setDomains(result.data.domains)
    else setMessage({ type: 'error', text: result.error.message })
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createDomain = async () => {
    const normalized = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!normalized) return
    setCreating(true)
    setMessage(null)
    const result = await api<{ domain: DomainItem }>('/api/admin/domains', {
      method: 'POST',
      body: JSON.stringify({ domain: normalized }),
    })
    setCreating(false)
    if (!result.ok) {
      setMessage({ type: 'error', text: result.error.message })
      return
    }
    setDomain('')
    setDomains((current) => [result.data.domain, ...current])
    setMessage({ type: 'success', text: 'Domínio adicionado. Agora configure os registros DNS abaixo.' })
  }

  const verify = async (item: DomainItem) => {
    setBusyId(item.id)
    setMessage(null)
    const result = await api<{ domain: DomainItem; verification: { verified: boolean; error: string | null } }>(
      `/api/admin/domains/${item.id}/verify`,
      { method: 'POST' },
    )
    setBusyId(null)
    if (!result.ok) {
      setMessage({ type: 'error', text: result.error.message })
      return
    }
    setDomains((current) => current.map((domainItem) => (domainItem.id === item.id ? result.data.domain : domainItem)))
    setMessage({
      type: result.data.verification.verified ? 'success' : 'error',
      text: result.data.verification.verified
        ? 'Domínio verificado e HTTPS autorizado. A primeira abertura pode levar alguns segundos.'
        : result.data.verification.error ?? 'DNS ainda não propagou. Aguarde e tente novamente.',
    })
  }

  const makePrimary = async (item: DomainItem) => {
    setBusyId(item.id)
    const result = await api<{ domain: DomainItem }>(`/api/admin/domains/${item.id}/primary`, { method: 'POST' })
    setBusyId(null)
    if (!result.ok) {
      setMessage({ type: 'error', text: result.error.message })
      return
    }
    setDomains((current) => current.map((domainItem) => ({ ...domainItem, isPrimary: domainItem.id === item.id })))
    setMessage({ type: 'success', text: 'Domínio principal atualizado.' })
  }

  const remove = async (item: DomainItem) => {
    if (!(await confirmAction({
      title: 'Remover domínio',
      message: `Remover ${item.domain}? O endereço deixará de abrir o seu espaço e novas emissões de certificado serão bloqueadas.`,
      confirmLabel: 'Remover domínio',
      danger: true,
    }))) return
    setBusyId(item.id)
    const result = await api<{ ok: true }>(`/api/admin/domains/${item.id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!result.ok) {
      setMessage({ type: 'error', text: result.error.message })
      return
    }
    setDomains((current) => current.filter((domainItem) => domainItem.id !== item.id))
  }

  return (
    <section className="card custom-domains-card" data-tour="custom-domains">
      <div className="cardHeader custom-domains-header">
        <div>
          <div className="domain-title-row">
            <div>
              <span className="section-kicker">Presença digital</span>
              <h2 className="cardTitle">Domínio personalizado</h2>
              <p className="cardDesc">Use até 5 endereços próprios, com verificação de propriedade e HTTPS automático.</p>
            </div>
          </div>
        </div>
        <span className="domain-security-pill"><ShieldCheck size={15} /> DNS verificado</span>
      </div>

      <div className="cardBody custom-domains-body">
        <div className="domain-add-row">
          <div className="domain-input-wrap">
            <span>https://</span>
            <input
              className="input"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createDomain()
              }}
              placeholder="agenda.seusalao.com.br"
              inputMode="url"
              aria-label="Domínio personalizado"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button type="button" className="btn btnPrimary" onClick={() => void createDomain()} disabled={creating || !domain.trim() || domains.length >= 5}>
            {domains.length >= 5 ? 'Limite atingido' : creating ? 'Adicionando...' : 'Conectar domínio'}
          </button>
        </div>

        {message && <div className={`domain-message ${message.type}`}><AlertCircle size={16} /> {message.text}</div>}

        {loading ? (
          <div className="domain-loading skeleton" />
        ) : domains.length === 0 ? (
          <div className="domain-empty">
            <img decoding="async" src="/empty-states/empty-domain.png" alt="" aria-hidden="true" loading="lazy" />
            <strong>Nenhum domínio conectado</strong>
            <span>Você continuará usando o subdomínio padrão até adicionar um endereço próprio.</span>
          </div>
        ) : (
          <div className="domain-list">
            {domains.map((item) => (
              <article className="domain-item" key={item.id}>
                <div className="domain-item-head">
                  <div>
                    <div className="domain-name-line">
                      <strong>{item.domain}</strong>
                      <span className={`domain-status ${item.status.toLowerCase()}`}>
                        {item.status === 'ACTIVE' ? <CheckCircle2 size={14} /> : item.status === 'ERROR' ? <AlertCircle size={14} /> : <RefreshCw size={14} />}
                        {item.status === 'ACTIVE' ? 'Ativo' : item.status === 'ERROR' ? 'Revisar DNS' : 'Aguardando DNS'}
                      </span>
                      {item.isPrimary && <span className="domain-primary"><Star size={13} /> Principal</span>}
                    </div>
                    <span className="domain-meta">
                      {item.status === 'ACTIVE'
                        ? `Verificado em ${item.verifiedAt ? new Date(item.verifiedAt).toLocaleString('pt-BR') : '—'}`
                        : item.verificationError || 'Adicione os dois registros no provedor onde o domínio foi comprado.'}
                    </span>
                  </div>
                  <div className="domain-actions">
                    {item.status === 'ACTIVE' && (
                      <a className="icon-btn" href={`https://${item.domain}`} target="_blank" rel="noopener noreferrer" title="Abrir domínio" aria-label={`Abrir ${item.domain} em nova aba`}>
                        <ExternalLink size={17} />
                      </a>
                    )}
                    {item.status === 'ACTIVE' && !item.isPrimary && (
                      <button type="button" className="btn btn-ghost" onClick={() => void makePrimary(item)} disabled={busyId === item.id}>
                        Tornar principal
                      </button>
                    )}
                    <button type="button" className="icon-btn domain-delete" onClick={() => void remove(item)} disabled={busyId === item.id} title="Remover domínio" aria-label={`Remover domínio ${item.domain}`}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>

                {item.status !== 'ACTIVE' && (
                  <div className="domain-dns-grid">
                    <div className="domain-dns-step">
                      <span className="domain-step-number">1</span>
                      <div>
                        <strong>Comprove que o domínio é seu</strong>
                        <p>Crie um registro <b>TXT</b> com estes dados:</p>
                        <label>Nome/host</label>
                        <CopyValue value={item.dns.verification.name} />
                        {item.dns.verification.value && (
                          <>
                            <label>Valor/conteúdo</label>
                            <CopyValue value={item.dns.verification.value} />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="domain-dns-step">
                      <span className="domain-step-number">2</span>
                      <div>
                        <strong>Aponte o acesso para a plataforma</strong>
                        {item.dns.routing.type === 'CNAME' ? (
                          <>
                            <p>Crie um registro <b>CNAME</b> para o endereço escolhido:</p>
                            <label>Nome/host</label>
                            <CopyValue value={item.dns.routing.name} />
                            <label>Destino</label>
                            <CopyValue value={item.dns.routing.value} />
                          </>
                        ) : (
                          <>
                            <p>Use os IPs abaixo em registros <b>A/AAAA</b>:</p>
                            {[...item.dns.routing.ipv4, ...item.dns.routing.ipv6].map((address) => <CopyValue value={address} key={address} />)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {item.status !== 'ACTIVE' && (
                  <div className="domain-verify-row">
                    <span>DNS pode levar alguns minutos ou horas. Durante a ativação, deixe o registro sem proxy/CDN.</span>
                    <button type="button" className="btn" onClick={() => void verify(item)} disabled={busyId === item.id}>
                      {busyId === item.id ? <RefreshCw size={15} className="spin" /> : null}
                      {busyId === item.id ? 'Verificando...' : 'Verificar agora'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
