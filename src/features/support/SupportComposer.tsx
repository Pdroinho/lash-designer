import { useRef, useState } from 'react'
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
    category: 'BUG',
    priority: 'NORMAL',
    body: '',
    internal: false,
    attachments: [],
  })
  const [fileBusy, setFileBusy] = useState(false),
    [error, setError] = useState('')
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
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy || fileBusy) return
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
            Assunto
            <input
              required
              minLength={5}
              maxLength={160}
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              placeholder="Resuma o que precisa de ajuda"
            />
          </label>
          <div className="support-filters">
            <label>
              Categoria
              <ProductSelect
                ariaLabel="Categoria"
                value={draft.category}
                options={options(categoryLabels)}
                onChange={(category) => setDraft({ ...draft, category })}
              />
            </label>
            <label>
              Impacto
              <ProductSelect
                ariaLabel="Impacto"
                value={draft.priority}
                options={options(priorityLabels).filter(
                  (item) => item.value !== 'URGENT',
                )}
                onChange={(priority) => setDraft({ ...draft, priority })}
              />
            </label>
          </div>
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
          required
          minLength={create ? 10 : 1}
          maxLength={8000}
          rows={4}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          placeholder="Conte o que aconteceu e os passos para reproduzir. Não inclua senhas ou dados de cartão."
        />
      </label>
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
          {fileBusy ? 'Preparando…' : 'Anexar imagem'}
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
        <small>Até 3 imagens. Dados pessoais devem ser ocultados.</small>
        <button
          type="submit"
          className="btn btnPrimary"
          disabled={busy || fileBusy}
        >
          {busy
            ? 'Enviando…'
            : create
              ? 'Abrir chamado'
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
