import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { api } from '../api'
import { ArrowRight, CheckCircle2, Compass, Paperclip, Plus, Search, Send, StopCircle, Trash2, X } from './Icons'
import { HistoryIcon } from './HistoryIcon'
import { LumaMark, LumaWordmark } from './LumaBrand'
import { LumaMarkdown } from './LumaMarkdown'

type CreditPack = { id: string; label: string; credits: number; amountCents: number; featured?: boolean }
type Usage = { enabled: boolean; used: number; limit: number; monthlyUsed?: number; monthlyLimit?: number; model?: string; extraCreditBalance?: number; creditPacks?: CreditPack[] }
type PendingAction = {
  id: string
  type: 'CREATE_SERVICE' | 'CONFIRM_APPOINTMENT'
  title: string
  description: string
  confirmLabel: string
  expiresAt: string
  payload: Record<string, unknown>
  status?: 'pending' | 'running' | 'done' | 'error'
  feedback?: string
}
type Message = { id: string; role: 'assistant' | 'user'; text: string; attachmentName?: string; actions?: PendingAction[] }
type ImageAttachment = { type: 'image'; dataUrl: string; mime: 'image/png' | 'image/jpeg' | 'image/webp'; name: string }

type Starter = {
  title: string
  prompt: string
}

const starters: Starter[] = [
  {
    title: 'Quais serviços estão mais rentáveis agora?',
    prompt: 'Analise meus serviços e me diga quais estão mais rentáveis agora, quais merecem atenção e o que eu faria primeiro para melhorar margem e recorrência.',
  },
  {
    title: 'Como posso atrair mais clientes?',
    prompt: 'Olhe os sinais do meu espaço e me dê sugestões práticas para atrair mais clientes sem perder posicionamento e sem criar uma rotina impossível de manter.',
  },
  {
    title: 'Quais são os próximos 3 movimentos?',
    prompt: 'Com base nos dados do meu espaço, quais são as 3 prioridades mais importantes para eu melhorar minha operação agora?',
  },
]

const followUps: Starter[] = [
  {
    title: 'Resuma meu momento atual',
    prompt: 'Resuma meu momento atual com foco em agenda, clientes e faturamento, e diga o que está indo bem e o que exige atenção.',
  },
  {
    title: 'Onde devo agir primeiro?',
    prompt: 'Considerando meu cenário atual, onde eu deveria agir primeiro para melhorar o resultado do negócio?',
  },
  {
    title: 'Me dê um plano para esta semana',
    prompt: 'Crie um plano simples para esta semana com prioridades práticas para o meu negócio.',
  },
]

const STORAGE_KEY = 'lashdesigner:luma-thread:v2'
const HISTORY_KEY = 'lashdesigner:luma-history:v1'
const MAX_STORED_MESSAGES = 20
const MAX_STORED_HISTORY = 8

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function loadThread(): Message[] {
  const parsed = readStorage<unknown>(STORAGE_KEY, [])
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((item): item is Message => Boolean(item && typeof item === 'object' && (item as Message).role && typeof (item as Message).text === 'string'))
    .filter((item) => item.role === 'assistant' || item.role === 'user')
    .slice(-MAX_STORED_MESSAGES)
    .map((item) => ({ ...item, id: String(item.id || crypto.randomUUID()) }))
}

function loadHistory(): string[] {
  const parsed = readStorage<unknown>(HISTORY_KEY, [])
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_STORED_HISTORY)
}

function persistThread(messages: Message[]) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)))
  } catch {
    // Ignore storage failures.
  }
}

function persistHistory(entries: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_STORED_HISTORY)))
  } catch {
    // Ignore storage failures.
  }
}

async function imageFileToAttachment(file: File): Promise<ImageAttachment> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Envie uma imagem PNG, JPG ou WEBP.')
  if (file.size > 8 * 1024 * 1024) throw new Error('A imagem é muito grande. Use um arquivo de até 8 MB.')

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Imagem inválida.'))
    img.src = dataUrl
  })

  const maxSide = 1280
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a imagem.')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const compressed = canvas.toDataURL('image/webp', 0.78)
  const estimatedBytes = Math.floor((compressed.split(',')[1]?.length ?? 0) * 0.75)
  if (estimatedBytes > 1_048_576) throw new Error('A imagem ainda ficou grande demais após otimização. Tente recortar ou reduzir a resolução.')
  return { type: 'image', dataUrl: compressed, mime: 'image/webp', name: file.name.slice(0, 120) || 'imagem.webp' }
}

