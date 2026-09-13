import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api } from '../api'
import {
  ArrowRight,
  Bell,
  Calendar,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Megaphone,
  MessageSquare,
  Paperclip,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Settings,
  Sparkles,
  Smartphone,
  Users,
  X,
  XCircle,
} from './Icons'
import { ProductSelect } from './ProductSelect'

type View = 'conversations' | 'automations' | 'campaigns' | 'connection'

type WhatsAppInstance = {
  id: string
  provider: string
  baseUrl: string | null
  instanceName: string | null
  status: string
  updatedAt: string
  hasApiKey: boolean
  usesGlobalBaseUrl: boolean
  usesGlobalApiKey: boolean
  platformManaged?: boolean
}

type WhatsAppSettings = {
  confirmationsEnabled: boolean
  confirmationOffsetHours: number
  confirmationRetryHours: number
  noResponseCutoffHours: number
  confirmationMessage: string
  autoCancelDeclined: boolean
  remindersEnabled: boolean
  reminderOffsetHours: number
  reminderMessage: string
  promoEnabled: boolean
  promoMessage: string
  updatedAt?: string
}

type Conversation = {
  id: string
  phone: string
  displayName: string
  unreadCount: number
  lastMessage: string
  lastDirection: 'INBOUND' | 'OUTBOUND' | null
  lastMessageAt: string | null
  client: null | {
    id: string
    userId: string
    name: string
    marketingOptIn: boolean
    appointmentsCount: number
  }
  upcomingAppointment: null | {
    id: string
    startsAt: string
    serviceName: string
    priceCents: number
    confirmationStatus: string
  }
}

type ChatMessage = {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  messageType: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'UNKNOWN'
  text: string
  source: 'WEBHOOK' | 'MANUAL' | 'AUTOMATION' | 'SYSTEM'
  sentAt: string
  deliveryStatus?: 'UNKNOWN' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED'
  statusUpdatedAt?: string | null
  mediaMimeType?: string | null
  mediaFileName?: string | null
  mediaSizeBytes?: number | null
  mediaStatus?: 'NONE' | 'PENDING' | 'READY' | 'FAILED'
}

type WhatsAppDiagnostics = {
  providerWebhookConfigured: boolean | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  optedInClients: number
  totalClients: number
}

type MarketingCampaign = {
  id: string
  name: string
  messageText: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'
  totalRecipients: number
  sentCount: number
  failedCount: number
  skippedCount: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  lastError: string | null
}

type CampaignsResponse = {
  enabled: boolean
  maxRecipients: number
  sendIntervalSeconds: number
  campaigns: MarketingCampaign[]
}

const defaultSettings: WhatsAppSettings = {
  confirmationsEnabled: true,
  confirmationOffsetHours: 24,
  confirmationRetryHours: 8,
  noResponseCutoffHours: 4,
  confirmationMessage: 'Oi {{nome}}! Seu horário de {{servico}} no {{espaco}} está chegando. Responda 1 para confirmar ou 2 se não puder comparecer.',
  autoCancelDeclined: false,
  remindersEnabled: true,
  reminderOffsetHours: 2,
  reminderMessage: 'Oi {{nome}}! Passando para lembrar que seu horário de {{servico}} é hoje às {{hora}} no {{espaco}}. Até já!',
  promoEnabled: false,
  promoMessage: 'Oi {{nome}}, temos uma novidade especial para você esta semana no {{espaco}}. Responda esta mensagem para saber mais.',
}

function statusToUi(raw: string | null) {
  const value = String(raw ?? '').toLowerCase()
  if (value.includes('open') || value.includes('connected')) return 'connected' as const
  if (value.includes('qr') || value.includes('scan') || value.includes('pair') || value.includes('connecting')) return 'qr_scan' as const
  return 'disconnected' as const
}

function money(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function phoneLabel(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return digits ? `+${digits}` : 'Número não identificado'
}

function contactTitle(item: Conversation) {
  const name = item.displayName.trim()
  const nameDigits = name.replace(/\D/g, '')
  const phoneDigits = item.phone.replace(/\D/g, '')
  if (!name || (nameDigits && nameDigits === phoneDigits)) return 'Contato sem nome'
  return name
}

function contactInitials(item: Conversation) {
  const title = contactTitle(item)
  if (title === 'Contato sem nome') return '•'
  return title.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase()
}

function relativeTime(value: string | null) {
  if (!value) return ''
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return ''
  const diff = Date.now() - time
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} min`
  const today = new Date()
  const date = new Date(time)
  if (date.toDateString() === today.toDateString()) return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
}

function messageTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d)
}

function deliveryCopy(status: ChatMessage['deliveryStatus']) {
  if (status === 'READ') return 'Lida'
  if (status === 'DELIVERED') return 'Entregue'
  if (status === 'FAILED') return 'Falhou'
  if (status === 'SENT') return 'Enviada'
  return ''
}

function appointmentDate(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d).replace('.', '')
}

function confirmationCopy(status: string) {
  if (status === 'CONFIRMED' || status === 'MANUALLY_CONFIRMED') return { label: 'Presença confirmada', tone: 'success' }
  if (status === 'DECLINED') return { label: 'Cliente recusou', tone: 'danger' }
  if (status === 'NO_RESPONSE' || status === 'DELIVERY_FAILED') return { label: 'Precisa de atenção', tone: 'warning' }
  if (status === 'AWAITING_CONFIRMATION') return { label: 'Aguardando resposta', tone: 'warning' }
  return { label: 'Confirmação não enviada', tone: 'neutral' }
}

function previewTemplate(template: string) {
  return template
    .replaceAll('{{nome}}', 'Maria')
    .replaceAll('{{servico}}', 'Volume Brasileiro')
    .replaceAll('{{espaco}}', 'Studio Bella')
    .replaceAll('{{data}}', '15/10')
    .replaceAll('{{hora}}', '14:00')
    .replaceAll('{{codigo}}', '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sameMessages(a: ChatMessage[], b: ChatMessage[]) {
  if (a.length !== b.length) return false
  if (!a.length) return true
  const firstA = a[0]
  const firstB = b[0]
  const lastA = a[a.length - 1]
  const lastB = b[b.length - 1]
  return firstA.id === firstB.id && firstA.sentAt === firstB.sentAt && lastA.id === lastB.id && lastA.sentAt === lastB.sentAt && lastA.text === lastB.text && lastA.deliveryStatus === lastB.deliveryStatus && lastA.mediaStatus === lastB.mediaStatus
}

function MiniToggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" className={`wa39-toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked} aria-label={label}>
      <span />
    </button>
  )
}

