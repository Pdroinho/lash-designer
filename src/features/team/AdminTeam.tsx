import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Users, Plus, Settings, X } from '../../components/Icons'
import { ModalRoot } from '../../components/ModalRoot'
import { confirmAction, notify } from '../../components/FeedbackCenter'
import type { AdminService } from '../shared/types'
import { ProfessionalEditor } from './ProfessionalEditor'
import { ProfessionalAccess } from './ProfessionalAccess'
import { ProfessionalTimeOff } from './ProfessionalTimeOff'
import type { Professional, TeamData } from './teamTypes'
import './team.css'
export function AdminTeam({
  onServices,
  onBilling,
}: {
  onServices: () => void
  onBilling: () => void
}) {
  const [data, setData] = useState<TeamData | null>(null),
    [services, setServices] = useState<AdminService[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [editor, setEditor] = useState<Professional | 'new' | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [panel, setPanel] = useState<'profile' | 'access' | 'off'>('profile'),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      api<TeamData>('/api/admin/professionals', { signal: controller.signal }),
      api<{ services: AdminService[] }>('/api/admin/services', {
        signal: controller.signal,
      }),
    ]).then(([team, catalog]) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (!team.ok || !catalog.ok) {
        setError(
          !team.ok
            ? team.error.message
            : !catalog.ok
              ? catalog.error.message
              : 'Não foi possível carregar a equipe.',
        )
        return
      }
      setError('')
      setData(team.data)
      setServices(catalog.data.services)
    })
    return () => controller.abort()
  }, [revision])
  function refresh() {
    setRevision((value) => value + 1)
  }
  const active =
    data?.professionals.filter((person) => person.active && person.bookable)
      .length ?? 0
  const atLimit = active >= (data?.seatLimit ?? 0)
  const selected = data?.professionals.find(
    (person) => person.id === selectedId,
  )
  const shown =
    data?.professionals.filter(
      (person) =>
        person.name
          .toLocaleLowerCase('pt-BR')
          .includes(search.toLocaleLowerCase('pt-BR')) &&
        (filter === 'all' ||
          (filter === 'active' ? person.active : !person.active)),
    ) ?? []
  async function toggle(person: Professional) {
    if (
      person.active &&
      !(await confirmAction({
        title: 'Desativar profissional?',
        message: `${person.name} deixará de aparecer para novos agendamentos. O histórico será mantido. Se houver atendimentos futuros, será preciso reagendá-los primeiro.`,
        confirmLabel: 'Desativar',
        danger: true,
      }))
    )
      return
    setBusy(true)
    setError('')
    const result = await api(`/api/admin/professionals/${person.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        active: !person.active,
        ...(!person.active ? { bookable: true } : {}),
      }),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    notify(
      person.active ? 'Profissional desativada.' : 'Profissional ativada.',
      'success',
    )
    refresh()
  }
  function open(
    person: Professional,
    tab: 'profile' | 'access' | 'off' = 'profile',
  ) {
    setSelectedId(person.id)
    setPanel(tab)
    setError('')
  }
  return (
    <section className="team-page" aria-labelledby="team-title">
      <header className="team-heading">
        <div>
          <span className="team-eyebrow">EQUIPE DO ESTÚDIO</span>
          <h2 id="team-title">Cada profissional, uma agenda organizada.</h2>
          <p>
            Escolha quem atende, quais serviços realiza e quando está
            disponível.
          </p>
        </div>
        <button
          type="button"
          className="btn btnPrimary"
          disabled={loading || !data || atLimit || !services.length}
          onClick={() => setEditor('new')}
        >
          <Plus size={18} /> Adicionar profissional
        </button>
      </header>
      {error && !selected ? (
        <div className="form-error" role="alert">
          {error}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setLoading(true)
              refresh()
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="team-empty" role="status">
          Carregando sua equipe…
        </div>
      ) : data ? (
        <>
          <div className="team-plan">
            <Users size={22} />
            <div>
              <strong>
                {active} de {data.seatLimit} vagas em uso
              </strong>
              <span>
                {atLimit
                  ? 'Todas as vagas do plano estão ocupadas.'
                  : `${data.seatLimit - active} vaga(s) disponível(is) para novas profissionais.`}
              </span>
            </div>
            <button
              type="button"
              className="team-text-button"
              onClick={onBilling}
            >
              Ver meu plano
            </button>
          </div>
          {!services.length ? (
            <div className="team-notice">
              Comece cadastrando os serviços do estúdio. Depois você escolhe
              quais cada profissional realiza.
              <button
                type="button"
                className="btn btnPrimary"
                onClick={onServices}
              >
                Cadastrar serviços
              </button>
            </div>
          ) : null}
          <div className="team-toolbar">
            <input
              type="search"
              aria-label="Buscar profissional"
              placeholder="Buscar profissional pelo nome"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="team-filters" aria-label="Filtrar profissionais">
              {[
                ['all', 'Todas'],
                ['active', 'Ativas'],
                ['inactive', 'Inativas'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!shown.length ? (
            <div className="team-empty">
              <Users size={32} />
              <h3>
                {data.professionals.length
                  ? 'Nenhuma profissional encontrada'
                  : 'Vamos montar sua equipe?'}
              </h3>
              <p>
                {data.professionals.length
                  ? 'Tente outro nome ou mude o filtro acima.'
                  : 'Adicione a primeira profissional e escolha os serviços que ela realiza.'}
              </p>
            </div>
          ) : (
            <div className="team-grid">
              {shown.map((person) => (
                <article className="team-person" key={person.id}>
                  <div className="team-person-top">
                    <span className="team-avatar" aria-hidden="true">
                      {person.name
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                    <div>
                      <h3>{person.name}</h3>
                      <span
                        className={`team-status ${person.active && person.bookable ? 'active' : ''}`}
                      >
                        {!person.active
                          ? 'Inativa'
                          : person.bookable
                            ? 'Recebe agendamentos'
                            : 'Fora do agendamento'}
                      </span>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Serviços</dt>
                      <dd>{person.serviceIds.length} cadastrado(s)</dd>
                    </div>
                    <div>
                      <dt>Horários</dt>
                      <dd>
                        {person.hours.length
                          ? 'Personalizados'
                          : 'Segue o estúdio'}
                      </dd>
                    </div>
                    <div>
                      <dt>Acesso ao painel</dt>
                      <dd>
                        {person.accessRole === 'ADMIN'
                          ? 'Administradora'
                          : person.userId
                            ? person.accessDisabledAt
                              ? 'Suspenso'
                              : 'Liberado'
                            : person.pendingInvitation
                              ? 'Convite pendente'
                              : 'Ainda não convidada'}
                      </dd>
                    </div>
                  </dl>
                  <footer>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => open(person)}
                    >
                      <Settings size={16} /> Configurar
                    </button>
                    {!person.userId && person.active && person.bookable ? (
                      <button
                        type="button"
                        className="team-text-button"
                        onClick={() => open(person, 'access')}
                      >
                        {person.pendingInvitation
                          ? 'Ver convite'
                          : 'Convidar ao painel'}
                      </button>
                    ) : null}
                  </footer>
                </article>
              ))}
            </div>
          )}
          <p className="team-footnote">
            O WhatsApp é compartilhado pelo estúdio e administrado pela
            responsável. Cada profissional com acesso vê somente a própria
            agenda.
          </p>
        </>
      ) : null}
      {editor && data ? (
        <ProfessionalEditor
          person={editor === 'new' ? null : editor}
          services={services}
          inherited={data.businessHours}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            refresh()
          }}
        />
      ) : null}
      {selected && data ? (
        <ModalRoot
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.stopPropagation()
              setSelectedId(null)
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-detail-title"
            className="team-dialog"
          >
            <header>
              <div>
                <span className="team-eyebrow">CONFIGURAR PROFISSIONAL</span>
                <h2 id="team-detail-title">{selected.name}</h2>
              </div>
              <button
                type="button"
                aria-label="Fechar configurações"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setSelectedId(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div
              className="team-tabs"
              aria-label="Configurações da profissional"
            >
              {(
                [
                  ['profile', 'Cadastro'],
                  ['off', 'Folgas'],
                  ['access', 'Acesso ao painel'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={panel === value}
                  disabled={busy}
                  onClick={() => setPanel(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="team-dialog-body">
              {panel === 'profile' ? (
                <>
                  <h3>Serviços e horários</h3>
                  <p className="team-help">
                    Atualize o nome, os serviços oferecidos e a rotina de
                    atendimento desta profissional.
                  </p>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    onClick={() => {
                      setEditor(selected)
                      setSelectedId(null)
                    }}
                  >
                    Editar cadastro
                  </button>
                  <div className="team-danger-zone">
                    <h4>
                      {selected.active
                        ? 'Desativar profissional'
                        : 'Reativar profissional'}
                    </h4>
                    <p className="team-help">
                      {selected.active
                        ? 'Ela deixa de receber novos agendamentos. Seu histórico continua salvo.'
                        : atLimit
                          ? 'Libere uma vaga ou altere o plano antes de reativar.'
                          : 'Ela voltará a receber novos agendamentos e ocupará uma vaga do plano.'}
                    </p>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || (!selected.active && atLimit)}
                      onClick={() => void toggle(selected)}
                    >
                      {busy
                        ? 'Atualizando…'
                        : selected.active
                          ? 'Desativar profissional'
                          : 'Reativar profissional'}
                    </button>
                  </div>
                </>
              ) : panel === 'access' ? (
                <ProfessionalAccess
                  key={selected.id}
                  person={selected}
                  onSaved={refresh}
                  onBusyChange={setBusy}
                />
              ) : (
                <ProfessionalTimeOff
                  key={selected.id}
                  person={selected}
                  timezone={data.timezone}
                  onBusyChange={setBusy}
                />
              )}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <footer>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setSelectedId(null)}
              >
                Concluir
              </button>
            </footer>
          </section>
        </ModalRoot>
      ) : null}
    </section>
  )
}
