import { useState } from 'react'
import { api } from '../../api'
import { ModalRoot } from '../../components/ModalRoot'
import { X } from '../../components/Icons'
import { notify } from '../../components/FeedbackCenter'
export type ReviewAction = {
  id: string
  title: string
  description: string
  confirmLabel: string
  expiresAt: string
}
export function LumaOperationDialog({
  action,
  onClose,
  onDone,
}: {
  action: ReviewAction
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await api(`/api/admin/assistant/actions/${action.id}/confirm`, {
      method: 'POST',
      body: '{}',
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    notify('Alteração registrada.', 'success')
    window.dispatchEvent(new Event('lashdesigner:luma-data-updated'))
    window.dispatchEvent(new Event('support-notifications-updated'))
    onDone()
  }
  return (
    <ModalRoot>
      <section
        className="ld-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="luma-review-title"
      >
        <header className="cardHeader">
          <h2 id="luma-review-title" className="cardTitle">
            Revise antes de confirmar
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Fechar revisão"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="cardBody">
          <h3>{action.title}</h3>
          <p className="luma-operation-description">{action.description}</p>
          <p className="form-help">
            A Luma só executa a alteração depois da sua confirmação.
          </p>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="modal-footer luma-operation-footer">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btnPrimary"
            disabled={busy || new Date(action.expiresAt) <= new Date()}
            onClick={() => void confirm()}
          >
            {busy ? 'Salvando…' : action.confirmLabel}
          </button>
        </footer>
      </section>
    </ModalRoot>
  )
}
export async function prepareLumaOperation(
  name: string,
  args: Record<string, unknown>,
): Promise<ReviewAction> {
  const res = await api<{ pendingAction: ReviewAction }>(
    '/api/admin/assistant/operations/prepare',
    { method: 'POST', body: JSON.stringify({ name, args }) },
  )
  if (!res.ok) throw Error(res.error.message)
  return res.data.pendingAction
}