export function WhatsAppCenter() {
  const [view, setView] = useState<View>('conversations')
  const [instance, setInstance] = useState<WhatsAppInstance | null>(null)
  const [connectionState, setConnectionState] = useState<string | null>(null)
  const status = statusToUi(connectionState)
  const [settings, setSettings] = useState<WhatsAppSettings>(defaultSettings)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connectionBusy, setConnectionBusy] = useState(false)
  const [diagnostics, setDiagnostics] = useState<WhatsAppDiagnostics | null>(null)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationLoading, setConversationLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageLoading, setMessageLoading] = useState(false)
  const [composer, setComposer] = useState('')
  const [sending, setSending] = useState(false)
  const [newConversationOpen, setNewConversationOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([])
  const [campaignsEnabled, setCampaignsEnabled] = useState(false)
  const [campaignMaxRecipients, setCampaignMaxRecipients] = useState(50)
  const [campaignSendIntervalSeconds, setCampaignSendIntervalSeconds] = useState(15)
  const [campaignBusy, setCampaignBusy] = useState(false)
  const messagesViewportRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const lastInboxActivityRef = useRef(Date.now())

  const selectedConversation = useMemo(() => conversations.find((item) => item.id === selectedId) ?? null, [conversations, selectedId])
  const unreadTotal = useMemo(() => conversations.reduce((sum, item) => sum + item.unreadCount, 0), [conversations])

  function scrollMessagesToEnd() {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const viewport = messagesViewportRef.current
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    }))
  }

  async function loadInstance() {
    const res = await api<{ instance: WhatsAppInstance | null }>('/api/admin/whatsapp')
    if (res.ok) setInstance(res.data.instance)
  }

  async function loadDiagnostics() {
    const res = await api<WhatsAppDiagnostics>('/api/admin/whatsapp/diagnostics')
    if (res.ok) setDiagnostics(res.data)
  }

  async function loadCampaigns() {
    const res = await api<CampaignsResponse>('/api/admin/whatsapp/campaigns')
    if (!res.ok) return
    setCampaigns(res.data.campaigns)
    setCampaignsEnabled(res.data.enabled)
    setCampaignMaxRecipients(res.data.maxRecipients)
    setCampaignSendIntervalSeconds(res.data.sendIntervalSeconds)
  }

  async function refreshStatus() {
    const res = await api<{ state: string }>('/api/admin/whatsapp/status')
    if (res.ok) {
      setConnectionState(res.data.state)
      if (statusToUi(res.data.state) === 'connected') setQrCode(null)
    }
  }

  async function refreshConnection() {
    setConnectionBusy(true)
    await Promise.all([refreshStatus(), loadDiagnostics(), loadInstance()])
    setConnectionBusy(false)
  }

  async function loadSettings() {
    const res = await api<{ settings: WhatsAppSettings }>('/api/admin/whatsapp/settings')
    if (res.ok) setSettings({ ...defaultSettings, ...res.data.settings })
  }

  async function loadConversations(keepSelection = true) {
    const res = await api<{ conversations: Conversation[] }>('/api/admin/whatsapp/conversations')
    if (!res.ok) {
      setConversationLoading(false)
      return
    }
    setConversations(res.data.conversations)
    setConversationLoading(false)
    if (!keepSelection || !selectedId || !res.data.conversations.some((item) => item.id === selectedId)) {
      setSelectedId(res.data.conversations[0]?.id ?? null)
    }
  }

  async function loadMessages(conversationId: string, mode: 'initial' | 'poll' | 'send' = 'initial') {
    if (mode === 'initial') setMessageLoading(true)
    const viewport = messagesViewportRef.current
    const wasNearBottom = !viewport || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96
    const currentMessages = messagesRef.current
    const previousLastId = currentMessages[currentMessages.length - 1]?.id ?? null
    const res = await api<{ messages: ChatMessage[] }>(`/api/admin/whatsapp/conversations/${conversationId}/messages`)
    if (res.ok) {
      const nextLastId = res.data.messages[res.data.messages.length - 1]?.id ?? null
      const changed = !sameMessages(currentMessages, res.data.messages)
      if (changed) {
        messagesRef.current = res.data.messages
        setMessages(res.data.messages)
      }
      if (document.visibilityState === 'visible') {
        void api(`/api/admin/whatsapp/conversations/${conversationId}/read`, { method: 'POST' })
        setConversations((items) => items.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item))
      }
      if (mode === 'initial' || mode === 'send' || (mode === 'poll' && wasNearBottom && previousLastId !== nextLastId)) scrollMessagesToEnd()
    }
    if (mode === 'initial') setMessageLoading(false)
  }

  useEffect(() => {
    let alive = true
    Promise.all([loadInstance(), loadSettings(), refreshStatus(), loadConversations(false), loadDiagnostics(), loadCampaigns()]).catch(() => {
      if (alive) setError('Não foi possível carregar a Central de WhatsApp agora.')
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (view !== 'conversations') return
    let stopped = false
    let timer = 0

    const nextDelay = () => {
      if (document.visibilityState !== 'visible') return 60_000
      return Date.now() - lastInboxActivityRef.current > 5 * 60_000 ? 30_000 : 6_000
    }
    const refresh = async () => {
      if (stopped) return
      if (document.visibilityState === 'visible') {
        await loadConversations(true)
        if (selectedId) await loadMessages(selectedId, 'poll')
      }
      if (!stopped) timer = window.setTimeout(() => void refresh(), nextDelay())
    }
    const refreshNow = () => {
      lastInboxActivityRef.current = Date.now()
      window.clearTimeout(timer)
      void refresh()
    }
    const markActivity = () => { lastInboxActivityRef.current = Date.now() }
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshNow() }

    timer = window.setTimeout(() => void refresh(), nextDelay())
    window.addEventListener('focus', refreshNow)
    window.addEventListener('pointerdown', markActivity, { passive: true })
    window.addEventListener('keydown', markActivity)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener('focus', refreshNow)
      window.removeEventListener('pointerdown', markActivity)
      window.removeEventListener('keydown', markActivity)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [view, selectedId])

  useEffect(() => {
    if (!selectedId || view !== 'conversations') {
      messagesRef.current = []
      setMessages([])
      return
    }
    void loadMessages(selectedId, 'initial')
  }, [selectedId, view])

  useEffect(() => {
    if (view === 'connection' || view === 'campaigns') void loadDiagnostics()
    if (view === 'campaigns') void loadCampaigns()
  }, [view])

  useEffect(() => {
    if (view !== 'campaigns' || !campaigns.some((item) => item.status === 'QUEUED' || item.status === 'RUNNING')) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void Promise.all([loadCampaigns(), loadDiagnostics()])
    }, 8000)
    return () => window.clearInterval(timer)
  }, [view, campaigns])

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((item) => `${contactTitle(item)} ${item.displayName} ${item.phone} ${item.lastMessage}`.toLowerCase().includes(q))
  }, [conversations, search])

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    if (!selectedConversation || sending || !composer.trim()) return
    const text = composer.trim()
    setComposer('')
    setSending(true)
    const optimistic: ChatMessage = { id: `optimistic-${Date.now()}`, direction: 'OUTBOUND', messageType: 'TEXT', text, source: 'MANUAL', sentAt: new Date().toISOString(), deliveryStatus: 'SENT' }
    messagesRef.current = [...messagesRef.current, optimistic]
    setMessages(messagesRef.current)
    scrollMessagesToEnd()
    const res = await api<{ ok: true }>(`/api/admin/whatsapp/conversations/${selectedConversation.id}/messages`, { method: 'POST', body: JSON.stringify({ text }) })
    if (!res.ok) {
      messagesRef.current = messagesRef.current.filter((item) => item.id !== optimistic.id)
      setMessages(messagesRef.current)
      setComposer(text)
      setError(res.error.message)
    } else {
      await Promise.all([loadMessages(selectedConversation.id, 'send'), loadConversations(true), loadDiagnostics()])
    }
    setSending(false)
  }

  async function startConversation(event: FormEvent) {
    event.preventDefault()
    if (sending || newName.trim().length < 2 || newPhone.trim().length < 8 || newMessage.trim().length < 1) return
    setSending(true)
    const res = await api<{ ok: true }>('/api/admin/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ contactName: newName.trim(), toPhone: newPhone.trim(), text: newMessage.trim(), recordInInbox: true }),
    })
    if (!res.ok) setError(res.error.message)
    else {
      setNewConversationOpen(false)
      setNewName('')
      setNewPhone('')
      setNewMessage('')
      await Promise.all([loadConversations(false), loadDiagnostics()])
    }
    setSending(false)
  }

  async function saveSettings() {
    setSettingsBusy(true)
    setError(null)
    const res = await api<{ ok: true }>('/api/admin/whatsapp/settings', { method: 'PUT', body: JSON.stringify(settings) })
    if (!res.ok) setError(res.error.message)
    else await loadSettings()
    setSettingsBusy(false)
  }

  async function sendTest(kind: 'confirmation' | 'reminder' | 'promo') {
    const phone = testPhone.trim()
    if (phone.length < 8) {
      setError('Informe um WhatsApp válido para o teste.')
      return
    }
    const raw = kind === 'confirmation' ? settings.confirmationMessage : kind === 'reminder' ? settings.reminderMessage : settings.promoMessage
    const text = previewTemplate(raw)
    const res = await api<{ ok: true }>('/api/admin/whatsapp/send', { method: 'POST', body: JSON.stringify({ toPhone: phone, text, recordInInbox: false }) })
    if (!res.ok) setError(res.error.message)
  }

  async function createCampaign() {
    if (campaignBusy) return
    const name = campaignName.trim() || `Campanha ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date())}`
    if (!settings.promoEnabled) { setError('Ative e salve o modelo promocional antes de criar a campanha.'); return }
    if (settings.promoMessage.trim().length < 10) { setError('Escreva uma mensagem promocional antes de criar a campanha.'); return }
    setCampaignBusy(true)
    setError(null)
    const saved = await api<{ ok: true }>('/api/admin/whatsapp/settings', { method: 'PUT', body: JSON.stringify(settings) })
    if (!saved.ok) {
      setCampaignBusy(false)
      setError(saved.error.message)
      return
    }
    const res = await api<{ ok: true; campaign: MarketingCampaign }>('/api/admin/whatsapp/campaigns', {
      method: 'POST',
      body: JSON.stringify({ name, message: settings.promoMessage }),
    })
    setCampaignBusy(false)
    if (!res.ok) { setError(res.error.message); return }
    setCampaignName('')
    await Promise.all([loadCampaigns(), loadDiagnostics()])
  }

  async function cancelCampaign(campaignId: string) {
    if (campaignBusy) return
    setCampaignBusy(true)
    setError(null)
    const res = await api<{ ok: true }>(`/api/admin/whatsapp/campaigns/${encodeURIComponent(campaignId)}/cancel`, { method: 'POST' })
    setCampaignBusy(false)
    if (!res.ok) { setError(res.error.message); return }
    await loadCampaigns()
  }

  async function handleConnect() {
    setConnectionBusy(true)
    setError(null)
    const res = await api<{ qrCode: string | null; state?: string }>('/api/admin/whatsapp/qrcode')
    if (!res.ok) setError(res.error.message)
    else {
      setQrCode(res.data.qrCode)
      if (res.data.state) setConnectionState(res.data.state)
    }
    setConnectionBusy(false)
  }

  async function presenceAction(action: 'resend' | 'manual') {
    const appointment = selectedConversation?.upcomingAppointment
    if (!appointment) return
    const res = await api(`/api/admin/appointments/${appointment.id}/confirmation/${action}`, { method: 'POST' })
    if (!res.ok) setError(res.error.message)
    else await loadConversations(true)
  }

  function askLumaForReply() {
    if (!selectedConversation) return
    const lastInbound = [...messages].reverse().find((item) => item.direction === 'INBOUND')?.text || selectedConversation.lastMessage
    window.dispatchEvent(new CustomEvent('lashdesigner:luma-open', {
      detail: {
        prompt: `Me ajude a responder esta cliente pelo WhatsApp. Cliente: ${contactTitle(selectedConversation)}. Mensagem mais recente: "${lastInbound}". ${selectedConversation.upcomingAppointment ? `Próximo agendamento: ${selectedConversation.upcomingAppointment.serviceName} em ${appointmentDate(selectedConversation.upcomingAppointment.startsAt)}.` : 'Sem próximo agendamento.'} Escreva uma resposta curta, acolhedora e pronta para eu revisar antes de enviar.`,
      },
    }))
  }

  const nav: Array<{ id: View; label: string; icon: typeof MessageSquare; badge?: number }> = [
    { id: 'conversations', label: 'Conversas', icon: MessageSquare, badge: unreadTotal },
    { id: 'automations', label: 'Automações', icon: Bell },
    { id: 'campaigns', label: 'Campanhas', icon: Megaphone },
    { id: 'connection', label: 'Conexão', icon: Settings },
  ]

  return (
    <div className="wa39">
      <header className="wa39-topbar">
        <div>
          <span className="wa39-eyebrow">Central de relacionamento</span>
          <h2>WhatsApp</h2>
          <p>Conversas, confirmações e relacionamento com clientes em um único fluxo.</p>
        </div>
        <div className={`wa39-health is-${status}`}>
          <i />
          <span>{status === 'connected' ? 'Conectado' : status === 'qr_scan' ? 'Aguardando leitura' : 'Desconectado'}</span>
        </div>
      </header>

      <nav className="wa39-tabs" aria-label="Seções do WhatsApp">
        {nav.map((item) => {
          const Icon = item.icon
          return (
            <button type="button" key={item.id} className={view === item.id ? 'is-active' : ''} onClick={() => setView(item.id)}>
              <Icon size={17} />
              <span>{item.label}</span>
              {item.badge ? <b>{Math.min(item.badge, 99)}</b> : null}
            </button>
          )
        })}
      </nav>

      {error ? <div className="wa39-alert" role="alert"><XCircle size={17} /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Fechar aviso"><X size={15} /></button></div> : null}

      {view === 'conversations' && !conversationLoading && conversations.length === 0 ? (
        <section className="wa39-empty-inbox">
          <div className="wa39-empty-orb"><MessageSquare size={26} /></div>
          <span>Caixa de entrada</span>
          <h3>Suas conversas começam aqui.</h3>
          <p>Inicie uma conversa ou aguarde uma mensagem de cliente. As respostas recebidas entram automaticamente nesta central.</p>
          <button type="button" onClick={() => setNewConversationOpen(true)}><Plus size={17} /> Nova conversa</button>
          <small>{status === 'connected' ? 'WhatsApp conectado e pronto para receber mensagens.' : 'Conecte o WhatsApp para receber respostas.'}</small>
        </section>
      ) : null}

      {view === 'conversations' && (conversationLoading || conversations.length > 0) ? (
        <section className={`wa39-inbox ${mobileChatOpen ? 'is-mobile-chat-open' : ''}`}>
          <aside className="wa39-conversation-pane">
            <div className="wa39-pane-head">
              <div><strong>Conversas</strong><small>{conversations.length} contato{conversations.length === 1 ? '' : 's'}</small></div>
              <button type="button" className="wa39-icon-button" onClick={() => setNewConversationOpen(true)} aria-label="Nova conversa"><Plus size={18} /></button>
            </div>
            <label className="wa39-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou número" />
            </label>
            <div className="wa39-conversation-list">
              {conversationLoading ? <div className="wa39-skeleton-list"><i /><i /><i /></div> : filteredConversations.length ? filteredConversations.map((item) => (
                <button type="button" key={item.id} className={`wa39-conversation ${selectedId === item.id ? 'is-active' : ''}`} onClick={() => { setSelectedId(item.id); setMobileChatOpen(true) }}>
                  <span className="wa39-avatar">{contactInitials(item)}</span>
                  <span className="wa39-conversation-copy">
                    <span className="wa39-conversation-line"><strong>{contactTitle(item)}</strong><time>{relativeTime(item.lastMessageAt)}</time></span>
                    <span className="wa39-conversation-phone">{phoneLabel(item.phone)}</span>
                    <span className="wa39-conversation-line is-preview"><span>{item.lastDirection === 'OUTBOUND' ? 'Você: ' : ''}{item.lastMessage || 'Nova conversa'}</span>{item.unreadCount ? <b>{item.unreadCount}</b> : null}</span>
                  </span>
                </button>
              )) : (
                <div className="wa39-empty-list"><Search size={23} /><strong>Nenhum resultado</strong><p>Tente buscar pelo nome ou pelo número da cliente.</p></div>
              )}
            </div>
          </aside>

          <main className="wa39-chat-pane">
            {selectedConversation ? (
              <>
                <header className="wa39-chat-head">
                  <button type="button" className="wa39-chat-back" onClick={() => setMobileChatOpen(false)} aria-label="Voltar para conversas"><ChevronLeft size={18} /></button>
                  <div className="wa39-chat-person">
                    <span className="wa39-avatar is-large">{contactInitials(selectedConversation)}</span>
                    <div><strong>{contactTitle(selectedConversation)}</strong><span>{phoneLabel(selectedConversation.phone)}</span></div>
                  </div>
                  <button type="button" className="wa39-luma-reply" onClick={askLumaForReply}><Sparkles size={16} /><span>Sugerir resposta</span></button>
                </header>
                <div className="wa39-messages" ref={messagesViewportRef} aria-live="polite">
                  {messageLoading && !messages.length ? <div className="wa39-chat-loading">Carregando conversa…</div> : null}
                  {!messageLoading && !messages.length ? <div className="wa39-chat-thread-empty"><MessageSquare size={22} /><strong>Conversa pronta</strong><span>Envie a primeira mensagem para começar.</span></div> : null}
                  {messages.map((message) => (
                    <article key={message.id} className={`wa39-message is-${message.direction.toLowerCase()} ${message.source === 'AUTOMATION' ? 'is-automation' : ''}`}>
                      {message.messageType !== 'TEXT' ? <small className="wa39-media-label">{message.messageType === 'IMAGE' ? 'Imagem' : message.messageType === 'AUDIO' ? 'Áudio' : message.messageType === 'DOCUMENT' ? 'Documento' : 'Mensagem'}</small> : null}
                      {message.mediaStatus === 'READY' && message.messageType === 'IMAGE' ? <img className="wa39-message-image" src={`/api/admin/whatsapp/messages/${message.id}/media`} alt={message.text || 'Imagem recebida'} loading="lazy" /> : null}
                      {message.mediaStatus === 'READY' && message.messageType === 'AUDIO' ? <audio className="wa39-message-audio" src={`/api/admin/whatsapp/messages/${message.id}/media`} controls preload="none" /> : null}
                      {message.mediaStatus === 'READY' && message.messageType === 'DOCUMENT' ? <a className="wa39-message-document" href={`/api/admin/whatsapp/messages/${message.id}/media`} target="_blank" rel="noreferrer">{message.mediaFileName || 'Abrir documento'}</a> : null}
                      {message.messageType !== 'TEXT' && message.mediaStatus === 'PENDING' ? <small className="wa39-media-state">Preparando mídia…</small> : null}
                      {message.messageType !== 'TEXT' && message.mediaStatus === 'FAILED' ? <small className="wa39-media-state is-error">Mídia indisponível no momento</small> : null}
                      {(message.messageType === 'TEXT' || message.text) ? <p>{message.text}</p> : message.mediaStatus !== 'READY' ? <p>{message.messageType === 'IMAGE' ? 'Imagem recebida' : message.messageType === 'AUDIO' ? 'Áudio recebido' : message.messageType === 'DOCUMENT' ? 'Documento recebido' : 'Mensagem recebida'}</p> : null}
                      <footer>
                        <time>{messageTime(message.sentAt)}</time>
                        {message.source === 'AUTOMATION' ? <span>Automação</span> : null}
                        {message.direction === 'OUTBOUND' && deliveryCopy(message.deliveryStatus) ? <span className={`wa39-delivery is-${String(message.deliveryStatus).toLowerCase()}`}>{deliveryCopy(message.deliveryStatus)}</span> : null}
                      </footer>
                    </article>
                  ))}
                </div>
                <form className="wa39-composer" onSubmit={sendMessage}>
                  <button type="button" className="wa39-composer-tool" title="Anexos entram em uma próxima etapa" aria-label="Anexar arquivo"><Paperclip size={18} /></button>
                  <textarea value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="Escreva uma mensagem…" rows={1} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} />
                  <button type="submit" className="wa39-send" disabled={sending || !composer.trim()} aria-label="Enviar mensagem"><Send size={18} /></button>
                </form>
              </>
            ) : (
              <div className="wa39-chat-empty"><div><MessageSquare size={28} /><strong>Escolha uma conversa</strong><p>Selecione uma cliente na lista para abrir o atendimento.</p></div></div>
            )}
          </main>

          {selectedConversation ? <aside className="wa39-context-pane">
            <section className="wa39-context-profile">
              <span className="wa39-avatar is-profile">{contactInitials(selectedConversation)}</span>
              <strong>{contactTitle(selectedConversation)}</strong>
              <span>{phoneLabel(selectedConversation.phone)}</span>
              <div className="wa39-context-tags">
                {selectedConversation.client ? <span><Users size={13} /> Cliente</span> : <span>Novo contato</span>}
                {selectedConversation.client?.marketingOptIn ? <span>Marketing autorizado</span> : null}
              </div>
            </section>

            {selectedConversation.upcomingAppointment ? (() => {
              const item = selectedConversation.upcomingAppointment
              const confirmation = confirmationCopy(item.confirmationStatus)
              return (
                <section className="wa39-context-card">
                  <header><span>Próximo horário</span><Calendar size={16} /></header>
                  <strong>{item.serviceName}</strong>
                  <p>{appointmentDate(item.startsAt)}</p>
                  <div className="wa39-appointment-price">{money(item.priceCents)}</div>
                  <span className={`wa39-status is-${confirmation.tone}`}>{confirmation.label}</span>
                  <div className="wa39-context-actions">
                    {!['CONFIRMED','MANUALLY_CONFIRMED'].includes(item.confirmationStatus) ? <button type="button" onClick={() => void presenceAction('resend')}>Reenviar confirmação</button> : null}
                    {!['CONFIRMED','MANUALLY_CONFIRMED'].includes(item.confirmationStatus) ? <button type="button" onClick={() => void presenceAction('manual')}>Confirmar manualmente</button> : null}
                  </div>
                </section>
              )
            })() : <section className="wa39-context-card is-empty"><Clock size={17} /><strong>Sem próximo horário</strong><p>O próximo agendamento aparece aqui automaticamente.</p></section>}

            <section className="wa39-context-stats">
              <div><span>Atendimentos</span><strong>{selectedConversation.client?.appointmentsCount ?? 0}</strong></div>
              <div><span>Última mensagem</span><strong>{relativeTime(selectedConversation.lastMessageAt) || '—'}</strong></div>
            </section>
          </aside> : null}
        </section>
      ) : null}

      {view === 'automations' ? (
        <section className="wa39-automation-layout">
          <div className="wa39-automation-main">
            <article className="wa39-automation-hero">
              <div><span>Agenda automática</span><h3>Confirmação de presença</h3><p>Defina o fluxo uma vez. O Lash Designer acompanha as respostas e destaca apenas o que precisa de você.</p></div>
              <MiniToggle checked={settings.confirmationsEnabled} onChange={(checked) => setSettings((value) => ({ ...value, confirmationsEnabled: checked }))} label="Ativar confirmação automática" />
            </article>

            <div className="wa39-flow-card">
              <div className="wa39-flow-step">
                <b>1</b>
                <label><span>Pedir confirmação</span><ProductSelect value={String(settings.confirmationOffsetHours)} onChange={(next) => setSettings((value) => ({ ...value, confirmationOffsetHours: Number(next) }))} ariaLabel="Quando pedir confirmação" size="compact" options={[{ value: '12', label: '12h antes' }, { value: '24', label: '24h antes' }, { value: '48', label: '48h antes' }]} /></label>
              </div>
              <ArrowRight className="wa39-flow-arrow" size={18} />
              <div className="wa39-flow-step">
                <b>2</b>
                <label><span>Se não responder, lembrar</span><ProductSelect value={String(settings.confirmationRetryHours)} onChange={(next) => setSettings((value) => ({ ...value, confirmationRetryHours: Number(next) }))} ariaLabel="Quando reenviar confirmação" size="compact" options={[{ value: '4', label: '4h depois' }, { value: '8', label: '8h depois' }, { value: '12', label: '12h depois' }]} /></label>
              </div>
              <ArrowRight className="wa39-flow-arrow" size={18} />
              <div className="wa39-flow-step">
                <b>3</b>
                <label><span>Sem resposta vira pendência</span><ProductSelect value={String(settings.noResponseCutoffHours)} onChange={(next) => setSettings((value) => ({ ...value, noResponseCutoffHours: Number(next) }))} ariaLabel="Quando transformar ausência de resposta em pendência" size="compact" options={[{ value: '2', label: '2h antes' }, { value: '4', label: '4h antes' }, { value: '6', label: '6h antes' }]} /></label>
              </div>
            </div>

            <div className="wa39-reply-rule"><CheckCircle2 size={17} /><div><strong>Resposta simples para a cliente</strong><span>Ela responde <b>1</b> para confirmar ou <b>2</b> para avisar que não poderá ir. Nenhum código aleatório é necessário no fluxo normal.</span></div></div>

            <label className="wa39-template"><span>Mensagem de confirmação</span><textarea value={settings.confirmationMessage} onChange={(e) => setSettings((value) => ({ ...value, confirmationMessage: e.target.value }))} /></label>
            <div className="wa39-variable-row"><span>Variáveis</span>{['{{nome}}','{{servico}}','{{data}}','{{hora}}','{{espaco}}'].map((item) => <button type="button" key={item} onClick={() => setSettings((value) => ({ ...value, confirmationMessage: `${value.confirmationMessage} ${item}` }))}>{item}</button>)}</div>

            <article className="wa39-compact-setting">
              <div><strong>Cancelar automaticamente se a cliente recusar</strong><p>Desligado por padrão: a recusa aparece para você decidir o que fazer.</p></div>
              <MiniToggle checked={settings.autoCancelDeclined} onChange={(checked) => setSettings((value) => ({ ...value, autoCancelDeclined: checked }))} label="Cancelar automaticamente" />
            </article>

            <article className="wa39-reminder-setting">
              <div className="wa39-reminder-head"><div><span>Depois da confirmação</span><strong>Lembrete final</strong><p>Enviado somente para quem já confirmou presença.</p></div><MiniToggle checked={settings.remindersEnabled} onChange={(checked) => setSettings((value) => ({ ...value, remindersEnabled: checked }))} label="Ativar lembrete final" /></div>
              {settings.remindersEnabled ? <div className="wa39-reminder-fields"><label><span>Enviar</span><ProductSelect value={String(settings.reminderOffsetHours)} onChange={(next) => setSettings((value) => ({ ...value, reminderOffsetHours: Number(next) }))} ariaLabel="Quando enviar lembrete final" size="compact" options={[{ value: '1', label: '1 hora antes' }, { value: '2', label: '2 horas antes' }, { value: '3', label: '3 horas antes' }, { value: '4', label: '4 horas antes' }]} /></label><label className="wa39-template"><span>Mensagem do lembrete</span><textarea value={settings.reminderMessage} onChange={(e) => setSettings((value) => ({ ...value, reminderMessage: e.target.value }))} /></label></div> : null}
            </article>

            <footer className="wa39-savebar"><span>{settings.updatedAt ? `Atualizado ${relativeTime(settings.updatedAt)}` : 'Revise antes de salvar.'}</span><button type="button" onClick={() => void saveSettings()} disabled={settingsBusy}>{settingsBusy ? 'Salvando…' : 'Salvar automações'}</button></footer>
          </div>

          <aside className="wa39-preview-card">
            <div className="wa39-preview-head"><span>Prévia</span><small>Como a cliente recebe</small></div>
            <div className="wa39-preview-chat">
              <div className="wa39-preview-day">Amanhã</div>
              <p className="is-out">{previewTemplate(settings.confirmationMessage)}</p>
              <p className="is-in">1</p>
              <div className="wa39-preview-system"><CheckCircle2 size={14} /> Presença confirmada</div>
            </div>
            <label className="wa39-test-field"><span>Enviar um teste</span><input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="(11) 99999-9999" /><button type="button" onClick={() => void sendTest('confirmation')} disabled={status !== 'connected'}>Testar</button></label>
          </aside>
        </section>
      ) : null}

      {view === 'campaigns' ? (
        <section className="wa39-campaigns">
          <div className="wa39-section-intro"><span>Relacionamento</span><h3>Campanhas para quem escolheu receber.</h3><p>O Lash Designer usa somente a audiência com consentimento promocional ativo e revalida essa autorização no momento de cada envio.</p></div>
          <div className="wa39-campaign-overview">
            <article><div className="wa39-stat-icon"><Users size={18} /></div><span>Audiência autorizada</span><strong>{diagnostics ? diagnostics.optedInClients : '—'}</strong><small>de {diagnostics ? diagnostics.totalClients : '—'} clientes · limite de {campaignMaxRecipients} por campanha</small></article>
            <article><div className="wa39-stat-icon"><Megaphone size={18} /></div><span>Envio operacional</span><strong className="is-text">{campaignsEnabled ? `1 mensagem a cada ${campaignSendIntervalSeconds}s` : 'Desativado no servidor'}</strong><small>{campaignsEnabled ? 'Fila com revalidação de consentimento, tentativas e histórico.' : 'A liberação exige configuração explícita de produção.'}</small></article>
          </div>

          {!campaignsEnabled ? <div className="wa39-campaign-gate"><ShieldCheck size={18} /><div><strong>Disparos protegidos por feature flag</strong><p>O editor e o histórico continuam disponíveis, mas novas campanhas só entram na fila quando <code>WHATSAPP_PROMOTIONAL_CAMPAIGNS_ENABLED=true</code> estiver configurado no servidor.</p></div></div> : null}

          <article className="wa39-campaign-editor">
            <header><div><span>Campanha promocional</span><strong>Mensagem e audiência consentida</strong><small>A instrução de saída é acrescentada automaticamente se o texto ainda não tiver SAIR/PARE/PARAR/STOP.</small></div><MiniToggle checked={settings.promoEnabled} onChange={(checked) => setSettings((value) => ({ ...value, promoEnabled: checked }))} label="Ativar modelo promocional" /></header>
            <label className="wa39-campaign-name"><span>Nome interno</span><input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} maxLength={80} placeholder="Ex.: Agenda de setembro" /></label>
            <label className="wa39-template"><span>Mensagem</span><textarea value={settings.promoMessage} onChange={(e) => setSettings((value) => ({ ...value, promoMessage: e.target.value }))} maxLength={1400} /></label>
            <div className="wa39-variable-row"><span>Variáveis</span>{['{{nome}}','{{espaco}}'].map((item) => <button type="button" key={item} onClick={() => setSettings((value) => ({ ...value, promoMessage: `${value.promoMessage} ${item}` }))}>{item}</button>)}</div>
            <div className="wa39-campaign-compliance"><ShieldCheck size={16} /><p>Somente clientes com consentimento ativo entram na audiência. Se alguém retirar a autorização antes do envio, essa pessoa é ignorada. Responder <strong>SAIR</strong>, <strong>PARE</strong>, <strong>PARAR</strong> ou <strong>STOP</strong> remove a autorização promocional.</p></div>
            <div className="wa39-campaign-actions"><label><span>Testar em um número</span><input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="(11) 99999-9999" /></label><button type="button" onClick={() => void sendTest('promo')} disabled={status !== 'connected'}>Enviar teste</button><button type="button" onClick={() => void saveSettings()} disabled={settingsBusy}>Salvar modelo</button><button type="button" className="is-primary" onClick={() => void createCampaign()} disabled={campaignBusy || !campaignsEnabled || !settings.promoEnabled || !(diagnostics?.optedInClients ?? 0)}>{campaignBusy ? 'Preparando…' : `Criar campanha para ${diagnostics?.optedInClients ?? 0} autorizadas`}</button></div>
          </article>

          <section className="wa39-campaign-history" aria-label="Histórico de campanhas">
            <header><div><span>Histórico</span><strong>Campanhas recentes</strong></div><button type="button" onClick={() => void loadCampaigns()} disabled={campaignBusy}><RefreshCw size={14} /> Atualizar</button></header>
            {campaigns.length ? <div className="wa39-campaign-list">{campaigns.map((campaign) => {
              const finished = campaign.sentCount + campaign.failedCount + campaign.skippedCount
              const progress = campaign.totalRecipients ? Math.min(100, Math.round((finished / campaign.totalRecipients) * 100)) : 0
              const active = campaign.status === 'QUEUED' || campaign.status === 'RUNNING'
              return <article className="wa39-campaign-row" key={campaign.id}>
                <div className="wa39-campaign-row-main"><div><strong>{campaign.name}</strong><span>{new Date(campaign.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span></div><b className={`is-${campaign.status.toLowerCase()}`}>{campaign.status === 'QUEUED' ? 'Na fila' : campaign.status === 'RUNNING' ? 'Enviando' : campaign.status === 'COMPLETED' ? 'Concluída' : campaign.status === 'CANCELLED' ? 'Cancelada' : 'Falhou'}</b></div>
                <div className="wa39-campaign-progress"><i><span style={{ width: `${progress}%` }} /></i><small>{campaign.sentCount} enviadas · {campaign.skippedCount} ignoradas · {campaign.failedCount} falharam · {campaign.totalRecipients} total</small></div>
                {campaign.lastError ? <p>{campaign.lastError}</p> : null}
                {active ? <button type="button" onClick={() => void cancelCampaign(campaign.id)} disabled={campaignBusy}>Cancelar campanha</button> : null}
              </article>
            })}</div> : <div className="wa39-campaign-empty">Nenhuma campanha criada ainda.</div>}
          </section>
        </section>
      ) : null}

      {view === 'connection' ? (
        <section className="wa39-connection-grid">
          <article className="wa39-connection-status">
            <div className={`wa39-connection-mark is-${status}`}><Smartphone size={22} /></div>
            <div><span>Conexão</span><h3>{status === 'connected' ? 'WhatsApp conectado' : status === 'qr_scan' ? 'Leia o QR Code' : 'Conecte seu WhatsApp'}</h3><p>{status === 'connected' ? 'A central está pronta para enviar e receber mensagens.' : 'Faça a conexão para ativar conversas e automações.'}</p></div>
            <button type="button" onClick={() => void refreshConnection()} disabled={connectionBusy}><RefreshCw size={16} /> {connectionBusy ? 'Verificando…' : 'Verificar'}</button>
          </article>

          <article className="wa39-connection-card">
            <header><div><span>Recebimento de mensagens</span><strong>{diagnostics?.providerWebhookConfigured === true ? 'Recebimento preparado' : diagnostics?.providerWebhookConfigured === false ? 'Precisa de atenção' : 'Verificando configuração'}</strong></div><MessageSquare size={20} /></header>
            <p>{diagnostics?.providerWebhookConfigured === false ? 'A conexão existe, mas o recebimento precisa ser configurado novamente.' : 'As respostas das clientes são encaminhadas para a inbox do Lash Designer.'}</p>
            <dl><div><dt>Última recebida</dt><dd>{relativeTime(diagnostics?.lastInboundAt ?? null) || 'Nenhuma ainda'}</dd></div><div><dt>Último envio</dt><dd>{relativeTime(diagnostics?.lastOutboundAt ?? null) || 'Nenhum ainda'}</dd></div></dl>
          </article>

          <article className="wa39-connection-card">
            <header><div><span>Infraestrutura</span><strong>{instance?.platformManaged ? 'Gerenciada pelo Lash Designer' : 'Conexão configurada'}</strong></div><QrCode size={20} /></header>
            <p>{instance?.platformManaged ? 'Os dados técnicos da instância ficam ocultos e são gerenciados pela plataforma.' : 'A integração Evolution deste espaço está configurada para operar com a central.'}</p>
            {status !== 'connected' ? <button type="button" className="is-primary" onClick={() => void handleConnect()} disabled={connectionBusy || !(instance?.baseUrl && instance?.instanceName && instance?.hasApiKey)}>{connectionBusy ? 'Preparando…' : 'Conectar via QR Code'}</button> : <span className="wa39-connected-note"><CheckCircle2 size={15} /> Nenhuma ação necessária agora</span>}
          </article>

          {qrCode && status !== 'connected' ? <article className="wa39-qr-card"><span>Leia no WhatsApp</span><div><img src={qrCode} alt="QR Code para conectar o WhatsApp" /></div><p>Abra <b>Aparelhos conectados</b> no WhatsApp e leia este código.</p></article> : null}
        </section>
      ) : null}

      {newConversationOpen ? (
        <div className="wa39-new-backdrop" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target) setNewConversationOpen(false) }}>
          <form className="wa39-new-dialog" onSubmit={startConversation}>
            <header><div><span>Nova conversa</span><h3>Adicionar contato e conversar</h3><p>O nome fica salvo na sua inbox para você não precisar reconhecer clientes pelo número.</p></div><button type="button" onClick={() => setNewConversationOpen(false)} aria-label="Fechar"><X size={18} /></button></header>
            <div className="wa39-new-fields"><label><span>Nome</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Maria Souza" autoFocus /></label><label><span>WhatsApp com DDD</span><input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="(11) 99999-9999" /></label></div>
            <label><span>Primeira mensagem</span><textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Oi, Maria! Como posso te ajudar?" /></label>
            <footer><button type="button" onClick={() => setNewConversationOpen(false)}>Cancelar</button><button type="submit" className="is-primary" disabled={sending || newName.trim().length < 2 || newPhone.trim().length < 8 || !newMessage.trim()}>{sending ? 'Enviando…' : 'Salvar e enviar'}</button></footer>
          </form>
        </div>
      ) : null}
    </div>
  )
}
