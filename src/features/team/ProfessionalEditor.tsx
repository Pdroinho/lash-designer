import { ProfessionalAvatar } from '../../components/ProfessionalAvatar'
import { optimizeImageFile } from '../../imageProcessing'
import { useRef, useState } from 'react'
import { api } from '../../api'
import { ModalRoot } from '../../components/ModalRoot'
import { X, Check } from '../../components/Icons'
import { notify } from '../../components/FeedbackCenter'
import type { AdminService } from '../shared/types'
import { TeamHours } from './TeamHours'
import { hoursError, type Hours, type Professional } from './teamTypes'
export function ProfessionalEditor({
  person,
  services,
  inherited,
  onClose,
  onSaved,
}: {
  person: Professional | null
  services: AdminService[]
  inherited: Hours[]
  onClose: () => void
  onSaved: () => void
}) {
  const [step, setStep] = useState(0),
    [name, setName] = useState(person?.name ?? ''),
    [ids, setIds] = useState(person?.serviceIds ?? []),
    [hours, setHours] = useState(person?.hours ?? []),
    [custom, setCustom] = useState(Boolean(person?.hours.length)),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [instagram, setInstagram] = useState(person?.instagram ?? '')
  const [tiktok, setTiktok] = useState(person?.tiktok ?? '')
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(person?.photoUrl ?? null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const photoRequest = useRef(0)
  async function uploadPhoto(file: File) {
    const request = ++photoRequest.current
    setPhotoBusy(true)
    setError('')
    try {
      const result = await optimizeImageFile(file, {maxBytes: 125_000, maxDimension: 480, quality: .85})
      if (photoRequest.current === request) setPhotoUrl(result)
    } catch (cause) {
      if (photoRequest.current === request) setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a foto.')
    } finally {
      if (photoRequest.current === request) setPhotoBusy(false)
    }
  }
  const labels = ['Nome', 'Serviços', 'Horários']
  function validate() {
    if (step === 0 && name.trim().length < 2)
      return 'Informe o nome da profissional, com pelo menos 2 letras.'
    if (step === 0 && [instagram, tiktok].some(value => value.trim() && !/^[a-zA-Z0-9_]+(?:[.][a-zA-Z0-9_]+)*$/.test(value.trim().replace(/^@/,'')))) return 'Nas redes sociais, informe somente o usuário, sem o link.'
    if (step === 1 && !ids.length)
      return 'Escolha pelo menos um serviço que ela realiza.'
    if (step === 2 && custom) return hoursError(hours)
    return ''
  }
  async function next() {
    if (busy || photoBusy) return
    const message = validate()
    setError(message)
    if (message) return
    if (step < 2) {
      setStep(step + 1)
      return
    }
    setBusy(true)
    const result = await api(
      person
        ? `/api/admin/professionals/${person.id}`
        : '/api/admin/professionals',
      {
        method: person ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: name.trim(),
          photoUrl,
          instagram: instagram.trim().replace(/^@/,'') || null,
          tiktok: tiktok.trim().replace(/^@/,'') || null,
          serviceIds: ids,
          hours: custom ? hours : [],
        }),
      },
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    notify(
      person
        ? 'Alterações salvas.'
        : 'Profissional adicionada. Você já pode agendar com ela.',
      'success',
    )
    onSaved()
  }
  return (
    <ModalRoot
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy && !photoBusy) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-editor-title"
        className="ld-dialog team-dialog"
      >
        <header className="cardHeader">
          <div>
            <span className="team-eyebrow">
              {person ? 'CONFIGURAR PROFISSIONAL' : 'ADICIONAR À EQUIPE'}
            </span>
            <h2 className="cardTitle" id="team-editor-title">
              {person ? person.name : 'Uma nova profissional'}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar cadastro"
            disabled={busy || photoBusy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <ol className="team-steps" aria-label="Etapas do cadastro">
          {labels.map((label, index) => (
            <li key={label} aria-current={step === index ? 'step' : undefined}>
              <span>{index < step ? <Check size={15} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void next()
          }}
          className="team-editor-form"
        >
          <div className="cardBody team-dialog-body">
            {step === 0 ? (
              <>
                <h3>Como ela se chama?</h3>
                <p className="team-help">
                  Este nome aparece para as clientes na página de agendamento. O
                  acesso ao painel pode ser criado depois.
                </p>
                <div className="team-photo-editor">
                  <ProfessionalAvatar name={name} photoUrl={photoUrl} />
                  <div>
                    <strong>Foto da profissional <span className="team-help">(opcional)</span></strong>
                    <p className="team-help">Ajuda a cliente a reconhecer quem vai atendê-la. Sem foto, mostramos as iniciais.</p>
                    <div className="team-photo-actions">
                      <button type="button" className="btn btn-ghost" disabled={busy || photoBusy} onClick={() => photoInput.current?.click()}>{photoBusy ? 'Preparando foto…' : photoUrl ? 'Trocar foto' : 'Adicionar foto'}</button>
                      {photoUrl ? <button type="button" className="btn btn-ghost" disabled={busy || photoBusy} onClick={() => setPhotoUrl(null)}>Remover foto</button> : null}
                    </div>
                    <input ref={photoInput} type="file" className="sr-only" tabIndex={-1} aria-label="Selecionar foto da profissional" accept="image/png,image/jpeg,image/webp" disabled={busy || photoBusy} onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if(file) void uploadPhoto(file)}} />
                    <small className="team-help">JPG, PNG ou WebP · até 12 MB</small>
                  </div>
                </div>
                <label className="team-field">
                  Nome da profissional
                  <input
                    className="input"
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                    autoComplete="off"
                    placeholder="Ex.: Mariana Souza"
                    disabled={busy || photoBusy}
                  />
                </label>
                <details className="team-social-editor"><summary>Redes sociais (opcional)</summary><p className="team-help">A cliente pode conhecer o trabalho dela antes de agendar. Informe o usuário, sem o link.</p><label className="team-field">Instagram<input className="input" value={instagram} onChange={e=>setInstagram(e.target.value)} placeholder="Ex.: camila.lashes" maxLength={31} disabled={busy || photoBusy} autoCapitalize="none" /></label><label className="team-field">TikTok<input className="input" value={tiktok} onChange={e=>setTiktok(e.target.value)} placeholder="Ex.: camila.lashes" maxLength={31} disabled={busy || photoBusy} autoCapitalize="none" /></label></details>
              </>
            ) : null}
            {step === 1 ? (
              <>
                <h3>Quais serviços ela realiza?</h3>
                <p className="team-help">
                  As clientes poderão escolher esta profissional para os
                  serviços marcados abaixo.
                </p>
                <input
                  className="input"
                  aria-label="Buscar serviço da profissional"
                  type="search"
                  placeholder="Buscar pelo nome do serviço"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="team-selection-summary">
                  <span>{ids.length} selecionado(s)</span>
                  <button
                    type="button"
                    className="btn btn-ghost team-text-button"
                    disabled={busy || photoBusy}
                    onClick={() =>
                      setIds(services.map((service) => service.id))
                    }
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost team-text-button"
                    disabled={busy || photoBusy}
                    onClick={() => setIds([])}
                  >
                    Limpar
                  </button>
                </div>
                <div className="team-service-grid">
                  {services
                    .filter((service) =>
                      service.name
                        .toLocaleLowerCase('pt-BR')
                        .includes(search.toLocaleLowerCase('pt-BR')),
                    )
                    .map((service) => (
                      <label
                        key={service.id}
                        className={`team-service ${ids.includes(service.id) ? 'is-selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={ids.includes(service.id)}
                          disabled={busy || photoBusy}
                          onChange={() =>
                            setIds((current) =>
                              current.includes(service.id)
                                ? current.filter((id) => id !== service.id)
                                : [...current, service.id],
                            )
                          }
                        />
                        <span>
                          <strong>{service.name}</strong>
                          <small>
                            {service.durationMinutes} min ·{' '}
                            {(service.priceCents / 100).toLocaleString(
                              'pt-BR',
                              { style: 'currency', currency: 'BRL' },
                            )}
                          </small>
                        </span>
                      </label>
                    ))}
                </div>
                {!services.some((service) =>
                  service.name
                    .toLocaleLowerCase('pt-BR')
                    .includes(search.toLocaleLowerCase('pt-BR')),
                ) ? (
                  <p className="team-help">
                    Nenhum serviço com esse nome. Tente outra busca.
                  </p>
                ) : null}
              </>
            ) : null}
            {step === 2 ? (
              <>
                <h3>Quando ela atende?</h3>
                <TeamHours
                  custom={custom}
                  onCustom={setCustom}
                  hours={hours}
                  onChange={setHours}
                  inherited={inherited}
                  disabled={busy || photoBusy}
                />
              </>
            ) : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <footer className="modal-footer">
            <button
              type="button"
              className="btn"
              disabled={busy || photoBusy}
              onClick={() => {
                if (step) {
                  setStep(step - 1)
                  setError('')
                } else onClose()
              }}
            >
              {step ? 'Voltar' : 'Cancelar'}
            </button>
            <button type="submit" className="btn btnPrimary" disabled={busy || photoBusy}>
              {busy
                ? 'Salvando…'
                : step === 2
                  ? 'Salvar profissional'
                  : 'Continuar'}
            </button>
          </footer>
        </form>
      </section>
    </ModalRoot>
  )
}
