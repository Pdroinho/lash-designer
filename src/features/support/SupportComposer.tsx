import { useRef, useState } from 'react'
import { Paperclip } from '../../components/Icons'
import { ProductSelect } from '../../components/ProductSelect'
import { categoryLabels, priorityLabels, type Attachment } from './types'
export type SupportDraft = {
  subject: string
  category: string
  priority: string
  body: string
  internal: boolean
  attachments: Attachment[]
}
const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))
export function SupportComposer({
  create = false,
  dev = false,
  busy,
  onSubmit,
}: {
  create?: boolean
  dev?: boolean
  busy: boolean
  onSubmit: (draft: SupportDraft, key: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<SupportDraft>({
    subject: '',
    category: 'OTHER',
    priority: 'NORMAL',
    body: '',
    internal: false,
    attachments: [],
  })
  const [fileBusy, setFileBusy] = useState(false),
    [error, setError] = useState('')
  const [more, setMore] = useState(false)
  const command = useRef({ payload: '', key: '' })
  async function images(files: FileList | null) {
    if (!files) return
    setFileBusy(true)
    setError('')
    try {
      if (files.length + draft.attachments.length > 3)
        throw Error('Anexe até 3 imagens por mensagem.')
      const items: Attachment[] = []
      for (const file of Array.from(files)) {
        if (
          !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          file.size > 8 * 1024 * 1024
        )
          throw Error('Envie PNG, JPEG ou WebP de até 8 MB.')
        const bitmap = await createImageBitmap(file)
        try {
          if (bitmap.width * bitmap.height > 30000000)
            throw Error(
              'A imagem é grande demais. Envie uma captura de tela menor.',
            )
          const scale = Math.min(
              1,
              1600 / Math.max(bitmap.width, bitmap.height),
            ),
            canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(bitmap.width * scale))
          canvas.height = Math.max(1, Math.round(bitmap.height * scale))
          canvas
            .getContext('2d')!
            .drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          let data = canvas.toDataURL('image/webp', 0.8)
          if (data.length > 477866) data = canvas.toDataURL('image/webp', 0.45)
          if (data.length > 477866)
            throw Error(
              'Não foi possível reduzir esta imagem. Recorte a área do problema.',
            )
          items.push({
            name: file.name.replace(/\.[^.]+$/, '').slice(0, 100) + '.webp',
            mime: 'image/webp',
            base64: data.split(',')[1],
          })
        } finally {
          bitmap.close()
        }
      }
      setDraft((previous) => ({
        ...previous,
        attachments: [...previous.attachments, ...items],
      }))
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao preparar a imagem.',
      )
    } finally {
      setFileBusy(false)
    }
  }
  return (
    <form
      className="support-composer"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy || fileBusy) return
        if (create && draft.subject.trim().length < 5) {
          setError(
            'Escreva um assunto com pelo menos 5 caracteres. Ex.: dúvida sobre WhatsApp.',
          )
          return
        }
        if (draft.body.trim().length < (create ? 10 : 1)) {
          setError(
            create
              ? 'Conte um pouco mais sobre o que aconteceu (pelo menos 10 caracteres).'
              : 'Escreva sua mensagem antes de enviar.',
          )
          return
        }
        setError('')
        const payload = JSON.stringify(draft)
        if (command.current.payload !== payload)
          command.current = { payload, key: crypto.randomUUID() }
        if (await onSubmit(draft, command.current.key)) {
          setDraft({ ...draft, body: '', attachments: [] })
          command.current = { payload: '', key: '' }
        }
      }}
    >
      {create ? (
        <>
          <label>
            Em poucas palavras, o que você precisa?
            <input
              disabled={busy || fileBusy}
              required
              minLength={5}
              maxLength={160}
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              placeholder="Ex.: não consigo conectar meu WhatsApp"
            />
          </label>
          <button
            type="button"
            className="support-details-toggle"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            {more
              ? 'Ocultar detalhes opcionais'
              : 'Adicionar assunto e urgência (opcional)'}
          </button>
          {more ? (
            <div className="support-filters">
              <label>
                Sobre o que você precisa de ajuda?
                <ProductSelect
                  ariaLabel="Categoria"
                  disabled={busy || fileBusy}
                  value={draft.category}
                  options={options(categoryLabels)}
                  onChange={(category) => setDraft({ ...draft, category })}
                />
              </label>
              <label>
                Quanto isso atrapalha sua rotina?
                <ProductSelect
                  ariaLabel="Impacto"
                  disabled={busy || fileBusy}
                  value={draft.priority}
                  options={
                    dev
                      ? options(priorityLabels).filter(
                          (item) => item.value !== 'URGENT',
                        )
                      : [
                          {
                            value: 'LOW',
                            label: 'É só uma dúvida ou sugestão',
                          },
                          {
                            value: 'NORMAL',
                            label: 'Preciso de ajuda para continuar',
                          },
                          {
                            value: 'HIGH',
                            label: 'Não consigo usar a plataforma',
                          },
                        ]
                  }
                  onChange={(priority) => setDraft({ ...draft, priority })}
                />
              </label>
            </div>
          ) : null}
        </>
      ) : null}
      {dev && !create ? (
        <label className="support-note-toggle">
          <input
            type="checkbox"
            checked={draft.internal}
            onChange={(e) => setDraft({ ...draft, internal: e.target.checked })}
          />
          Nota interna · visível apenas ao DEV
        </label>
      ) : null}
      <label>
        {create
          ? 'Descreva o problema'
          : draft.internal
            ? 'Nota para a equipe'
            : 'Sua mensagem'}
        <textarea
          aria-label={
            create
              ? 'Descreva o problema'
              : draft.internal
                ? 'Nota para a equipe'
                : 'Sua mensagem'
          }
          disabled={busy || fileBusy}
          required
          minLength={create ? 10 : 1}
          maxLength={8000}
          rows={4}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          placeholder={
            create
              ? 'Conte o que estava tentando fazer e o que aconteceu. Pode escrever do seu jeito.'
              : 'Escreva aqui sua resposta ou mais detalhes…'
          }
        />
      </label>
      <p className="support-privacy-tip">
        Não envie senhas nem dados de cartão. Se anexar uma imagem, oculte os
        dados pessoais das clientes.
      </p>
      <div className="support-attachments">
        {draft.attachments.map((file, index) => (
          <button
            key={index}
            type="button"
            className="btn btn-ghost"
            disabled={busy || fileBusy}
            onClick={() =>
              setDraft({
                ...draft,
                attachments: draft.attachments.filter((_, i) => i !== index),
              })
            }
          >
            {file.name} · remover
          </button>
        ))}
      </div>
      <div className="support-actions">
        <label className="btn btn-ghost support-file">
          <Paperclip size={16} />{' '}
          {fileBusy ? 'Preparando…' : 'Adicionar imagem da tela'}
          <input
            aria-label="Anexar imagens"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={busy || fileBusy || draft.attachments.length === 3}
            onChange={(e) => {
              void images(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
        <small>Opcional · até 3 imagens (PNG, JPEG ou WebP).</small>
        <button
          type="submit"
          className="btn btnPrimary"
          disabled={busy || fileBusy}
        >
          {busy
            ? 'Enviando…'
            : create
              ? 'Enviar pedido de ajuda'
              : draft.internal
                ? 'Salvar nota interna'
                : 'Enviar resposta'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
    </form>
  )
}