export function LumaConversation({ variant = 'page', onClose, initialPrompt = '' }: { variant?: 'page' | 'drawer'; onClose?: () => void; initialPrompt?: string }) {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>(loadThread)
  const [recentPrompts, setRecentPrompts] = useState<string[]>(loadHistory)
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [historyQuery, setHistoryQuery] = useState('')
  const [attachment, setAttachment] = useState<ImageAttachment | null>(null)
  const [creditCheckoutBusy, setCreditCheckoutBusy] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    api<Usage>('/api/admin/assistant/usage').then((result) => {
      if (mountedRef.current && result.ok) setUsage(result.data)
    })
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    persistThread(messages)
  }, [messages])

  useEffect(() => {
    persistHistory(recentPrompts)
  }, [recentPrompts])

  useEffect(() => {
    const clean = initialPrompt.trim()
    if (!clean) return
    setView('chat')
    setInput(clean)
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }, [initialPrompt])

  useEffect(() => {
    const surface = messagesRef.current
    if (!surface || messages.length === 0) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    surface.scrollTo({ top: surface.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }, [busy, messages])

  useEffect(() => {
    const field = inputRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, variant === 'drawer' ? 104 : 120)}px`
  }, [input, variant])

  const remaining = useMemo(() => (usage ? Math.max(0, usage.limit - usage.used) : null), [usage])
  const disabled = usage?.enabled === false
  const hasConversation = messages.length > 0
  const showFollowUps = hasConversation && !busy && messages.length < 6
  const showCreditUpsell = errorCode === 'ASSISTANT_DAILY_LIMIT' || errorCode === 'ASSISTANT_MONTHLY_LIMIT'

  function rememberPrompt(prompt: string) {
    const clean = prompt.trim()
    if (!clean) return
    setRecentPrompts((items) => [clean, ...items.filter((item) => item !== clean)].slice(0, MAX_STORED_HISTORY))
  }

  function clearHistory() {
    setRecentPrompts([])
    if (typeof window !== 'undefined') window.localStorage.removeItem(HISTORY_KEY)
  }

  function startFresh() {
    abortRef.current?.abort()
    setBusy(false)
    setError(null)
    setErrorCode(null)
    setLastFailedMessage(null)
    setMessages([])
    setInput('')
    setView('chat')
    setAttachment(null)
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(STORAGE_KEY)
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  }

  async function sendMessage(message: string, appendUser = true, image: ImageAttachment | null = null) {
    const clean = message.trim() || (image ? 'Analise a imagem anexada.' : '')
    if (clean.length < 2 || busy || disabled) return

    let history = messages.slice(-8)
    if (!appendUser && history.at(-1)?.role === 'user' && history.at(-1)?.text === clean) history = history.slice(0, -1)

    rememberPrompt(clean)

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setError(null)
    setErrorCode(null)
    setLastFailedMessage(null)
    if (appendUser) setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'user', text: clean, attachmentName: image?.name }])
    setBusy(true)

    try {
      const result = await api<{ answer: string; actions?: PendingAction[]; usage: { used: number; limit: number; monthlyUsed?: number; monthlyLimit?: number; extraCreditBalance?: number; creditPacks?: CreditPack[] } }>('/api/admin/assistant/message', {
        method: 'POST',
        signal: controller.signal,
        timeoutMs: 60_000,
        body: JSON.stringify({ message: clean, history: history.map(({ role, text }) => ({ role, text })), ...(image ? { attachment: image } : {}) }),
      })
      if (!result.ok) {
        if (result.error.code === 'REQUEST_ABORTED') return
        const failure = new Error(result.error.message) as Error & { code?: string }
        failure.code = result.error.code
        throw failure
      }
      if (!mountedRef.current) return
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: 'assistant', text: result.data.answer, actions: (result.data.actions ?? []).map((action) => ({ ...action, status: 'pending' as const })) }])
      setUsage((current) => (current ? { ...current, ...result.data.usage } : { enabled: true, ...result.data.usage }))
    } catch (requestError) {
      if (!mountedRef.current || controller.signal.aborted) return
      setLastFailedMessage(clean)
      setErrorCode(requestError instanceof Error && 'code' in requestError && typeof (requestError as { code?: unknown }).code === 'string' ? (requestError as { code?: string }).code ?? null : null)
      setError(requestError instanceof Error ? requestError.message : 'A Luma não conseguiu responder agora.')
    } finally {
      if (mountedRef.current && abortRef.current === controller) {
        setBusy(false)
        abortRef.current = null
      }
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const message = input.trim()
    const image = attachment
    if (!message && !image) return
    setInput('')
    setAttachment(null)
    void sendMessage(message, true, image)
  }

  function submitWithEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  async function attachImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setError(null)
      setErrorCode(null)
      setAttachment(await imageFileToAttachment(file))
      window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    } catch (attachmentError) {
      setError(attachmentError instanceof Error ? attachmentError.message : 'Não foi possível anexar a imagem.')
    }
  }

  async function confirmAction(messageId: string, actionId: string) {
    setMessages((items) => items.map((message) => message.id !== messageId ? message : {
      ...message,
      actions: message.actions?.map((action) => action.id === actionId ? { ...action, status: 'running' } : action),
    }))
    const result = await api<{ ok: true; actionType?: string; result?: Record<string, unknown> }>(`/api/admin/assistant/actions/${actionId}/confirm`, { method: 'POST', body: '{}', timeoutMs: 25_000 })
    setMessages((items) => items.map((message) => message.id !== messageId ? message : {
      ...message,
      actions: message.actions?.map((action) => action.id !== actionId ? action : result.ok
        ? { ...action, status: 'done', feedback: action.type === 'CREATE_SERVICE' ? 'Serviço adicionado.' : 'Agendamento confirmado.' }
        : { ...action, status: 'error', feedback: result.error.message }),
    }))
  }

  function choosePrompt(prompt: string) {
    setView('chat')
    setInput('')
    void sendMessage(prompt)
  }

  function renderComposer(inline = false) {
    return (
      <form className={`luma34-composer ${inline ? 'is-inline' : ''}`} onSubmit={submit}>
        <div className="luma34-composer-shell">
          <div className="luma34-composer-meta">
            <div className="luma34-composer-brand">
              <span>Pergunte à Luma</span>
            </div>
            {variant === 'page' ? <small>Agenda · Clientes · Financeiro</small> : null}
          </div>

          <label htmlFor={`luma-message-${variant}`} className="sr-only">Mensagem para a Luma</label>
          <textarea
            ref={inputRef}
            id={`luma-message-${variant}`}
            rows={1}
            maxLength={1800}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={submitWithEnter}
            disabled={disabled}
            placeholder={disabled ? 'Luma não está habilitada neste ambiente' : variant === 'page' ? 'Pergunte algo sobre seu negócio...' : 'Faça uma pergunta...'}
          />

          {attachment ? (
            <div className="luma35-attachment-chip">
              <img src={attachment.dataUrl} alt="Prévia do anexo" />
              <span>{attachment.name}</span>
              <button type="button" onClick={() => setAttachment(null)} aria-label="Remover imagem"><Trash2 size={14} /></button>
            </div>
          ) : null}

          <div className="luma34-composer-actions">
            <div className="luma35-composer-tools">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={attachImage} hidden />
              <button type="button" className="luma35-attach" onClick={() => fileInputRef.current?.click()} disabled={busy || disabled} aria-label="Anexar imagem" title="Anexar imagem">
                <Paperclip size={18} />
              </button>
              {variant === 'page' ? <span>PNG, JPG ou WEBP</span> : null}
            </div>
            {busy ? (
              <button type="button" className="luma34-send is-stop" onClick={() => abortRef.current?.abort()} aria-label="Parar resposta">
                <StopCircle size={19} weight="fill" />
              </button>
            ) : (
              <button type="submit" className="luma34-send" disabled={disabled || (input.trim().length < 2 && !attachment)} aria-label="Enviar mensagem">
                <Send size={17} weight="fill" />
              </button>
            )}
          </div>
        </div>
      </form>
    )
  }



  async function startCreditCheckout(packId: string) {
    if (creditCheckoutBusy) return
    setCreditCheckoutBusy(packId)
    setError(null)
    setErrorCode(null)
    try {
      const result = await api<{ url: string; orderNsu: string }>('/api/admin/assistant/credits/checkout-url', {
        method: 'POST',
        body: JSON.stringify({ packId }),
      })
      if (!result.ok) throw new Error(result.error.message)
      if (typeof window !== 'undefined') window.localStorage.setItem('lashdesigner_pending_luma_credit_order', result.data.orderNsu)
      window.location.assign(result.data.url)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Não foi possível abrir a compra de créditos agora.')
    } finally {
      setCreditCheckoutBusy(null)
    }
  }

  function renderCreditUpsell() {
    const packs = usage?.creditPacks ?? []
    if (!showCreditUpsell || packs.length === 0) return null
    return (
      <section className="luma35-credit-upsell" aria-label="Créditos extras da Luma">
        <div className="luma35-credit-upsell__copy">
          <strong>Seu limite acabou por hoje</strong>
          <p>Cada crédito libera 1 mensagem extra da Luma. Eles não expiram e só são consumidos quando você usa mensagens além da franquia incluída.</p>
          <small>Saldo extra atual: {usage?.extraCreditBalance ?? 0} crédito{(usage?.extraCreditBalance ?? 0) === 1 ? '' : 's'}.</small>
        </div>
        <div className="luma35-credit-upsell__grid">
          {packs.map((pack) => (
            <article key={pack.id} className={pack.featured ? 'is-featured' : ''}>
              <strong>{pack.label}</strong>
              <span>{(pack.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              <small>{pack.credits} {pack.credits === 1 ? 'mensagem extra sem vencimento.' : 'mensagens extras sem vencimento.'}</small>
              <button type="button" onClick={() => void startCreditCheckout(pack.id)} disabled={Boolean(creditCheckoutBusy)}>
                {creditCheckoutBusy === pack.id ? 'Abrindo checkout…' : `Comprar ${pack.credits}`} 
              </button>
            </article>
          ))}
        </div>
      </section>
    )
  }

  function historyTitle(prompt: string) {
    const max = variant === 'drawer' ? 54 : 88
    const normalized = prompt.replace(/\s+/g, ' ').trim()
    return normalized.length > max ? `${normalized.slice(0, max - 1).trimEnd()}…` : normalized
  }

  function renderConversationsView() {
    const query = historyQuery.trim().toLowerCase()
    const items = recentPrompts.filter((item) => !query || item.toLowerCase().includes(query))
    return (
      <section className="luma34-conversations" aria-label="Histórico de conversas da Luma">
        <div className="luma34-conversations-head">
          <div>
            <strong>Conversas</strong>
            <span>{recentPrompts.length} item{recentPrompts.length === 1 ? '' : 's'}</span>
          </div>
          {recentPrompts.length ? <button type="button" onClick={clearHistory}>Limpar</button> : null}
        </div>

        <label className="luma34-history-search" htmlFor={`luma-history-search-${variant}`}>
          <Search size={18} aria-hidden="true" />
          <input
            id={`luma-history-search-${variant}`}
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            value={historyQuery}
            onChange={(event) => setHistoryQuery(event.target.value)}
            placeholder="Buscar conversa"
          />
        </label>

        <div className="luma34-conversations-body">
          <div className="luma34-conversations-group">
            <small>Último mês</small>
            <div className="luma34-conversations-list">
              {items.length ? (
                items.map((prompt) => (
                  <button type="button" key={prompt} className="luma34-conversation-item" onClick={() => choosePrompt(prompt)}>
                    <span title={prompt}>{historyTitle(prompt)}</span>
                    <ArrowRight size={15} aria-hidden="true" />
                  </button>
                ))
              ) : (
                <div className="luma34-conversations-empty">
                  <strong>Nada encontrado.</strong>
                  <p>Tente buscar com outro termo ou volte para iniciar uma nova conversa.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className={`luma34 luma34--${variant} ${hasConversation ? 'has-thread' : 'is-empty'} ${view === 'history' ? 'is-history-view' : ''}`}>
      <header className="luma34-header">
        <div className="luma34-brand">
          <LumaMark className="luma34-brand-mark" />
          <div>
            <div className="luma34-brand-row"><LumaWordmark /><span>AI</span></div>
            <p>{variant === 'page' ? 'Assistente do Lash Designer' : 'Assistente da plataforma'}</p>
          </div>
        </div>

        <div className="luma34-header-actions">
          <div className="luma34-usage" aria-label={remaining === null ? 'Carregando limite diário' : `${remaining} consultas disponíveis hoje`}>
            <strong>{remaining ?? '—'}</strong>
            <span>de {usage?.limit ?? '—'} hoje</span>
          </div>
          {hasConversation ? (
            <button type="button" className="luma34-new" onClick={startFresh} disabled={busy} title="Nova conversa">
              <Plus size={15} />
              <span>Nova conversa</span>
            </button>
          ) : null}
          <button type="button" className={`luma34-close luma34-history-toggle ${view === 'history' ? 'is-active' : ''}`} onClick={() => setView((current) => current === 'history' ? 'chat' : 'history')} aria-label={view === 'history' ? 'Voltar para a conversa' : 'Abrir histórico de conversas'} title={view === 'history' ? 'Voltar para a conversa' : 'Abrir histórico de conversas'}>
            <HistoryIcon size={17} />
          </button>
          {onClose ? (
            <button type="button" className="luma34-close" data-modal-close onClick={onClose} aria-label="Fechar Luma">
              <X size={17} />
            </button>
          ) : null}
        </div>
      </header>

      {disabled ? (
        <div className="luma34-disabled" role="status">
          <strong>Luma indisponível neste ambiente.</strong>
          <span>O restante da plataforma continua funcionando normalmente.</span>
        </div>
      ) : null}

      <main className="luma34-workspace">
        {view === 'history' ? (
          renderConversationsView()
        ) : (
        <>
        <div ref={messagesRef} className="luma34-thread" aria-live="polite" aria-busy={busy}>
          {!hasConversation ? (
            <section className="luma34-empty" aria-label="Começar uma conversa com a Luma">
              <div className="luma34-empty-main">
                <div className="luma34-hero">
                  <span className="luma34-eyebrow">Luma AI</span>
                  <h3>Converse com a Luma</h3>
                  <p>Receba orientações objetivas sobre agenda, clientes e financeiro.</p>
                </div>
              </div>

              <div className="luma34-starters" aria-label="Sugestões para começar">
                {starters.map((starter) => (
                  <button type="button" key={starter.title} onClick={() => choosePrompt(starter.prompt)} disabled={disabled || busy}>
                    <Compass size={15} aria-hidden="true" />
                    <span>{starter.title}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {hasConversation ? (
            <div className="luma34-thread-flow">
              <div className="luma34-session-title">
                <span>Conversa atual</span>
                <i />
              </div>

              {messages.map((message) =>
                message.role === 'assistant' ? (
                  <article key={message.id} className="luma34-message is-assistant">
                    <div className="luma34-message-head">
                      <strong>Luma</strong>
                    </div>
                    <div className="luma34-answer">
                      <LumaMarkdown text={message.text} />
                    </div>
                    {message.actions?.length ? (
                      <div className="luma35-actions">
                        {message.actions.map((action) => (
                          <div className={`luma35-action ${action.status === 'done' ? 'is-done' : ''}`} key={action.id}>
                            <div>
                              <strong>{action.title}</strong>
                              <span>{action.description}</span>
                              {action.feedback ? <small>{action.feedback}</small> : null}
                            </div>
                            {action.status === 'done' ? (
                              <span className="luma35-action-done"><CheckCircle2 size={17} /> Feito</span>
                            ) : (
                              <button type="button" disabled={action.status === 'running'} onClick={() => void confirmAction(message.id, action.id)}>
                                {action.status === 'running' ? 'Confirmando…' : action.confirmLabel}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ) : (
                  <article key={message.id} className="luma34-message is-user">
                    <div className="luma34-question">
                      {message.attachmentName ? <span className="luma35-user-attachment"><Paperclip size={13} /> {message.attachmentName}</span> : null}
                      {message.text}
                    </div>
                  </article>
                ),
              )}

              {busy ? (
                <article className="luma34-message is-assistant is-generating">
                  <div className="luma34-message-head">
                    <strong>Luma</strong>
                  </div>
                  <div className="luma34-thinking">
                    <span />
                    <span />
                    <span />
                    <em>Analisando seu contexto</em>
                  </div>
                </article>
              ) : null}

              {showFollowUps ? (
                <section className="luma34-followups" aria-label="Sugestões para continuar a conversa">
                  <small>Continue com</small>
                  <div>
                    {followUps.map((item) => (
                      <button type="button" key={item.title} onClick={() => choosePrompt(item.prompt)}>
                        {item.title}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {error ? (
                <div className="luma34-error" role="alert">
                  <span>{error}</span>
                  {!showCreditUpsell && lastFailedMessage ? (
                    <button type="button" onClick={() => void sendMessage(lastFailedMessage, false)}>
                      Tentar novamente
                    </button>
                  ) : null}
                </div>
              ) : null}

              {renderCreditUpsell()}
            </div>
          ) : null}
        </div>

        {renderComposer(false)}
        </>
        )}
      </main>
    </div>
  )
}
