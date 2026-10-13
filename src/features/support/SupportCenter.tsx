import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { MessageSquare, Plus, ChevronLeft } from '../../components/Icons'
import { ProductSelect } from '../../components/ProductSelect'
import { SupportComposer, type SupportDraft } from './SupportComposer'
import {
  categoryLabels,
  priorityLabels,
  statusLabels,
  type SupportDetail,
  type SupportTicket,
} from './types'
import './support.css'
const choices = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))
const date = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
export function SupportCenter({ role }: { role: 'DEV' | 'ADMIN' | 'STAFF' }) {
  const dev = role === 'DEV',
    location = useLocation(),
    navigate = useNavigate()
  const selected =
    Number(new URLSearchParams(location.search).get('ticket')) || null
  const [tickets, setTickets] = useState<SupportTicket[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('')
  const [detail, setDetail] = useState<SupportDetail | null>(null),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [stats, setStats] = useState({ active: 0, waiting: 0, overdue: 0 }),
    [refresh, setRefresh] = useState(0)
  const [priority, setPriority] = useState(''),
    [assigned, setAssigned] = useState('')
  const retry = useRef<{
    key: string
    payload: Record<string, unknown>
  } | null>(null)
  const [detailFailed, setDetailFailed] = useState(false)
  const request = useRef(0)
  const open = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(location.search)
      if (id) params.set('ticket', String(id))
      else params.delete('ticket')
      if (role !== 'STAFF') params.set('view', 'support')
      navigate({ pathname: location.pathname, search: params.toString() })
      setCreate(false)
      setError('')
    },
    [location.pathname, location.search, navigate, role],
  )
  useEffect(() => {
    if (!dev) return
    void api<{ agents: { id: string; name: string }[] }>(
      '/api/support/agents',
    ).then((res) => {
      if (res.ok) setAgents(res.data.agents)
    })
  }, [dev])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void api<{
        tickets: SupportTicket[]
        total: number
        stats: { active: number; waiting: number; overdue: number }
      }>(
        `/api/support/tickets?search=${encodeURIComponent(search)}&status=${status}&page=${page}&priority=${priority}&assigned=${assigned}`,
        { signal: controller.signal },
      ).then((res) => {
        if (controller.signal.aborted) return
        if (res.ok) {
          setTickets(res.data.tickets)
          setTotal(res.data.total)
          setStats(res.data.stats)
          setLoading(false)
        } else {
          setError(res.error.message)
          setLoading(false)
        }
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [page, search, status, priority, assigned, refresh])
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !busy)
        setRefresh((value) => value + 1)
    }, 20000)
    return () => window.clearInterval(interval)
  }, [busy])
  useEffect(() => {
    setDetailFailed(false)
    const generation = ++request.current,
      controller = new AbortController()
    if (!selected) {
      setDetail(null)
      return () => controller.abort()
    }
    let cancelled = false
    async function load() {
      let after = 0,
        all: SupportDetail['messages'] = [],
        result: SupportDetail | null = null
      do {
        const res = await api<SupportDetail>(
          `/api/support/tickets/${selected}?after=${after}`,
          { signal: controller.signal },
        )
        if (cancelled || generation !== request.current) return
        if (!res.ok) {
          setError(res.error.message)
          setDetailFailed(true)
          return
        }
        result = res.data
        all = [...all, ...result.messages]
        after = result.nextAfter ?? 0
      } while (after)
      if (!result) return
      setDetail({ ...result, messages: all })
      const sequence = all.at(-1)?.sequence ?? 0
      await api(`/api/support/tickets/${selected}/read`, {
        method: 'POST',
        body: JSON.stringify({ sequence }),
        signal: controller.signal,
      })
      window.dispatchEvent(new Event('support-notifications-updated'))
    }
    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selected, refresh])
  async function submit(draft: SupportDraft, key: string) {
    setBusy(true)
    setError('')
    const payload = create
      ? {
          key,
          subject: draft.subject,
          category: draft.category,
          priority: draft.priority,
          body: draft.body,
          attachments: draft.attachments,
        }
      : {
          key,
          version: detail!.ticket.version,
          body: draft.body,
          internal: draft.internal,
          attachments: draft.attachments,
        }
    if (retry.current?.key !== key) retry.current = { key, payload }
    const res = await api<{ id: number }>(
      create
        ? '/api/support/tickets'
        : `/api/support/tickets/${selected}/replies`,
      { method: 'POST', body: JSON.stringify(retry.current.payload) },
    )
    setBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      if (res.error.code === 'SUPPORT_VERSION_CONFLICT') {
        retry.current = null
        setRefresh((value) => value + 1)
      }
      return false
    }
    retry.current = null
    open(res.data.id)
    setRefresh((value) => value + 1)
    return true
  }
  async function update(fields: Record<string, unknown>) {
    if (!detail || busy) return
    setBusy(true)
    setError('')
    const res = await api(`/api/support/tickets/${selected}`, {
      method: 'PATCH',
      body: JSON.stringify({
        key: crypto.randomUUID(),
        version: detail.ticket.version,
        ...fields,
      }),
    })
    setBusy(false)
    if (!res.ok) setError(res.error.message)
    setRefresh((value) => value + 1)
  }
  const t = detail?.ticket
  const statusHelp: Record<string, string> = {
    NEW: 'Pedido recebido. Nossa equipe vai responder por aqui.',
    OPEN: 'Nossa equipe está cuidando do seu pedido. Você pode acrescentar informações abaixo.',
    PENDING:
      'Precisamos de uma resposta sua para continuar. Escreva sua mensagem abaixo.',
    ON_HOLD:
      'Estamos analisando seu pedido. Avisaremos quando houver uma atualização.',
    RESOLVED:
      'Deu tudo certo? Se precisar de mais ajuda, toque em Reabrir pedido.',
    CLOSED:
      'Este atendimento terminou. Você pode abrir um novo pedido se precisar.',
  }
  return (
    <section
      className={`support-center ${dev ? 'support-dev' : 'support-friendly'} ${create ? 'is-creating' : ''} ${selected && !create ? 'has-ticket' : ''}`}
      aria-label="Central de suporte"
    >
      <header className="support-heading">
        <div>
          <span className="support-eyebrow">
            {dev ? 'ATENDIMENTO DA PLATAFORMA' : 'ESTAMOS AQUI PARA AJUDAR'}
          </span>
          <h2 className="ld-ds-page-title support-title">
            {dev
              ? 'Central de atendimento'
              : selected && !create
                ? 'Seu pedido de ajuda'
                : 'Como podemos ajudar?'}
          </h2>
          <p>
            {dev
              ? 'Organize a fila e acompanhe cada conversa com os estúdios.'
              : 'Conte sua dúvida ou o que não funcionou. Nossa equipe responde aqui, e você recebe uma notificação no painel.'}
          </p>
        </div>
        {!dev && !create ? (
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => {
              open(null)
              setCreate(true)
            }}
            disabled={busy}
          >
            <Plus size={17} /> Pedir ajuda
          </button>
        ) : null}
      </header>
      {dev ? (
        <div className="support-stats">
          <span>
            <strong>{stats.active ?? 0}</strong> em andamento
          </span>
          <span>
            <strong>{stats.waiting ?? 0}</strong> aguardando estúdio
          </span>
          <span>
            <strong>{stats.overdue ?? 0}</strong> além da meta interna
          </span>
        </div>
      ) : !create ? (
        <div className="support-user-summary">
          <span>
            <MessageSquare size={18} /> Meus pedidos de ajuda
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={status === 'PENDING'}
            onClick={() => {
              setStatus(status === 'PENDING' ? '' : 'PENDING')
              setPage(1)
              open(null)
            }}
          >
            {stats.waiting ?? 0} aguardando sua resposta
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="form-error" role="alert">
          {error}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setError('')
              setRefresh((value) => value + 1)
            }}
          >
            Atualizar
          </button>
        </div>
      ) : null}
      {create ? (
        <div className="card support-panel">
          <div className="support-heading">
            <div>
              <h2>Conte o que você precisa</h2>
              <p>
                Preencha abaixo. Se tiver uma imagem da tela, você pode anexar.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setCreate(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
          <SupportComposer
            key="new-request"
            create
            busy={busy}
            onSubmit={submit}
          />
        </div>
      ) : (
        <div className={`support-layout ${selected ? 'has-selection' : ''}`}>
          <aside
            className="card support-panel support-list"
            aria-label={dev ? 'Lista de chamados' : 'Meus pedidos de ajuda'}
          >
            <div className="support-filters">
              <label>
                Buscar
                <input
                  className="input"
                  type="search"
                  value={search}
                  maxLength={160}
                  placeholder="Buscar pelo assunto"
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </label>
              <label>
                {dev ? 'Estado' : 'Mostrar'}
                <ProductSelect
                  ariaLabel={dev ? 'Filtrar estado' : 'Mostrar pedidos'}
                  value={status}
                  options={[
                    { value: '', label: 'Todos' },
                    ...choices(statusLabels),
                  ]}
                  onChange={(value) => {
                    setStatus(value)
                    setPage(1)
                  }}
                />
              </label>
              {dev ? (
                <>
                  <label>
                    Prioridade
                    <ProductSelect
                      ariaLabel="Filtrar prioridade"
                      value={priority}
                      options={[
                        { value: '', label: 'Todas' },
                        ...choices(priorityLabels),
                      ]}
                      onChange={(value) => {
                        setPriority(value)
                        setPage(1)
                      }}
                    />
                  </label>
                  <label>
                    Atendente
                    <ProductSelect
                      ariaLabel="Filtrar atendente"
                      value={assigned}
                      options={[
                        { value: '', label: 'Todos' },
                        { value: 'unassigned', label: 'Sem responsável' },
                        ...agents.map((agent) => ({
                          value: agent.id,
                          label: agent.name,
                        })),
                      ]}
                      onChange={(value) => {
                        setAssigned(value)
                        setPage(1)
                      }}
                    />
                  </label>
                </>
              ) : null}
            </div>
            {loading ? (
              <p role="status">Carregando chamados…</p>
            ) : tickets.length === 0 ? (
              <div className="support-empty">
                <MessageSquare size={30} />
                <h3>
                  {search || status
                    ? 'Nenhum pedido encontrado'
                    : 'Ainda não pediu ajuda por aqui?'}
                </h3>
                <p>
                  {search || status
                    ? 'Tente outro assunto ou selecione Todos no filtro.'
                    : 'Quando precisar, toque em Pedir ajuda. Suas conversas ficam salvas aqui.'}
                </p>
              </div>
            ) : (
              tickets.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`support-ticket ${item.id === selected ? 'selected' : ''}`}
                  onClick={() => open(item.id)}
                  aria-pressed={item.id === selected}
                >
                  <span className="support-ticket-meta">
                    {dev ? item.protocol : categoryLabels[item.category]}
                    <span className="status-badge support-badge">
                      {statusLabels[item.status]}
                    </span>
                  </span>
                  <strong>{item.subject}</strong>
                  {dev ? (
                    <small>
                      {item.tenantName} · {priorityLabels[item.priority]}
                    </small>
                  ) : null}
                  <span className="support-ticket-meta">
                    {dev ? '' : 'Última atualização: '}
                    {date(item.updatedAt)}
                    {item.unread ? (
                      <span className="support-unread">
                        {item.unread}{' '}
                        {item.unread === 1
                          ? 'mensagem nova'
                          : 'mensagens novas'}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))
            )}
            <div className="support-pagination">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <small>
                Página {page} de {Math.max(1, Math.ceil(total / 20))}
              </small>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={page * 20 >= total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          </aside>
          <article className="card support-panel support-conversation">
            {selected ? (
              <button
                type="button"
                className="btn btn-ghost support-back"
                onClick={() => open(null)}
              >
                <ChevronLeft size={16} />{' '}
                {dev ? 'Voltar à lista' : 'Meus pedidos'}
              </button>
            ) : null}
            {!selected ? (
              <div className="support-empty">
                <h2>Uma conversa, todo o histórico.</h2>
                <p>
                  Selecione um chamado para ver as mensagens e acompanhar o
                  atendimento.
                </p>
              </div>
            ) : !t || t.id !== selected ? (
              <p role="status">
                {detailFailed
                  ? 'Não foi possível abrir este chamado. Volte à lista ou tente atualizar.'
                  : 'Carregando conversa…'}
              </p>
            ) : (
              <>
                <div className="support-ticket-meta">
                  <span>
                    {categoryLabels[t.category]} · {t.protocol}
                  </span>
                  <span className="status-badge support-badge">
                    {statusLabels[t.status]}
                  </span>
                </div>
                <h2>{t.subject}</h2>
                <p className="support-muted">
                  {dev ? `${t.tenantName} · ` : ''}Aberto em {date(t.createdAt)}{' '}
                  {dev
                    ? ` · Impacto ${priorityLabels[t.priority].toLowerCase()}`
                    : ''}
                </p>
                {!dev ? (
                  <p
                    className={`support-next-step ${t.status === 'PENDING' ? 'needs-answer' : ''}`}
                    role="status"
                  >
                    {statusHelp[t.status]}
                  </p>
                ) : null}
                {!dev && t.status !== 'CLOSED' && t.status !== 'RESOLVED' ? (
                  <button
                    type="button"
                    className="btn btnPrimary support-reply-jump"
                    onClick={() => {
                      const field = document.querySelector<HTMLTextAreaElement>(
                        '.support-conversation textarea',
                      )
                      field?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      })
                      field?.focus({ preventScroll: true })
                    }}
                  >
                    Responder ao atendimento
                  </button>
                ) : null}
                {dev && t.overdue ? (
                  <p className="support-warning">
                    Meta interna de primeira resposta ultrapassada.
                  </p>
                ) : null}
                {dev && t.status !== 'CLOSED' ? (
                  <div className="support-filters">
                    <label>
                      Estado
                      <ProductSelect
                        ariaLabel="Estado do chamado"
                        disabled={busy}
                        value={t.status}
                        options={choices(statusLabels).map((item) => ({
                          ...item,
                          disabled:
                            item.value === 'CLOSED' && t.status !== 'RESOLVED',
                        }))}
                        onChange={(status) => void update({ status })}
                      />
                    </label>
                    <label>
                      Prioridade
                      <ProductSelect
                        ariaLabel="Prioridade do chamado"
                        disabled={busy}
                        value={t.priority}
                        options={choices(priorityLabels)}
                        onChange={(priority) => void update({ priority })}
                      />
                    </label>
                    <label>
                      Responsável
                      <ProductSelect
                        ariaLabel="Responsável pelo atendimento"
                        disabled={busy}
                        value={t.assignedTo ?? ''}
                        options={[
                          { value: '', label: 'Sem responsável' },
                          ...agents.map((agent) => ({
                            value: agent.id,
                            label: agent.name,
                          })),
                        ]}
                        onChange={(value) =>
                          void update({ assignedTo: value || null })
                        }
                      />
                    </label>
                  </div>
                ) : !dev && t.status !== 'CLOSED' ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() =>
                      void update({
                        status: t.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED',
                      })
                    }
                  >
                    {t.status === 'RESOLVED'
                      ? 'Reabrir pedido'
                      : 'Marcar como resolvido'}
                  </button>
                ) : null}
                <ol
                  className="support-messages"
                  aria-label="Histórico do chamado"
                >
                  {detail!.messages.map((message) => (
                    <li
                      key={message.id}
                      className={`support-message ${message.authorRole === 'DEV' ? 'from-support' : 'from-user'} ${message.visibility === 'INTERNAL' ? 'internal' : ''} ${message.kind === 'EVENT' ? 'event' : ''}`}
                    >
                      <div className="support-ticket-meta">
                        <strong>
                          {message.visibility === 'INTERNAL'
                            ? 'Nota interna · '
                            : ''}
                          {message.authorRole === 'DEV'
                            ? 'Equipe de suporte'
                            : message.authorRole === 'ADMIN'
                              ? dev
                                ? 'Administradora'
                                : 'Você'
                              : dev
                                ? 'Profissional'
                                : 'Você'}
                        </strong>
                        <time dateTime={message.createdAt}>
                          {date(message.createdAt)}
                        </time>
                      </div>
                      <p>{message.body}</p>
                      {message.attachments.map((file) => (
                        <a
                          key={file.id}
                          href={`/api/support/attachments/${file.id}`}
                          download
                        >
                          {file.name} · {Math.ceil(file.size / 1024)} KB
                        </a>
                      ))}
                    </li>
                  ))}
                </ol>
                {t.status === 'CLOSED' ? (
                  <p className="support-empty">
                    Este pedido está encerrado. Para continuar, toque em Pedir
                    ajuda e mencione {t.protocol}.
                  </p>
                ) : (
                  <SupportComposer
                    key={selected}
                    dev={dev}
                    busy={busy}
                    onSubmit={submit}
                  />
                )}
              </>
            )}
          </article>
        </div>
      )}
    </section>
  )
}
